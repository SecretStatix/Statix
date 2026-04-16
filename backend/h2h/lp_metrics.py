"""LP metrics + per-market pool snapshots.

Two responsibilities:
  - `snapshot_pool(market)`         → h2h_pool_snapshots (called periodically by live tracker)
  - `snapshot_market_metrics(id)`   → h2h_markets fields (called once at resolve time)

LP P&L (since the protocol is the sole LP for the beta):
    lp_pnl = collateral_recovered + fees_collected - seed_collateral

`collateral_recovered` after resolution =
    pool_winning_side  (the FPMM holds outcome tokens; the winning side is fully redeemable)
  + (pool_losing_side - winning_side)?  No — losing side is worthless.
  Actually after redeem on resolution:
    LP burns all LP tokens via removeFunding → receives pool slice of A and B (post-trade balances).
    Then merges the matched portion → collateral, leaves the unbalanced remainder as outcome tokens.
    Then redeems remaining outcome tokens against the resolved condition → final collateral.

For the snapshot we approximate via on-chain reads:
  pool_a, pool_b = fpmm.poolBalances()
  collected_fees = fpmm.collectedFees()
  Final collateral that the LP can extract ≈ min(pool_a, pool_b) + max(pool_a, pool_b) * winner_payout
                                          ≈ winner_pool_size  (assuming binary all-or-nothing)
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Optional

from db import get_supabase

from .chain import COLLATERAL_DECIMALS, build_fpmm, get_w3

logger = logging.getLogger("statix.h2h.lp_metrics")


def _to_human(units: int) -> float:
    return float(units) / (10 ** COLLATERAL_DECIMALS)


def snapshot_pool(market: dict) -> Optional[dict]:
    """Read on-chain pool state for a market and insert a row into h2h_pool_snapshots."""
    fpmm_address = market.get("fpmm_address")
    if not fpmm_address:
        return None
    try:
        w3 = get_w3()
        fpmm = build_fpmm(w3, fpmm_address)
        pool_a, pool_b = fpmm.functions.poolBalances().call()
        fees = fpmm.functions.collectedFees().call()
        price_a = fpmm.functions.priceA().call()
    except Exception as e:
        logger.warning("snapshot_pool failed for market %s: %s", market.get("id"), e)
        return None

    pa_h = _to_human(pool_a)
    pb_h = _to_human(pool_b)
    implied = pb_h / (pa_h + pb_h) if (pa_h + pb_h) > 0 else 0.5
    row = {
        "market_id": market["id"],
        "snapshot_at": datetime.now(timezone.utc).isoformat(),
        "pool_a": pa_h,
        "pool_b": pb_h,
        "collateral_in_pool": (pa_h + pb_h) / 2.0,  # mergeable matched pairs ≈ collateral backing pool
        "accrued_fees": _to_human(fees),
        "implied_prob_a": implied,
    }

    sb = get_supabase()
    if sb is None:
        return row
    try:
        sb.table("h2h_pool_snapshots").insert(row).execute()
    except Exception as e:
        logger.warning("h2h_pool_snapshots insert failed: %s", e)
    return row


def snapshot_market_metrics(market_id: int) -> None:
    """Once a market resolves, compute final-state metrics and write to h2h_markets."""
    sb = get_supabase()
    if sb is None:
        return
    try:
        resp = sb.table("h2h_markets").select("*").eq("id", market_id).single().execute()
        market = resp.data
    except Exception:
        return
    if not market:
        return

    fpmm_address = market.get("fpmm_address")
    seed = float(market.get("seed_collateral") or 0)
    winner = market.get("winner")  # 'A' | 'B' | 'void' | None

    pool_a = pool_b = fees = 0.0
    if fpmm_address:
        try:
            w3 = get_w3()
            fpmm = build_fpmm(w3, fpmm_address)
            pa, pb = fpmm.functions.poolBalances().call()
            pool_a = _to_human(pa)
            pool_b = _to_human(pb)
            fees = _to_human(fpmm.functions.collectedFees().call())
        except Exception as e:
            logger.warning("metrics chain read failed for market %s: %s", market_id, e)

    if winner == "A":
        recoverable = pool_a
    elif winner == "B":
        recoverable = pool_b
    else:
        # Void: each side pays 50% so both halves of the pool are worth half collateral.
        recoverable = (pool_a + pool_b) / 2.0

    lp_pnl = recoverable + fees - seed

    update = {
        "final_pool_a": pool_a,
        "final_pool_b": pool_b,
        "fees_collected": fees,
        "lp_pnl": lp_pnl,
    }
    try:
        sb.table("h2h_markets").update(update).eq("id", market_id).execute()
    except Exception as e:
        logger.warning("snapshot_market_metrics update failed: %s", e)


def list_lp_metrics(limit: int = 200) -> list:
    """Read from the h2h_lp_metrics view created in h2h_schema.sql."""
    sb = get_supabase()
    if sb is None:
        return []
    try:
        resp = sb.table("h2h_lp_metrics").select("*").limit(limit).execute()
        return resp.data or []
    except Exception as e:
        logger.warning("list_lp_metrics failed: %s", e)
        return []
