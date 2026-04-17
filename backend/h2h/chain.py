"""On-chain helpers for the H2H stack.

Pattern mirrors backend/indexing/rpc.py: a single connected Web3 + builder
functions that wrap each contract.
"""

from __future__ import annotations

import logging
import os
from typing import Optional

from web3 import Web3

from chain import get_abi, get_deployment
from indexing.rpc import connect_w3_http

logger = logging.getLogger("statix.h2h.chain")

H2H_DEPLOYMENT_KEY = "h2h"
COLLATERAL_DECIMALS = 6  # DBucks / USDC scale


# ---------------------------------------------------------------------------
# Address resolution
# ---------------------------------------------------------------------------

def get_h2h_deployment() -> Optional[dict]:
    deployment = get_deployment()
    if not deployment:
        return None
    return deployment.get(H2H_DEPLOYMENT_KEY)


def get_creator_address() -> Optional[str]:
    d = get_h2h_deployment()
    return d.get("H2HCreator") if d else None


def get_oracle_address() -> Optional[str]:
    d = get_h2h_deployment()
    return d.get("H2HOracle") if d else None


def get_ctf_address() -> Optional[str]:
    d = get_h2h_deployment()
    return d.get("BinaryCTF") if d else None


def get_collateral_address() -> Optional[str]:
    d = get_h2h_deployment()
    return d.get("collateral") if d else None


# ---------------------------------------------------------------------------
# Contract instances
# ---------------------------------------------------------------------------

def build_creator(w3: Web3):
    addr = get_creator_address()
    if not addr:
        raise RuntimeError("H2H not deployed (missing H2HCreator address)")
    return w3.eth.contract(address=Web3.to_checksum_address(addr), abi=get_abi("H2HCreator"))


def build_oracle(w3: Web3):
    addr = get_oracle_address()
    if not addr:
        raise RuntimeError("H2H not deployed (missing H2HOracle address)")
    return w3.eth.contract(address=Web3.to_checksum_address(addr), abi=get_abi("H2HOracle"))


def build_ctf(w3: Web3):
    addr = get_ctf_address()
    if not addr:
        raise RuntimeError("H2H not deployed (missing BinaryCTF address)")
    return w3.eth.contract(address=Web3.to_checksum_address(addr), abi=get_abi("BinaryCTF"))


def build_fpmm(w3: Web3, fpmm_address: str):
    return w3.eth.contract(address=Web3.to_checksum_address(fpmm_address), abi=get_abi("BinaryFPMM"))


# ---------------------------------------------------------------------------
# Signing helpers (resolver + market creator daemons run with a hot key)
# ---------------------------------------------------------------------------

def _signer_account(w3: Web3, env_var: str):
    pk = os.getenv(env_var, "").strip()
    if not pk:
        raise RuntimeError(f"{env_var} is required for on-chain writes")
    if not pk.startswith("0x"):
        pk = "0x" + pk
    return w3.eth.account.from_key(pk)


def get_creator_signer(w3: Web3):
    """Wallet with H2HCreator owner rights — the daemon that opens markets."""
    return _signer_account(w3, "H2H_CREATOR_PRIVATE_KEY")


def get_oracle_signer(w3: Web3):
    """Wallet with H2HOracle owner rights — the resolver daemon."""
    return _signer_account(w3, "H2H_ORACLE_PRIVATE_KEY")


def send_tx(w3: Web3, signer, tx: dict) -> str:
    """Sign and broadcast `tx`. Returns the tx hash hex."""
    nonce = w3.eth.get_transaction_count(signer.address, "pending")
    gas_price = w3.eth.gas_price
    base = {
        "from": signer.address,
        "nonce": nonce,
        "chainId": w3.eth.chain_id,
        "maxFeePerGas": int(gas_price * 2),
        "maxPriorityFeePerGas": int(gas_price * 2),
    }
    base.update(tx)
    if "gas" not in base:
        base["gas"] = int(w3.eth.estimate_gas(base) * 12 // 10)
    signed = signer.sign_transaction(base)
    raw = signed.raw_transaction if hasattr(signed, "raw_transaction") else signed.rawTransaction
    return w3.eth.send_raw_transaction(raw).hex()


def get_w3() -> Web3:
    """Connected Web3 against the configured Base RPC."""
    return connect_w3_http()


__all__ = [
    "get_h2h_deployment",
    "get_creator_address",
    "get_oracle_address",
    "get_ctf_address",
    "get_collateral_address",
    "build_creator",
    "build_oracle",
    "build_ctf",
    "build_fpmm",
    "get_creator_signer",
    "get_oracle_signer",
    "send_tx",
    "get_w3",
    "COLLATERAL_DECIMALS",
]
