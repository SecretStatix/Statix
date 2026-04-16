"""Batch upsert into Supabase (`pool_price_snapshots`, `transactions`)."""

from __future__ import annotations

import logging

from .config import UPSERT_BATCH

logger = logging.getLogger("statix_indexer.upsert")


def upsert_snapshot_rows(sb, rows: list[dict]) -> int:
    if not rows:
        return 0
    total = 0
    for i in range(0, len(rows), UPSERT_BATCH):
        batch = rows[i : i + UPSERT_BATCH]
        sb.table("pool_price_snapshots").upsert(
            batch,
            on_conflict="block_number,log_index",
        ).execute()
        logger.info(
            "Upserted %d row(s) into pool_price_snapshots (blocks %s–%s)",
            len(batch),
            batch[0]["block_number"],
            batch[-1]["block_number"],
        )
        total += len(batch)
    return total


def upsert_transaction_rows(sb, rows: list[dict]) -> int:
    """Insert/update `transactions` from chain events (unique on tx_hash)."""
    if not rows:
        return 0
    total = 0
    for i in range(0, len(rows), UPSERT_BATCH):
        batch = rows[i : i + UPSERT_BATCH]
        sb.table("transactions").upsert(batch, on_conflict="tx_hash").execute()
        logger.info(
            "Upserted %d row(s) into transactions (tx hashes e.g. %s…)",
            len(batch),
            batch[0]["tx_hash"][:18],
        )
        total += len(batch)
    return total


def upsert_dividend_claim_rows(sb, rows: list[dict]) -> int:
    """Insert/update `dividend_claims` from DividendClaimed events (unique on round, wallet_address)."""
    if not rows:
        return 0
    total = 0
    for i in range(0, len(rows), UPSERT_BATCH):
        batch = rows[i : i + UPSERT_BATCH]
        sb.table("dividend_claims").upsert(
            batch, on_conflict="round,wallet_address"
        ).execute()
        logger.info("Upserted %d row(s) into dividend_claims", len(batch))
        total += len(batch)
    return total


def upsert_round_distribution_rows(sb, rows: list[dict]) -> int:
    """Insert/update `round_distributions` from DividendsDistributed events (unique on round)."""
    if not rows:
        return 0
    total = 0
    for i in range(0, len(rows), UPSERT_BATCH):
        batch = rows[i : i + UPSERT_BATCH]
        sb.table("round_distributions").upsert(batch, on_conflict="round").execute()
        logger.info("Upserted %d row(s) into round_distributions", len(batch))
        total += len(batch)
    return total
