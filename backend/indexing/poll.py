"""HTTP polling loop for near-real-time indexing."""

from __future__ import annotations

import asyncio
import logging

from .config import CONFIRMATIONS
from .rpc import connect_w3_http
from .state import last_processed_block, load_state
from .sync import process_blocks_range

logger = logging.getLogger("statix_indexer.poll")

# Log occasionally when there is nothing to index (avoids silent "running but no rows" confusion).
_IDLE_LOG_EVERY = 20


async def run_poll_loop(sb, interval: float) -> None:
    logger.info("Poll mode: every %ss (HTTP)", interval)
    idle_ticks = 0
    while True:
        await asyncio.sleep(interval)
        try:
            w3 = connect_w3_http()
            latest = w3.eth.block_number
            safe = latest - CONFIRMATIONS
            st = load_state()
            last = last_processed_block(st)
            if safe <= last:
                idle_ticks += 1
                if idle_ticks == 1 or idle_ticks % _IDLE_LOG_EVERY == 0:
                    logger.info(
                        "Poll idle: no confirmed range to index yet "
                        "(last_processed_block=%s, safe_head=%s, latest=%s, confirmations=%s). "
                        "Indexing resumes once latest > last_processed + confirmations "
                        "(~%s more block(s) on the chain).",
                        last,
                        safe,
                        latest,
                        CONFIRMATIONS,
                        max(0, last + CONFIRMATIONS + 1 - int(latest)),
                    )
                continue
            idle_ticks = 0
            snap_n, tx_n = await asyncio.to_thread(process_blocks_range, sb, last + 1, safe)
            if snap_n or tx_n:
                logger.info(
                    "Indexed blocks %s..%s — pool_price_snapshots rows=%s, transactions rows=%s",
                    last + 1,
                    safe,
                    snap_n,
                    tx_n,
                )
        except Exception as e:
            logger.exception("poll tick failed: %s", e)
