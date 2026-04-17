"""Daemon entrypoint: poll in-progress H2H games for live fantasy points + pool snapshots.

Run as a long-lived worker (Railway service, `python -m backend.scripts.h2h_live_tracker`).
Use H2H_LIVE_INTERVAL env to tune polling (default 60s).
"""

from __future__ import annotations

import logging
import os

logging.basicConfig(
    level=os.getenv("LOG_LEVEL", "INFO"),
    format="%(asctime)s %(levelname)s %(name)s - %(message)s",
)


def main() -> None:
    from h2h import live_tracker

    live_tracker.run_forever()


if __name__ == "__main__":
    main()
