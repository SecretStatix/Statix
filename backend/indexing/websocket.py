"""WebSocket newHeads subscription + fallback to poll when WSS unavailable."""

from __future__ import annotations

import asyncio
import json
import logging

from websockets.exceptions import InvalidStatus

from .common import (
    catch_up_gap,
    parse_head_number,
    process_confirmed_head,
    websocket_url_for_indexer,
)
from .poll import run_poll_loop

logger = logging.getLogger("statix_indexer.websocket")


async def run_ws_loop(sb, *, fallback_poll: float) -> None:
    import websockets

    uri = websocket_url_for_indexer()
    logger.info("WebSocket mode: %s", uri)

    while True:
        try:
            async with websockets.connect(
                uri,
                max_size=10_000_000,
                ping_interval=20,
                ping_timeout=120,
            ) as ws:
                req = {
                    "jsonrpc": "2.0",
                    "id": 1,
                    "method": "eth_subscribe",
                    "params": ["newHeads"],
                }
                await ws.send(json.dumps(req))
                while True:
                    raw = await ws.recv()
                    msg = json.loads(raw)
                    if msg.get("id") == 1:
                        if msg.get("error"):
                            raise RuntimeError(msg["error"])
                        logger.info("subscribed newHeads id=%s", msg.get("result"))
                        continue
                    if msg.get("method") != "eth_subscription":
                        continue
                    params = msg.get("params") or {}
                    head = params.get("result")
                    if not isinstance(head, dict):
                        continue
                    bn = parse_head_number(head)
                    await asyncio.to_thread(process_confirmed_head, sb, bn)
        except asyncio.CancelledError:
            raise
        except InvalidStatus as e:
            if e.response.status_code == 405:
                logger.warning(
                    "WebSocket rejected (HTTP 405) at %s — public Base RPC often has no WSS. "
                    "Set INDEXER_WS_URL to Alchemy/Infura WSS, or use HTTP polling every %ss.",
                    uri,
                    fallback_poll,
                )
                await run_poll_loop(sb, fallback_poll)
                return
            logger.warning("WebSocket handshake failed: %s — falling back to poll", e)
            await run_poll_loop(sb, fallback_poll)
            return
        except Exception as e:
            logger.warning("WebSocket disconnected: %s — gap fill, reconnect in 5s", e)
            try:
                snap_n, tx_n = await asyncio.to_thread(catch_up_gap, sb)
                if snap_n or tx_n:
                    logger.info(
                        "Gap fill: %s snapshot(s), %s transaction(s) upserted",
                        snap_n,
                        tx_n,
                    )
            except Exception:
                logger.exception("catch_up_gap failed")
            await asyncio.sleep(5)
