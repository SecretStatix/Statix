"""
Player routes - real NBA data + on-chain price data.
"""

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
from typing import List, Optional
import json
import logging
import os
from datetime import datetime, timedelta, timezone
from pathlib import Path

from nba_stats import fetch_top_players, calculate_fantasy_points, fetch_player_game_log, generate_player_id
from chain import get_deployment, get_abi
from db import get_supabase

router = APIRouter()
logger = logging.getLogger(__name__)

# AMM listing price (DBucks per share) — matches PlayerPool initial virtual curve.
INITIAL_POOL_PRICE = 10.0


def _float_field(player: dict, key: str, default: float = 0.0) -> float:
    """Coerce player[key] to float; missing or None uses default."""
    v = player.get(key)
    return default if v is None else float(v)


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
    # Merge with cached NBA stats for avg_stats
    cache_path = Path(__file__).parent.parent / "player_cache.json"
    nba_cache = {}
    if cache_path.exists():
        with open(cache_path) as f:
            data = json.load(f)
            for row in data.get("players", []):
                nba_cache[row["nba_id"]] = row

    result = []
    for p in players:
        cached = nba_cache.get(p.get("nba_id"))
        wp = _float_field(p, "weekly_projection", 0.0)
        fallback_avg = wp / 3.5
        if cached:
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
    """Rows from pool_price_snapshots since now - days, ordered by chain position."""
    sb = get_supabase()
    if sb is None:
        return []
    cutoff = datetime.now(timezone.utc) - timedelta(days=days)
    cutoff_iso = cutoff.isoformat()
    try:
        q = (
            sb.table("pool_price_snapshots")
            .select("timestamp, price, block_number, log_index")
            .eq("pool_index", pool_index)
            .gte("timestamp", cutoff_iso)
            .order("block_number", desc=False)
            .order("log_index", desc=False)
            .limit(max_rows)
        )
        res = q.execute()
        return res.data or []
    except Exception as e:
        logger.warning("pool_price_snapshots query failed: %s", e)
        return []


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

    # Anchor chart at listing $10 immediately before first trade (backend-side).
    if points:
        t0 = _parse_ts(points[0].timestamp)
        anchor_ts = (t0 - timedelta(seconds=1)).isoformat()
        points.insert(
            0,
            PriceHistoryPoint(
                timestamp=anchor_ts,
                price=INITIAL_POOL_PRICE,
                block_number=0,
                log_index=-1,
            ),
        )

    current_source = "default"
    current_price = INITIAL_POOL_PRICE
    if chain_price is not None:
        current_price = chain_price
        current_source = "chain"
    elif points:
        current_price = points[-1].price
        current_source = "snapshot"

    # No indexer rows yet but chain works: minimal line from listing to spot.
    if not raw and chain_price is not None:
        now = datetime.now(timezone.utc)
        points = [
            PriceHistoryPoint(
                timestamp=(now - timedelta(hours=1)).isoformat(),
                price=INITIAL_POOL_PRICE,
                block_number=0,
                log_index=-1,
            ),
            PriceHistoryPoint(
                timestamp=now.isoformat(),
                price=round(chain_price, 6),
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
        (current_price - INITIAL_POOL_PRICE) / INITIAL_POOL_PRICE * 100,
        4,
    )

    return PlayerPriceHistoryResponse(
        player_index=pool_index,
        player_id=player_id,
        days=days,
        points=points,
        current_price=round(current_price, 6),
        current_price_source=current_source,
        range_change_pct=range_change_pct,
        vs_listing_pct=vs_listing,
    )


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
