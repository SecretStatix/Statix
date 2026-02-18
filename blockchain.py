"""
Blockchain API - Smart contract interactions
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional
import os
import json
from web3 import Web3
from dotenv import load_dotenv

load_dotenv()

router = APIRouter()


# ============== CONFIG ==============

# Base Sepolia RPC
RPC_URL = os.getenv("BASE_SEPOLIA_RPC", "https://sepolia.base.org")
PRIVATE_KEY = os.getenv("PRIVATE_KEY", "")

# Contract addresses (loaded from deployed-addresses.json)
CONTRACT_ADDRESSES = {}


def load_contract_addresses():
    """Load deployed contract addresses"""
    global CONTRACT_ADDRESSES
    try:
        with open("../contracts/deployed-addresses.json") as f:
            CONTRACT_ADDRESSES = json.load(f)
    except FileNotFoundError:
        print("Warning: deployed-addresses.json not found")


# Initialize web3
w3 = Web3(Web3.HTTPProvider(RPC_URL))


# ============== MODELS ==============

class BuyQuote(BaseModel):
    player_id: str
    shares: float
    cost: float
    fee: float
    total: float
    avg_price: float
    new_price: float
    slippage_percent: float


class SellQuote(BaseModel):
    player_id: str
    shares: float
    revenue: float
    fee: float
    net: float
    avg_price: float
    new_price: float
    slippage_percent: float


class PlayerMarketData(BaseModel):
    player_id: str
    token_address: str
    amm_address: str
    price: float
    virtual_shares: float
    virtual_cash: float
    total_supply: float


class TransactionResult(BaseModel):
    success: bool
    tx_hash: Optional[str] = None
    error: Optional[str] = None


# ============== CONTRACT ABIs (Simplified) ==============

PLAYER_AMM_ABI = [
    {
        "inputs": [],
        "name": "getPrice",
        "outputs": [{"type": "uint256"}],
        "stateMutability": "view",
        "type": "function"
    },
    {
        "inputs": [],
        "name": "virtualShares",
        "outputs": [{"type": "uint256"}],
        "stateMutability": "view",
        "type": "function"
    },
    {
        "inputs": [],
        "name": "virtualCash",
        "outputs": [{"type": "uint256"}],
        "stateMutability": "view",
        "type": "function"
    },
    {
        "inputs": [{"name": "sharesOut", "type": "uint256"}],
        "name": "getBuyQuote",
        "outputs": [
            {"name": "cost", "type": "uint256"},
            {"name": "fee", "type": "uint256"},
            {"name": "total", "type": "uint256"},
            {"name": "avgPrice", "type": "uint256"},
            {"name": "newPrice", "type": "uint256"}
        ],
        "stateMutability": "view",
        "type": "function"
    },
    {
        "inputs": [{"name": "sharesIn", "type": "uint256"}],
        "name": "getSellQuote",
        "outputs": [
            {"name": "revenue", "type": "uint256"},
            {"name": "fee", "type": "uint256"},
            {"name": "net", "type": "uint256"},
            {"name": "avgPrice", "type": "uint256"},
            {"name": "newPrice", "type": "uint256"}
        ],
        "stateMutability": "view",
        "type": "function"
    },
]

ERC20_ABI = [
    {
        "inputs": [{"name": "account", "type": "address"}],
        "name": "balanceOf",
        "outputs": [{"type": "uint256"}],
        "stateMutability": "view",
        "type": "function"
    },
    {
        "inputs": [],
        "name": "totalSupply",
        "outputs": [{"type": "uint256"}],
        "stateMutability": "view",
        "type": "function"
    },
]


# ============== HELPER FUNCTIONS ==============

def get_amm_contract(amm_address: str):
    """Get AMM contract instance"""
    return w3.eth.contract(address=amm_address, abi=PLAYER_AMM_ABI)


def get_token_contract(token_address: str):
    """Get token contract instance"""
    return w3.eth.contract(address=token_address, abi=ERC20_ABI)


def wei_to_ether(wei: int) -> float:
    """Convert wei to ether"""
    return float(Web3.from_wei(wei, 'ether'))


def ether_to_wei(ether: float) -> int:
    """Convert ether to wei"""
    return Web3.to_wei(ether, 'ether')


# ============== ENDPOINTS ==============

@router.get("/status")
async def get_blockchain_status():
    """Check blockchain connection status"""
    try:
        block = w3.eth.block_number
        chain_id = w3.eth.chain_id
        return {
            "connected": True,
            "chain_id": chain_id,
            "latest_block": block,
            "rpc_url": RPC_URL
        }
    except Exception as e:
        return {
            "connected": False,
            "error": str(e)
        }


@router.get("/player/{player_id}/market", response_model=PlayerMarketData)
async def get_player_market_data(player_id: str):
    """Get market data for a player from the AMM"""
    # Load addresses
    load_contract_addresses()

    if "players" not in CONTRACT_ADDRESSES:
        raise HTTPException(status_code=500, detail="Contract addresses not loaded")

    player_data = CONTRACT_ADDRESSES["players"].get(player_id)
    if not player_data:
        raise HTTPException(status_code=404, detail="Player not found")

    try:
        amm = get_amm_contract(player_data["amm"])
        token = get_token_contract(player_data["token"])

        price = amm.functions.getPrice().call()
        virtual_shares = amm.functions.virtualShares().call()
        virtual_cash = amm.functions.virtualCash().call()
        total_supply = token.functions.totalSupply().call()

        return PlayerMarketData(
            player_id=player_id,
            token_address=player_data["token"],
            amm_address=player_data["amm"],
            price=wei_to_ether(price),
            virtual_shares=wei_to_ether(virtual_shares),
            virtual_cash=wei_to_ether(virtual_cash),
            total_supply=wei_to_ether(total_supply)
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/player/{player_id}/buy-quote")
async def get_buy_quote(player_id: str, shares: float):
    """Get quote for buying player shares"""
    load_contract_addresses()

    player_data = CONTRACT_ADDRESSES.get("players", {}).get(player_id)
    if not player_data:
        raise HTTPException(status_code=404, detail="Player not found")

    try:
        amm = get_amm_contract(player_data["amm"])
        shares_wei = ether_to_wei(shares)

        quote = amm.functions.getBuyQuote(shares_wei).call()
        cost, fee, total, avg_price, new_price = quote

        current_price = amm.functions.getPrice().call()
        slippage = (avg_price - current_price) / current_price * 100

        return BuyQuote(
            player_id=player_id,
            shares=shares,
            cost=wei_to_ether(cost),
            fee=wei_to_ether(fee),
            total=wei_to_ether(total),
            avg_price=wei_to_ether(avg_price),
            new_price=wei_to_ether(new_price),
            slippage_percent=slippage
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/player/{player_id}/sell-quote")
async def get_sell_quote(player_id: str, shares: float):
    """Get quote for selling player shares"""
    load_contract_addresses()

    player_data = CONTRACT_ADDRESSES.get("players", {}).get(player_id)
    if not player_data:
        raise HTTPException(status_code=404, detail="Player not found")

    try:
        amm = get_amm_contract(player_data["amm"])
        shares_wei = ether_to_wei(shares)

        quote = amm.functions.getSellQuote(shares_wei).call()
        revenue, fee, net, avg_price, new_price = quote

        current_price = amm.functions.getPrice().call()
        slippage = (current_price - avg_price) / current_price * 100

        return SellQuote(
            player_id=player_id,
            shares=shares,
            revenue=wei_to_ether(revenue),
            fee=wei_to_ether(fee),
            net=wei_to_ether(net),
            avg_price=wei_to_ether(avg_price),
            new_price=wei_to_ether(new_price),
            slippage_percent=slippage
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/user/{address}/balance/{player_id}")
async def get_user_balance(address: str, player_id: str):
    """Get user's balance of a player token"""
    load_contract_addresses()

    player_data = CONTRACT_ADDRESSES.get("players", {}).get(player_id)
    if not player_data:
        raise HTTPException(status_code=404, detail="Player not found")

    try:
        token = get_token_contract(player_data["token"])
        balance = token.functions.balanceOf(address).call()

        return {
            "address": address,
            "player_id": player_id,
            "balance": wei_to_ether(balance)
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/user/{address}/portfolio")
async def get_user_portfolio(address: str):
    """Get user's complete portfolio"""
    load_contract_addresses()

    portfolio = []
    total_value = 0

    for player_id, player_data in CONTRACT_ADDRESSES.get("players", {}).items():
        try:
            token = get_token_contract(player_data["token"])
            amm = get_amm_contract(player_data["amm"])

            balance = token.functions.balanceOf(address).call()
            if balance > 0:
                price = amm.functions.getPrice().call()
                balance_float = wei_to_ether(balance)
                price_float = wei_to_ether(price)
                value = balance_float * price_float

                portfolio.append({
                    "player_id": player_id,
                    "shares": balance_float,
                    "price": price_float,
                    "value": value
                })
                total_value += value
        except Exception:
            continue

    return {
        "address": address,
        "portfolio": portfolio,
        "total_value": total_value
    }


# ============== ADMIN ENDPOINTS ==============

@router.post("/admin/distribute-dividends")
async def trigger_dividend_distribution(week: int):
    """
    Trigger dividend distribution on-chain

    This would:
    1. Call setWeeklyPerformance() for each player
    2. Call distributeDividends()
    3. Advance to next week
    """
    # This requires a signed transaction with the admin private key
    if not PRIVATE_KEY:
        raise HTTPException(status_code=500, detail="Private key not configured")

    # TODO: Implement actual contract calls
    return {
        "status": "pending",
        "message": "Dividend distribution would be triggered here",
        "week": week
    }
