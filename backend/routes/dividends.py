"""
Dividend routes — round info, user claim history, top performers, leaderboard.

Data flow:
  - round_distributions table is written by distribute-dividends.js (on-chain events)
  - dividend_claims table is written by the chain indexer (DividendClaimed events)
  - round_performance table is written by POST /admin/update-round-stats
  - Player name/team comes from deployments.json via chain.get_player_map()

Endpoints:
  GET /config              — fee & split constants
  GET /rounds              — all completed distribution rounds
  GET /rounds/{n}          — info for a specific round
  GET /user/{wallet}       — claim history and totals for a wallet
  GET /top-performers      — ranked players eligible for the 80% bonus pool
  GET /leaderboard         — portfolio NAV leaderboard
"""

import logging

from fastapi import APIRouter, HTTPException

from chain import get_player_map
from config import (
    FEE_RATE, DIVIDEND_POOL_PCT, COMPANY_PCT,
    BASE_POOL_PCT, TOP_PERFORMER_PCT,
)
from routes.helpers import require_supabase

logger = logging.getLogger(__name__)
router = APIRouter()

DIVIDEND_CONFIG = {
    "fee_rate": FEE_RATE,
    "dividend_pool_pct": DIVIDEND_POOL_PCT,
    "company_pct": COMPANY_PCT,
    "base_pct": BASE_POOL_PCT,
    "top_performer_pct": TOP_PERFORMER_PCT,
}


@router.get("/config")
async def get_dividend_config():
    """Fee and split constants (matches StatixRouter.sol + DividendHub.sol)."""
    return DIVIDEND_CONFIG


@router.get("/rounds")
async def get_rounds():
    """All completed distribution rounds, newest first."""
    supabase = require_supabase()
    result = (
        supabase.table("round_distributions")
        .select("*")
        .order("round", desc=True)
        .execute()
    )
    return result.data or []


@router.get("/rounds/{round_number}")
async def get_round(round_number: int):
    """Info for a specific distribution round."""
    supabase = require_supabase()
    result = (
        supabase.table("round_distributions")
        .select("*")
        .eq("round", round_number)
        .execute()
    )
    if result.data:
        return result.data[0]
    raise HTTPException(
        status_code=404,
        detail=f"Round {round_number} not found or not yet distributed",
    )


@router.get("/user/{wallet_address}")
async def get_user_dividends(wallet_address: str):
    """Full dividend claim history for a wallet, newest first."""
    supabase = require_supabase()
    result = (
        supabase.table("dividend_claims")
        .select("round, amount, tx_hash, claimed_at")
        .eq("wallet_address", wallet_address.lower())
        .order("round", desc=True)
        .execute()
    )
    claims = result.data or []
    total_earned = sum(float(c["amount"]) for c in claims)
    return {
        "wallet_address": wallet_address.lower(),
        "total_earned": round(total_earned, 6),
        "rounds_claimed": len(claims),
        "claims": claims,
    }


@router.get("/top-performers")
async def get_top_performers(round: int = None):
    """Top performing players eligible for the 80% bonus pool.

    Defaults to the latest completed round. Returns players sorted by avg_fpts
    descending, capped to top_n for that round.
    Player names come from deployments.json — no separate DB lookup needed.
    """
    supabase = require_supabase()

    if round is None:
        result = (
            supabase.table("round_distributions")
            .select("round")
            .order("round", desc=True)
            .limit(1)
            .execute()
        )
        if not result.data:
            return []
        round = result.data[0]["round"]

    dist = (
        supabase.table("round_distributions")
        .select("top_n")
        .eq("round", round)
        .execute()
    )
    top_n = dist.data[0]["top_n"] if dist.data else 10

    perf = (
        supabase.table("round_performance")
        .select("player_index, avg_fpts, games_played")
        .eq("round", round)
        .order("avg_fpts", desc=True)
        .limit(top_n)
        .execute()
    )
    rows = perf.data or []

    players_by_index = get_player_map()

    out = []
    for r in rows:
        idx = r["player_index"]
        p = players_by_index.get(idx, {})
        out.append({
            "rank": len(out) + 1,
            "player_index": idx,
            "player_name": p.get("name", f"Player #{idx}"),
            "player_team": p.get("team", ""),
            "avg_fpts": float(r["avg_fpts"]),
            "games_played": r["games_played"],
            "round": round,
        })
    return out


@router.get("/leaderboard")
async def get_dividend_leaderboard():
    """Portfolio leaderboard ranked by NAV (calls get_dividend_leaderboard() Postgres function)."""
    supabase = require_supabase()
    try:
        result = supabase.rpc("get_dividend_leaderboard").execute()
    except Exception as e:
        logger.error("leaderboard RPC failed: %s", e)
        raise HTTPException(status_code=503, detail=f"Leaderboard query failed: {e}")
    return result.data or []
