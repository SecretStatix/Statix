"""On-chain helpers for H2H contracts.

Thin wrapper over the shared backend/chain.py; keeps H2H-specific ABI
lookups and address resolution isolated from the core Statix chain code.
Populated during P1 after contracts are deployed.
"""

from typing import Optional
from chain import get_deployment


H2H_DEPLOYMENT_KEY = "h2h"  # expect deployments.json to grow an "h2h" block


def get_h2h_deployment() -> Optional[dict]:
    """Return the h2h block from deployments.json, or None if not deployed yet."""
    deployment = get_deployment()
    if not deployment:
        return None
    return deployment.get(H2H_DEPLOYMENT_KEY)


def get_conditional_tokens_address() -> Optional[str]:
    d = get_h2h_deployment()
    return d.get("conditional_tokens") if d else None


def get_fpmm_factory_address() -> Optional[str]:
    d = get_h2h_deployment()
    return d.get("fpmm_factory") if d else None


def get_creator_address() -> Optional[str]:
    d = get_h2h_deployment()
    return d.get("creator") if d else None


def get_oracle_address() -> Optional[str]:
    d = get_h2h_deployment()
    return d.get("oracle") if d else None
