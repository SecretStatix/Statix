"""H2H market creation + DB read helpers.

Workflow for `create_markets_for_today`:
  1. Pull today's NBA games via ScoreboardV2 (with cache).
  2. For each game pick the top player on each team — using the curated 50-player
     roster intersected with the game's teams. Top = highest avg FP over last 10
     games (uses existing fetch_player_game_log + calculate_fantasy_points).
  3. Build a deterministic questionId from gameId+playerA+playerB.
  4. Call H2HCreator.createMarket on-chain.
  5. Persist the market in Supabase (h2h_markets) so the frontend + resolver can find it.
"""

from __future__ import annotations

import hashlib
import json
import logging
import os
import time
from datetime import datetime, timedelta, timezone
from typing import List, Optional

from web3 import Web3

from chain import get_deployment
from db import get_supabase
from nba_stats import calculate_fantasy_points, fetch_player_game_log

from .chain import (
    COLLATERAL_DECIMALS,
    build_creator,
    get_creator_signer,
    get_w3,
    send_tx,
)

logger = logging.getLogger("statix.h2h.service")

# How much collateral the protocol seeds each market with (human DBucks → wei).
DEFAULT_SEED_HUMAN = float(os.getenv("H2H_SEED_AMOUNT", "300"))  # 300 VBucks

# Cache today's NBA scoreboard for 30 min so admin re-runs don't hammer NBA API.
_scoreboard_cache: dict = {}


# ---------------------------------------------------------------------------
# NBA scoreboard
# ---------------------------------------------------------------------------

def _today_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%d")


def get_games_today(force_refresh: bool = False) -> List[dict]:
    """Return [{game_id, home_team_tricode, away_team_tricode, tip_off_at_iso}] for today.

    Cached 30 minutes. Returns [] on any NBA API failure.
    """
    cache_key = _today_iso()
    cached = _scoreboard_cache.get(cache_key)
    if cached and not force_refresh and (time.time() - cached["fetched_at"] < 1800):
        return cached["games"]

    try:
        from nba_api.stats.endpoints import scoreboardv2

        sb = scoreboardv2.ScoreboardV2(game_date=cache_key, timeout=8)
        games_df = sb.game_header.get_data_frame()
        line_df = sb.line_score.get_data_frame()
    except Exception as e:
        logger.warning("ScoreboardV2 fetch failed: %s", e)
        return []

    games: List[dict] = []
    for _, row in games_df.iterrows():
        gid = str(row.get("GAME_ID", "")).strip()
        home_id = row.get("HOME_TEAM_ID")
        away_id = row.get("VISITOR_TEAM_ID")
        if not gid or home_id is None or away_id is None:
            continue
        home_tri = _team_tricode(line_df, home_id)
        away_tri = _team_tricode(line_df, away_id)
        if not home_tri or not away_tri:
            continue
        tip_off = row.get("GAME_DATE_EST")
        games.append(
            {
                "game_id": gid,
                "home_team": home_tri,
                "away_team": away_tri,
                "tip_off_at": tip_off.isoformat() if hasattr(tip_off, "isoformat") else str(tip_off),
            }
        )

    _scoreboard_cache[cache_key] = {"games": games, "fetched_at": time.time()}
    return games


def _team_tricode(line_df, team_id) -> Optional[str]:
    rows = line_df[line_df["TEAM_ID"] == team_id]
    if rows.empty:
        return None
    return str(rows.iloc[0].get("TEAM_ABBREVIATION", "")).strip() or None


# ---------------------------------------------------------------------------
# Top-player selection
# ---------------------------------------------------------------------------

def _curated_players_by_team() -> dict:
    """{tricode: [player dict, ...]} from deployments.json player roster."""
    deployment = get_deployment() or {}
    by_team: dict = {}
    for p in deployment.get("players", []):
        team = (p.get("team") or "").upper()
        if not team:
            continue
        by_team.setdefault(team, []).append(p)
    return by_team


def pick_top_player_for_team(team_tricode: str, last_n: int = 10) -> Optional[dict]:
    """Pick the curated player on `team_tricode` with the highest avg FP over their last N games.

    Returns {player_index, id, nba_id, name, team, recent_avg_fp} or None if no eligible player.
    """
    candidates = _curated_players_by_team().get(team_tricode.upper(), [])
    best = None
    best_fp = -1.0
    for p in candidates:
        nba_id = p.get("nba_id")
        if not nba_id:
            continue
        try:
            games = fetch_player_game_log(int(nba_id), last_n_games=last_n)
        except Exception as e:
            logger.warning("game log fetch failed for %s: %s", p.get("name"), e)
            continue
        if not games:
            continue
        avg = sum(g.get("fantasy_points", 0.0) for g in games) / len(games)
        if avg > best_fp:
            best_fp = avg
            best = p
    if best is None:
        return None
    return {
        "player_index": best.get("index"),
        "id": best.get("id"),
        "nba_id": best.get("nba_id"),
        "name": best.get("name"),
        "team": best.get("team"),
        "recent_avg_fp": round(best_fp, 2),
    }


# ---------------------------------------------------------------------------
# Question id
# ---------------------------------------------------------------------------

def make_question_id(game_id: str, player_a_id: str, player_b_id: str) -> bytes:
    """Deterministic 32-byte questionId so re-runs don't double-create markets."""
    raw = f"{game_id}|{player_a_id}|{player_b_id}".encode()
    return hashlib.sha256(raw).digest()


def _player_id_to_bytes32(player_id: str) -> bytes:
    """Pack a string player id into a 32-byte slot (left-aligned, zero-padded)."""
    enc = player_id.encode()
    if len(enc) > 32:
        return hashlib.sha256(enc).digest()
    return enc.ljust(32, b"\x00")


# ---------------------------------------------------------------------------
# On-chain create
# ---------------------------------------------------------------------------

def _seed_amount_units() -> int:
    return int(DEFAULT_SEED_HUMAN * (10 ** COLLATERAL_DECIMALS))


def _approve_collateral(w3: Web3, signer, creator_addr: str, amount: int):
    """Approve the H2HCreator to spend `amount` collateral on behalf of the signer."""
    from chain import get_abi
    from h2h.chain import get_collateral_address

    coll = get_collateral_address()
    if not coll:
        raise RuntimeError("collateral address missing in deployments.h2h")
    erc20 = w3.eth.contract(address=Web3.to_checksum_address(coll), abi=get_abi("DBucks"))
    tx = erc20.functions.approve(Web3.to_checksum_address(creator_addr), amount).build_transaction(
        {"from": signer.address}
    )
    return send_tx(w3, signer, tx)


def create_market_onchain(
    game_id: str,
    player_a: dict,
    player_b: dict,
    seed_amount: Optional[int] = None,
) -> dict:
    """Submit the createMarket transaction. Returns dict with tx_hash + addresses (parsed from event)."""
    seed = seed_amount or _seed_amount_units()
    qid = make_question_id(game_id, player_a["id"], player_b["id"])
    pa = _player_id_to_bytes32(player_a["id"])
    pb = _player_id_to_bytes32(player_b["id"])

    w3 = get_w3()
    signer = get_creator_signer(w3)
    creator = build_creator(w3)

    _approve_collateral(w3, signer, creator.address, seed)

    tx = creator.functions.createMarket(qid, pa, pb, seed).build_transaction({"from": signer.address})
    tx_hash = send_tx(w3, signer, tx)
    receipt = w3.eth.wait_for_transaction_receipt(tx_hash, timeout=120)

    fpmm_addr = None
    condition_id = None
    for log in receipt.logs:
        try:
            ev = creator.events.H2HMarketCreated().process_log(log)
            fpmm_addr = ev["args"]["fpmm"]
            condition_id = ev["args"]["conditionId"].hex()
            break
        except Exception:
            continue

    return {
        "tx_hash": tx_hash,
        "fpmm_address": fpmm_addr,
        "condition_id": condition_id,
        "question_id": qid.hex(),
        "seed_amount": seed,
    }


# ---------------------------------------------------------------------------
# DB writes
# ---------------------------------------------------------------------------

def _persist_market(row: dict) -> Optional[int]:
    sb = get_supabase()
    if sb is None:
        logger.warning("Supabase not configured; market not persisted: %s", row.get("question_id"))
        return None
    try:
        resp = sb.table("h2h_markets").insert(row).execute()
        if resp.data and len(resp.data) > 0:
            return resp.data[0].get("id")
    except Exception as e:
        logger.error("h2h_markets insert failed: %s", e)
    return None


# ---------------------------------------------------------------------------
# Schedule helpers
# ---------------------------------------------------------------------------

def get_player_by_id(player_id: str) -> Optional[dict]:
    """Look up a player from deployments.json by their string id (e.g. 'victor_wembanyama')."""
    deployment = get_deployment() or {}
    for p in deployment.get("players", []):
        if p.get("id") == player_id:
            return p
    return None


def get_games_for_date(game_date: str) -> List[dict]:
    """Like get_games_today() but for any YYYY-MM-DD date. Not cached."""
    try:
        from nba_api.stats.endpoints import scoreboardv2

        sb_api = scoreboardv2.ScoreboardV2(game_date=game_date, timeout=8)
        games_df = sb_api.game_header.get_data_frame()
        line_df = sb_api.line_score.get_data_frame()
    except Exception as e:
        logger.warning("ScoreboardV2 fetch failed for %s: %s", game_date, e)
        return []

    games: List[dict] = []
    for _, row in games_df.iterrows():
        gid = str(row.get("GAME_ID", "")).strip()
        home_id = row.get("HOME_TEAM_ID")
        away_id = row.get("VISITOR_TEAM_ID")
        if not gid or home_id is None or away_id is None:
            continue
        home_tri = _team_tricode(line_df, home_id)
        away_tri = _team_tricode(line_df, away_id)
        if not home_tri or not away_tri:
            continue
        tip_off = row.get("GAME_DATE_EST")
        games.append({
            "game_id": gid,
            "home_team": home_tri,
            "away_team": away_tri,
            "tip_off_at": tip_off.isoformat() if hasattr(tip_off, "isoformat") else str(tip_off),
        })
    return games


def get_next_scheduled_game() -> Optional[dict]:
    """Return the next upcoming h2h_schedule entry (today or future). Used by frontend."""
    from db import get_supabase as _sb
    sb = _sb()
    if sb is None:
        return None
    today = _today_iso()
    try:
        resp = (
            sb.table("h2h_schedule")
            .select("game_date, player_a_id, player_b_id, notes")
            .gte("game_date", today)
            .order("game_date")
            .limit(1)
            .execute()
        )
        rows = resp.data or []
        if not rows:
            return None
        row = rows[0]
        # Enrich with player names from deployments
        pa = get_player_by_id(row["player_a_id"])
        pb = get_player_by_id(row["player_b_id"])
        return {
            "game_date": row["game_date"],
            "player_a_name": pa["name"] if pa else row["player_a_id"],
            "player_b_name": pb["name"] if pb else row["player_b_id"],
            "notes": row.get("notes"),
        }
    except Exception as e:
        logger.warning("get_next_scheduled_game failed: %s", e)
        return None


def upsert_schedule_entry(
    game_date: str,
    player_a_id: str,
    player_b_id: str,
    game_id: Optional[str] = None,
    tip_off_utc: Optional[str] = None,
    notes: Optional[str] = None,
) -> dict:
    """Upsert a row in h2h_schedule. Returns the upserted row."""
    from db import get_supabase as _sb
    sb = _sb()
    if sb is None:
        raise RuntimeError("Supabase not configured")
    row = {
        "game_date": game_date,
        "player_a_id": player_a_id,
        "player_b_id": player_b_id,
    }
    if game_id:
        row["game_id"] = game_id
    if tip_off_utc:
        row["tip_off_utc"] = tip_off_utc
    if notes:
        row["notes"] = notes
    resp = sb.table("h2h_schedule").upsert(row, on_conflict="game_date").execute()
    return (resp.data or [row])[0]


def list_schedule(limit: int = 14) -> List[dict]:
    """Return upcoming schedule entries."""
    from db import get_supabase as _sb
    sb = _sb()
    if sb is None:
        return []
    today = _today_iso()
    try:
        resp = (
            sb.table("h2h_schedule")
            .select("*")
            .gte("game_date", today)
            .order("game_date")
            .limit(limit)
            .execute()
        )
        rows = resp.data or []
        # Enrich with player names
        for row in rows:
            pa = get_player_by_id(row["player_a_id"])
            pb = get_player_by_id(row["player_b_id"])
            row["player_a_name"] = pa["name"] if pa else row["player_a_id"]
            row["player_b_name"] = pb["name"] if pb else row["player_b_id"]
        return rows
    except Exception as e:
        logger.warning("list_schedule failed: %s", e)
        return []


def create_market_from_schedule(game_date: Optional[str] = None, dry_run: bool = False) -> List[dict]:
    """Create today's (or a specific date's) H2H market from h2h_schedule.

    Returns [] if no schedule entry exists for that date (no market = no game day).
    """
    from db import get_supabase as _sb
    if game_date is None:
        game_date = _today_iso()

    sb = _sb()
    schedule_row = None
    if sb:
        try:
            resp = sb.table("h2h_schedule").select("*").eq("game_date", game_date).single().execute()
            schedule_row = resp.data
        except Exception:
            pass

    if not schedule_row:
        logger.info("No h2h_schedule entry for %s — skipping.", game_date)
        return []

    pa_raw = get_player_by_id(schedule_row["player_a_id"])
    pb_raw = get_player_by_id(schedule_row["player_b_id"])
    if not pa_raw or not pb_raw:
        logger.error("Player not found: %s or %s", schedule_row["player_a_id"], schedule_row["player_b_id"])
        return []

    pa = {"player_index": pa_raw["index"], "id": pa_raw["id"], "nba_id": pa_raw["nba_id"], "name": pa_raw["name"], "team": pa_raw["team"]}
    pb = {"player_index": pb_raw["index"], "id": pb_raw["id"], "nba_id": pb_raw["nba_id"], "name": pb_raw["name"], "team": pb_raw["team"]}

    # Use explicit game_id if set, else auto-detect from NBA API by matching player teams
    game_id = schedule_row.get("game_id")
    tip_off_at = schedule_row.get("tip_off_utc")

    if not game_id:
        games = get_games_for_date(game_date)
        for g in games:
            teams = {g["home_team"].upper(), g["away_team"].upper()}
            if pa["team"].upper() in teams or pb["team"].upper() in teams:
                game_id = g["game_id"]
                tip_off_at = tip_off_at or g["tip_off_at"]
                break
        if not game_id:
            # Fallback: use a deterministic placeholder so testing still works
            game_id = f"manual_{game_date}_{pa['team']}_{pb['team']}"
            logger.warning("Could not detect NBA game_id for %s — using placeholder %s", game_date, game_id)

    if not tip_off_at:
        tip_off_at = f"{game_date}T23:00:00+00:00"  # default 7pm ET

    # Idempotency check
    qid_hex = make_question_id(game_id, pa["id"], pb["id"]).hex()
    if sb:
        try:
            resp = sb.table("h2h_markets").select("id").eq("question_id", qid_hex).execute()
            if resp.data:
                logger.info("Market already exists for %s — skipping.", game_date)
                return []
        except Exception:
            pass

    if dry_run:
        return [{"game_date": game_date, "game_id": game_id, "player_a": pa, "player_b": pb, "question_id": qid_hex, "dry_run": True}]

    try:
        tx = create_market_onchain(game_id, pa, pb)
    except Exception as e:
        logger.error("createMarket failed for %s: %s", game_date, e)
        return []

    row = {
        "condition_id": tx["condition_id"],
        "question_id": tx["question_id"],
        "fpmm_address": tx["fpmm_address"],
        "position_id_a": "",
        "position_id_b": "",
        "game_id": game_id,
        "tip_off_at": tip_off_at,
        "player_a_id": pa["id"],
        "player_a_nba_id": pa["nba_id"],
        "player_a_name": pa["name"],
        "player_a_team": pa["team"],
        "player_b_id": pb["id"],
        "player_b_nba_id": pb["nba_id"],
        "player_b_name": pb["name"],
        "player_b_team": pb["team"],
        "status": "open",
        "seed_collateral": tx["seed_amount"] / (10 ** COLLATERAL_DECIMALS),
    }
    market_id = _persist_market(row)
    return [{"market_id": market_id, **row, "tx_hash": tx["tx_hash"]}]


# ---------------------------------------------------------------------------
# Public entrypoint
# ---------------------------------------------------------------------------

def create_markets_for_today(dry_run: bool = False) -> List[dict]:
    """Create one H2H market per scheduled NBA game today.

    Skips a game if either team has no eligible curated player, or if the game
    already has a row in h2h_markets (idempotent on questionId).
    """
    games = get_games_today()
    if not games:
        logger.info("No NBA games today; nothing to create.")
        return []

    sb = get_supabase()
    existing_qids: set = set()
    if sb is not None:
        try:
            today_iso = _today_iso()
            resp = (
                sb.table("h2h_markets")
                .select("question_id")
                .gte("tip_off_at", today_iso)
                .execute()
            )
            existing_qids = {r["question_id"] for r in (resp.data or [])}
        except Exception as e:
            logger.warning("h2h_markets dedupe lookup failed: %s", e)

    out: List[dict] = []
    for g in games:
        pa = pick_top_player_for_team(g["home_team"])
        pb = pick_top_player_for_team(g["away_team"])
        if not pa or not pb:
            logger.info(
                "Skipping %s vs %s — no curated player on one side (home=%s, away=%s)",
                g["home_team"],
                g["away_team"],
                bool(pa),
                bool(pb),
            )
            continue

        qid = make_question_id(g["game_id"], pa["id"], pb["id"]).hex()
        if qid in existing_qids:
            logger.info("Market already exists for game %s, skipping", g["game_id"])
            continue

        if dry_run:
            out.append({"game_id": g["game_id"], "player_a": pa, "player_b": pb, "question_id": qid})
            continue

        try:
            tx = create_market_onchain(g["game_id"], pa, pb)
        except Exception as e:
            logger.error("createMarket failed for %s: %s", g["game_id"], e)
            continue

        row = {
            "condition_id": tx["condition_id"],
            "question_id": tx["question_id"],
            "fpmm_address": tx["fpmm_address"],
            "position_id_a": "",  # filled lazily by frontend / live tracker
            "position_id_b": "",
            "game_id": g["game_id"],
            "tip_off_at": g["tip_off_at"],
            "player_a_id": pa["id"],
            "player_a_nba_id": pa["nba_id"],
            "player_a_name": pa["name"],
            "player_a_team": pa["team"],
            "player_b_id": pb["id"],
            "player_b_nba_id": pb["nba_id"],
            "player_b_name": pb["name"],
            "player_b_team": pb["team"],
            "status": "open",
            "seed_collateral": tx["seed_amount"] / (10 ** COLLATERAL_DECIMALS),
        }
        market_id = _persist_market(row)
        out.append({"market_id": market_id, **row, "tx_hash": tx["tx_hash"]})

    return out


# ---------------------------------------------------------------------------
# Read helpers (used by routes.py)
# ---------------------------------------------------------------------------

def list_markets(status: Optional[str] = None, limit: int = 100) -> List[dict]:
    sb = get_supabase()
    if sb is None:
        return []
    q = sb.table("h2h_markets").select("*").order("tip_off_at", desc=False).limit(limit)
    if status:
        q = q.eq("status", status)
    try:
        resp = q.execute()
        return resp.data or []
    except Exception as e:
        logger.warning("list_markets failed: %s", e)
        return []


def get_market(market_id: int) -> Optional[dict]:
    sb = get_supabase()
    if sb is None:
        return None
    try:
        resp = sb.table("h2h_markets").select("*").eq("id", market_id).single().execute()
        return resp.data
    except Exception:
        return None


def list_open_markets_past_tipoff(grace_minutes: int = 30) -> List[dict]:
    """Markets whose game has likely ended (tip_off + 4h) and aren't yet resolved."""
    sb = get_supabase()
    if sb is None:
        return []
    cutoff = (datetime.now(timezone.utc) - timedelta(minutes=grace_minutes)).isoformat()
    try:
        resp = (
            sb.table("h2h_markets")
            .select("*")
            .eq("status", "open")
            .lte("tip_off_at", cutoff)
            .execute()
        )
        return resp.data or []
    except Exception as e:
        logger.warning("list_open_markets_past_tipoff failed: %s", e)
        return []
