"""
NBA Stats Integration — fetches real player data for Statix.

Uses nba_api to pull from stats.nba.com. Primary flow:
  1. _load_curated_players() reads players.json (80 players with nba_id)
  2. fetch_player_season_stats() pulls each player's game log for season averages
  3. Results are cached in player_cache.json for 24 hours

Consumed by: routes/players.py (list + detail), routes/admin.py (round stats).
Fantasy point formula is imported from config.SCORING — do not inline it here.
"""

import json
import logging
import os
import re
import time
import unicodedata
from datetime import datetime, timedelta
from pathlib import Path
from typing import Dict, List, Optional

from nba_api.stats.endpoints import playergamelog
from nba_api.stats.static import players as nba_players

from config import SCORING

logger = logging.getLogger(__name__)

CACHE_FILE = os.path.join(os.path.dirname(__file__), "player_cache.json")
PLAYERS_JSON = os.path.join(
    os.path.dirname(__file__), "..", "blockchain", "scripts", "players.json"
)


def calculate_fantasy_points(stats: dict) -> float:
    """Calculate fantasy points from a stat-line dict (per-game basis).

    Stat keys: PTS, REB, AST, STL, BLK, FG3M, TOV.
    Bonus categories: DD_BONUS (10+ in 2 cats), TD_BONUS (10+ in 3 cats).
    """
    base = (
        stats.get("PTS", 0) * SCORING["PTS"]
        + stats.get("REB", 0) * SCORING["REB"]
        + stats.get("AST", 0) * SCORING["AST"]
        + stats.get("STL", 0) * SCORING["STL"]
        + stats.get("BLK", 0) * SCORING["BLK"]
        + stats.get("FG3M", 0) * SCORING["FG3M"]
        + stats.get("TOV", 0) * SCORING["TOV"]
    )
    dd_cats = ["PTS", "REB", "AST", "STL", "BLK"]
    doubles = sum(1 for cat in dd_cats if stats.get(cat, 0) >= 10)
    if doubles >= 3:
        base += SCORING["TD_BONUS"]
    elif doubles >= 2:
        base += SCORING["DD_BONUS"]
    return base


def _current_nba_season() -> str:
    """Calculate current NBA season string (e.g., '2025-26') from today's date."""
    now = datetime.now()
    year = now.year if now.month >= 10 else now.year - 1
    return f"{year}-{str(year + 1)[-2:]}"


def _load_curated_players() -> List[dict]:
    """Load the curated player list from blockchain/scripts/players.json.

    Raises FileNotFoundError if the file is absent — run `npm run generate-players`
    in the blockchain directory to create it.
    """
    if os.path.exists(PLAYERS_JSON):
        with open(PLAYERS_JSON) as f:
            return json.load(f)
    raise FileNotFoundError(
        f"players.json not found at {PLAYERS_JSON}. "
        "Run `npm run generate-players` in the blockchain directory."
    )


def _row_fpts(row, has_fg3m: bool) -> float:
    """Compute fantasy points for a single game-log DataFrame row."""
    return calculate_fantasy_points({
        "PTS": row.get("PTS", 0),
        "REB": row.get("REB", 0),
        "AST": row.get("AST", 0),
        "STL": row.get("STL", 0),
        "BLK": row.get("BLK", 0),
        "FG3M": row.get("FG3M", 0) if has_fg3m else 0,
        "TOV": row.get("TOV", 0),
    })


def fetch_player_season_stats(nba_id: int, season: str = None) -> Optional[dict]:
    """Fetch season averages for a player from their NBA game log.

    Returns None if the player has no data for the season (did not play).
    Logs a warning on API failure rather than silently returning None.
    """
    if season is None:
        season = _current_nba_season()

    try:
        log = playergamelog.PlayerGameLog(player_id=nba_id, season=season)
        time.sleep(0.6)
        df = log.get_data_frames()[0]
    except Exception as e:
        logger.warning("NBA API fetch failed for nba_id=%s season=%s: %s", nba_id, season, e)
        return None

    if df.empty:
        return None

    has_fg3m = "FG3M" in df.columns
    avg_stats = {
        "PTS": round(float(df["PTS"].mean()), 1),
        "REB": round(float(df["REB"].mean()), 1),
        "AST": round(float(df["AST"].mean()), 1),
        "STL": round(float(df["STL"].mean()), 1),
        "BLK": round(float(df["BLK"].mean()), 1),
        "FG3M": round(float(df["FG3M"].mean()), 1) if has_fg3m else 0.0,
        "TOV": round(float(df["TOV"].mean()), 1),
    }
    avg_fpts = round(float(df.apply(lambda r: _row_fpts(r, has_fg3m), axis=1).mean()), 2)

    return {
        "nba_id": nba_id,
        "games_played": len(df),
        "avg_stats": avg_stats,
        "avg_fantasy_points": avg_fpts,
        "weekly_projection": round(avg_fpts * 3.5, 2),
        "season_projection": round(avg_fpts * 82, 2),
    }


def fetch_curated_players(season: str = None) -> List[dict]:
    """Fetch season stats for all curated players, writing a 24h cache.

    Raises FileNotFoundError if players.json is missing.
    Individual players that return no data receive zeroed stats (they simply
    haven't played this season — not an error).
    """
    if os.path.exists(CACHE_FILE):
        with open(CACHE_FILE) as f:
            cache = json.load(f)
        cache_time = datetime.fromisoformat(cache.get("timestamp", "2000-01-01"))
        if datetime.now() - cache_time < timedelta(hours=24):
            logger.info("Using cached player data (%d players)", len(cache["players"]))
            return cache["players"]

    curated = _load_curated_players()

    if season is None:
        season = _current_nba_season()

    logger.info("Fetching stats for %d curated players (season %s)...", len(curated), season)

    players_list = []
    for i, p in enumerate(curated):
        nba_id = p.get("nba_id")
        if not nba_id:
            continue

        stats = fetch_player_season_stats(nba_id, season)
        try:
            recent_games = fetch_player_game_log(nba_id, last_n_games=10)
        except Exception as e:
            logger.warning("[%d/%d] %s — game log failed: %s", i + 1, len(curated), p["name"], e)
            recent_games = []

        if stats:
            players_list.append({
                "nba_id": nba_id,
                "name": p["name"],
                "team": p.get("team", ""),
                "position": p.get("position", "F"),
                "games_played": stats["games_played"],
                "avg_stats": stats["avg_stats"],
                "avg_fantasy_points": stats["avg_fantasy_points"],
                "weekly_projection": stats["weekly_projection"],
                "season_projection": stats["season_projection"],
                "recent_games": recent_games,
            })
            logger.info(
                "[%d/%d] %s — %d GP, %.1f FPts/G, %d recent games",
                i + 1, len(curated), p["name"],
                stats["games_played"], stats["avg_fantasy_points"], len(recent_games),
            )
        else:
            players_list.append({
                "nba_id": nba_id,
                "name": p["name"],
                "team": p.get("team", ""),
                "position": p.get("position", "F"),
                "games_played": 0,
                "avg_stats": {},
                "avg_fantasy_points": 0,
                "weekly_projection": 0,
                "season_projection": 0,
                "recent_games": recent_games,
            })
            logger.info("[%d/%d] %s — no data", i + 1, len(curated), p["name"])

    with open(CACHE_FILE, "w") as f:
        json.dump({"timestamp": datetime.now().isoformat(), "season": season, "players": players_list}, f, indent=2)

    fetched = sum(1 for p in players_list if p["games_played"] > 0)
    logger.info("Cached %d players (%d with stats)", len(players_list), fetched)
    return players_list


def fetch_top_players(season: str = None, top_n: int = 80) -> List[dict]:
    """Fetch stats for curated players, capped to top_n. Wrapper for back-compat."""
    return fetch_curated_players(season)[:top_n]


def fetch_player_game_log(
    player_id: int, season: str = None, last_n_games: int = 0
) -> List[dict]:
    """Fetch a player's game log for the season.

    Returns a list of game dicts: {date, matchup, result, stats, fantasy_points}.
    """
    from concurrent.futures import ThreadPoolExecutor, TimeoutError as FuturesTimeout

    if season is None:
        season = _current_nba_season()

    def _fetch():
        return playergamelog.PlayerGameLog(player_id=player_id, season=season, timeout=15)

    with ThreadPoolExecutor(max_workers=1) as ex:
        future = ex.submit(_fetch)
        try:
            log = future.result(timeout=20)
        except FuturesTimeout:
            raise TimeoutError(f"NBA API timed out for player_id={player_id}")

    time.sleep(0.6)

    df = log.get_data_frames()[0]
    has_fg3m = "FG3M" in df.columns
    games = []

    for _, row in df.iterrows():
        stats = {
            "PTS": float(row.get("PTS", 0)),
            "REB": float(row.get("REB", 0)),
            "AST": float(row.get("AST", 0)),
            "STL": float(row.get("STL", 0)),
            "BLK": float(row.get("BLK", 0)),
            "TOV": float(row.get("TOV", 0)),
            "MIN": float(row.get("MIN", 0)),
        }
        if has_fg3m:
            stats["FG3M"] = float(row.get("FG3M", 0))
        fpts = calculate_fantasy_points(stats)
        games.append({
            "date": row["GAME_DATE"],
            "matchup": row["MATCHUP"],
            "result": row["WL"],
            "stats": stats,
            "fantasy_points": round(fpts, 2),
        })

    if last_n_games > 0:
        games = games[:last_n_games]
    return games


def get_weekly_actuals(
    player_id: int,
    week_start: str,
    week_end: str,
    season: str = None,
) -> dict:
    """Get a player's actual fantasy points for a date window.

    week_start / week_end in 'YYYY-MM-DD' format.
    Returns {player_id, week_start, week_end, games_played, total_fantasy_points, games}.
    """
    games = fetch_player_game_log(player_id, season)
    start = datetime.strptime(week_start, "%Y-%m-%d")
    end = datetime.strptime(week_end, "%Y-%m-%d")

    week_games = [
        g for g in games
        if start <= datetime.strptime(g["date"], "%b %d, %Y") <= end
    ]
    total_fpts = sum(g["fantasy_points"] for g in week_games)

    return {
        "player_id": player_id,
        "week_start": week_start,
        "week_end": week_end,
        "games_played": len(week_games),
        "total_fantasy_points": round(total_fpts, 2),
        "games": week_games,
    }


def get_next_week_projection(nba_id: int, player: Dict) -> float:
    """Projected fantasy points for the upcoming NBA week.

    Currently re-uses the weekly_projection from cache/deployment.
    Replace with a dedicated forecast feed when available.
    """
    return float(player.get("weekly_projection") or 0)


def generate_player_id(name: str) -> str:
    """Generate a clean slug ID from a player name.

    Normalizes unicode (ć→c, ņ→n, etc.), strips non-alphanumeric chars.
    Must match generate-players.js logic exactly.
    """
    nfkd = unicodedata.normalize("NFKD", name)
    ascii_name = nfkd.encode("ascii", "ignore").decode("ascii")
    cleaned = re.sub(r"[^a-z0-9]+", "_", ascii_name.lower())
    return cleaned.strip("_")


if __name__ == "__main__":
    players = fetch_curated_players()
    print(f"\nStatix — {len(players)} Curated Players:\n")
    for i, p in enumerate(players):
        gp = p.get("games_played", 0)
        fpts = p.get("avg_fantasy_points", 0)
        print(
            f"{i:2d}. {p['name']:<30s} {p.get('team',''):<5s} "
            f"GP:{gp:3d}  FPts/G:{fpts:6.1f}  "
            f"Weekly:{p.get('weekly_projection', 0):6.1f}"
        )
