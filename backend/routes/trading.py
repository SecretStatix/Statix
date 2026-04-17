"""
Trading routes — AMM quotes and transaction history.

Trades execute on-chain via StatixRouter. The `transactions` and
`pool_price_snapshots` tables are populated by the chain indexer
(index_statix_router_ws.py / indexing.batch), NOT by client POSTs.

Endpoints:
  GET  /contracts              — addresses + ABIs for the frontend
  POST /quote                  — AMM quote (buy or sell)
  GET  /transactions           — per-player tx list (last N days)
  GET  /transactions/recent    — latest trades across all players
  GET  /history/{wallet}       — full tx history for a wallet
  GET  /summary/{wallet}       — aggregate trading stats for a wallet
  GET  /portfolio-snapshots    — hourly NAV snapshots for portfolio chart
"""

import logging
import os
import re
from datetime import datetime, timedelta, timezone
from typing import List, Optional

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from chain import get_contract_info, get_deployment, get_abi
from config import FEE_RATE
from db import get_supabase
from routes.helpers import require_supabase, require_deployment

logger = logging.getLogger(__name__)
router = APIRouter()


# ── Pydantic models ──────────────────────────────────────────────────────────

class QuoteRequest(BaseModel):
    player_index: int
    shares: float   # human-readable (e.g. 10.5)
    side: str       # "buy" or "sell"


class QuoteResponse(BaseModel):
    player_index: int
    side: str
    shares: float
    cost_or_revenue: float
    fee: float
    total: float
    price_impact: float
    current_price: float
    new_price: float


class PortfolioSnapshotPoint(BaseModel):
    snapshot_at: str
    net_worth: float
    cash_dbucks: float
    positions_value: float


class PortfolioSnapshotsResponse(BaseModel):
    wallet_address: str
    days: int
    source: str
    points: List[PortfolioSnapshotPoint]


# ── Helpers ──────────────────────────────────────────────────────────────────

def _get_pool_state(player_index: int) -> tuple[float, float]:
    """Read live virtualShares/virtualCash from the PlayerPool contract.

    Raises HTTP 503 if the chain is unreachable — quotes are meaningless
    without live pool state.
    """
    try:
        from web3 import Web3

        deployment = get_deployment()
        if not deployment:
            raise HTTPException(status_code=503, detail="Contracts not deployed")

        rpc_url = os.getenv("RPC_URL", "https://sepolia.base.org")
        w3 = Web3(Web3.HTTPProvider(rpc_url))
        if not w3.is_connected():
            raise HTTPException(status_code=503, detail="RPC unavailable")

        factory_abi = get_abi("PoolFactory")
        pool_abi = get_abi("PlayerPool")
        factory = w3.eth.contract(
            address=Web3.to_checksum_address(deployment["contracts"]["PoolFactory"]),
            abi=factory_abi,
        )
        pool_addr = factory.functions.pools(player_index).call()
        pool = w3.eth.contract(
            address=Web3.to_checksum_address(pool_addr),
            abi=pool_abi,
        )
        virtual_shares = pool.functions.virtualShares().call() / 1e6
        virtual_cash = pool.functions.virtualCash().call() / 1e6
        return virtual_shares, virtual_cash
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Failed to read pool state for player %d: %s", player_index, e)
        raise HTTPException(
            status_code=503,
            detail=f"Could not read pool state for player {player_index} from chain: {e}",
        )


def _build_player_name_map() -> dict[int, str]:
    """Build index→name lookup from deployments.json."""
    deployment = get_deployment()
    if not deployment:
        return {}
    return {p["index"]: p["name"] for p in deployment.get("players", [])}


def _fill_missing_names(txs: list[dict]) -> list[dict]:
    """Patch transactions with NULL player_name using the deployment name map."""
    name_map: dict[int, str] | None = None
    for tx in txs:
        if not tx.get("player_name"):
            if name_map is None:
                name_map = _build_player_name_map()
            tx["player_name"] = name_map.get(tx.get("player_index", -1))
    return txs


# ── Routes ───────────────────────────────────────────────────────────────────

@router.get("/contracts")
async def get_contracts():
    """Contract addresses and ABIs for the frontend wallet integration."""
    info = get_contract_info()
    if not info:
        raise HTTPException(status_code=503, detail="Contracts not deployed yet")
    return info


@router.post("/quote", response_model=QuoteResponse)
async def get_quote(req: QuoteRequest):
    """AMM quote for buying or selling shares.

    Reads live pool state from chain — raises 503 if chain is unreachable.
    NOTE: On-chain getBuyQuote/getSellQuote are the authoritative source; use
    this only for UI previews.
    """
    deployment = require_deployment()

    player = next(
        (p for p in deployment.get("players", []) if p["index"] == req.player_index),
        None,
    )
    if not player:
        raise HTTPException(status_code=404, detail="Player not found")

    virtual_shares, virtual_cash = _get_pool_state(req.player_index)
    shares = req.shares

    if req.side == "buy":
        if shares >= virtual_shares / 2:
            raise HTTPException(status_code=400, detail="Too many shares")
        new_shares = virtual_shares - shares
        cost = (virtual_cash * shares) / new_shares
        fee = cost * FEE_RATE
        total = cost + fee
        current_price = virtual_cash / virtual_shares
        new_price = (virtual_cash + cost) / new_shares
        price_impact = (new_price - current_price) / current_price * 100
        return QuoteResponse(
            player_index=req.player_index,
            side="buy",
            shares=shares,
            cost_or_revenue=round(cost, 2),
            fee=round(fee, 2),
            total=round(total, 2),
            price_impact=round(price_impact, 2),
            current_price=round(current_price, 2),
            new_price=round(new_price, 2),
        )

    if req.side == "sell":
        new_shares = virtual_shares + shares
        revenue = (virtual_cash * shares) / new_shares
        fee = revenue * FEE_RATE
        net = revenue - fee
        current_price = virtual_cash / virtual_shares
        new_price = (virtual_cash - revenue) / new_shares
        price_impact = (current_price - new_price) / current_price * 100
        return QuoteResponse(
            player_index=req.player_index,
            side="sell",
            shares=shares,
            cost_or_revenue=round(net, 2),
            fee=round(fee, 2),
            total=round(net, 2),
            price_impact=round(price_impact, 2),
            current_price=round(current_price, 2),
            new_price=round(new_price, 2),
        )

    raise HTTPException(status_code=400, detail="side must be 'buy' or 'sell'")


@router.get("/transactions")
async def get_player_transactions(player_index: int, limit: int = 10, days: int = 7):
    """Top transactions for a player in the past N days, ordered by cost descending."""
    supabase = require_supabase()
    since = (datetime.utcnow() - timedelta(days=days)).isoformat()
    try:
        res = (
            supabase.table("transactions")
            .select("wallet_address, player_index, side, shares, cost, tx_hash, created_at")
            .eq("player_index", player_index)
            .gte("created_at", since)
            .order("cost", desc=True)
            .limit(limit)
            .execute()
        )
    except Exception as e:
        logger.error("transactions query failed for player %d: %s", player_index, e)
        raise HTTPException(status_code=503, detail=f"Database query failed: {e}")
    return res.data or []


@router.get("/transactions/recent")
async def get_recent_transactions(limit: int = Query(default=15, le=50)):
    """Most recent trades across all players — feeds the homepage activity feed."""
    supabase = require_supabase()
    try:
        res = (
            supabase.table("transactions")
            .select("wallet_address, player_index, player_name, side, shares, cost, tx_hash, created_at")
            .order("created_at", desc=True)
            .limit(limit)
            .execute()
        )
    except Exception as e:
        logger.error("transactions/recent query failed: %s", e)
        raise HTTPException(status_code=503, detail=f"Database query failed: {e}")
    return _fill_missing_names(res.data or [])


@router.get("/history/{wallet_address}")
async def get_transaction_history(
    wallet_address: str,
    limit: int = Query(default=50, le=200),
):
    """Full transaction history for a wallet address, newest first."""
    supabase = require_supabase()
    try:
        result = (
            supabase.table("transactions")
            .select("*")
            .eq("wallet_address", wallet_address.lower())
            .order("created_at", desc=True)
            .limit(limit)
            .execute()
        )
    except Exception as e:
        logger.error("transaction history query failed for %s: %s", wallet_address, e)
        raise HTTPException(status_code=503, detail=f"Database query failed: {e}")
    return result.data or []


@router.get("/summary/{wallet_address}")
async def get_trading_summary(wallet_address: str):
    """Aggregate trading stats (volume, fees, buys, sells) for a wallet."""
    supabase = require_supabase()
    try:
        result = (
            supabase.table("transactions")
            .select("side, cost, fee")
            .eq("wallet_address", wallet_address.lower())
            .execute()
        )
    except Exception as e:
        logger.error("trading summary query failed for %s: %s", wallet_address, e)
        raise HTTPException(status_code=503, detail=f"Database query failed: {e}")
    txs = result.data or []

    return {
        "total_trades": len(txs),
        "total_volume": round(sum(abs(float(t.get("cost", 0))) for t in txs), 2),
        "total_fees": round(sum(float(t.get("fee", 0)) for t in txs), 2),
        "buys": sum(1 for t in txs if t.get("side") == "buy"),
        "sells": sum(1 for t in txs if t.get("side") == "sell"),
    }


@router.get("/portfolio-snapshots", response_model=PortfolioSnapshotsResponse)
async def get_portfolio_snapshots(
    wallet: str = Query(..., description="Wallet address (0x…)"),
    days: int = Query(default=30, ge=1, le=365),
):
    """Hourly NAV snapshots for the portfolio chart (written by snapshot.job).

    Returns rows from wallet_portfolio_snapshots within the last `days` window.
    Raises 503 if the database is unavailable.
    """
    w = wallet.strip().lower()
    if not re.match(r"^0x[a-f0-9]{40}$", w):
        raise HTTPException(status_code=400, detail="Invalid wallet address")

    supabase = require_supabase()
    cutoff_iso = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()

    try:
        result = (
            supabase.table("wallet_portfolio_snapshots")
            .select("snapshot_at, net_worth, cash_dbucks, positions_value")
            .eq("wallet_address", w)
            .gte("snapshot_at", cutoff_iso)
            .order("snapshot_at", desc=False)
            .limit(2000)
            .execute()
        )
    except Exception as e:
        logger.error("portfolio-snapshots query failed for %s: %s", w, e)
        raise HTTPException(status_code=503, detail=f"Database query failed: {e}")

    rows = result.data or []
    points = [
        PortfolioSnapshotPoint(
            snapshot_at=str(r["snapshot_at"]),
            net_worth=float(r["net_worth"]),
            cash_dbucks=float(r["cash_dbucks"]),
            positions_value=float(r["positions_value"]),
        )
        for r in rows
    ]

    return PortfolioSnapshotsResponse(
        wallet_address=w,
        days=days,
        source="snapshots" if points else "none",
        points=points,
    )
