"""Orchestrate startup backfill + WebSocket or HTTP poll for live indexing."""

from __future__ import annotations

import argparse
import asyncio
import logging
import os
import sys

from .sync import run_backfill_once
from .poll import run_poll_loop
from .websocket import run_ws_loop

logger = logging.getLogger("statix_indexer.live")

DEFAULT_POLL_SECONDS = float(os.getenv("INDEXER_POLL_SECONDS", "0"))
POLL_FALLBACK_SECONDS = float(os.getenv("INDEXER_POLL_FALLBACK_SECONDS", "3"))


async def run_live_indexer(
    sb,
    *,
    poll_seconds: float | None,
    fallback_poll: float,
) -> None:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(message)s",
    )
    logger.info("Startup backfill…")
    await asyncio.to_thread(run_backfill_once, sb)

    if poll_seconds and poll_seconds > 0:
        await run_poll_loop(sb, poll_seconds)
    else:
        await run_ws_loop(sb, fallback_poll=fallback_poll)


def main() -> None:
    parser = argparse.ArgumentParser(description="WebSocket / poll indexer for StatixRouter")
    parser.add_argument(
        "--poll-seconds",
        type=float,
        default=None,
        metavar="N",
        help="HTTP polling every N seconds (skips WebSocket). Recommended for public Base RPC.",
    )
    args = parser.parse_args()

    from db import create_supabase_service_client

    sb = create_supabase_service_client()
    if sb is None:
        print(
            "ERROR: Set SUPABASE_SERVICE_ROLE_KEY in backend/.env",
            file=sys.stderr,
        )
        sys.exit(1)

    if args.poll_seconds is not None:
        poll = float(args.poll_seconds)
    else:
        poll = float(DEFAULT_POLL_SECONDS)

    try:
        asyncio.run(
            run_live_indexer(
                sb,
                poll_seconds=poll if poll > 0 else None,
                fallback_poll=POLL_FALLBACK_SECONDS,
            )
        )
    except KeyboardInterrupt:
        print("Stopped.")


if __name__ == "__main__":
    main()
