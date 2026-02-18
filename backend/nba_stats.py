"""
NBA Stats Integration - Fetches real player data for Dividend Fantasy
Uses nba_api library to pull from stats.nba.com
"""

import json
import os
from datetime import datetime, timedelta
from typing import List, Dict, Optional
from nba_api.stats.static import players as nba_players
from nba_api.stats.endpoints import (
    leagueleaders,
    playergamelog,
    commonplayerinfo,
)
import time

# Fantasy point scoring weights
SCORING = {
    "PTS": 1.0,
    "REB": 1.2,
    "AST": 1.5,
    "STL": 3.0,
    "BLK": 3.0,
    "TOV": -1.0,
}

CACHE_FILE = os.path.join(os.path.dirname(__file__), "player_cache.json")


def calculate_fantasy_points(stats: dict) -> float:
    """Calculate fantasy points from a stat line."""
    return (
        stats.get("PTS", 0) * SCORING["PTS"]
        + stats.get("REB", 0) * SCORING["REB"]
        + stats.get("AST", 0) * SCORING["AST"]
        + stats.get("STL", 0) * SCORING["STL"]
        + stats.get("BLK", 0) * SCORING["BLK"]
        + stats.get("TOV", 0) * SCORING["TOV"]
    )


def _current_nba_season() -> str:
    """Calculate current NBA season string (e.g., '2025-26') from date."""
    now = datetime.now()
    year = now.year if now.month >= 10 else now.year - 1
    return f"{year}-{str(year + 1)[-2:]}"


def fetch_top_players(season: str = None, top_n: int = 50) -> List[dict]:
    """
    Fetch top N NBA players by fantasy points (PTS-based ranking as proxy).
    Returns list of player dicts with id, name, team, position, season averages.
    """
    # Check cache first (valid for 24 hours)
    if os.path.exists(CACHE_FILE):
        with open(CACHE_FILE, "r") as f:
            cache = json.load(f)
            cache_time = datetime.fromisoformat(cache.get("timestamp", "2000-01-01"))
            if datetime.now() - cache_time < timedelta(hours=24):
                print(f"Using cached player data ({len(cache['players'])} players)")
                return cache["players"][:top_n]

    if season is None:
        season = _current_nba_season()

    print(f"Fetching top {top_n} players from NBA API (season {season})...")

    # Get league leaders by PTS to find top players
    leaders = leagueleaders.LeagueLeaders(
        season=season,
        stat_category_abbreviation="PTS",
        per_mode48="PerGame",
    )
    time.sleep(0.6)  # Rate limit

    df = leaders.get_data_frames()[0]
    players_list = []

    for _, row in df.head(top_n).iterrows():
        player_id = row["PLAYER_ID"]
        name = row["PLAYER"]
        team = row["TEAM"]

        # Calculate fantasy points from per-game averages
        avg_stats = {
            "PTS": row.get("PTS", 0),
            "REB": row.get("REB", 0),
            "AST": row.get("AST", 0),
            "STL": row.get("STL", 0),
            "BLK": row.get("BLK", 0),
            "TOV": row.get("TOV", 0),
        }
        avg_fpts = calculate_fantasy_points(avg_stats)
        gp = int(row.get("GP", 0))

        # Weekly projection = avg fantasy points per game * ~3.5 games/week
        weekly_projection = round(avg_fpts * 3.5, 2)
        season_projection = round(avg_fpts * 82, 2)

        players_list.append({
            "nba_id": int(player_id),
            "name": name,
            "team": team,
            "position": _get_position(player_id),
            "games_played": gp,
            "avg_stats": {k: round(float(v), 1) for k, v in avg_stats.items()},
            "avg_fantasy_points": round(avg_fpts, 2),
            "weekly_projection": weekly_projection,
            "season_projection": season_projection,
        })

    # Cache results
    with open(CACHE_FILE, "w") as f:
        json.dump({
            "timestamp": datetime.now().isoformat(),
            "season": season,
            "players": players_list,
        }, f, indent=2)

    print(f"Fetched and cached {len(players_list)} players")
    return players_list


_position_cache: Dict[int, str] = {}


def _get_position(player_id: int) -> str:
    """Get player position from static data (cached lookup)."""
    if not _position_cache:
        for p in nba_players.get_players():
            _position_cache[p["id"]] = p.get("position", "F")
    return _position_cache.get(player_id, "F")


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


def generate_player_id(name: str) -> str:
    """Generate a clean ID from player name."""
    return name.lower().replace(" ", "_").replace(".", "").replace("'", "")


if __name__ == "__main__":
    # Test: fetch top 50 players
    players = fetch_top_players(top_n=50)
    print(f"\nTop 50 NBA Players by Fantasy Points:\n")
    for i, p in enumerate(players, 1):
        print(f"{i:2d}. {p['name']:<25s} {p['team']:<5s} "
              f"FPts/G: {p['avg_fantasy_points']:6.1f}  "
              f"Weekly Proj: {p['weekly_projection']:6.1f}")
