"""Autonomous H2H resolver daemon.

Loop:
  1. List open markets whose tip_off was at least RESOLVE_GRACE_MINUTES ago.
  2. Pull BoxScoreTraditionalV2 for the game_id.
  3. If game status is Final:
       - For each player, compute FP from their box-score line via calculate_fantasy_points.
       - If both played: oracle.resolve(qid, fpA*100, fpB*100). The oracle picks payouts.
       - If either MIN==0: oracle.voidMarket(qid).
  4. If status indicates Postponed/Cancelled or the call fails repeatedly:
       - oracle.voidMarket(qid).
  5. After confirmation:
       - Mark market resolved in h2h_markets with winner + final_fp values.
       - Snapshot LP metrics.
       - Sweep FPMM fees → already auto-routed to DividendHub via FPMM.withdrawFees.

Designed to be safe to re-run: if a market is already resolved on-chain, the
oracle reverts and we mark the row resolved without re-broadcasting.
"""

from __future__ import annotations

import logging
import os
import time
from datetime import datetime, timezone
from typing import Optional

from web3 import Web3

from db import get_supabase
from nba_stats import calculate_fantasy_points

from .chain import build_fpmm, build_oracle, get_oracle_signer, get_w3, send_tx
from .lp_metrics import snapshot_market_metrics
from .service import list_open_markets_past_tipoff

logger = logging.getLogger("statix.h2h.resolver")

RESOLVE_GRACE_MINUTES = int(os.getenv("H2H_RESOLVE_GRACE_MINUTES", "30"))
LOOP_INTERVAL_SECONDS = int(os.getenv("H2H_RESOLVER_INTERVAL", "60"))

# Final game status codes from NBA BoxScoreV2 (3 = Final).
NBA_STATUS_FINAL = 3
NBA_STATUS_POSTPONED_KEYWORDS = ("PPD", "POSTP", "CANCEL")


# ---------------------------------------------------------------------------
# NBA box-score helpers
# ---------------------------------------------------------------------------

def _fetch_boxscore(game_id: str) -> Optional[dict]:
    try:
        from nba_api.stats.endpoints import boxscoretraditionalv2

        bs = boxscoretraditionalv2.BoxScoreTraditionalV2(game_id=game_id, timeout=10)
        players_df = bs.player_stats.get_data_frame()
        return {"players": players_df}
    except Exception as e:
        logger.warning("BoxScoreV2 fetch failed for %s: %s", game_id, e)
        return None


def _fetch_game_status(game_id: str) -> Optional[int]:
    try:
        from nba_api.stats.endpoints import scoreboardv2

        # Game status lives on the GameHeader row; we can grab it from any recent scoreboard
        # but the cleanest single-game endpoint is BoxScoreSummaryV2.
        from nba_api.stats.endpoints import boxscoresummaryv2

        s = boxscoresummaryv2.BoxScoreSummaryV2(game_id=game_id, timeout=8)
        df = s.game_summary.get_data_frame()
        if df.empty:
            return None
        status = df.iloc[0].get("GAME_STATUS_ID")
        text = str(df.iloc[0].get("GAME_STATUS_TEXT") or "").upper()
        if any(k in text for k in NBA_STATUS_POSTPONED_KEYWORDS):
            return -1  # custom code: postponed
        return int(status) if status is not None else None
    except Exception as e:
        logger.warning("game status fetch failed for %s: %s", game_id, e)
        return None


def _player_fp_and_min(players_df, nba_id: int) -> Optional[tuple]:
    """Return (fantasy_points, minutes) for `nba_id`, or None if not in box score."""
    rows = players_df[players_df["PLAYER_ID"] == nba_id]
    if rows.empty:
        return None
    row = rows.iloc[0]
    minutes_raw = row.get("MIN")
    minutes = _parse_min(minutes_raw)
    stats = {
        "PTS": float(row.get("PTS") or 0),
        "REB": float(row.get("REB") or 0),
        "AST": float(row.get("AST") or 0),
        "STL": float(row.get("STL") or 0),
        "BLK": float(row.get("BLK") or 0),
        "FG3M": float(row.get("FG3M") or 0),
        "TOV": float(row.get("TO") or 0),
    }
    fp = calculate_fantasy_points(stats)
    return (fp, minutes)


def _parse_min(value) -> float:
    """Parse NBA's "MM:SS" minutes string into a float."""
    if value is None:
        return 0.0
    if isinstance(value, (int, float)):
        return float(value)
    s = str(value).strip()
    if not s:
        return 0.0
    if ":" in s:
        try:
            mm, ss = s.split(":")
            return float(mm) + float(ss) / 60.0
        except Exception:
            return 0.0
    try:
        return float(s)
    except Exception:
        return 0.0


# ---------------------------------------------------------------------------
# Oracle write
# ---------------------------------------------------------------------------

def _resolve_onchain(question_id_hex: str, fp_a_x100: int, fp_b_x100: int) -> Optional[str]:
    w3 = get_w3()
    signer = get_oracle_signer(w3)
    oracle = build_oracle(w3)
    qid_bytes = bytes.fromhex(question_id_hex.removeprefix("0x"))
    tx = oracle.functions.resolve(qid_bytes, fp_a_x100, fp_b_x100).build_transaction({"from": signer.address})
    try:
        tx_hash = send_tx(w3, signer, tx)
        w3.eth.wait_for_transaction_receipt(tx_hash, timeout=120)
        return tx_hash
    except Exception as e:
        logger.error("oracle.resolve failed for %s: %s", question_id_hex, e)
        return None


def _void_onchain(question_id_hex: str) -> Optional[str]:
    w3 = get_w3()
    signer = get_oracle_signer(w3)
    oracle = build_oracle(w3)
    qid_bytes = bytes.fromhex(question_id_hex.removeprefix("0x"))
    tx = oracle.functions.voidMarket(qid_bytes).build_transaction({"from": signer.address})
    try:
        tx_hash = send_tx(w3, signer, tx)
        w3.eth.wait_for_transaction_receipt(tx_hash, timeout=120)
        return tx_hash
    except Exception as e:
        logger.error("oracle.voidMarket failed for %s: %s", question_id_hex, e)
        return None


def _sweep_fpmm_fees(fpmm_address: str) -> None:
    """Best-effort: trigger withdrawFees so DividendHub receives the round's H2H fees."""
    if not fpmm_address:
        return
    try:
        w3 = get_w3()
        signer = get_oracle_signer(w3)
        fpmm = build_fpmm(w3, fpmm_address)
        tx = fpmm.functions.withdrawFees().build_transaction({"from": signer.address})
        send_tx(w3, signer, tx)
    except Exception as e:
        logger.warning("withdrawFees failed for %s: %s", fpmm_address, e)


# ---------------------------------------------------------------------------
# DB write
# ---------------------------------------------------------------------------

def _mark_resolved(
    market_id: int,
    winner: str,
    fp_a: float,
    fp_b: float,
    tx_hash: Optional[str],
) -> None:
    sb = get_supabase()
    if sb is None:
        return
    try:
        sb.table("h2h_markets").update(
            {
                "status": "resolved" if winner != "void" else "voided",
                "winner": winner,
                "player_a_final_fp": fp_a,
                "player_b_final_fp": fp_b,
                "resolved_at": datetime.now(timezone.utc).isoformat(),
                "resolve_tx_hash": tx_hash,
            }
        ).eq("id", market_id).execute()
    except Exception as e:
        logger.error("mark_resolved DB update failed for market %s: %s", market_id, e)


# ---------------------------------------------------------------------------
# Per-market handler
# ---------------------------------------------------------------------------

def _handle_market(market: dict) -> None:
    qid = market["question_id"]
    game_id = market["game_id"]
    nba_a = market["player_a_nba_id"]
    nba_b = market["player_b_nba_id"]
    fpmm_address = market.get("fpmm_address")

    status = _fetch_game_status(game_id)
    if status is None:
        logger.info("Game %s status unknown, will retry next loop", game_id)
        return
    if status == -1:
        logger.info("Game %s postponed/cancelled — voiding market %s", game_id, market.get("id"))
        tx = _void_onchain(qid)
        _mark_resolved(market["id"], "void", 0.0, 0.0, tx)
        snapshot_market_metrics(market["id"])
        _sweep_fpmm_fees(fpmm_address)
        return
    if status != NBA_STATUS_FINAL:
        # Game still in progress, leave for live tracker.
        return

    box = _fetch_boxscore(game_id)
    if box is None:
        return

    a = _player_fp_and_min(box["players"], int(nba_a))
    b = _player_fp_and_min(box["players"], int(nba_b))
    if a is None or b is None:
        # Player(s) didn't appear in box score — void.
        logger.warning("Missing box-score row for market %s — voiding", market.get("id"))
        tx = _void_onchain(qid)
        _mark_resolved(market["id"], "void", 0.0, 0.0, tx)
        snapshot_market_metrics(market["id"])
        _sweep_fpmm_fees(fpmm_address)
        return

    fp_a, min_a = a
    fp_b, min_b = b
    if min_a <= 0 or min_b <= 0:
        # Either player DNP — void.
        logger.info("Market %s: DNP detected (min_a=%s, min_b=%s) → void", market.get("id"), min_a, min_b)
        tx = _void_onchain(qid)
        _mark_resolved(market["id"], "void", fp_a, fp_b, tx)
        snapshot_market_metrics(market["id"])
        _sweep_fpmm_fees(fpmm_address)
        return

    fp_a_x100 = int(round(fp_a * 100))
    fp_b_x100 = int(round(fp_b * 100))
    tx = _resolve_onchain(qid, fp_a_x100, fp_b_x100)
    winner = "A" if fp_a > fp_b else ("B" if fp_b > fp_a else "void")
    _mark_resolved(market["id"], winner, fp_a, fp_b, tx)
    snapshot_market_metrics(market["id"])
    _sweep_fpmm_fees(fpmm_address)


# ---------------------------------------------------------------------------
# Public entrypoints
# ---------------------------------------------------------------------------

def run_once() -> int:
    """One pass: handle every open-and-past-tipoff market. Returns count handled."""
    markets = list_open_markets_past_tipoff(grace_minutes=RESOLVE_GRACE_MINUTES)
    handled = 0
    for m in markets:
        try:
            _handle_market(m)
            handled += 1
        except Exception as e:
            logger.exception("Unhandled error resolving market %s: %s", m.get("id"), e)
    return handled


def run_forever(interval: int = LOOP_INTERVAL_SECONDS) -> None:
    logger.info("H2H resolver loop starting (interval=%ss)", interval)
    while True:
        try:
            n = run_once()
            if n:
                logger.info("Resolver pass complete — handled %s markets", n)
        except Exception as e:
            logger.exception("Resolver loop error: %s", e)
        time.sleep(interval)
