"""Cron entrypoint: create one H2H market per NBA game scheduled today.

Invoke once per day (e.g. 09:00 ET) via Railway scheduled jobs or GitHub Actions:
    python -m backend.scripts.h2h_create_daily_markets

Env:
    DRY_RUN=1 to skip on-chain writes.
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
    created = service.create_markets_for_today(dry_run=dry_run)
    logger.info("Created %s market(s) (dry_run=%s)", len(created), dry_run)
    print(json.dumps({"created": len(created), "dry_run": dry_run, "markets": created}))
    return 0


if __name__ == "__main__":
    sys.exit(main())
