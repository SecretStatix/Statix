"""
Supabase client wrapper for the Statix backend.

Provides two clients:
  - get_supabase()                  — lazy singleton, prefers service-role key.
                                      Returns None if credentials are missing (callers
                                      should use routes.helpers.require_supabase() to
                                      raise HTTP 503 instead of handling None).
  - create_supabase_service_client() — fresh non-singleton using ONLY service-role key.
                                       Used by the chain indexer and snapshot jobs that
                                       must write past RLS without inheriting a cached
                                       anon-key client.

Server-side writes need SUPABASE_SERVICE_ROLE_KEY (Project Settings → API → service_role).
"""

import logging
import os

logger = logging.getLogger(__name__)

_client = None


def get_supabase():
    """Get or create the shared Supabase client (lazy init).

    Prefers SUPABASE_SERVICE_ROLE_KEY over SUPABASE_KEY so RLS never blocks
    backend inserts. Returns None if credentials are absent — route handlers
    should call routes.helpers.require_supabase() to surface this as HTTP 503.
    """
    global _client

    if _client is not None:
        return _client

    url = os.getenv("SUPABASE_URL")
    service = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
    key = service or os.getenv("SUPABASE_KEY")

    if not url or not key:
        logger.error(
            "Supabase not configured: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set"
        )
        return None

    if not service and key.startswith("sb_publishable_"):
        logger.warning(
            "SUPABASE_KEY looks like a publishable (anon) key — "
            "backend writes need SUPABASE_SERVICE_ROLE_KEY from "
            "Supabase Dashboard → Project Settings → API → service_role"
        )

    try:
        from supabase import create_client
        _client = create_client(url, key)
        return _client
    except ImportError:
        logger.error("supabase-py not installed — run: pip install supabase")
        return None


def create_supabase_service_client():
    """Create a fresh Supabase client using ONLY SUPABASE_SERVICE_ROLE_KEY.

    Not a singleton — always creates a new client so a bad cached key from
    get_supabase() cannot affect indexer or snapshot jobs.
    Returns None if the service role key is absent.
    """
    url = os.getenv("SUPABASE_URL")
    key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        logger.error(
            "create_supabase_service_client: SUPABASE_URL or "
            "SUPABASE_SERVICE_ROLE_KEY not set"
        )
        return None
    try:
        from supabase import create_client
        return create_client(url, key)
    except ImportError:
        logger.error("supabase-py not installed — run: pip install supabase")
        return None
