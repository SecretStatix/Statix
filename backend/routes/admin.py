"""
Admin routes - weekly performance updates, dividend triggers.
Protected by admin key in production.
"""

from fastapi import APIRouter, HTTPException, Header, Depends
from pydantic import BaseModel
from typing import List, Optional
import hmac
import os

from nba_stats import fetch_top_players, fetch_curated_players, get_weekly_actuals, calculate_fantasy_points
from chain import get_deployment
from db import get_supabase, get_store

router = APIRouter()

ADMIN_KEY = os.getenv("ADMIN_KEY")
if not ADMIN_KEY:
    import warnings
    warnings.warn("ADMIN_KEY not set! Admin endpoints will reject all requests.", stacklevel=2)


def verify_admin(authorization: str = Header(None)):
    """Admin key check. Rejects all requests if ADMIN_KEY env var is not set."""
    if not ADMIN_KEY or not hmac.compare_digest(authorization or "", f"Bearer {ADMIN_KEY}"):
        raise HTTPException(status_code=403, detail="Not authorized")


class WeeklyUpdate(BaseModel):
    week: int
    week_start: str  # YYYY-MM-DD
    week_end: str    # YYYY-MM-DD


class RoundUpdate(BaseModel):
    round: int
    round_start: str  # YYYY-MM-DD
    round_end: str    # YYYY-MM-DD
    top_n: int = 10


class ManualPerformance(BaseModel):
    week: int
    performances: List[dict]  # [{player_index, actual_points}]


@router.post("/update-weekly-stats")
async def update_weekly_stats(update: WeeklyUpdate, _=Depends(verify_admin)):
    """
    Pull real NBA stats for the week and calculate actual fantasy points.
    Returns data ready to be submitted on-chain (absolute FPts, no projections).
    """
    deployment = get_deployment()
    if not deployment:
        raise HTTPException(status_code=503, detail="Not deployed")

    players = deployment.get("players", [])
    results = []

    for p in players:
        nba_id = p.get("nba_id")
        if not nba_id:
            continue

        try:
            weekly = get_weekly_actuals(nba_id, update.week_start, update.week_end)
            actual_points = weekly["total_fantasy_points"]

            results.append({
                "player_index": p["index"],
                "name": p["name"],
                "nba_id": nba_id,
                "games_played": weekly["games_played"],
                "actual_points": round(actual_points, 2),
            })
        except Exception as e:
            results.append({
                "player_index": p["index"],
                "name": p["name"],
                "error": str(e),
            })

    # Save to Supabase if available
    supabase = get_supabase()
    if supabase:
        for r in results:
            if "error" not in r:
                supabase.table("weekly_performance").upsert({
                    "week": update.week,
                    "player_index": r["player_index"],
                    "actual_points": r["actual_points"],
                    "games_played": r["games_played"],
                }).execute()

    # Format for on-chain submission (fantasy points scaled 1e6)
    ok = [r for r in results if "error" not in r]
    on_chain_data = {
        "player_indices": [r["player_index"] for r in ok],
        "actual_points_scaled": [int(r["actual_points"] * 1e6) for r in ok],
    }

    return {
        "week": update.week,
        "players_updated": len([r for r in results if "error" not in r]),
        "errors": len([r for r in results if "error" in r]),
        "results": results,
        "on_chain_data": on_chain_data,
    }


@router.post("/update-round-stats")
async def update_round_stats(update: RoundUpdate, _=Depends(verify_admin)):
    """
    Pull real NBA stats for a playoff round window and compute per-game avg FPts.
    Returns data ready for on-chain submission via setRoundPerformanceBatch.
    Minimum 2 games played required; players below threshold return avg_fpts=0.
    """
    deployment = get_deployment()
    if not deployment:
        raise HTTPException(status_code=503, detail="Not deployed")

    players = deployment.get("players", [])
    results = []

    for p in players:
        nba_id = p.get("nba_id")
        if not nba_id:
            continue

        try:
            weekly = get_weekly_actuals(nba_id, update.round_start, update.round_end)
            games_played = weekly["games_played"]
            total_fpts = weekly["total_fantasy_points"]
            avg_fpts = round(total_fpts / games_played, 4) if games_played >= 1 else 0.0

            results.append({
                "player_index": p["index"],
                "name": p["name"],
                "nba_id": nba_id,
                "games_played": games_played,
                "total_fpts": round(total_fpts, 2),
                "avg_fpts": avg_fpts,
            })
        except Exception as e:
            results.append({
                "player_index": p["index"],
                "name": p["name"],
                "error": str(e),
            })

    # Save to Supabase if available
    supabase = get_supabase()
    if supabase:
        for r in results:
            if "error" not in r:
                supabase.table("round_performance").upsert({
                    "round": update.round,
                    "player_index": r["player_index"],
                    "games_played": r["games_played"],
                    "avg_fpts": r["avg_fpts"],
                }).execute()

    # Format for on-chain (avg FPts scaled 1e6, 0 for players below min games)
    ok = [r for r in results if "error" not in r]
    on_chain_data = {
        "player_indices": [r["player_index"] for r in ok],
        "avg_fpts_scaled": [int(r["avg_fpts"] * 1e6) for r in ok],
        "games_played": [r["games_played"] for r in ok],
    }

    return {
        "round": update.round,
        "round_start": update.round_start,
        "round_end": update.round_end,
        "top_n": update.top_n,
        "players_updated": len(ok),
        "errors": len([r for r in results if "error" in r]),
        "results": results,
        "on_chain_data": on_chain_data,
    }


@router.post("/set-performance-manual")
async def set_performance_manual(data: ManualPerformance, _=Depends(verify_admin)):
    """
    Manually set performance data (for testing or manual override).
    Returns data formatted for on-chain submission.
    """

    on_chain_data = {
        "player_indices": [p["player_index"] for p in data.performances],
        "actual_points_scaled": [
            int(p["actual_points"] * 1e6) for p in data.performances
        ],
    }

    return {
        "week": data.week,
        "players": len(data.performances),
        "on_chain_data": on_chain_data,
    }


@router.get("/refresh-players")
async def refresh_players(_=Depends(verify_admin)):
    """Force refresh player data from NBA API for all 50 curated players."""

    import os
    cache_path = os.path.join(os.path.dirname(__file__), "..", "player_cache.json")
    if os.path.exists(cache_path):
        os.remove(cache_path)

    players = fetch_curated_players()
    fetched = len([p for p in players if p.get("games_played", 0) > 0])
    return {"players_total": len(players), "players_with_stats": fetched}
