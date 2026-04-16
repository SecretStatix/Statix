"""
Dividend routes - round info, user claim history, leaderboard.
"""
from fastapi import APIRouter, HTTPException
from chain import get_deployment
from db import get_supabase

router = APIRouter()

DIVIDEND_CONFIG = {
    "fee_rate": 0.02,
    "dividend_pool_pct": 0.67,
    "company_pct": 0.33,
    "base_pct": 0.20,
    "top_performer_pct": 0.80,
}


@router.get("/config")
async def get_dividend_config():
    return DIVIDEND_CONFIG


@router.get("/rounds")
async def get_rounds():
    """All completed distribution rounds (from round_distributions table)."""
    supabase = get_supabase()
    if supabase:
        result = (
            supabase.table("round_distributions")
            .select("*")
            .order("round", desc=True)
            .execute()
        )
        return result.data or []
    return []


@router.get("/rounds/{round_number}")
async def get_round(round_number: int):
    """Info for a specific distribution round."""
    supabase = get_supabase()
    if supabase:
        result = (
            supabase.table("round_distributions")
            .select("*")
            .eq("round", round_number)
            .execute()
        )
        if result.data:
            return result.data[0]
    raise HTTPException(status_code=404, detail=f"Round {round_number} not found or not yet distributed")


@router.get("/user/{wallet_address}")
async def get_user_dividends(wallet_address: str):
    """User's full dividend claim history, newest first."""
    supabase = get_supabase()
    if supabase:
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

    return {
        "wallet_address": wallet_address.lower(),
        "total_earned": 0,
        "rounds_claimed": 0,
        "claims": [],
    }


@router.get("/leaderboard")
async def get_dividend_leaderboard():
    """Portfolio leaderboard ranked by NAV (calls get_dividend_leaderboard() Postgres function)."""
    supabase = get_supabase()
    if supabase:
        result = supabase.rpc("get_dividend_leaderboard").execute()
        return result.data or []
    return []
