"""
NBA Stats Integration - Fetches real player data for Statix.
Uses nba_api library to pull from stats.nba.com.

Primary flow: fetch stats for the 50 curated players in players.json
by their nba_id, using each player's game log to compute season averages.
"""

import json
import os
import re
import unicodedata
from datetime import datetime, timedelta
from pathlib import Path
from typing import List, Dict, Optional
from nba_api.stats.static import players as nba_players
from nba_api.stats.endpoints import (
    playergamelog,
    commonplayerinfo,
)
import time

SCORING = {
    "PTS": 1.0,
    "REB": 1.2,
    "AST": 1.5,
    "STL": 2.0,
    "BLK": 2.0,
    "FG3M": 0.5,
    "TOV": -1.5,
    "DD_BONUS": 2.0,
    "TD_BONUS": 5.0,
}

CACHE_FILE = os.path.join(os.path.dirname(__file__), "player_cache.json")
PLAYERS_JSON = os.path.join(
    os.path.dirname(__file__), "..", "blockchain", "scripts", "players.json"
)


def calculate_fantasy_points(stats: dict) -> float:
    """Calculate fantasy points from a stat line (per-game basis)."""
    base = (
        stats.get("PTS", 0) * SCORING["PTS"]
        + stats.get("REB", 0) * SCORING["REB"]
        + stats.get("AST", 0) * SCORING["AST"]
        + stats.get("STL", 0) * SCORING["STL"]
        + stats.get("BLK", 0) * SCORING["BLK"]
        + stats.get("FG3M", 0) * SCORING["FG3M"]
        + stats.get("TOV", 0) * SCORING["TOV"]
    )
    # Double-double / triple-double bonuses (threshold: 10+ in a category)
    dd_cats = ["PTS", "REB", "AST", "STL", "BLK"]
    doubles = sum(1 for cat in dd_cats if stats.get(cat, 0) >= 10)
    if doubles >= 3:
        base += SCORING["TD_BONUS"]
    elif doubles >= 2:
        base += SCORING["DD_BONUS"]
    return base


def _current_nba_season() -> str:
    """Calculate current NBA season string (e.g., '2025-26') from date."""
    now = datetime.now()
    year = now.year if now.month >= 10 else now.year - 1
    return f"{year}-{str(year + 1)[-2:]}"


def _load_curated_players() -> List[dict]:
    """Load the curated 50-player list from players.json."""
    if os.path.exists(PLAYERS_JSON):
        with open(PLAYERS_JSON) as f:
            return json.load(f)
    return []


def fetch_player_season_stats(nba_id: int, season: str = None) -> Optional[dict]:
    """Fetch season averages for a specific player from their game log."""
    if season is None:
        season = _current_nba_season()

    try:
        log = playergamelog.PlayerGameLog(player_id=nba_id, season=season)
        time.sleep(0.6)
        df = log.get_data_frames()[0]
    except Exception:
        return None

    if df.empty:
        return None

    avg_stats = {
        "PTS": round(float(df["PTS"].mean()), 1),
        "REB": round(float(df["REB"].mean()), 1),
        "AST": round(float(df["AST"].mean()), 1),
        "STL": round(float(df["STL"].mean()), 1),
        "BLK": round(float(df["BLK"].mean()), 1),
        "FG3M": round(float(df["FG3M"].mean()), 1) if "FG3M" in df.columns else 0.0,
        "TOV": round(float(df["TOV"].mean()), 1),
    }
    # Compute FPts per game (with DD/TD bonuses per game) then average
    def _row_fpts(row):
        return calculate_fantasy_points({
            "PTS": row.get("PTS", 0), "REB": row.get("REB", 0),
            "AST": row.get("AST", 0), "STL": row.get("STL", 0),
            "BLK": row.get("BLK", 0),
            "FG3M": row.get("FG3M", 0) if "FG3M" in df.columns else 0,
            "TOV": row.get("TOV", 0),
        })
    avg_fpts = round(float(df.apply(_row_fpts, axis=1).mean()), 2)

    return {
        "nba_id": nba_id,
        "games_played": len(df),
        "avg_stats": avg_stats,
        "avg_fantasy_points": round(avg_fpts, 2),
        "weekly_projection": round(avg_fpts * 3.5, 2),
        "season_projection": round(avg_fpts * 82, 2),
    }


def fetch_curated_players(season: str = None) -> List[dict]:
    """
    Fetch stats for all 50 curated players by their nba_id.
    Reads the player list from players.json, fetches each player's
    game log, computes season averages, and caches the result.
    """
    if os.path.exists(CACHE_FILE):
        with open(CACHE_FILE, "r") as f:
            cache = json.load(f)
            cache_time = datetime.fromisoformat(cache.get("timestamp", "2000-01-01"))
            if datetime.now() - cache_time < timedelta(hours=24):
                print(f"Using cached player data ({len(cache['players'])} players)")
                return cache["players"]

    curated = _load_curated_players()
    if not curated:
        print("WARNING: players.json not found, falling back to empty list")
        return []

    if season is None:
        season = _current_nba_season()

    print(f"Fetching stats for {len(curated)} curated players (season {season})...")

    players_list = []
    for i, p in enumerate(curated):
        nba_id = p.get("nba_id")
        if not nba_id:
            continue

        print(f"  [{i+1}/{len(curated)}] {p['name']}...", end=" ", flush=True)
        stats = fetch_player_season_stats(nba_id, season)

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
            })
            print(f"OK ({stats['games_played']} GP, {stats['avg_fantasy_points']} FPts/G)")
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
            })
            print("NO DATA (player may not have played this season)")

    with open(CACHE_FILE, "w") as f:
        json.dump({
            "timestamp": datetime.now().isoformat(),
            "season": season,
            "players": players_list,
        }, f, indent=2)

    fetched = len([p for p in players_list if p["games_played"] > 0])
    print(f"Cached {len(players_list)} players ({fetched} with stats)")
    return players_list


def fetch_top_players(season: str = None, top_n: int = 50) -> List[dict]:
    """Fetch stats for curated players. Wrapper for backward compatibility."""
    return fetch_curated_players(season)[:top_n]


def fetch_player_game_log(
    player_id: int, season: str = None, last_n_games: int = 0
) -> List[dict]:
    """
    Fetch a player's game log for the season.
    Returns list of game dicts with date, opponent, stats, fantasy points.
    """
    if season is None:
        season = _current_nba_season()
    log = playergamelog.PlayerGameLog(
        player_id=player_id,
        season=season,
    )
    time.sleep(0.6)

    df = log.get_data_frames()[0]
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
    """
    Get a player's actual fantasy points for a specific week.
    week_start/week_end in 'YYYY-MM-DD' format.
    """
    games = fetch_player_game_log(player_id, season)
    start = datetime.strptime(week_start, "%Y-%m-%d")
    end = datetime.strptime(week_end, "%Y-%m-%d")

    week_games = []
    total_fpts = 0.0

    for game in games:
        game_date = datetime.strptime(game["date"], "%b %d, %Y")
        if start <= game_date <= end:
            week_games.append(game)
            total_fpts += game["fantasy_points"]

    return {
        "player_id": player_id,
        "week_start": week_start,
        "week_end": week_end,
        "games_played": len(week_games),
        "total_fantasy_points": round(total_fpts, 2),
        "games": week_games,
    }


def get_next_week_projection(nba_id: int, player: Dict) -> float:
    """Projected fantasy points for the *upcoming* NBA week (next scoring window).

    Wired into on-chain updates via DividendHub.setNextWeekProjectionsBatch.
    Replace with a dedicated forecast feed when available.
    """
    # Default: reuse latest weekly estimate from deployment / cache
    return float(player.get("weekly_projection") or 0)


def generate_player_id(name: str) -> str:
    """Generate a clean ID from player name.

    Normalizes unicode (ć→c, ņ→n, etc.), strips non-alphanumeric chars,
    collapses underscores. Must match generate-players.js logic exactly.
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
        print(f"{i:2d}. {p['name']:<30s} {p.get('team',''):<5s} "
              f"GP:{gp:3d}  FPts/G:{fpts:6.1f}  "
              f"Weekly:{p.get('weekly_projection',0):6.1f}")
