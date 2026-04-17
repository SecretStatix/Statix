"""
Shared route-layer helpers for Statix FastAPI routes.

Provides fail-fast guards that raise HTTP errors immediately when required
infrastructure (Supabase, deployment) is unavailable, instead of silently
returning empty data. Import these in any route that must have a live dependency.
"""

from fastapi import HTTPException
from db import get_supabase
from chain import get_deployment


def require_supabase():
    """Return the Supabase client or raise HTTP 503.

    Use at the start of any route that reads or writes the database.
    Never returns None — the caller can use the result directly.
    """
    sb = get_supabase()
    if sb is None:
        raise HTTPException(
            status_code=503,
            detail="Database unavailable — set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY",
        )
    return sb


def require_deployment():
    """Return the deployment dict or raise HTTP 503.

    Use at the start of any route that needs contract addresses or player list.
    Never returns None — the caller can use the result directly.
    """
    dep = get_deployment()
    if not dep:
        raise HTTPException(
            status_code=503,
            detail="Contracts not deployed — deployments.json missing or empty",
        )
    return dep
