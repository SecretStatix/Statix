"""
Shared StatixRouter indexer: RPC, logs → snapshot rows, Supabase upsert, backfill.
"""

from __future__ import annotations

import json
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


def collect_snapshots(w3: Web3, router, from_block: int, to_block: int) -> list[dict]:
    buy_logs = list(router.events.Buy.get_logs(from_block=from_block, to_block=to_block))
    sell_logs = list(
        router.events.Sell.get_logs(from_block=from_block, to_block=to_block)
    )

    combined: list[tuple[str, object]] = [("buy", ev) for ev in buy_logs]
    combined.extend(("sell", ev) for ev in sell_logs)
    combined.sort(key=lambda x: (x[1]["blockNumber"], x[1]["logIndex"]))

    rows: list[dict] = []
    block_ts_cache: dict[int, int] = {}

    for side, ev in combined:
        args = ev["args"]
        block_number = int(ev["blockNumber"])
        log_index = int(ev["logIndex"])
        pool_index = int(args["poolIndex"])
        shares = int(args["shares"])
        amount = int(args["cost"]) if side == "buy" else int(args["revenue"])

        price = avg_price_dbucks_per_share(shares, amount)
        if price is None:
            continue

        if block_number not in block_ts_cache:
            blk = w3.eth.get_block(block_number)
            block_ts_cache[block_number] = int(blk["timestamp"])

        ts = block_ts_cache[block_number]
        dt = datetime.fromtimestamp(ts, tz=timezone.utc)

        rows.append(
            {
                "pool_index": pool_index,
                "price": float(price),
                "timestamp": dt.isoformat(),
                "block_number": block_number,
                "log_index": log_index,
            }
        )

    return rows


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
) -> int:
    total_rows = 0
    a = start
    while a <= end:
        b = min(a + BLOCK_CHUNK - 1, end)
        rows = collect_snapshots(w3, router, a, b)
        if rows and sb is not None:
            upsert_snapshot_rows(sb, rows)
            total_rows += len(rows)
        elif rows and sb is None:
            print(f"Dry run: would upsert {len(rows)} rows (blocks {a}-{b})")
            total_rows += len(rows)

        if persist_state:
            save_state(b)

        a = b + 1

    return total_rows


def catch_up_gap(sb) -> int:
    """Index from last_processed+1 through safe_latest (for reconnect / WS drop)."""
    w3 = connect_w3_http()
    router = build_router_contract(w3)
    st = load_state()
    last = int(st["last_processed_block"]) if st.get("last_processed_block") is not None else -1
    latest = w3.eth.block_number
    safe = max(0, latest - CONFIRMATIONS)
    start = last + 1
    if start > safe:
        return 0
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

    total = sync_range(
        w3,
        router,
        sb,
        start_block,
        safe_latest,
        persist_state=not dry_run,
    )
    print(f"Done. Rows upserted: {total}. State file: {STATE_PATH} (updated={not dry_run})")


def parse_head_number(head: dict[str, Any]) -> int:
    n = head.get("number")
    if n is None:
        raise ValueError("newHeads payload missing number")
    if isinstance(n, str):
        return int(n, 16)
    return int(n)


def process_blocks_range(sb, from_b: int, to_b: int) -> int:
    """Sync: index [from_b, to_b] inclusive. Returns rows written."""
    if from_b > to_b:
        return 0
    w3 = connect_w3_http()
    router = build_router_contract(w3)
    n = 0
    for b in range(from_b, to_b + 1):
        rows = collect_snapshots(w3, router, b, b)
        if rows:
            n += upsert_snapshot_rows(sb, rows)
        save_state(b)
    return n


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
