"""
Admin routes — performance updates, dividend triggering, and snapshot jobs.

All endpoints require the ADMIN_KEY header (Bearer token). Workflow:
  1. POST /update-round-stats    — pull NBA data for a round window, upsert to round_performance
  2. POST /update-weekly-stats   — pull NBA data for a week window, upsert to weekly_performance
  3. GET  /job-status/{job_id}   — check background job status
  4. GET  /snapshot-wallets      — list approved wallet addresses (used by distribute-dividends.js)
  5. POST /run-snapshot          — trigger an immediate portfolio NAV snapshot
  6. GET  /refresh-players       — bust player_cache.json and re-fetch from NBA API
  7. POST /approve-user          — set profiles.is_approved; optional Resend welcome email (see approval_email.py)

Supabase upserts use batch inserts (single call per table) rather than per-row loops.
Long-running NBA API fetches (80 players × 0.6s ≈ 48s) run as background tasks and
return a job_id immediately. Poll GET /job-status/{job_id} for the result.
"""

import hmac
import logging
import os
import uuid
from typing import List, Optional

from fastapi import APIRouter, BackgroundTasks, Depends, Header, HTTPException
from pydantic import BaseModel, Field
from web3 import Web3

from approval_email import ApprovalEmailSendResult, send_account_approval_email
from nba_stats import fetch_curated_players, get_weekly_actuals  # get_weekly_actuals used by update-weekly-stats
from routes.helpers import require_supabase, require_deployment
from snapshot.job import run_snapshot_job

# In-memory job status store (per-process, sufficient for single-instance admin use)
_jobs: dict[str, dict] = {}

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
    round_start: str   # YYYY-MM-DD
    round_end: str     # YYYY-MM-DD
    top_n: int = 10


class ManualPerformance(BaseModel):
    week: int
    performances: List[dict]  # [{player_index, actual_points}]


class ApproveUserBody(BaseModel):
    email: str = Field(..., min_length=3, max_length=320)
    resend_notification: bool = Field(
        False,
        description="If true and the user is already approved, send the welcome email again.",
    )


# ── Routes ────────────────────────────────────────────────────────────────────

def _run_weekly_stats_job(job_id: str, update: WeeklyUpdate) -> None:
    """Background worker for update-weekly-stats. Writes result into _jobs[job_id]."""
    from db import get_supabase as _get_supabase
    from chain import get_deployment as _get_deployment

    _jobs[job_id]["status"] = "running"
    try:
        deployment = _get_deployment()
        if not deployment:
            raise RuntimeError("deployments.json missing")
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

        supabase = _get_supabase()
        if supabase and ok:
            rows = [
                {"week": update.week, "player_index": r["player_index"],
                 "actual_points": r["actual_points"], "games_played": r["games_played"]}
                for r in ok
            ]
            supabase.table("weekly_performance").upsert(rows).execute()
            logger.info("Upserted %d rows to weekly_performance (week %d)", len(rows), update.week)

        on_chain_data = {
            "player_indices": [r["player_index"] for r in ok],
            "actual_points_scaled": [int(r["actual_points"] * 1e6) for r in ok],
        }
        _jobs[job_id].update({
            "status": "done",
            "result": {
                "week": update.week,
                "players_updated": len(ok),
                "errors": len(results) - len(ok),
                "results": results,
                "on_chain_data": on_chain_data,
            },
        })
    except Exception as e:
        logger.error("weekly stats job %s failed: %s", job_id, e)
        _jobs[job_id].update({"status": "error", "error": str(e)})


def _run_round_stats_job(job_id: str, update: RoundUpdate) -> None:
    """Background worker for update-round-stats. Reads from player_cache.json — no NBA API calls.

    Filters each player's cached recent_games by date range, sums fantasy_points,
    and computes avg_fpts. Instant and reliable vs. live NBA API which times out on cloud IPs.
    Run update_daily.sh first to ensure the cache is fresh.
    """
    import json
    from datetime import datetime
    from pathlib import Path
    from db import get_supabase as _get_supabase
    from chain import get_deployment as _get_deployment

    _jobs[job_id]["status"] = "running"
    try:
        deployment = _get_deployment()
        if not deployment:
            raise RuntimeError("deployments.json missing")
        players = deployment.get("players", [])

        # Load player_cache.json — keyed by nba_id
        cache_path = Path(__file__).parent.parent / "player_cache.json"
        if not cache_path.exists():
            raise RuntimeError("player_cache.json not found — run update_daily.sh first")
        with open(cache_path) as f:
            cache_data = json.load(f)
        nba_cache = {p["nba_id"]: p for p in cache_data.get("players", [])}

        start = datetime.strptime(update.round_start, "%Y-%m-%d")
        end = datetime.strptime(update.round_end, "%Y-%m-%d")

        results = []
        for p in players:
            nba_id = p.get("nba_id")
            if not nba_id:
                continue
            cached = nba_cache.get(nba_id, {})
            recent_games = cached.get("recent_games", [])
            round_games = [
                g for g in recent_games
                if start <= datetime.strptime(g["date"], "%b %d, %Y") <= end
            ]
            games_played = len(round_games)
            total_fpts = sum(g["fantasy_points"] for g in round_games)
            avg_fpts = round(total_fpts / games_played, 4) if games_played >= 1 else 0.0
            results.append({
                "player_index": p["index"],
                "name": p["name"],
                "nba_id": nba_id,
                "games_played": games_played,
                "total_fpts": round(total_fpts, 2),
                "avg_fpts": avg_fpts,
            })

        ok = [r for r in results if "error" not in r]

        supabase = _get_supabase()
        if supabase and ok:
            rows = [
                {"round": update.round, "player_index": r["player_index"],
                 "games_played": r["games_played"], "avg_fpts": r["avg_fpts"]}
                for r in ok
            ]
            supabase.table("round_performance").upsert(rows).execute()
            logger.info("Upserted %d rows to round_performance (round %d)", len(rows), update.round)

        on_chain_data = {
            "player_indices": [r["player_index"] for r in ok],
            "avg_fpts_scaled": [int(r["avg_fpts"] * 1e6) for r in ok],
            "games_played": [r["games_played"] for r in ok],
        }
        _jobs[job_id].update({
            "status": "done",
            "result": {
                "round": update.round,
                "round_start": update.round_start,
                "round_end": update.round_end,
                "top_n": update.top_n,
                "players_updated": len(ok),
                "errors": len(results) - len(ok),
                "results": results,
                "on_chain_data": on_chain_data,
            },
        })
    except Exception as e:
        logger.error("round stats job %s failed: %s", job_id, e)
        _jobs[job_id].update({"status": "error", "error": str(e)})


@router.post("/update-weekly-stats")
async def update_weekly_stats(
    update: WeeklyUpdate,
    background_tasks: BackgroundTasks,
    _=Depends(verify_admin),
):
    """Kick off a background job to pull NBA stats for a week window.

    Returns immediately with a job_id. Poll GET /job-status/{job_id} for the result.
    80 players × ~0.6s NBA API sleep ≈ 48s — must run in background to avoid timeouts.
    """
    job_id = str(uuid.uuid4())
    _jobs[job_id] = {"status": "queued", "type": "weekly", "week": update.week}
    background_tasks.add_task(_run_weekly_stats_job, job_id, update)
    return {"job_id": job_id, "status": "queued", "message": "Poll GET /api/admin/job-status/" + job_id}


@router.post("/update-round-stats")
async def update_round_stats(update: RoundUpdate, _=Depends(verify_admin)):
    """Compute round stats from player_cache.json and return on_chain_data synchronously.

    Reads from local cache — instant, no NBA API calls. Run update_daily.sh first.
    Returns on_chain_data directly so distribute-dividends.js can consume it immediately.
    """
    job_id = str(uuid.uuid4())
    _jobs[job_id] = {"status": "queued", "type": "round", "round": update.round}
    _run_round_stats_job(job_id, update)
    job = _jobs[job_id]
    if job["status"] == "error":
        raise HTTPException(status_code=500, detail=job.get("error", "round stats failed"))
    return job["result"]


@router.get("/job-status/{job_id}")
async def get_job_status(job_id: str, _=Depends(verify_admin)):
    """Check the status of a background stats job.

    Returns {status: queued|running|done|error, result?, error?}.
    """
    job = _jobs.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return job


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


def _find_profile_by_email(supabase, email: str) -> Optional[dict]:
    """Return one profile row or None. Uses ILIKE for case-insensitive match."""
    clean = email.strip()
    if not clean or "@" not in clean:
        return None
    res = (
        supabase.table("profiles")
        .select("id, email, username, first_name, is_approved")
        .ilike("email", clean)
        .limit(2)
        .execute()
    )
    rows = res.data or []
    if len(rows) > 1:
        raise HTTPException(
            status_code=409,
            detail="Multiple profiles match this email — resolve manually in Supabase.",
        )
    return rows[0] if rows else None


def _display_name_for_profile(row: dict, fallback_email: str) -> str:
    return (
        (row.get("username") or "").strip()
        or (row.get("first_name") or "").strip()
        or (row.get("email") or fallback_email).split("@", 1)[0]
        or "there"
    )


@router.post("/approve-user")
async def approve_user(body: ApproveUserBody, _=Depends(verify_admin)):
    """Set ``profiles.is_approved`` to true and send welcome email via ``approval_email`` (optional Resend).

    Body: ``{"email":"..."}`` — case-insensitive match. Use ``resend_notification: true`` to send
    the email again for an already-approved user (e.g. after configuring ``RESEND_API_KEY``).
    """
    supabase = require_supabase()

    row = _find_profile_by_email(supabase, body.email)
    if not row:
        raise HTTPException(status_code=404, detail="No profile found for that email")

    uid = row["id"]
    to_addr = (row.get("email") or body.email).strip()
    display = _display_name_for_profile(row, body.email)

    if row.get("is_approved") is True:
        if body.resend_notification and "@" in to_addr:
            mail = await send_account_approval_email(to_email=to_addr, display_name=display)
            return {
                "ok": True,
                "already_approved": True,
                "id": uid,
                "email": to_addr,
                "email_sent": mail.sent,
                "email_detail": mail.detail,
            }
        return {
            "ok": True,
            "already_approved": True,
            "id": uid,
            "email": to_addr,
            "email_sent": False,
            "email_detail": "skipped_use_resend_notification_true_to_email_again",
        }

    try:
        supabase.table("profiles").update({"is_approved": True}).eq("id", uid).execute()
    except Exception as e:
        logger.error("approve-user: update failed: %s", e)
        raise HTTPException(status_code=503, detail=f"Could not update profile: {e}") from e

    if "@" not in to_addr:
        logger.warning("approve-user: missing usable email — skipping send")
        mail = ApprovalEmailSendResult(False, "no_at_in_profile_email")
    else:
        mail = await send_account_approval_email(to_email=to_addr, display_name=display)

    logger.info(
        "approve-user: approved profile %s (%s) email_sent=%s detail=%s",
        uid,
        to_addr,
        mail.sent,
        mail.detail,
    )
    return {
        "ok": True,
        "already_approved": False,
        "id": uid,
        "email": to_addr,
        "email_sent": mail.sent,
        "email_detail": mail.detail,
    }
