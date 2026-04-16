"""FastAPI router for /api/h2h/*.

Endpoints return stubs until P2. Shape is stable so the frontend can be
built against it in parallel.
"""

from fastapi import APIRouter, HTTPException, Query
from typing import List, Optional

from .schemas import (
    MarketSummary,
    MarketDetail,
    LiveScore,
    TradeRecord,
    UserPosition,
    LPMetricsRow,
)

router = APIRouter()


@router.get("/markets", response_model=List[MarketSummary])
async def list_markets(
    status: Optional[str] = Query(default=None, pattern="^(open|resolved|voided)$"),
):
    """List H2H markets, optionally filtered by status."""
    return []


@router.get("/markets/{market_id}", response_model=MarketDetail)
async def get_market(market_id: int):
    raise HTTPException(status_code=404, detail="Not yet implemented")


@router.get("/markets/{market_id}/trades", response_model=List[TradeRecord])
async def get_market_trades(market_id: int, limit: int = Query(default=50, le=500)):
    return []


@router.get("/markets/{market_id}/live", response_model=Optional[LiveScore])
async def get_market_live_score(market_id: int):
    return None


@router.get("/users/{wallet}/positions", response_model=List[UserPosition])
async def get_user_positions(wallet: str):
    return []


@router.get("/admin/lp-metrics", response_model=List[LPMetricsRow])
async def get_lp_metrics():
    """Admin-only LP dashboard data. TODO: auth gate in P2."""
    return []


@router.post("/admin/create-daily-markets")
async def create_daily_markets():
    """Manual trigger for daily market creation cron. TODO: admin-key gate + implement in P2."""
    raise HTTPException(status_code=501, detail="Not yet implemented")


@router.post("/admin/resolve-pending")
async def resolve_pending():
    """Manual trigger for resolver pass. TODO: admin-key gate + implement in P2."""
    raise HTTPException(status_code=501, detail="Not yet implemented")
