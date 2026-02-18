"""
Dividend routes - weekly dividend info, user history, claim status.
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Optional

from chain import get_deployment
from db import get_supabase, get_store

router = APIRouter()


# Dividend config (mirrors on-chain constants)
DIVIDEND_CONFIG = {
    "fee_rate": 0.015,          # 1.5% per trade
    "dividend_pool_pct": 0.67,   # 67% of fees to dividends
    "company_pct": 0.33,         # 33% to protocol
    "base_pct": 0.20,            # 20% of dividend pool to all holders
    "outperformer_pct": 0.80,    # 80% to outperformer holders
}


@router.get("/config")
async def get_dividend_config():
    """Get dividend configuration."""
    return DIVIDEND_CONFIG


@router.get("/week/{week}")
async def get_week_info(week: int):
    """Get dividend info for a specific week."""
    supabase = get_supabase()
    if supabase:
        result = supabase.table("weekly_dividends").select("*").eq("week", week).execute()
        if result.data:
            return result.data[0]

    return {
        "week": week,
        "status": "pending",
        "total_pool": 0,
        "base_pool": 0,
        "outperformer_pool": 0,
        "message": "No dividend data yet for this week",
    }


@router.get("/user/{wallet_address}")
async def get_user_dividends(wallet_address: str):
    """Get user's dividend history."""
    supabase = get_supabase()
    if supabase:
        result = (
            supabase.table("dividend_claims")
            .select("*")
            .eq("wallet_address", wallet_address.lower())
            .order("week", desc=True)
            .execute()
        )
        return {
            "wallet_address": wallet_address,
            "claims": result.data or [],
        }

    return {
        "wallet_address": wallet_address,
        "claims": [],
        "message": "Connect Supabase for persistent history",
    }


@router.get("/leaderboard")
async def get_dividend_leaderboard():
    """Get top dividend earners."""
    supabase = get_supabase()
    if supabase:
        result = (
            supabase.rpc("get_dividend_leaderboard")
            .execute()
        )
        return result.data or []

    return []
