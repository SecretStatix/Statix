"""
Admin routes — performance updates, dividend triggering, and snapshot jobs.

All endpoints require the ADMIN_KEY header (Bearer token). Workflow:
  1. POST /update-round-stats    — pull NBA data for a round window, upsert to round_performance
  2. POST /update-weekly-stats   — pull NBA data for a week window, upsert to weekly_performance
  3. GET  /snapshot-wallets      — list approved wallet addresses (used by distribute-dividends.js)
  4. POST /run-snapshot          — trigger an immediate portfolio NAV snapshot
  5. GET  /refresh-players       — bust player_cache.json and re-fetch from NBA API

Supabase upserts use batch inserts (single call per table) rather than per-row loops.
"""

import hmac
import logging
import os
from typing import List, Optional

from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel
from web3 import Web3

from nba_stats import fetch_curated_players, get_weekly_actuals
from routes.helpers import require_supabase, require_deployment
from snapshot.job import run_snapshot_job

logger = logging.getLogger(__name__)
router = APIRouter()

ADMIN_KEY = os.getenv("ADMIN_KEY")
if not ADMIN_KEY:
    import warnings
    warnings.warn("ADMIN_KEY not set — admin endpoints will reject all requests.", stacklevel=2)


def verify_admin(authorization: str = Header(None)):
    """Constant-time comparison against ADMIN_KEY. Rejects if key is unset."""
    if not ADMIN_KEY or not hmac.compare_digest(authorization or "", f"Bearer {ADMIN_KEY}"):
        raise HTTPException(status_code=403, detail="Not authorized")


# ── Request models ────────────────────────────────────────────────────────────

class WeeklyUpdate(BaseModel):
    week: int
    week_start: str   # YYYY-MM-DD
    week_end: str     # YYYY-MM-DD


class RoundUpdate(BaseModel):
    round: int
    round_start: str  # YYYY-MM-DD
    round_end: str    # YYYY-MM-DD
    top_n: int = 10


class ManualPerformance(BaseModel):
    week: int
    performances: List[dict]  # [{player_index, actual_points}]


# ── Routes ────────────────────────────────────────────────────────────────────

@router.post("/update-weekly-stats")
async def update_weekly_stats(update: WeeklyUpdate, _=Depends(verify_admin)):
    """Pull real NBA stats for a week window and calculate total fantasy points.

    Upserts all rows to weekly_performance in a single batch call.
    Returns data formatted for on-chain setWeeklyActualsBatch.
    """
    deployment = require_deployment()
    players = deployment.get("players", [])
    results = []

    for p in players:
        nba_id = p.get("nba_id")
        if not nba_id:
            continue
        try:
            weekly = get_weekly_actuals(nba_id, update.week_start, update.week_end)
            results.append({
                "player_index": p["index"],
                "name": p["name"],
                "nba_id": nba_id,
                "games_played": weekly["games_played"],
                "actual_points": round(weekly["total_fantasy_points"], 2),
            })
        except Exception as e:
            logger.warning("weekly stats failed for %s (nba_id=%s): %s", p["name"], nba_id, e)
            results.append({"player_index": p["index"], "name": p["name"], "error": str(e)})

    ok = [r for r in results if "error" not in r]

    supabase = require_supabase()
    if ok:
        rows = [
            {"week": update.week, "player_index": r["player_index"],
             "actual_points": r["actual_points"], "games_played": r["games_played"]}
            for r in ok
        ]
        try:
            supabase.table("weekly_performance").upsert(rows).execute()
            logger.info("Upserted %d rows to weekly_performance (week %d)", len(rows), update.week)
        except Exception as e:
            logger.error("weekly_performance batch upsert failed (week %d): %s", update.week, e)
            raise HTTPException(status_code=503, detail=f"Database upsert failed: {e}")

    on_chain_data = {
        "player_indices": [r["player_index"] for r in ok],
        "actual_points_scaled": [int(r["actual_points"] * 1e6) for r in ok],
    }
    return {
        "week": update.week,
        "players_updated": len(ok),
        "errors": len(results) - len(ok),
        "results": results,
        "on_chain_data": on_chain_data,
    }


@router.post("/update-round-stats")
async def update_round_stats(update: RoundUpdate, _=Depends(verify_admin)):
    """Pull real NBA stats for a playoff round window and compute per-game avg FPts.

    Upserts all rows to round_performance in a single batch call.
    Returns data formatted for on-chain setRoundPerformanceBatch.
    Minimum 1 game played required; players below threshold get avg_fpts=0.
    """
    deployment = require_deployment()
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
            logger.warning("round stats failed for %s (nba_id=%s): %s", p["name"], nba_id, e)
            results.append({"player_index": p["index"], "name": p["name"], "error": str(e)})

    ok = [r for r in results if "error" not in r]

    supabase = require_supabase()
    if ok:
        rows = [
            {"round": update.round, "player_index": r["player_index"],
             "games_played": r["games_played"], "avg_fpts": r["avg_fpts"]}
            for r in ok
        ]
        try:
            supabase.table("round_performance").upsert(rows).execute()
            logger.info("Upserted %d rows to round_performance (round %d)", len(rows), update.round)
        except Exception as e:
            logger.error("round_performance batch upsert failed (round %d): %s", update.round, e)
            raise HTTPException(status_code=503, detail=f"Database upsert failed: {e}")

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
        "errors": len(results) - len(ok),
        "results": results,
        "on_chain_data": on_chain_data,
    }


@router.post("/set-performance-manual")
async def set_performance_manual(data: ManualPerformance, _=Depends(verify_admin)):
    """Manually set performance data for testing or override.

    Returns data formatted for on-chain submission (no DB write).
    """
    on_chain_data = {
        "player_indices": [p["player_index"] for p in data.performances],
        "actual_points_scaled": [int(p["actual_points"] * 1e6) for p in data.performances],
    }
    return {"week": data.week, "players": len(data.performances), "on_chain_data": on_chain_data}


@router.get("/refresh-players")
async def refresh_players(_=Depends(verify_admin)):
    """Bust the 24h player_cache.json and re-fetch stats from NBA API."""
    cache_path = os.path.join(os.path.dirname(__file__), "..", "player_cache.json")
    if os.path.exists(cache_path):
        os.remove(cache_path)
        logger.info("Deleted player_cache.json — re-fetching from NBA API")

    players = fetch_curated_players()
    fetched = sum(1 for p in players if p.get("games_played", 0) > 0)
    return {"players_total": len(players), "players_with_stats": fetched}


@router.get("/snapshot-wallets")
async def snapshot_wallets(_=Depends(verify_admin)):
    """Return all approved wallet addresses (checksummed), paginated from profiles table.

    Used by distribute-dividends.js via BACKEND_URL + ADMIN_KEY to get the wallet list
    for on-chain dividend distribution.
    """
    supabase = require_supabase()

    page_size = 1000
    offset = 0
    rows: list = []

    try:
        while True:
            res = (
                supabase.table("profiles")
                .select("wallet_address")
                .eq("is_approved", True)
                .range(offset, offset + page_size - 1)
                .execute()
            )
            batch = res.data or []
            if not batch:
                break
            rows.extend(batch)
            if len(batch) < page_size:
                break
            offset += page_size
    except Exception as e:
        logger.error("snapshot-wallets: could not read profiles: %s", e)
        raise HTTPException(status_code=503, detail=f"Could not read profiles: {e}") from e

    seen: set[str] = set()
    wallets: list[str] = []
    for row in rows:
        raw = row.get("wallet_address")
        if not raw or not isinstance(raw, str) or not raw.strip():
            continue
        s = raw.strip()
        if not Web3.is_address(s):
            logger.warning("snapshot-wallets: skipping invalid address %r", s)
            continue
        low = s.lower()
        if low in seen:
            continue
        seen.add(low)
        wallets.append(Web3.to_checksum_address(s))

    logger.info("snapshot-wallets: returning %d approved wallets", len(wallets))
    return {"wallets": wallets, "count": len(wallets)}


@router.post("/run-snapshot")
async def run_snapshot(_=Depends(verify_admin)):
    """Trigger an immediate portfolio NAV snapshot.

    Reads all wallets from transactions, computes on-chain NAV for each, and
    writes to wallet_portfolio_snapshots. In production this runs hourly via
    cron — call this endpoint to force a refresh.
    """
    try:
        result = run_snapshot_job()
        return result
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))
