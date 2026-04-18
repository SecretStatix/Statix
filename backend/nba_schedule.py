"""
NBA full-season schedule via stats.nba.com (ScheduleLeagueV2).

Used to answer “what games start in the next N hours?” without per-day scoreboard calls.
"""

from __future__ import annotations

import logging
import os
import time as _time
from datetime import datetime, timedelta, timezone
from typing import Any

logger = logging.getLogger(__name__)

_SCHEDULE_CACHE: dict[str, Any] = {"ts": 0.0, "season": "", "games": None}
_SCHEDULE_TTL = max(60, int(os.getenv("NBA_SCHEDULE_CACHE_SECONDS", "3600")))
_NBA_SCHEDULE_TIMEOUT = max(10, int(os.getenv("NBA_SCHEDULE_FETCH_TIMEOUT", "30")))


def _current_nba_season() -> str:
    now = datetime.now()
    year = now.year if now.month >= 10 else now.year - 1
    return f"{year}-{str(year + 1)[-2:]}"


def _fetch_league_schedule_games(season: str, timeout: int) -> list[dict[str, Any]]:
    """Blocking: download league schedule and normalize rows."""
    import pandas as pd
    from nba_api.stats.endpoints import scheduleleaguev2

    s = scheduleleaguev2.ScheduleLeagueV2(
        league_id="00",
        season=season,
        timeout=timeout,
    )
    df = s.get_data_frames()[0]
    if df.empty:
        return []

    df = df.copy()
    df["dt"] = pd.to_datetime(df["gameDateTimeUTC"], utc=True, errors="coerce")
    df = df.dropna(subset=["dt"])

    games: list[dict[str, Any]] = []
    for _, row in df.iterrows():
        dt = row["dt"]
        if hasattr(dt, "to_pydatetime"):
            dt = dt.to_pydatetime()
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        iso = dt.isoformat().replace("+00:00", "Z")

        arena = row.get("arenaName")
        city = row.get("arenaCity")
        state = row.get("arenaState")
        gs_raw = row.get("gameStatus")
        if pd.isna(gs_raw):
            game_status = 0
        else:
            try:
                game_status = int(gs_raw)
            except (TypeError, ValueError):
                game_status = 0

        games.append(
            {
                "game_id": str(row["gameId"]),
                "away_team_tricode": str(row.get("awayTeam_teamTricode") or ""),
                "home_team_tricode": str(row.get("homeTeam_teamTricode") or ""),
                "away_team": f"{row.get('awayTeam_teamCity', '')} {row.get('awayTeam_teamName', '')}".strip(),
                "home_team": f"{row.get('homeTeam_teamCity', '')} {row.get('homeTeam_teamName', '')}".strip(),
                "start_time_utc": iso,
                "arena_name": "" if pd.isna(arena) else str(arena),
                "arena_city": "" if pd.isna(city) else str(city),
                "arena_state": "" if pd.isna(state) else str(state),
                "game_status": game_status,
            }
        )
    return games


def _get_cached_schedule(season: str) -> list[dict[str, Any]]:
    now = _time.time()
    if (
        _SCHEDULE_CACHE["games"] is not None
        and _SCHEDULE_CACHE["season"] == season
        and now - float(_SCHEDULE_CACHE["ts"]) < _SCHEDULE_TTL
    ):
        return _SCHEDULE_CACHE["games"]

    logger.info("Fetching NBA league schedule for season=%s (cache miss)", season)
    games = _fetch_league_schedule_games(season, _NBA_SCHEDULE_TIMEOUT)
    _SCHEDULE_CACHE.update({"ts": now, "season": season, "games": games})
    return games


def get_upcoming_games_within_hours(hours: int = 24) -> dict[str, Any]:
    """
    Games with scheduled tip-off in [now, now + hours), based on gameDateTimeUTC.

    Full schedule is cached in-process (_SCHEDULE_TTL) to avoid hammering the NBA API.
    """
    if hours < 1 or hours > 168:
        raise ValueError("hours must be between 1 and 168")

    season = _current_nba_season()
    games = _get_cached_schedule(season)
    now = datetime.now(timezone.utc)
    end = now + timedelta(hours=hours)

    upcoming: list[dict[str, Any]] = []
    for g in games:
        raw = g["start_time_utc"]
        try:
            dt = datetime.fromisoformat(raw.replace("Z", "+00:00"))
        except ValueError:
            continue
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        if now <= dt < end:
            upcoming.append(g)

    upcoming.sort(key=lambda x: x["start_time_utc"])
    return {
        "season": season,
        "hours": hours,
        "window_start_utc": now.isoformat().replace("+00:00", "Z"),
        "window_end_utc": end.isoformat().replace("+00:00", "Z"),
        "count": len(upcoming),
        "games": upcoming,
    }
