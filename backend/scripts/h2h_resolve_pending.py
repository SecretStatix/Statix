"""Cron entrypoint: resolve any H2H markets whose games have finished.

Invoke every 5-10 minutes during NBA game hours:
    python -m backend.scripts.h2h_resolve_pending

Safe to run frequently — resolver.run_once() skips markets whose games are
still in progress or not past the tip-off grace window.
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
logger = logging.getLogger("h2h.cron.resolve")


def main() -> int:
    from h2h import resolver

    handled = resolver.run_once()
    logger.info("Resolver handled %s markets", handled)
    print(json.dumps({"handled": handled}))
    return 0


if __name__ == "__main__":
    sys.exit(main())
