"""
Trading routes - provides quotes and contract info for frontend trading.
Actual buy/sell transactions happen directly on-chain via the frontend.
The backend provides estimated quotes and logs transactions to Supabase.

NOTE: Backend quotes are approximations based on pool state read from chain.
The on-chain getBuyQuote/getSellQuote are the authoritative source of truth.
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional
import os

from chain import get_deployment, get_contract_info, get_abi
from db import get_supabase, get_store

router = APIRouter()


class QuoteRequest(BaseModel):
    player_index: int
    shares: float  # Human-readable (e.g., 10.5 shares)
    side: str  # "buy" or "sell"


class QuoteResponse(BaseModel):
    player_index: int
    side: str
    shares: float
    cost_or_revenue: float
    fee: float
    total: float
    price_impact: float
    current_price: float
    new_price: float


class TransactionLog(BaseModel):
    wallet_address: str
    player_index: int
    side: str
    shares: float
    cost: float
    tx_hash: str


@router.get("/contracts")
async def get_contracts():
    """Get contract addresses and ABIs for frontend."""
    info = get_contract_info()
    if not info:
        raise HTTPException(status_code=503, detail="Contracts not deployed yet")
    return info


def _get_pool_state(player_index: int):
    """
    Try to read live pool state from chain via web3.
    Falls back to initial values (1000 shares, $10,000 cash) if chain unavailable.
    """
    try:
        from web3 import Web3

        deployment = get_deployment()
        chain_id = deployment.get("chainId", 84532)
        rpc_url = os.getenv("RPC_URL", "https://sepolia.base.org")
        w3 = Web3(Web3.HTTPProvider(rpc_url))

        if w3.is_connected():
            abi = get_abi("DividendFantasy")
            contract = w3.eth.contract(
                address=Web3.to_checksum_address(deployment["contracts"]["DividendFantasy"]),
                abi=abi,
            )
            player = contract.functions.players(player_index).call()
            # players returns: (name, symbol, playerId, virtualShares, virtualCash, totalShares, projectedPoints, active)
            virtual_shares = player[3] / 1e6
            virtual_cash = player[4] / 1e6
            return virtual_shares, virtual_cash
    except Exception:
        pass

    # Fallback to initial values
    return 1000.0, 10000.0


@router.post("/quote", response_model=QuoteResponse)
async def get_quote(req: QuoteRequest):
    """
    Get a quote for buying or selling shares.
    Reads live pool state from chain when available.
    NOTE: On-chain getBuyQuote/getSellQuote are the source of truth.
    """
    deployment = get_deployment()
    if not deployment:
        raise HTTPException(status_code=503, detail="Not deployed")

    # Find player
    player = None
    for p in deployment.get("players", []):
        if p["index"] == req.player_index:
            player = p
            break

    if not player:
        raise HTTPException(status_code=404, detail="Player not found")

    # Read live pool state (or fall back to initial values)
    virtual_shares, virtual_cash = _get_pool_state(req.player_index)

    shares = req.shares
    fee_rate = 0.015  # 1.5%

    if req.side == "buy":
        if shares >= virtual_shares / 2:
            raise HTTPException(status_code=400, detail="Too many shares")
        new_shares = virtual_shares - shares
        # Rearranged AMM math (matches on-chain): cost = (virtualCash * sharesOut) / newShares
        cost = (virtual_cash * shares) / new_shares
        fee = cost * fee_rate
        total = cost + fee
        current_price = virtual_cash / virtual_shares
        new_cash = virtual_cash + cost
        new_price = new_cash / new_shares
        price_impact = (new_price - current_price) / current_price * 100

        return QuoteResponse(
            player_index=req.player_index,
            side="buy",
            shares=shares,
            cost_or_revenue=round(cost, 2),
            fee=round(fee, 2),
            total=round(total, 2),
            price_impact=round(price_impact, 2),
            current_price=round(current_price, 2),
            new_price=round(new_price, 2),
        )
    elif req.side == "sell":
        new_shares = virtual_shares + shares
        # Rearranged AMM math (matches on-chain): revenue = (virtualCash * sharesIn) / newShares
        revenue = (virtual_cash * shares) / new_shares
        fee = revenue * fee_rate
        net = revenue - fee
        current_price = virtual_cash / virtual_shares
        new_cash = virtual_cash - revenue
        new_price = new_cash / new_shares
        price_impact = (current_price - new_price) / current_price * 100

        return QuoteResponse(
            player_index=req.player_index,
            side="sell",
            shares=shares,
            cost_or_revenue=round(net, 2),
            fee=round(fee, 2),
            total=round(net, 2),
            price_impact=round(price_impact, 2),
            current_price=round(current_price, 2),
            new_price=round(new_price, 2),
        )
    else:
        raise HTTPException(status_code=400, detail="side must be 'buy' or 'sell'")


@router.post("/log-transaction")
async def log_transaction(tx: TransactionLog):
    """
    Log a completed on-chain transaction to Supabase.
    Public endpoint — blockchain is the source of truth; Supabase is for analytics/leaderboard.
    """

    supabase = get_supabase()
    if supabase:
        supabase.table("transactions").insert({
            "wallet_address": tx.wallet_address,
            "player_index": tx.player_index,
            "side": tx.side,
            "shares": tx.shares,
            "cost": tx.cost,
            "tx_hash": tx.tx_hash,
        }).execute()
    else:
        store = get_store()
        store["transactions"].append(tx.model_dump())

    return {"status": "logged"}
