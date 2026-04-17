"""Pydantic schemas for /api/h2h/* endpoints."""

from datetime import datetime
from typing import Optional, Literal
from pydantic import BaseModel


class PlayerRef(BaseModel):
    id: str
    nba_id: int
    name: str
    team: str


class MarketSummary(BaseModel):
    """Lobby card view — lightweight, no trade history."""
    id: int
    fpmm_address: str
    status: Literal["open", "resolved", "voided"]
    tip_off_at: datetime
    player_a: PlayerRef
    player_b: PlayerRef
    implied_prob_a: float
    total_volume: float
    winner: Optional[Literal["A", "B", "void"]] = None


class MarketDetail(MarketSummary):
    """Market detail view — includes CTF identifiers so the frontend can read balances."""
    condition_id: str
    question_id: str
    position_id_a: str
    position_id_b: str
    player_a_final_fp: Optional[float] = None
    player_b_final_fp: Optional[float] = None
    resolved_at: Optional[datetime] = None


class LiveScore(BaseModel):
    captured_at: datetime
    game_clock: Optional[str] = None
    game_status: Optional[str] = None
    player_a_fp: Optional[float] = None
    player_a_minutes: Optional[float] = None
    player_b_fp: Optional[float] = None
    player_b_minutes: Optional[float] = None


class TradeRecord(BaseModel):
    id: int
    market_id: int
    wallet_address: str
    side: Literal["A", "B"]
    action: Literal["buy", "sell"]
    shares: float
    cost_dbucks: float
    price_per_share: float
    tx_hash: str
    created_at: datetime


class UserPosition(BaseModel):
    """Derived from on-chain CT.balanceOf — the DB only stores trade history."""
    market_id: int
    shares_a: float
    shares_b: float
    avg_price_a: Optional[float] = None
    avg_price_b: Optional[float] = None
    redeemable: bool  # status='resolved' and user holds winning shares


class LPMetricsRow(BaseModel):
    market_id: int
    player_a_name: str
    player_b_name: str
    status: str
    tip_off_at: datetime
    resolved_at: Optional[datetime]
    seed_collateral: Optional[float]
    fees_collected: Optional[float]
    total_volume: Optional[float]
    lp_pnl: Optional[float]
    lp_return_pct: Optional[float]
    effective_fee_rate: Optional[float]
    final_pool_skew: Optional[float]
