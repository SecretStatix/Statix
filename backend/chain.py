"""
Blockchain interaction layer.
Reads deployment info and provides contract access.
"""

import os
import json
from pathlib import Path

_deployment = None
_abi_cache = {}


def get_deployment():
    """Load deployment addresses."""
    global _deployment
    if _deployment:
        return _deployment

    deploy_path = Path(__file__).parent / "deployments.json"
    if not deploy_path.exists():
        print("WARNING: deployments.json not found. Deploy contracts first.")
        return None

    with open(deploy_path) as f:
        _deployment = json.load(f)
    return _deployment


def get_abi(contract_name: str) -> list:
    """Load contract ABI from Hardhat artifacts."""
    if contract_name in _abi_cache:
        return _abi_cache[contract_name]

    artifact_path = (
        Path(__file__).parent.parent
        / "blockchain"
        / "artifacts"
        / "contracts"
        / f"{contract_name}.sol"
        / f"{contract_name}.json"
    )

    if not artifact_path.exists():
        raise FileNotFoundError(f"ABI not found: {artifact_path}")

    with open(artifact_path) as f:
        artifact = json.load(f)

    _abi_cache[contract_name] = artifact["abi"]
    return artifact["abi"]


def get_contract_info():
    """Get all contract addresses and ABIs for the frontend."""
    deployment = get_deployment()
    if not deployment:
        return None

    try:
        fantasy_abi = get_abi("DividendFantasy")
        usdc_abi = get_abi("MockUSDC")
        dbucks_abi = get_abi("DBucks")
    except FileNotFoundError:
        return None

    contracts = deployment.get("contracts", {})
    return {
        "network": deployment.get("network"),
        "chainId": deployment.get("chainId"),
        "contracts": {
            "DividendFantasy": {
                "address": contracts.get("DividendFantasy"),
                "abi": fantasy_abi,
            },
            "MockUSDC": {
                "address": contracts.get("MockUSDC"),
                "abi": usdc_abi,
            },
            "DBucks": {
                "address": contracts.get("DBucks"),
                "abi": dbucks_abi,
            },
        },
    }
