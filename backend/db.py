"""
Supabase client wrapper.
Credentials are loaded from environment variables.

Server-side writes (transactions, indexer, etc.) need the service_role JWT so RLS
does not block inserts. Set SUPABASE_SERVICE_ROLE_KEY from the Supabase dashboard
(Project Settings → API → service_role secret). If unset, falls back to SUPABASE_KEY.
"""

import os
from typing import Optional

_client = None


def get_supabase():
    """Get or create Supabase client (lazy init).

    Prefers SUPABASE_SERVICE_ROLE_KEY over SUPABASE_KEY for backend/indexer inserts.
    """
    global _client

    if _client is not None:
        return _client

    url = os.getenv("SUPABASE_URL")
    service = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
    key = service or os.getenv("SUPABASE_KEY")

    if not url or not key:
        print("WARNING: Supabase not configured. Using in-memory fallback.")
        return None

    if not service and key.startswith("sb_publishable_"):
        print(
            "WARNING: SUPABASE_KEY looks like a publishable (anon) key. "
            "Backend/indexer inserts need SUPABASE_SERVICE_ROLE_KEY from "
            "Supabase Dashboard → Project Settings → API → service_role."
        )

    try:
        from supabase import create_client
        _client = create_client(url, key)
        return _client
    except ImportError:
        print("WARNING: supabase-py not installed. Using in-memory fallback.")
        return None


def create_supabase_service_client():
    """
    Supabase client using ONLY SUPABASE_SERVICE_ROLE_KEY (no publishable fallback).

    Use for the chain indexer and any job that must insert past RLS. Not a singleton,
    so a bad cached key from get_supabase() cannot affect it.
    """
    url = os.getenv("SUPABASE_URL")
    key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        return None
    try:
        from supabase import create_client

        return create_client(url, key)
    except ImportError:
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
