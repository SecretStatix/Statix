"""One-shot / cron batch indexer CLI."""

from __future__ import annotations

import argparse
import logging
import os
import sys
import time

from .config import STATE_PATH
from .sync import run_backfill_once


def main() -> None:
    parser = argparse.ArgumentParser(description="Batch index StatixRouter trades into Supabase")
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Fetch logs but do not write DB or state file",
    )
    parser.add_argument(
        "--reset-state",
        action="store_true",
        help="Delete indexer_state.json before run",
    )
    parser.add_argument(
        "--from-block",
        type=int,
        default=None,
        metavar="N",
        help="Start from this block (overrides saved state; upserts dedupe)",
    )
    args = parser.parse_args()

    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(message)s",
    )

    if args.reset_state and STATE_PATH.exists():
        STATE_PATH.unlink()
        print(f"Removed {STATE_PATH}")

    from db import create_supabase_service_client

    sb = None if args.dry_run else create_supabase_service_client()
    if not args.dry_run and sb is None:
        print(
            "ERROR: Set SUPABASE_SERVICE_ROLE_KEY in backend/.env (Secret API key).",
            file=sys.stderr,
        )
        sys.exit(1)
    if not args.dry_run:
        print("Using SUPABASE_SERVICE_ROLE_KEY for inserts.")

    from_override = args.from_block

    loop_sec = int(os.getenv("INDEXER_LOOP_SECONDS", "0"))
    while True:
        try:
            run_backfill_once(sb, dry_run=args.dry_run, from_block_override=from_override)
            from_override = None
        except Exception as e:
            print(f"Indexer error: {e}", file=sys.stderr)
            raise
        if loop_sec <= 0:
            break
        time.sleep(loop_sec)


if __name__ == "__main__":
    main()
