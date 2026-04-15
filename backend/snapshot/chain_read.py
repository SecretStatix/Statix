"""Read DBucks + StatixRouter.getPortfolio + unclaimed dividends for a wallet."""

from __future__ import annotations

import logging
from typing import Tuple

from web3 import Web3

from chain import get_abi, get_deployment
from indexing.rpc import connect_w3_http

logger = logging.getLogger("statix_snapshot.chain_read")

USDC_DECIMALS = 6


def compute_wallet_nav(w3: Web3, wallet_address: str) -> Tuple[float, float, float] | None:
    """
    Returns (net_worth, cash_dbucks, positions_value) in human float DBucks, or None on failure.
    Caller supplies a connected Web3 (use indexing.rpc.connect_w3_http() for RPC fallback).
    """
    deployment = get_deployment()
    if not deployment or not deployment.get("contracts"):
        logger.warning("compute_wallet_nav: no deployment")
        return None

    contracts = deployment["contracts"]
    router_addr = contracts.get("StatixRouter")
    dbucks_addr = contracts.get("DBucks")
    hub_addr = contracts.get("DividendHub")
    if not router_addr or not dbucks_addr:
        return None

    try:
        wallet = Web3.to_checksum_address(wallet_address)
        router = w3.eth.contract(
            address=Web3.to_checksum_address(router_addr),
            abi=get_abi("StatixRouter"),
        )
        dbucks = w3.eth.contract(
            address=Web3.to_checksum_address(dbucks_addr),
            abi=get_abi("DBucks"),
        )

        raw_bal = dbucks.functions.balanceOf(wallet).call()
        cash = float(raw_bal) / 10**USDC_DECIMALS

        portfolio = router.functions.getPortfolio(wallet).call()
        _idxs, _shares, values = portfolio
        positions_value = sum(int(v) for v in values) / 10**USDC_DECIMALS

        unclaimed = 0.0
        if hub_addr:
            hub = w3.eth.contract(
                address=Web3.to_checksum_address(hub_addr),
                abi=get_abi("DividendHub"),
            )
            raw_unclaimed = hub.functions.getUnclaimedDividends(wallet).call()
            unclaimed = float(raw_unclaimed) / 10**USDC_DECIMALS

        net_worth = cash + positions_value + unclaimed
        return (net_worth, cash, positions_value)
    except Exception as e:
        logger.warning("compute_wallet_nav failed for %s: %s", wallet_address, e)
        return None


__all__ = ["compute_wallet_nav"]
