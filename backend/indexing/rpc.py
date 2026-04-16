"""HTTP RPC and WebSocket URL resolution; Web3 + StatixRouter contract wiring."""

from __future__ import annotations

import logging
import os

from web3 import Web3

from chain import get_abi, get_deployment

from .config import DEFAULT_RPC

logger = logging.getLogger("statix_indexer.rpc")

_LOCAL_RPC_HINTS = ("127.0.0.1", "localhost")
_warned_local_rpc = False


def rpc_url_for_indexer() -> str:
    explicit = os.getenv("INDEXER_RPC_URL", "").strip()
    if explicit:
        return explicit
    if os.getenv("INDEXER_USE_LOCAL_RPC", "").lower() in ("1", "true", "yes"):
        return os.getenv("RPC_URL", DEFAULT_RPC)
    rpc = os.getenv("RPC_URL", DEFAULT_RPC)
    global _warned_local_rpc
    if any(h in rpc for h in _LOCAL_RPC_HINTS):
        if not _warned_local_rpc:
            _warned_local_rpc = True
            logger.warning(
                "RPC_URL is localhost — indexer needs Base Sepolia history. "
                "Using %s (set INDEXER_RPC_URL=... or INDEXER_USE_LOCAL_RPC=1).",
                DEFAULT_RPC,
            )
        return DEFAULT_RPC
    return rpc


def connect_w3_http() -> Web3:
    rpc = rpc_url_for_indexer()
    w3 = Web3(Web3.HTTPProvider(rpc))
    if not w3.is_connected():
        if rpc != DEFAULT_RPC:
            logger.warning("RPC unreachable (%s), falling back to %s", rpc, DEFAULT_RPC)
            rpc = DEFAULT_RPC
            w3 = Web3(Web3.HTTPProvider(rpc))
        if not w3.is_connected():
            raise RuntimeError(f"Cannot connect to RPC: {rpc}")

    dep = get_deployment()
    want = int(dep["chainId"]) if dep and dep.get("chainId") is not None else 84532
    got = int(w3.eth.chain_id)
    if got != want:
        if rpc != DEFAULT_RPC:
            logger.warning(
                "RPC chain_id=%s but deployments.json expects %s. Trying %s.",
                got,
                want,
                DEFAULT_RPC,
            )
            w3 = Web3(Web3.HTTPProvider(DEFAULT_RPC))
            if w3.is_connected() and int(w3.eth.chain_id) == want:
                return w3
        raise RuntimeError(
            f"Wrong chain: RPC has {got}, expected {want} (from deployments.json)."
        )
    return w3


def build_router_contract(w3: Web3):
    deployment = get_deployment()
    if not deployment:
        raise RuntimeError("deployments.json missing")
    router_addr = deployment.get("contracts", {}).get("StatixRouter")
    if not router_addr:
        raise RuntimeError("StatixRouter not in deployments.json")
    abi = get_abi("StatixRouter")
    return w3.eth.contract(address=Web3.to_checksum_address(router_addr), abi=abi)


def build_hub_contract(w3: Web3):
    deployment = get_deployment()
    if not deployment:
        raise RuntimeError("deployments.json missing")
    hub_addr = deployment.get("contracts", {}).get("DividendHub")
    if not hub_addr:
        raise RuntimeError("DividendHub not in deployments.json")
    abi = get_abi("DividendHub")
    return w3.eth.contract(address=Web3.to_checksum_address(hub_addr), abi=abi)


def http_rpc_to_ws(url: str) -> str:
    if url.startswith("https://"):
        return "wss://" + url[len("https://") :]
    if url.startswith("http://"):
        return "ws://" + url[len("http://") :]
    return url


def websocket_url_for_indexer() -> str:
    w = os.getenv("INDEXER_WS_URL", "").strip()
    if w:
        return w
    return http_rpc_to_ws(rpc_url_for_indexer())
