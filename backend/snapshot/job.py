"""
Snapshot job: one row per (wallet, UTC hour) with on-chain NAV.

Run on a schedule (e.g. cron hourly):
  cd backend && ./venv/bin/python -m snapshot.job

Requires SUPABASE_SERVICE_ROLE_KEY and RPC access to Base Sepolia.
"""

from __future__ import annotations

import argparse
import logging
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

from dotenv import load_dotenv

load_dotenv(Path(__file__).parent.parent / ".env")

from db import create_supabase_service_client
from indexing.rpc import connect_w3_http

from .chain_read import compute_wallet_nav

logger = logging.getLogger("statix_snapshot.job")

PAGE_SIZE = 1000


def _utc_hour_bucket() -> datetime:
    now = datetime.now(timezone.utc)
    return now.replace(minute=0, second=0, microsecond=0)


def fetch_distinct_wallets(sb) -> list[str]:
    """Approved wallets from profiles (lowercased). Only snapshots users with accounts."""
    seen: set[str] = set()
    offset = 0
    while True:
        res = (
            sb.table("profiles")
            .select("wallet_address")
            .eq("is_approved", True)
            .not_.is_("wallet_address", "null")
            .range(offset, offset + PAGE_SIZE - 1)
            .execute()
        )
        rows = res.data or []
        if not rows:
            break
        for r in rows:
            w = r.get("wallet_address")
            if w:
                seen.add(str(w).lower().strip())
        if len(rows) < PAGE_SIZE:
            break
        offset += PAGE_SIZE
    return sorted(seen)


def run_snapshot_job(sb=None) -> dict:
    """
    For each wallet seen in `transactions`, read chain NAV and upsert one row
    for the current UTC hour bucket.
    """
    if sb is None:
        sb = create_supabase_service_client()
    if sb is None:
        raise RuntimeError("SUPABASE_SERVICE_ROLE_KEY and SUPABASE_URL must be set for snapshot job")

    bucket = _utc_hour_bucket()
    bucket_iso = bucket.isoformat()

    wallets = fetch_distinct_wallets(sb)
    logger.info("Snapshot bucket=%s wallets=%s", bucket_iso, len(wallets))

    try:
        w3 = connect_w3_http()
    except Exception as e:
        logger.error(
            "Snapshot job: cannot connect to Base Sepolia RPC (%s). "
            "Set INDEXER_RPC_URL or RPC_URL to a working HTTPS endpoint.",
            e,
        )
        return {
            "bucket": bucket_iso,
            "wallets_seen": len(wallets),
            "rows_upserted": 0,
            "chain_read_errors": len(wallets),
            "rpc_error": str(e),
        }

    rows = []
    errors = 0
    for w in wallets:
        nav = compute_wallet_nav(w3, w)
        if nav is None:
            errors += 1
            continue
        net_worth, cash, pos = nav
        rows.append(
            {
                "wallet_address": w,
                "snapshot_at": bucket_iso,
                "net_worth": round(net_worth, 6),
                "cash_dbucks": round(cash, 6),
                "positions_value": round(pos, 6),
            }
        )

    upserted = 0
    if rows:
        batch = int(os.getenv("SNAPSHOT_UPSERT_BATCH", "100"))
        for i in range(0, len(rows), batch):
            chunk = rows[i : i + batch]
            sb.table("wallet_portfolio_snapshots").upsert(
                chunk,
                on_conflict="wallet_address,snapshot_at",
            ).execute()
            upserted += len(chunk)

    return {
        "bucket": bucket_iso,
        "wallets_seen": len(wallets),
        "rows_upserted": upserted,
        "chain_read_errors": errors,
    }


def main() -> None:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(message)s",
    )
    parser = argparse.ArgumentParser(description="Wallet portfolio snapshot job (hourly NAV → Supabase)")
    parser.parse_args()

    try:
        out = run_snapshot_job()
        logger.info("Done: %s", out)
    except KeyboardInterrupt:
        raise
    except Exception as e:
        logger.exception("Snapshot job failed: %s", e)
        sys.exit(1)


if __name__ == "__main__":
    main()
