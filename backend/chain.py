"""
Blockchain interaction layer.
Reads deployment info and provides contract access.
"""

import os
import json
from pathlib import Path

_deployment = None
_deployment_mtime = 0
_abi_cache = {}

def get_deployment():
    """Load deployment addresses. Reloads if file has changed on disk."""
    global _deployment, _deployment_mtime

    deploy_path = Path(__file__).parent / "deployments.json"
    if not deploy_path.exists():
        print("WARNING: deployments.json not found. Deploy contracts first.")
        return None

    current_mtime = deploy_path.stat().st_mtime
    if _deployment and current_mtime == _deployment_mtime:
        return _deployment

    with open(deploy_path) as f:
        _deployment = json.load(f)
    _deployment_mtime = current_mtime
    return _deployment

def get_abi(contract_name: str) -> list:
    """Load contract ABI from bundled abis/ directory."""
    if contract_name in _abi_cache:
        return _abi_cache[contract_name]

    abi_path = Path(__file__).parent / "abis" / f"{contract_name}.json"

    if not abi_path.exists():
        raise FileNotFoundError(f"ABI not found: {abi_path}")

    with open(abi_path) as f:
        abi = json.load(f)

    _abi_cache[contract_name] = abi
    return abi

def get_contract_info():
    """Get all contract addresses and ABIs for the frontend."""
    deployment = get_deployment()
    if not deployment:
        return None
    try:
        router_abi = get_abi("StatixRouter")
        hub_abi = get_abi("DividendHub")
        dbucks_abi = get_abi("DBucks")
    except FileNotFoundError:
        return None

    contracts = deployment.get("contracts", {})
    return {
        "network": deployment.get("network"),
        "chainId": deployment.get("chainId"),
        "contracts": {
            "StatixRouter": {
                "address": contracts.get("StatixRouter"),
                "abi": router_abi,
            },
            "DividendHub": {
                "address": contracts.get("DividendHub"),
                "abi": hub_abi,
            },
            "PoolFactory": {
                "address": contracts.get("PoolFactory"),
            },
            "MockUSDC": {
                "address": contracts.get("MockUSDC"),
            },
            "DBucks": {
                "address": contracts.get("DBucks"),
                "abi": dbucks_abi,
            },
        },
    }