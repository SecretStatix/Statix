"""
Player routes - real NBA data + on-chain price data.
"""

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
from typing import List, Optional
import json
from pathlib import Path

from nba_stats import fetch_top_players, calculate_fantasy_points, fetch_player_game_log, fetch_player_season_stats, generate_player_id
from chain import get_deployment
import logging

logger = logging.getLogger(__name__)

router = APIRouter()


def _float_field(player: dict, key: str, default: float = 0.0) -> float:
    """Coerce player[key] to float; missing or None uses default."""
    v = player.get(key)
    return default if v is None else float(v)


def _load_nba_cache() -> dict:
    """Load player_cache.json into a dict keyed by nba_id."""
    cache_path = Path(__file__).parent.parent / "player_cache.json"
    if not cache_path.exists():
        return {}
    with open(cache_path) as f:
        data = json.load(f)
    return {row["nba_id"]: row for row in data.get("players", [])}


def _get_cached_or_live(nba_id: int, nba_cache: dict) -> Optional[dict]:
    """Return cached stats for a player, or fetch live from NBA API on miss."""
    cached = nba_cache.get(nba_id)
    if cached and cached.get("avg_stats"):
        return cached
    try:
        live = fetch_player_season_stats(nba_id)
        if live and live.get("avg_stats"):
            logger.info("Live-fetched stats for nba_id=%s", nba_id)
            return live
    except Exception as e:
        logger.warning("NBA API fetch failed for nba_id=%s: %s", nba_id, e)
    return cached


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
            "id": generate_player_id(p["name"]),
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
    nba_cache = _load_nba_cache()

    result = []
    for p in players:
        cached = nba_cache.get(p.get("nba_id"))
        wp = _float_field(p, "weekly_projection", 0.0)
        fallback_avg = wp / 3.5 if wp else 0.0
        if cached and cached.get("avg_stats"):
            afp = cached.get("avg_fantasy_points")
            avg_fp = float(afp) if afp is not None else fallback_avg
        else:
            avg_fp = fallback_avg
        result.append(PlayerResponse(
            index=p["index"],
            id=p["id"],
            name=p["name"],
            team=p.get("team", ""),
            symbol=p.get("symbol", ""),
            nba_id=p.get("nba_id", 0),
            position=cached.get("position", "F") if cached else "F",
            avg_fantasy_points=avg_fp,
            weekly_projection=wp,
            season_projection=_float_field(p, "season_projection", 0.0),
            avg_stats=cached.get("avg_stats", {}) if cached else {},
        ))

    return result


@router.get("/{player_id}")
async def get_player(player_id: str):
    """Get player details by ID, enriched with cached NBA stats."""
    players = _get_players()
    target = None
    for p in players:
        if p["id"] == player_id or str(p.get("index")) == player_id:
            target = p
            break

    if not target:
        raise HTTPException(status_code=404, detail="Player not found")

    nba_cache = _load_nba_cache()
    nba_id = target.get("nba_id")
    stats = _get_cached_or_live(nba_id, nba_cache) if nba_id else None

    wp = _float_field(target, "weekly_projection", 0.0)
    fallback_avg = wp / 3.5 if wp else 0.0
    if stats and stats.get("avg_stats"):
        afp = stats.get("avg_fantasy_points")
        avg_fp = float(afp) if afp is not None else fallback_avg
        wp_resolved = float(stats.get("weekly_projection") or wp)
        sp_resolved = float(stats.get("season_projection") or _float_field(target, "season_projection", 0.0))
    else:
        avg_fp = fallback_avg
        wp_resolved = wp
        sp_resolved = _float_field(target, "season_projection", 0.0)

    return PlayerResponse(
        index=target["index"],
        id=target["id"],
        name=target["name"],
        team=target.get("team", ""),
        symbol=target.get("symbol", ""),
        nba_id=target.get("nba_id", 0),
        position=stats.get("position", "F") if stats else target.get("position", "F"),
        avg_fantasy_points=avg_fp,
        weekly_projection=wp_resolved,
        season_projection=sp_resolved,
        avg_stats=stats.get("avg_stats", {}) if stats else {},
    )


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
