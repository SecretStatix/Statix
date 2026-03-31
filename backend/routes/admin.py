"""
Admin routes - weekly performance updates, dividend triggers.
Protected by admin key in production.
"""

from fastapi import APIRouter, HTTPException, Header, Depends
from pydantic import BaseModel
from typing import List, Optional
import hmac
import os

from nba_stats import fetch_top_players, get_weekly_actuals, calculate_fantasy_points
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


class ManualPerformance(BaseModel):
    week: int
    performances: List[dict]  # [{player_index, actual_points}]


@router.post("/update-weekly-stats")
async def update_weekly_stats(update: WeeklyUpdate, _=Depends(verify_admin)):
    """
    Pull real NBA stats for the week and calculate fantasy points.
    Returns data ready to be submitted on-chain.
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
            weekly_projection = p.get("weekly_projection", 0)
            actual_points = weekly["total_fantasy_points"]

            outperformance = 0
            if weekly_projection > 0:
                outperformance = (actual_points - weekly_projection) / weekly_projection

            results.append({
                "player_index": p["index"],
                "name": p["name"],
                "nba_id": nba_id,
                "games_played": weekly["games_played"],
                "actual_points": round(actual_points, 2),
                "projected_points": round(weekly_projection, 2),
                "outperformance": round(outperformance, 4),
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
                    "projected_points": r["projected_points"],
                    "outperformance": r["outperformance"],
                    "games_played": r["games_played"],
                }).execute()

    # Format for on-chain submission
    on_chain_data = {
        "player_indices": [r["player_index"] for r in results if "error" not in r],
        "actual_points_scaled": [
            int(r["actual_points"] * 1e6) for r in results if "error" not in r
        ],
    }

    return {
        "week": update.week,
        "players_updated": len([r for r in results if "error" not in r]),
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
    """Force refresh player data from NBA API."""

    import os
    cache_path = os.path.join(os.path.dirname(__file__), "..", "player_cache.json")
    if os.path.exists(cache_path):
        os.remove(cache_path)

    players = fetch_top_players(top_n=50)
    return {"players_fetched": len(players)}
