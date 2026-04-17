"""Live FP tracker for in-progress games.

Loop (every LIVE_INTERVAL):
  1. Open markets whose tip_off is within the last LIVE_WINDOW_HOURS.
  2. For each, pull BoxScoreV2; compute live FP for both players.
  3. Insert into h2h_live_scores so the frontend can poll /api/h2h/markets/{id}/live.
  4. Also snapshot pool state (price + fees) to h2h_pool_snapshots so we get
     a time series of how the odds evolve during the game.
"""

from __future__ import annotations

import logging
import os
import time
from datetime import datetime, timedelta, timezone
from typing import List

from db import get_supabase
from nba_stats import calculate_fantasy_points

from .lp_metrics import snapshot_pool

logger = logging.getLogger("statix.h2h.live_tracker")

LIVE_INTERVAL = int(os.getenv("H2H_LIVE_INTERVAL", "60"))
LIVE_WINDOW_HOURS = int(os.getenv("H2H_LIVE_WINDOW_HOURS", "4"))


def _list_live_markets() -> List[dict]:
    sb = get_supabase()
    if sb is None:
        return []
    now = datetime.now(timezone.utc)
    window_start = (now - timedelta(hours=LIVE_WINDOW_HOURS)).isoformat()
    window_end = now.isoformat()
    try:
        resp = (
            sb.table("h2h_markets")
            .select("*")
            .eq("status", "open")
            .gte("tip_off_at", window_start)
            .lte("tip_off_at", window_end)
            .execute()
        )
        return resp.data or []
    except Exception as e:
        logger.warning("live markets query failed: %s", e)
        return []


def _player_live(players_df, nba_id: int):
    rows = players_df[players_df["PLAYER_ID"] == nba_id]
    if rows.empty:
        return (0.0, 0.0)
    row = rows.iloc[0]
    stats = {
        "PTS": float(row.get("PTS") or 0),
        "REB": float(row.get("REB") or 0),
        "AST": float(row.get("AST") or 0),
        "STL": float(row.get("STL") or 0),
        "BLK": float(row.get("BLK") or 0),
        "FG3M": float(row.get("FG3M") or 0),
        "TOV": float(row.get("TO") or 0),
    }
    minutes_raw = row.get("MIN")
    minutes = 0.0
    if minutes_raw is not None:
        s = str(minutes_raw).strip()
        if ":" in s:
            try:
                mm, ss = s.split(":")
                minutes = float(mm) + float(ss) / 60.0
            except Exception:
                minutes = 0.0
        else:
            try:
                minutes = float(s)
            except Exception:
                minutes = 0.0
    return (calculate_fantasy_points(stats), minutes)


def _record_live_score(market: dict, fp_a: float, min_a: float, fp_b: float, min_b: float) -> None:
    sb = get_supabase()
    if sb is None:
        return
    row = {
        "market_id": market["id"],
        "captured_at": datetime.now(timezone.utc).isoformat(),
        "player_a_fp": fp_a,
        "player_a_minutes": min_a,
        "player_b_fp": fp_b,
        "player_b_minutes": min_b,
        "game_status": "live",
    }
    try:
        sb.table("h2h_live_scores").insert(row).execute()
    except Exception as e:
        logger.warning("h2h_live_scores insert failed: %s", e)


def run_once() -> int:
    markets = _list_live_markets()
    if not markets:
        return 0
    try:
        from nba_api.stats.endpoints import boxscoretraditionalv2
    except Exception as e:
        logger.warning("nba_api import failed: %s", e)
        return 0

    handled = 0
    for m in markets:
        gid = m.get("game_id")
        if not gid:
            continue
        try:
            bs = boxscoretraditionalv2.BoxScoreTraditionalV2(game_id=gid, timeout=8)
            df = bs.player_stats.get_data_frame()
        except Exception as e:
            logger.warning("BoxScoreV2 fetch failed for %s: %s", gid, e)
            continue
        fp_a, min_a = _player_live(df, int(m["player_a_nba_id"]))
        fp_b, min_b = _player_live(df, int(m["player_b_nba_id"]))
        _record_live_score(m, fp_a, min_a, fp_b, min_b)
        snapshot_pool(m)
        handled += 1
    return handled


def run_forever(interval: int = LIVE_INTERVAL) -> None:
    logger.info("H2H live tracker starting (interval=%ss)", interval)
    while True:
        try:
            n = run_once()
            if n:
                logger.info("Live tracker pass — %s markets updated", n)
        except Exception as e:
            logger.exception("Live tracker error: %s", e)
        time.sleep(interval)
