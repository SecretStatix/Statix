"""Environment and indexer constants (loads `.env` once at import)."""

from __future__ import annotations

import os
from pathlib import Path

from dotenv import load_dotenv

BACKEND_DIR = Path(__file__).parent.parent.resolve()
load_dotenv(BACKEND_DIR / ".env")

STATE_PATH = BACKEND_DIR / "indexer_state.json"

DEFAULT_RPC = "https://sepolia.base.org"

CONFIRMATIONS = int(os.getenv("INDEXER_CONFIRMATIONS", "12"))
BLOCK_CHUNK = int(os.getenv("INDEXER_BLOCK_CHUNK", "2000"))
FIRST_LOOKBACK = int(os.getenv("INDEXER_FIRST_LOOKBACK", "50000"))
FROM_BLOCK_ENV = os.getenv("INDEXER_FROM_BLOCK")
UPSERT_BATCH = int(os.getenv("INDEXER_UPSERT_BATCH", "100"))

# DBucks / share amounts on-chain use 6 decimals (match StatixRouter + DBucks).
TOKEN_DECIMALS = 6
