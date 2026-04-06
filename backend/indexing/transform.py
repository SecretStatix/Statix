"""Decode StatixRouter Buy/Sell logs into snapshot + transaction row dicts."""

from __future__ import annotations

from datetime import datetime, timezone
from decimal import Decimal
from typing import Any

from web3 import Web3

from chain import get_deployment

from .config import TOKEN_DECIMALS

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
    """Snapshot rows only (backward-compatible)."""
    snaps, _ = collect_trade_index_rows(w3, router, from_block, to_block)
    return snaps


def parse_head_number(head: dict[str, Any]) -> int:
    n = head.get("number")
    if n is None:
        raise ValueError("newHeads payload missing number")
    if isinstance(n, str):
        return int(n, 16)
    return int(n)
