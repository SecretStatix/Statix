"""
Blockchain interaction layer for the Statix backend.

Reads deployments.json (written by deploy-statix.js) with mtime-based hot reload
so a redeploy takes effect without restarting the server. Provides:
  - get_deployment()   — full deployment dict (addresses, players, chainId)
  - get_abi()          — contract ABI by name from abis/
  - get_contract_info() — formatted payload for the frontend /api/trading/contracts
  - get_player_map()   — index→player dict (single source of truth for name lookups)
"""

import json
import logging
from pathlib import Path

logger = logging.getLogger(__name__)

_deployment = None
_deployment_mtime = 0.0
_abi_cache: dict = {}


def get_deployment() -> dict | None:
    """Load deployment addresses from deployments.json, reloading on file change.

    Returns None if the file is missing (contracts not yet deployed).
    Route handlers should use routes.helpers.require_deployment() to raise 503.
    """
    global _deployment, _deployment_mtime

    deploy_path = Path(__file__).parent / "deployments.json"
    if not deploy_path.exists():
        logger.error("deployments.json not found — deploy contracts first (npm run deploy:sepolia)")
        return None

    current_mtime = deploy_path.stat().st_mtime
    if _deployment and current_mtime == _deployment_mtime:
        return _deployment

    with open(deploy_path) as f:
        _deployment = json.load(f)
    _deployment_mtime = current_mtime
    logger.info("Loaded deployments.json (mtime %.0f)", current_mtime)
    return _deployment


def get_abi(contract_name: str) -> list:
    """Load contract ABI from the bundled abis/ directory.

    Raises FileNotFoundError if the ABI file is absent — this is a deployment
    error and should never be silently swallowed.
    """
    if contract_name in _abi_cache:
        return _abi_cache[contract_name]

    abi_path = Path(__file__).parent / "abis" / f"{contract_name}.json"
    if not abi_path.exists():
        raise FileNotFoundError(f"ABI not found: {abi_path}")

    with open(abi_path) as f:
        abi = json.load(f)

    _abi_cache[contract_name] = abi
    return abi


def get_contract_info() -> dict | None:
    """Return contract addresses + ABIs formatted for the frontend.

    Returns None if deployments.json is missing or ABIs are unavailable.
    The /api/trading/contracts route raises 503 in that case.
    """
    deployment = get_deployment()
    if not deployment:
        return None
    try:
        router_abi = get_abi("StatixRouter")
        hub_abi = get_abi("DividendHub")
        dbucks_abi = get_abi("DBucks")
    except FileNotFoundError as e:
        logger.error("get_contract_info: ABI missing — %s", e)
        return None

    contracts = deployment.get("contracts", {})
    return {
        "network": deployment.get("network"),
        "chainId": deployment.get("chainId"),
        "contracts": {
            "StatixRouter": {"address": contracts.get("StatixRouter"), "abi": router_abi},
            "DividendHub": {"address": contracts.get("DividendHub"), "abi": hub_abi},
            "PoolFactory": {"address": contracts.get("PoolFactory")},
            "MockUSDC": {"address": contracts.get("MockUSDC")},
            "DBucks": {"address": contracts.get("DBucks"), "abi": dbucks_abi},
        },
    }


def get_player_map() -> dict[int, dict]:
    """Return a player-index → player-dict lookup from deployments.json.

    This is the single source of truth for player names and teams across
    all backend routes and scripts. Returns an empty dict if not deployed.
    """
    deployment = get_deployment()
    if not deployment:
        return {}
    return {p["index"]: p for p in deployment.get("players", [])}
