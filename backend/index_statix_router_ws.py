#!/usr/bin/env python3
"""
Near real-time StatixRouter indexer (startup backfill + WebSocket or HTTP poll).

Implementation: indexing/live.py, indexing/poll.py, indexing/websocket.py, indexing/sync.py, etc.
  cd backend && ./venv/bin/python index_statix_router_ws.py
  ./venv/bin/python index_statix_router_ws.py --poll-seconds 3
  ./venv/bin/python -m indexing.live --poll-seconds 3
"""
import os
from pathlib import Path
from dotenv import load_dotenv

load_dotenv(Path(__file__).parent / ".env")

from indexing.live import main

if __name__ == "__main__":
    main()