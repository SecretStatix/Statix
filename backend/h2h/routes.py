"""FastAPI router for /api/h2h/*.

Read endpoints are public; admin POSTs are gated by ADMIN_KEY (matches main app pattern).
"""

from __future__ import annotations

import logging
import os
from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, Header, HTTPException, Query

from db import get_supabase

from . import resolver, service
from .lp_metrics import list_lp_metrics
from .schemas import (
    LiveScore,
    LPMetricsRow,
    MarketDetail,
    MarketSummary,
    PlayerRef,
    TradeRecord,
    UserPosition,
)

logger = logging.getLogger("statix.h2h.routes")

router = APIRouter()


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _row_to_summary(row: dict) -> MarketSummary:
    pa_pool = float(row.get("final_pool_a") or 0)
    pb_pool = float(row.get("final_pool_b") or 0)
    if pa_pool + pb_pool > 0:
        implied = pb_pool / (pa_pool + pb_pool)  # priceA = pool_b / (pool_a + pool_b)
    else:
        implied = 0.5
    return MarketSummary(
        id=row["id"],
        fpmm_address=row["fpmm_address"],
        status=row["status"],
        tip_off_at=row["tip_off_at"],
        player_a=PlayerRef(
            id=row["player_a_id"],
            nba_id=row["player_a_nba_id"],
            name=row["player_a_name"],
            team=row["player_a_team"],
        ),
        player_b=PlayerRef(
            id=row["player_b_id"],
            nba_id=row["player_b_nba_id"],
            name=row["player_b_name"],
            team=row["player_b_team"],
        ),
        implied_prob_a=implied,
        total_volume=float(row.get("total_volume") or 0),
        winner=row.get("winner"),
    )


def _row_to_detail(row: dict) -> MarketDetail:
    base = _row_to_summary(row).model_dump()
    base.update(
        condition_id=row["condition_id"],
        question_id=row["question_id"],
        position_id_a=row.get("position_id_a") or "",
        position_id_b=row.get("position_id_b") or "",
        player_a_final_fp=row.get("player_a_final_fp"),
        player_b_final_fp=row.get("player_b_final_fp"),
        resolved_at=row.get("resolved_at"),
    )
    return MarketDetail(**base)


def _check_admin(provided: Optional[str]) -> None:
    expected = os.getenv("ADMIN_KEY", "")
    if not expected or provided != expected:
        raise HTTPException(status_code=401, detail="Unauthorized")


# ---------------------------------------------------------------------------
# Public reads
# ---------------------------------------------------------------------------

@router.get("/markets", response_model=List[MarketSummary])
async def list_markets(
    status: Optional[str] = Query(default=None, pattern="^(open|resolved|voided)$"),
    limit: int = Query(default=100, le=500),
):
    return [_row_to_summary(r) for r in service.list_markets(status=status, limit=limit)]


@router.get("/markets/{market_id}", response_model=MarketDetail)
async def get_market(market_id: int):
    row = service.get_market(market_id)
    if not row:
        raise HTTPException(status_code=404, detail="Market not found")
    return _row_to_detail(row)


@router.get("/markets/{market_id}/trades", response_model=List[TradeRecord])
async def get_market_trades(market_id: int, limit: int = Query(default=50, le=500)):
    sb = get_supabase()
    if sb is None:
        return []
    try:
        resp = (
            sb.table("h2h_trades")
            .select("*")
            .eq("market_id", market_id)
            .order("created_at", desc=True)
            .limit(limit)
            .execute()
        )
        return [TradeRecord(**r) for r in (resp.data or [])]
    except Exception as e:
        logger.warning("trades query failed: %s", e)
        return []


@router.get("/markets/{market_id}/live", response_model=Optional[LiveScore])
async def get_market_live_score(market_id: int):
    sb = get_supabase()
    if sb is None:
        return None
    try:
        resp = (
            sb.table("h2h_live_scores")
            .select("*")
            .eq("market_id", market_id)
            .order("captured_at", desc=True)
            .limit(1)
            .execute()
        )
        rows = resp.data or []
        if not rows:
            return None
        r = rows[0]
        return LiveScore(
            captured_at=r["captured_at"],
            game_clock=r.get("game_clock"),
            game_status=r.get("game_status"),
            player_a_fp=r.get("player_a_fp"),
            player_a_minutes=r.get("player_a_minutes"),
            player_b_fp=r.get("player_b_fp"),
            player_b_minutes=r.get("player_b_minutes"),
        )
    except Exception as e:
        logger.warning("live score query failed: %s", e)
        return None


@router.get("/users/{wallet}/positions", response_model=List[UserPosition])
async def get_user_positions(wallet: str):
    """Return cost-basis info per market from h2h_trades. Live share counts are read on-chain by the frontend."""
    sb = get_supabase()
    if sb is None:
        return []
    try:
        resp = (
            sb.table("h2h_trades")
            .select("*")
            .ilike("wallet_address", wallet)
            .execute()
        )
        trades = resp.data or []
    except Exception as e:
        logger.warning("user positions query failed: %s", e)
        return []

    by_market: dict = {}
    for t in trades:
        bucket = by_market.setdefault(t["market_id"], {"A": [], "B": []})
        bucket[t["side"]].append(t)

    out: List[UserPosition] = []
    for market_id, sides in by_market.items():
        market = service.get_market(market_id)
        sa = sum((1 if t["action"] == "buy" else -1) * float(t["shares"]) for t in sides["A"])
        sb_count = sum((1 if t["action"] == "buy" else -1) * float(t["shares"]) for t in sides["B"])
        avg_a = _vwap_buys(sides["A"])
        avg_b = _vwap_buys(sides["B"])
        winner = (market or {}).get("winner")
        redeemable = (
            (market or {}).get("status") in ("resolved", "voided")
            and (
                (winner == "A" and sa > 0)
                or (winner == "B" and sb_count > 0)
                or (winner == "void" and (sa > 0 or sb_count > 0))
            )
        )
        out.append(
            UserPosition(
                market_id=market_id,
                shares_a=max(sa, 0.0),
                shares_b=max(sb_count, 0.0),
                avg_price_a=avg_a,
                avg_price_b=avg_b,
                redeemable=bool(redeemable),
            )
        )
    return out


def _vwap_buys(trades: list) -> Optional[float]:
    buys = [t for t in trades if t["action"] == "buy"]
    if not buys:
        return None
    total_shares = sum(float(t["shares"]) for t in buys)
    total_cost = sum(float(t["cost_dbucks"]) for t in buys)
    return round(total_cost / total_shares, 4) if total_shares else None


# ---------------------------------------------------------------------------
# Admin
# ---------------------------------------------------------------------------

@router.get("/admin/lp-metrics", response_model=List[LPMetricsRow])
async def get_lp_metrics(x_admin_key: Optional[str] = Header(default=None)):
    _check_admin(x_admin_key)
    return [LPMetricsRow(**r) for r in list_lp_metrics()]


@router.post("/admin/create-daily-markets")
async def create_daily_markets(
    dry_run: bool = Query(default=False),
    x_admin_key: Optional[str] = Header(default=None),
):
    _check_admin(x_admin_key)
    created = service.create_markets_for_today(dry_run=dry_run)
    return {"created": len(created), "markets": created}


@router.post("/admin/resolve-pending")
async def resolve_pending(x_admin_key: Optional[str] = Header(default=None)):
    _check_admin(x_admin_key)
    handled = resolver.run_once()
    return {"handled": handled}
