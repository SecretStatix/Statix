"""
Player routes - real NBA data + on-chain price data.
"""

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
from typing import List, Optional
import json
from pathlib import Path

from nba_stats import fetch_top_players, calculate_fantasy_points, fetch_player_game_log
from chain import get_deployment

router = APIRouter()


class PlayerResponse(BaseModel):
    index: int
    id: str
    name: str
    team: str
    symbol: str
    nba_id: int
    position: Optional[str] = "F"
    avg_fantasy_points: float
    weekly_projection: float
    season_projection: float
    avg_stats: dict

class PlayerDetailResponse(PlayerResponse):
    recent_games: Optional[list] = None

def _get_players() -> list:
    """Get player list from deployments.json (on-chain source of truth)."""
    deployment = get_deployment()
    if deployment and "players" in deployment:
        return deployment["players"]

    # Fallback to NBA API
    raw = fetch_top_players(top_n=50)
    return [
        {
            "index": i,
            "id": p["name"].lower().replace(" ", "_").replace(".", "").replace("'", ""),
            "name": p["name"],
            "team": p["team"],
            "symbol": "",
            "nba_id": p["nba_id"],
            "position": p.get("position", "F"),
            "avg_fantasy_points": p["avg_fantasy_points"],
            "weekly_projection": p["weekly_projection"],
            "season_projection": p["season_projection"],
            "avg_stats": p.get("avg_stats", {}),
        }
        for i, p in enumerate(raw)
    ]


@router.get("/", response_model=List[PlayerResponse])
async def list_players():
    """Get all 50 tradeable players."""
    players = _get_players()
    # Merge with cached NBA stats for avg_stats
    cache_path = Path(__file__).parent.parent / "player_cache.json"
    nba_cache = {}
    if cache_path.exists():
        with open(cache_path) as f:
            data = json.load(f)
            for p in data.get("players", []):
                nba_cache[p["nba_id"]] = p

    result = []
    for p in players:
        cached = nba_cache.get(p.get("nba_id"))
        result.append(PlayerResponse(
            index=p["index"],
            id=p["id"],
            name=p["name"],
            team=p.get("team", ""),
            symbol=p.get("symbol", ""),
            nba_id=p.get("nba_id", 0),
            position=cached.get("position", "F") if cached else "F",
            avg_fantasy_points=cached.get("avg_fantasy_points", p.get("weekly_projection", 0) / 3.5) if cached else p.get("weekly_projection", 0) / 3.5,
            weekly_projection=p.get("weekly_projection", 0),
            season_projection=p.get("season_projection", 0),
            avg_stats=cached.get("avg_stats", {}) if cached else {},
        ))

    return result


@router.get("/{player_id}")
async def get_player(player_id: str):
    """Get player details by ID."""
    players = _get_players()
    for p in players:
        if p["id"] == player_id or str(p.get("index")) == player_id:
            return p
    raise HTTPException(status_code=404, detail="Player not found")


@router.get("/{player_id}/games")
async def get_player_games(player_id: str, last_n: int = Query(default=10, le=82)):
    """Get a player's recent game log."""
    players = _get_players()
    target = None
    for p in players:
        if p["id"] == player_id or str(p.get("index")) == player_id:
            target = p
            break

    if not target:
        raise HTTPException(status_code=404, detail="Player not found")

    nba_id = target.get("nba_id")
    if not nba_id:
        raise HTTPException(status_code=404, detail="No NBA ID for player")

    try:
        games = fetch_player_game_log(nba_id, last_n_games=last_n)
        return {"player_id": player_id, "games": games}
    except Exception:
        raise HTTPException(status_code=500, detail="Failed to fetch game log")
