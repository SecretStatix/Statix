"""HTTP polling loop for near-real-time indexing."""

from __future__ import annotations

import asyncio
import logging

from .config import CONFIRMATIONS
from .rpc import connect_w3_http
from .state import last_processed_block, load_state
from .sync import process_blocks_range

logger = logging.getLogger("statix_indexer.poll")


async def run_poll_loop(sb, interval: float) -> None:
    logger.info("Poll mode: every %ss (HTTP)", interval)
    while True:
        await asyncio.sleep(interval)
        try:
            w3 = connect_w3_http()
            latest = w3.eth.block_number
            safe = latest - CONFIRMATIONS
            st = load_state()
            last = last_processed_block(st)
            if safe <= last:
                continue
            await asyncio.to_thread(process_blocks_range, sb, last + 1, safe)
        except Exception as e:
            logger.exception("poll tick failed: %s", e)
