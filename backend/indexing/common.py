"""
Shared StatixRouter indexer: RPC, logs → pool_price_snapshots + transactions, Supabase upsert.

`transactions` rows are derived from Buy/Sell events (single source of truth — no client POST).
"""

from __future__ import annotations

import json
import logging
import os
import sys
from datetime import datetime, timezone
from decimal import Decimal
from pathlib import Path
from typing import Any

from dotenv import load_dotenv

load_dotenv(Path(__file__).parent.parent / ".env")

from web3 import Web3

from chain import get_abi, get_deployment

logger = logging.getLogger("statix_indexer.common")

BACKEND_DIR = Path(__file__).parent.parent.resolve()
STATE_PATH = BACKEND_DIR / "indexer_state.json"

DEFAULT_RPC = "https://sepolia.base.org"
_LOCAL_RPC_HINTS = ("127.0.0.1", "localhost")
_warned_local_rpc = False

CONFIRMATIONS = int(os.getenv("INDEXER_CONFIRMATIONS", "12"))
BLOCK_CHUNK = int(os.getenv("INDEXER_BLOCK_CHUNK", "2000"))
FIRST_LOOKBACK = int(os.getenv("INDEXER_FIRST_LOOKBACK", "50000"))
FROM_BLOCK_ENV = os.getenv("INDEXER_FROM_BLOCK")
UPSERT_BATCH = int(os.getenv("INDEXER_UPSERT_BATCH", "100"))

# DBucks / share amounts on-chain use 6 decimals (match StatixRouter + DBucks).
TOKEN_DECIMALS = 6
_TOKEN_SCALE = Decimal(10) ** TOKEN_DECIMALS


def _human_amount(raw: int) -> float:
    return float(Decimal(raw) / _TOKEN_SCALE)


def _tx_hash_hex(ev: object) -> str:
    h = ev["transactionHash"]
    if hasattr(h, "hex"):
        hx = h.hex()
        return hx if hx.startswith("0x") else "0x" + hx
    s = str(h)
    return s if s.startswith("0x") else "0x" + s


def _player_index_to_name() -> dict[int, str]:
    dep = get_deployment()
    if not dep:
        return {}
    return {int(p["index"]): p["name"] for p in dep.get("players", [])}


def load_state() -> dict:
    if STATE_PATH.exists():
        return json.loads(STATE_PATH.read_text())
    return {}


def save_state(last_block: int) -> None:
    STATE_PATH.write_text(json.dumps({"last_processed_block": last_block}, indent=2))


def rpc_url_for_indexer() -> str:
    explicit = os.getenv("INDEXER_RPC_URL", "").strip()
    if explicit:
        return explicit
    if os.getenv("INDEXER_USE_LOCAL_RPC", "").lower() in ("1", "true", "yes"):
        return os.getenv("RPC_URL", DEFAULT_RPC)
    rpc = os.getenv("RPC_URL", DEFAULT_RPC)
    global _warned_local_rpc
    if any(h in rpc for h in _LOCAL_RPC_HINTS):
        if not _warned_local_rpc:
            _warned_local_rpc = True
            print(
                "WARNING: RPC_URL is localhost — indexer needs Base Sepolia history. "
                f"Using {DEFAULT_RPC} (set INDEXER_RPC_URL=... or INDEXER_USE_LOCAL_RPC=1).",
                file=sys.stderr,
            )
        return DEFAULT_RPC
    return rpc


def connect_w3_http() -> Web3:
    rpc = rpc_url_for_indexer()
    w3 = Web3(Web3.HTTPProvider(rpc))
    if not w3.is_connected():
        if rpc != DEFAULT_RPC:
            print(
                f"WARNING: RPC unreachable ({rpc}), falling back to {DEFAULT_RPC}",
                file=sys.stderr,
            )
            rpc = DEFAULT_RPC
            w3 = Web3(Web3.HTTPProvider(rpc))
        if not w3.is_connected():
            raise RuntimeError(f"Cannot connect to RPC: {rpc}")

    dep = get_deployment()
    want = int(dep["chainId"]) if dep and dep.get("chainId") is not None else 84532
    got = int(w3.eth.chain_id)
    if got != want:
        if rpc != DEFAULT_RPC:
            print(
                f"WARNING: RPC chain_id={got} but deployments.json expects {want}. "
                f"Trying {DEFAULT_RPC}.",
                file=sys.stderr,
            )
            w3 = Web3(Web3.HTTPProvider(DEFAULT_RPC))
            if w3.is_connected() and int(w3.eth.chain_id) == want:
                return w3
        raise RuntimeError(f"Wrong chain: RPC has {got}, expected {want} (Base Sepolia).")
    return w3


def build_router_contract(w3: Web3):
    deployment = get_deployment()
    if not deployment:
        raise RuntimeError("deployments.json missing")
    router_addr = deployment.get("contracts", {}).get("StatixRouter")
    if not router_addr:
        raise RuntimeError("StatixRouter not in deployments.json")
    abi = get_abi("StatixRouter")
    return w3.eth.contract(address=Web3.to_checksum_address(router_addr), abi=abi)


def http_rpc_to_ws(url: str) -> str:
    if url.startswith("https://"):
        return "wss://" + url[len("https://") :]
    if url.startswith("http://"):
        return "ws://" + url[len("http://") :]
    return url


def websocket_url_for_indexer() -> str:
    w = os.getenv("INDEXER_WS_URL", "").strip()
    if w:
        return w
    return http_rpc_to_ws(rpc_url_for_indexer())


def avg_price_dbucks_per_share(shares: int, amount: int) -> Decimal | None:
    if shares <= 0:
        return None
    return Decimal(amount) / Decimal(shares)


def collect_trade_index_rows(
    w3: Web3, router, from_block: int, to_block: int
) -> tuple[list[dict], list[dict]]:
    """
    Fetch Buy/Sell logs in one pass. Build:
    - pool_price_snapshots rows (AMM line chart)
    - transactions rows (activity feed / history; unique on tx_hash)

    Buy `cost` column = total DBucks paid (cost + fee). Sell `cost` = net revenue to seller.
    """
    buy_logs = list(router.events.Buy.get_logs(from_block=from_block, to_block=to_block))
    sell_logs = list(
        router.events.Sell.get_logs(from_block=from_block, to_block=to_block)
    )

    combined: list[tuple[str, object]] = [("buy", ev) for ev in buy_logs]
    combined.extend(("sell", ev) for ev in sell_logs)
    combined.sort(key=lambda x: (x[1]["blockNumber"], x[1]["logIndex"]))

    snapshot_rows: list[dict] = []
    transaction_rows: list[dict] = []
    block_ts_cache: dict[int, int] = {}
    names = _player_index_to_name()

    for side, ev in combined:
        args = ev["args"]
        block_number = int(ev["blockNumber"])
        log_index = int(ev["logIndex"])
        pool_index = int(args["poolIndex"])
        shares_raw = int(args["shares"])
        tx_hash = _tx_hash_hex(ev)

        if side == "buy":
            cost_raw = int(args["cost"])
            fee_raw = int(args["fee"])
            amount_for_price = cost_raw
            total_paid_raw = cost_raw + fee_raw
            wallet = args["buyer"]
        else:
            revenue_raw = int(args["revenue"])
            fee_raw = int(args["fee"])
            amount_for_price = revenue_raw
            wallet = args["seller"]

        price = avg_price_dbucks_per_share(shares_raw, amount_for_price)
        if price is None:
            continue

        if block_number not in block_ts_cache:
            blk = w3.eth.get_block(block_number)
            block_ts_cache[block_number] = int(blk["timestamp"])

        ts = block_ts_cache[block_number]
        dt = datetime.fromtimestamp(ts, tz=timezone.utc)

        snapshot_rows.append(
            {
                "pool_index": pool_index,
                "price": float(price),
                "timestamp": dt.isoformat(),
                "block_number": block_number,
                "log_index": log_index,
            }
        )

        shares_h = _human_amount(shares_raw)
        fee_h = _human_amount(fee_raw)
        if side == "buy":
            cost_h = _human_amount(total_paid_raw)
        else:
            cost_h = _human_amount(revenue_raw)

        price_per_share = (cost_h / shares_h) if shares_h > 0 else 0.0

        wallet_lower = Web3.to_checksum_address(wallet).lower()

        trow: dict = {
            "wallet_address": wallet_lower,
            "player_index": pool_index,
            "side": side,
            "shares": shares_h,
            "cost": cost_h,
            "tx_hash": tx_hash,
            "fee": fee_h,
            "price_per_share": price_per_share,
            "created_at": dt.isoformat(),
        }
        pname = names.get(pool_index)
        if pname:
            trow["player_name"] = pname
        transaction_rows.append(trow)

    return snapshot_rows, transaction_rows


def collect_snapshots(w3: Web3, router, from_block: int, to_block: int) -> list[dict]:
    """Backward-compatible: snapshot rows only."""
    snaps, _ = collect_trade_index_rows(w3, router, from_block, to_block)
    return snaps


def upsert_snapshot_rows(sb, rows: list[dict]) -> int:
    if not rows:
        return 0
    total = 0
    for i in range(0, len(rows), UPSERT_BATCH):
        batch = rows[i : i + UPSERT_BATCH]
        sb.table("pool_price_snapshots").upsert(
            batch,
            on_conflict="block_number,log_index",
        ).execute()
        logger.info(
            "Upserted %d row(s) into pool_price_snapshots (blocks %s–%s)",
            len(batch),
            batch[0]["block_number"],
            batch[-1]["block_number"],
        )
        total += len(batch)
    return total


def upsert_transaction_rows(sb, rows: list[dict]) -> int:
    """Insert/update `transactions` from chain events (unique on tx_hash)."""
    if not rows:
        return 0
    total = 0
    for i in range(0, len(rows), UPSERT_BATCH):
        batch = rows[i : i + UPSERT_BATCH]
        sb.table("transactions").upsert(batch, on_conflict="tx_hash").execute()
        logger.info(
            "Upserted %d row(s) into transactions (tx hashes e.g. %s…)",
            len(batch),
            batch[0]["tx_hash"][:18],
        )
        total += len(batch)
    return total


def upsert_transaction_rows(sb, rows: list[dict]) -> int:
    """Insert/update `transactions` from chain events (unique on tx_hash)."""
    if not rows:
        return 0
    total = 0
    for i in range(0, len(rows), UPSERT_BATCH):
        batch = rows[i : i + UPSERT_BATCH]
        sb.table("transactions").upsert(batch, on_conflict="tx_hash").execute()
        total += len(batch)
    return total


def sync_range(
    w3: Web3,
    router,
    sb,
    start: int,
    end: int,
    *,
    persist_state: bool,
) -> tuple[int, int]:
    total_snap = 0
    total_tx = 0
    a = start
    while a <= end:
        b = min(a + BLOCK_CHUNK - 1, end)
        snap_rows, tx_rows = collect_trade_index_rows(w3, router, a, b)
        if sb is not None:
            if snap_rows:
                total_snap += upsert_snapshot_rows(sb, snap_rows)
            if tx_rows:
                total_tx += upsert_transaction_rows(sb, tx_rows)
        elif snap_rows or tx_rows:
            print(
                f"Dry run: would upsert {len(snap_rows)} snapshot(s), "
                f"{len(tx_rows)} transaction(s) (blocks {a}-{b})"
            )
            total_snap += len(snap_rows)
            total_tx += len(tx_rows)

        if persist_state:
            save_state(b)

        a = b + 1

    return total_snap, total_tx


def catch_up_gap(sb) -> tuple[int, int]:
    """Index from last_processed+1 through safe_latest (for reconnect / WS drop)."""
    w3 = connect_w3_http()
    router = build_router_contract(w3)
    st = load_state()
    last = int(st["last_processed_block"]) if st.get("last_processed_block") is not None else -1
    latest = w3.eth.block_number
    safe = max(0, latest - CONFIRMATIONS)
    start = last + 1
    if start > safe:
        return 0, 0
    return sync_range(w3, router, sb, start, safe, persist_state=True)


def run_backfill_once(
    sb,
    *,
    dry_run: bool = False,
    from_block_override: int | None = None,
) -> None:
    deployment = get_deployment()
    if not deployment:
        raise RuntimeError("deployments.json missing — cannot index")

    contracts = deployment.get("contracts") or {}
    router_addr = contracts.get("StatixRouter")
    if not router_addr:
        raise RuntimeError("StatixRouter address not in deployments.json")

    w3 = connect_w3_http()
    abi = get_abi("StatixRouter")
    router = w3.eth.contract(address=Web3.to_checksum_address(router_addr), abi=abi)

    state = load_state()
    latest = w3.eth.block_number
    safe_latest = max(0, latest - CONFIRMATIONS)

    if safe_latest < 1:
        print("Chain not far enough; nothing to index.")
        return

    if from_block_override is not None:
        start_block = from_block_override
    elif state.get("last_processed_block") is not None:
        start_block = int(state["last_processed_block"]) + 1
    elif FROM_BLOCK_ENV:
        start_block = int(FROM_BLOCK_ENV)
    else:
        start_block = max(0, safe_latest - FIRST_LOOKBACK)

    if start_block > safe_latest:
        print(f"Already caught up (start {start_block} > safe latest {safe_latest}).")
        return

    print(
        f"Indexing blocks {start_block}..{safe_latest} (latest={latest}, confirmations={CONFIRMATIONS})"
    )

    snap_n, tx_n = sync_range(
        w3,
        router,
        sb,
        start_block,
        safe_latest,
        persist_state=not dry_run,
    )
    print(
        f"Done. pool_price_snapshots: {snap_n}, transactions: {tx_n}. "
        f"State file: {STATE_PATH} (updated={not dry_run})"
    )


def parse_head_number(head: dict[str, Any]) -> int:
    n = head.get("number")
    if n is None:
        raise ValueError("newHeads payload missing number")
    if isinstance(n, str):
        return int(n, 16)
    return int(n)


def process_blocks_range(sb, from_b: int, to_b: int) -> tuple[int, int]:
    """Sync: index [from_b, to_b] inclusive. Returns (snapshot rows, transaction rows) written."""
    if from_b > to_b:
        return 0, 0
    w3 = connect_w3_http()
    router = build_router_contract(w3)
    n_snap = 0
    n_tx = 0
    for b in range(from_b, to_b + 1):
        snap_rows, tx_rows = collect_trade_index_rows(w3, router, b, b)
        if snap_rows:
            n_snap += upsert_snapshot_rows(sb, snap_rows)
        if tx_rows:
            n_tx += upsert_transaction_rows(sb, tx_rows)
        save_state(b)
    return n_snap, n_tx


def process_confirmed_head(sb, head_block_number: int) -> None:
    """Process blocks up to (head_block_number - CONFIRMATIONS) from newHeads."""
    target = head_block_number - CONFIRMATIONS
    if target < 0:
        return
    st = load_state()
    last = int(st["last_processed_block"]) if st.get("last_processed_block") is not None else -1
    if target <= last:
        return
    start = last + 1
    process_blocks_range(sb, start, target)
