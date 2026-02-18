"""
Supabase client wrapper.
Credentials are loaded from environment variables.
Set SUPABASE_URL and SUPABASE_KEY in your .env file.
"""

import os
from typing import Optional

_client = None


def get_supabase():
    """Get or create Supabase client (lazy init)."""
    global _client

    if _client is not None:
        return _client

    url = os.getenv("SUPABASE_URL")
    key = os.getenv("SUPABASE_KEY")

    if not url or not key:
        print("WARNING: Supabase not configured. Using in-memory fallback.")
        return None

    try:
        from supabase import create_client
        _client = create_client(url, key)
        return _client
    except ImportError:
        print("WARNING: supabase-py not installed. Using in-memory fallback.")
        return None


# ============== In-memory fallback for development ==============

_memory_store = {
    "users": {},          # wallet_address -> {balance, joined_at}
    "transactions": [],   # [{user, player_idx, type, shares, cost, timestamp}]
    "dividend_claims": [],
}


def get_store():
    """Get in-memory store (used when Supabase not configured)."""
    return _memory_store
