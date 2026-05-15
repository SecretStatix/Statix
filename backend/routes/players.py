"""
Player routes — NBA player data enriched with on-chain price history.

Data sources:
  - Player list: deployments.json (on-chain source of truth via chain.get_deployment)
  - NBA stats: player_cache.json (24h cache) or live nba_api fallback
  - Price history: pool_price_snapshots table + PlayerPool.getPrice() from chain

Endpoints:
  GET /                         — list all players with stats
  GET /games-today              — team tri-codes with games scheduled today
  GET /upcoming-games           — league games with tip-off in the next N hours (schedule feed)
  GET /{player_id}              — player detail with NBA stats
  GET /{player_id}/games        — player game log
  GET /{player_id}/price-history — price chart data
"""

import asyncio
import json
import logging
import os
import time as _time
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import List, Optional

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from chain import get_deployment, get_abi
from config import INITIAL_POOL_PRICE, listing_price
from db import get_supabase
from nba_stats import (
    fetch_player_game_log,
    fetch_player_season_stats,
)
from routes.helpers import require_deployment
from nba_schedule import get_upcoming_games_within_hours

logger = logging.getLogger(__name__)
router = APIRouter()

def _float_field(player: dict, key: str, default: float = 0.0) -> float:
    """Coerce player[key] to float; missing or None uses default."""
    v = player.get(key)
    return default if v is None else float(v)


_nba_cache: dict = {}
_nba_cache_mtime: float = 0.0


def _load_nba_cache() -> dict:
    """Load player_cache.json into a dict keyed by nba_id.

    Cached in-process by file mtime — only re-reads the file when it changes
    on disk (e.g. after GET /admin/refresh-players). Fast on every request.
    """
    global _nba_cache, _nba_cache_mtime
    cache_path = Path(__file__).parent.parent / "player_cache.json"
    if not cache_path.exists():
        return {}
    mtime = cache_path.stat().st_mtime
    if _nba_cache and mtime == _nba_cache_mtime:
        return _nba_cache
    with open(cache_path) as f:
        data = json.load(f)
    _nba_cache = {row["nba_id"]: row for row in data.get("players", [])}
    _nba_cache_mtime = mtime
    logger.info("Loaded player_cache.json (%d players)", len(_nba_cache))
    return _nba_cache


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


class PriceHistoryPoint(BaseModel):
    """One sample on the price chart (trade execution average or synthetic anchor)."""

    timestamp: str  # ISO-8601 UTC
    price: float
    block_number: int
    log_index: int


class PlayerPriceHistoryResponse(BaseModel):
    """Pool snapshot history + live spot from chain (all math server-side)."""

    player_index: int
    player_id: str
    days: int
    points: List[PriceHistoryPoint]
    current_price: float
    current_price_source: str  # "chain" | "snapshot" | "default"
    range_change_pct: Optional[float]  # (last - first) / first * 100 for returned series
    vs_listing_pct: float  # (current - INITIAL_POOL_PRICE) / INITIAL_POOL_PRICE * 100
    vs_round_start_pct: Optional[float]  # (current - price at round start) / price at round start * 100


def _get_players() -> list:
    """Get player list from deployments.json (on-chain source of truth).

    Raises HTTP 503 if deployments.json is missing — there is no valid fallback
    since player indices must match the deployed pool contracts.
    """
    deployment = require_deployment()
    return deployment.get("players", [])


@router.get("/", response_model=List[PlayerResponse])
async def list_players():
    """Get all tradeable players (up to 80)."""
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


def _resolve_player(player_id: str) -> Optional[dict]:
    players = _get_players()
    for p in players:
        if p["id"] == player_id or str(p.get("index")) == player_id:
            return p
    return None


def _spot_price_from_chain(player_index: int) -> Optional[float]:
    """Read marginal DBucks/share from PlayerPool.getPrice() (6 decimals)."""
    try:
        from web3 import Web3

        deployment = get_deployment()
        if not deployment or "contracts" not in deployment:
            return None
        rpc_url = os.getenv("RPC_URL", "https://sepolia.base.org")
        w3 = Web3(Web3.HTTPProvider(rpc_url))
        if not w3.is_connected():
            return None
        factory_abi = get_abi("PoolFactory")
        pool_abi = get_abi("PlayerPool")
        factory = w3.eth.contract(
            address=Web3.to_checksum_address(deployment["contracts"]["PoolFactory"]),
            abi=factory_abi,
        )
        pool_addr = factory.functions.pools(player_index).call()
        if pool_addr in (None, "0x0000000000000000000000000000000000000000"):
            return None
        pool = w3.eth.contract(
            address=Web3.to_checksum_address(pool_addr),
            abi=pool_abi,
        )
        raw = pool.functions.getPrice().call()
        return float(raw) / 1e6
    except Exception as e:
        logger.warning("spot price read failed for pool %s: %s", player_index, e)
        return None


def _parse_ts(ts) -> datetime:
    if isinstance(ts, datetime):
        return ts if ts.tzinfo else ts.replace(tzinfo=timezone.utc)
    s = str(ts).replace("Z", "+00:00")
    return datetime.fromisoformat(s)


def _fetch_snapshot_rows(pool_index: int, days: int, max_rows: int = 8000) -> list:
    """Rows from pool_price_snapshots since now - days, ordered by chain position.

    Returns [] on query failure (price history is non-critical — chain spot is the
    authoritative price even when snapshot rows are absent).
    """
    sb = get_supabase()
    if sb is None:
        logger.warning("pool_price_snapshots unavailable: Supabase not configured")
        return []
    cutoff_iso = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()
    try:
        res = (
            sb.table("pool_price_snapshots")
            .select("timestamp, price, block_number, log_index")
            .eq("pool_index", pool_index)
            .gte("timestamp", cutoff_iso)
            .order("block_number", desc=False)
            .order("log_index", desc=False)
            .limit(max_rows)
            .execute()
        )
        return res.data or []
    except Exception as e:
        logger.warning("pool_price_snapshots query failed for pool %d: %s", pool_index, e)
        return []


# Round 2 started when Round 1 dividends were distributed on-chain.
_ROUND_2_START = datetime(2026, 5, 4, 5, 4, 34, tzinfo=timezone.utc)


def _round_start_price(pool_index: int, listing: float) -> float:
    """Return the last known price for a pool at or before Round 2 start.

    Falls back to the listing price if no snapshot exists before that time.
    """
    sb = get_supabase()
    if sb is None:
        return listing
    try:
        res = (
            sb.table("pool_price_snapshots")
            .select("price")
            .eq("pool_index", pool_index)
            .lte("timestamp", _ROUND_2_START.isoformat())
            .order("block_number", desc=True)
            .order("log_index", desc=True)
            .limit(1)
            .execute()
        )
        if res.data:
            return float(res.data[0]["price"])
    except Exception as e:
        logger.warning("round_start_price query failed for pool %d: %s", pool_index, e)
    return listing


def _build_price_history(
    pool_index: int,
    player_id: str,
    days: int,
) -> PlayerPriceHistoryResponse:
    """
    Load trade-derived prices from Supabase, anchor the series at the listing price,
    append the current spot from chain, and compute window metrics.
    """
    raw = _fetch_snapshot_rows(pool_index, days)
    chain_price = _spot_price_from_chain(pool_index)

    points: List[PriceHistoryPoint] = []
    for row in raw:
        try:
            ts = _parse_ts(row["timestamp"])
            pr = float(row["price"])
            bn = int(row["block_number"])
            li = int(row["log_index"])
        except (KeyError, TypeError, ValueError) as e:
            logger.debug("skip bad snapshot row: %s", e)
            continue
        points.append(
            PriceHistoryPoint(
                timestamp=ts.isoformat(),
                price=round(pr, 6),
                block_number=bn,
                log_index=li,
            )
        )

    base_price = listing_price(player_id)

    # Anchor chart at listing price immediately before first trade (backend-side).
    if points:
        t0 = _parse_ts(points[0].timestamp)
        anchor_ts = (t0 - timedelta(seconds=1)).isoformat()
        points.insert(
            0,
            PriceHistoryPoint(
                timestamp=anchor_ts,
                price=base_price,
                block_number=0,
                log_index=-1,
            ),
        )

    current_source = "default"
    current_price = base_price
    if chain_price is not None:
        current_price = chain_price
        current_source = "chain"
    elif points:
        current_price = points[-1].price
        current_source = "snapshot"

    # No indexer rows yet but chain works: flat line at listing price (no fake movement).
    if not raw and chain_price is not None:
        now = datetime.now(timezone.utc)
        points = [
            PriceHistoryPoint(
                timestamp=(now - timedelta(hours=1)).isoformat(),
                price=base_price,
                block_number=0,
                log_index=-1,
            ),
            PriceHistoryPoint(
                timestamp=now.isoformat(),
                price=base_price,
                block_number=0,
                log_index=-2,
            ),
        ]
    elif chain_price is not None and points:
        # Close the series at live spot (chart meets on-chain quote).
        now_iso = datetime.now(timezone.utc).isoformat()
        points.append(
            PriceHistoryPoint(
                timestamp=now_iso,
                price=round(chain_price, 6),
                block_number=0,
                log_index=-2,
            )
        )

    range_change_pct: Optional[float] = None
    if len(points) >= 2:
        a, b = points[0].price, points[-1].price
        if a != 0:
            range_change_pct = round((b - a) / a * 100, 4)

    vs_listing = round(
        (current_price - base_price) / base_price * 100,
        4,
    )

    round_start = _round_start_price(pool_index, base_price)
    vs_round_start = round((current_price - round_start) / round_start * 100, 4) if round_start else None

    return PlayerPriceHistoryResponse(
        player_index=pool_index,
        player_id=player_id,
        days=days,
        points=points,
        current_price=round(current_price, 6),
        current_price_source=current_source,
        range_change_pct=range_change_pct,
        vs_listing_pct=vs_listing,
        vs_round_start_pct=vs_round_start,
    )


_games_today_cache: dict = {"ts": 0.0, "teams": [], "date": ""}
_GAMES_TODAY_TTL = 1800  # 30 minutes
# nba_api uses this as requests timeout (seconds). 8s matched user-visible ~8s stalls.
_GAMES_TODAY_NBA_TIMEOUT = max(2, int(os.getenv("NBA_SCOREBOARD_TIMEOUT", "5")))


def _fetch_scoreboard_team_tricodes(game_date: str, timeout: int) -> List[str]:
    """Blocking call to stats.nba.com — must run in a thread from async routes."""
    from nba_api.stats.endpoints import scoreboardv2

    sb = scoreboardv2.ScoreboardV2(game_date=game_date, timeout=timeout)
    line_score = sb.line_score.get_dict()
    headers = line_score.get("headers", [])
    rows = line_score.get("data", [])
    idx = headers.index("TEAM_ABBREVIATION") if "TEAM_ABBREVIATION" in headers else None
    teams_playing: set[str] = set()
    if idx is not None:
        for row in rows:
            tri = row[idx]
            if tri:
                teams_playing.add(tri)
    return sorted(teams_playing)


@router.get("/games-today")
async def get_games_today():
    """Team tri-codes with games scheduled today. Cached 30 min."""
    now = _time.time()
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    if (
        _games_today_cache["date"] == today
        and now - _games_today_cache["ts"] < _GAMES_TODAY_TTL
    ):
        return {"date": today, "teams": _games_today_cache["teams"]}

    try:
        result = await asyncio.to_thread(
            _fetch_scoreboard_team_tricodes,
            today,
            _GAMES_TODAY_NBA_TIMEOUT,
        )
        _games_today_cache.update({"ts": now, "teams": result, "date": today})
        return {"date": today, "teams": result}
    except Exception as e:
        logger.warning("games-today fetch failed: %s", e)
        # After TTL expiry, NBA can be slow; return last good list for today if we have it.
        if _games_today_cache["date"] == today and _games_today_cache.get("teams") is not None:
            return {"date": today, "teams": _games_today_cache["teams"], "stale": True}
        return {"date": today, "teams": []}


@router.get("/upcoming-games")
async def get_upcoming_games(
    hours: int = Query(
        default=24,
        ge=1,
        le=168,
        description="Include games whose scheduled tip-off (UTC) falls in [now, now + hours)",
    ),
):
    """
    Full league schedule (ScheduleLeagueV2), filtered to tip-offs in the next `hours`
    hours. Cached server-side to limit NBA API usage. Arena fields come from the schedule feed.
    """
    try:
        return await asyncio.to_thread(get_upcoming_games_within_hours, hours)
    except Exception as e:
        logger.warning("upcoming-games failed: %s", e)
        raise HTTPException(
            status_code=503,
            detail="Could not load NBA schedule",
        ) from e


@router.get("/price-changes")
async def get_price_changes(days: int = Query(default=7, ge=1, le=90)):
    """Return % price change over the last N days (default 7) for all players.

    Finds the last price snapshot per pool just before the window start,
    compares to current price. Falls back to listing price if no snapshot exists.
    """
    players = _get_players()
    sb = get_supabase()

    window_start = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()

    # Batch-fetch last snapshot per pool BEFORE the window start (that's the "old" price)
    old_price_by_pool: dict[int, float] = {}
    if sb:
        try:
            res = (
                sb.table("pool_price_snapshots")
                .select("pool_index, price, block_number")
                .lte("timestamp", window_start)
                .order("block_number", desc=True)
                .limit(5000)
                .execute()
            )
            for row in res.data or []:
                idx = int(row["pool_index"])
                if idx not in old_price_by_pool:
                    old_price_by_pool[idx] = float(row["price"])
        except Exception as e:
            logger.warning("price-changes batch query failed: %s", e)

    result = {}
    for p in players:
        idx = p.get("index")
        pid = p.get("id")
        if idx is None or not pid:
            continue
        base = listing_price(pid)
        old_price = old_price_by_pool.get(idx, base)
        current = p.get("price") or base
        pct = round((current - old_price) / old_price * 100, 2) if old_price else 0.0
        result[pid] = {"old_price": round(old_price, 4), "current_price": round(current, 4), "pct": pct}

    return result


@router.get("/{player_id}/price-history", response_model=PlayerPriceHistoryResponse)
async def get_player_price_history(
    player_id: str,
    days: int = Query(default=90, ge=1, le=365, description="Trailing window in days"),
):
    """
    Historical pool prices from indexed trades (`pool_price_snapshots`) plus current
    spot from `PlayerPool.getPrice()`. Chart series and % change are computed here.
    """
    target = _resolve_player(player_id)
    if not target:
        raise HTTPException(status_code=404, detail="Player not found")
    pool_index = int(target["index"])
    return _build_price_history(pool_index, target["id"], days)


@router.get("/{player_id}")
async def get_player(player_id: str):
    """Get player details by ID, enriched with cached NBA stats."""
    target = _resolve_player(player_id)
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
async def get_player_games(player_id: str, last_n: int = Query(default=10, le=10)):
    """Get a player's recent game log (last 10 games). Served exclusively from player_cache.json."""
    target = _resolve_player(player_id)
    if not target:
        raise HTTPException(status_code=404, detail="Player not found")

    nba_id = target.get("nba_id")
    if not nba_id:
        raise HTTPException(status_code=404, detail="No NBA ID for player")

    nba_cache = _load_nba_cache()
    cached = nba_cache.get(nba_id)
    if cached and cached.get("recent_games"):
        games = cached["recent_games"][:last_n]
        return {"player_id": player_id, "games": games, "source": "cache"}

    return {"player_id": player_id, "games": [], "source": "cache"}
