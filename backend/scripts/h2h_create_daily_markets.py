"""Cron entrypoint: create today's H2H market from the h2h_schedule table.

Runs once per day (e.g. 09:00 ET). If no schedule entry exists for today,
no market is created — expected on non-game days.

    python -m backend.scripts.h2h_create_daily_markets

Env:
    DRY_RUN=1  — skip on-chain writes, just log what would be created.
"""

from __future__ import annotations

import json
import logging
import os
import sys

logging.basicConfig(
    level=os.getenv("LOG_LEVEL", "INFO"),
    format="%(asctime)s %(levelname)s %(name)s - %(message)s",
)
logger = logging.getLogger("h2h.cron.create")


def main() -> int:
    from h2h import service

    dry_run = os.getenv("DRY_RUN") in ("1", "true", "True")
    created = service.create_market_from_schedule(dry_run=dry_run)
    if created:
        logger.info("Created market (dry_run=%s): %s", dry_run, created[0].get("fpmm_address") or created[0].get("question_id"))
    else:
        logger.info("No market created today (no schedule entry or already exists).")
    print(json.dumps({"created": len(created), "dry_run": dry_run, "markets": created}))
    return 0


if __name__ == "__main__":
    sys.exit(main())
