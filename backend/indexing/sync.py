"""
Orchestrate log fetch, Supabase upsert, and state updates for StatixRouter indexing.
"""

from __future__ import annotations

import logging

from web3 import Web3

from chain import get_abi, get_deployment

from .config import (
    BLOCK_CHUNK,
    CONFIRMATIONS,
    FIRST_LOOKBACK,
    FROM_BLOCK_ENV,
    STATE_PATH,
)
from .rpc import build_hub_contract, build_router_contract, connect_w3_http
from .state import last_processed_block, load_state, save_state
from .transform import collect_dividend_rows, collect_trade_index_rows
from .upsert import (
    upsert_dividend_claim_rows,
    upsert_round_distribution_rows,
    upsert_snapshot_rows,
    upsert_transaction_rows,
)
logger = logging.getLogger("statix_indexer.sync")


def sync_range(
    w3: Web3,
    router,
    hub,
    sb,
    start: int,
    end: int,
    *,
    persist_state: bool,
) -> tuple[int, int]:
    total_snap = 0
    total_tx = 0
    a = start
    while a <= end:
        b = min(a + BLOCK_CHUNK - 1, end)

        snap_rows, tx_rows = collect_trade_index_rows(w3, router, a, b)
        claim_rows, dist_rows = collect_dividend_rows(w3, hub, a, b)

        if sb is not None:
            if snap_rows:
                total_snap += upsert_snapshot_rows(sb, snap_rows)
            if tx_rows:
                total_tx += upsert_transaction_rows(sb, tx_rows)
            if claim_rows:
                upsert_dividend_claim_rows(sb, claim_rows)
            if dist_rows:
                upsert_round_distribution_rows(sb, dist_rows)
        elif snap_rows or tx_rows or claim_rows or dist_rows:
            logger.info(
                "Dry run: would upsert %s snapshot(s), %s transaction(s), "
                "%s claim(s), %s distribution(s) (blocks %s-%s)",
                len(snap_rows), len(tx_rows), len(claim_rows), len(dist_rows), a, b,
            )
            total_snap += len(snap_rows)
            total_tx += len(tx_rows)

        if persist_state:
            save_state(b)

        a = b + 1

    return total_snap, total_tx


def catch_up_gap(sb) -> tuple[int, int]:
    """Index from last_processed+1 through safe_latest (for reconnect / WS drop)."""
    w3 = connect_w3_http()
    router = build_router_contract(w3)
    hub = build_hub_contract(w3)
    st = load_state()
    last = last_processed_block(st)
    latest = w3.eth.block_number
    safe = max(0, latest - CONFIRMATIONS)
    start = last + 1
    if start > safe:
        return 0, 0
    return sync_range(w3, router, hub, sb, start, safe, persist_state=True)


def run_backfill_once(
    sb,
    *,
    dry_run: bool = False,
    from_block_override: int | None = None,
) -> None:
    deployment = get_deployment()
    if not deployment:
        raise RuntimeError("deployments.json missing — cannot index")

    contracts = deployment.get("contracts") or {}
    router_addr = contracts.get("StatixRouter")
    if not router_addr:
        raise RuntimeError("StatixRouter address not in deployments.json")

    w3 = connect_w3_http()
    abi = get_abi("StatixRouter")
    router = w3.eth.contract(address=Web3.to_checksum_address(router_addr), abi=abi)
    hub = build_hub_contract(w3)

    state = load_state()
    latest = w3.eth.block_number
    safe_latest = max(0, latest - CONFIRMATIONS)

    if safe_latest < 1:
        logger.info("Chain not far enough; nothing to index.")
        return

    if from_block_override is not None:
        start_block = from_block_override
    elif state.get("last_processed_block") is not None:
        start_block = int(state["last_processed_block"]) + 1
    elif FROM_BLOCK_ENV:
        start_block = int(FROM_BLOCK_ENV)
    else:
        start_block = max(0, safe_latest - FIRST_LOOKBACK)

    if start_block > safe_latest:
        logger.info(
            "Already caught up (start %s > safe latest %s).",
            start_block,
            safe_latest,
        )
        return

    logger.info(
        "Indexing blocks %s..%s (latest=%s, confirmations=%s)",
        start_block,
        safe_latest,
        latest,
        CONFIRMATIONS,
    )

    snap_n, tx_n = sync_range(
        w3,
        router,
        hub,
        sb,
        start_block,
        safe_latest,
        persist_state=not dry_run,
    )
    logger.info(
        "Done. pool_price_snapshots: %s, transactions: %s. State file: %s (updated=%s)",
        snap_n,
        tx_n,
        STATE_PATH,
        not dry_run,
    )


def process_blocks_range(sb, from_b: int, to_b: int) -> tuple[int, int]:
    """Sync: index [from_b, to_b] inclusive. Returns rows written per table."""
    if from_b > to_b:
        return 0, 0
    w3 = connect_w3_http()
    router = build_router_contract(w3)
    hub = build_hub_contract(w3)
    n_snap = 0
    n_tx = 0
    for b in range(from_b, to_b + 1):
        snap_rows, tx_rows = collect_trade_index_rows(w3, router, b, b)
        claim_rows, dist_rows = collect_dividend_rows(w3, hub, b, b)
        if snap_rows:
            n_snap += upsert_snapshot_rows(sb, snap_rows)
        if tx_rows:
            n_tx += upsert_transaction_rows(sb, tx_rows)
        if claim_rows:
            upsert_dividend_claim_rows(sb, claim_rows)
        if dist_rows:
            upsert_round_distribution_rows(sb, dist_rows)
        save_state(b)
    return n_snap, n_tx


def process_confirmed_head(sb, head_block_number: int) -> None:
    """Process blocks up to (head_block_number - CONFIRMATIONS) from newHeads."""
    target = head_block_number - CONFIRMATIONS
    if target < 0:
        return
    st = load_state()
    last = last_processed_block(st)
    if target <= last:
        return
    start = last + 1
    process_blocks_range(sb, start, target)
