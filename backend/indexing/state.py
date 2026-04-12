"""Persistent indexer cursor: `last_processed_block` in `indexer_state.json`."""

from __future__ import annotations

import json

from .config import STATE_PATH


def load_state() -> dict:
    if STATE_PATH.exists():
        return json.loads(STATE_PATH.read_text())
    return {}


def save_state(last_block: int) -> None:
    STATE_PATH.write_text(json.dumps({"last_processed_block": last_block}, indent=2))


def last_processed_block(st: dict) -> int:
    if st.get("last_processed_block") is None:
        return -1
    return int(st["last_processed_block"])
