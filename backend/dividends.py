"""
Dividends API - Weekly dividend calculations and distribution
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Dict, Optional
from datetime import datetime

router = APIRouter()


# ============== MODELS ==============

class DividendConfig(BaseModel):
    total_fee_percent: float = 1.5       # 1.5% trading fee
    dividend_pool_percent: float = 0.67  # 67% to dividend pool
    company_percent: float = 0.33        # 33% to company
    base_dividend_percent: float = 0.20  # 20% base dividend
    outperformer_percent: float = 0.80   # 80% to outperformers


class WeeklyDividendPool(BaseModel):
    week: int
    total_fees: float
    company_revenue: float
    dividend_pool: float
    base_pool: float
    outperformer_pool: float
    distributed: bool
    distributed_at: Optional[datetime] = None


class PlayerDividendShare(BaseModel):
    player_id: str
    player_name: str
    outperformance: float
    share_of_pool: float  # Percentage of outperformer pool
    dividend_amount: float


class UserDividend(BaseModel):
    week: int
    base_dividend: float
    outperformer_dividend: float
    total_dividend: float
    claimed: bool
    claimed_at: Optional[datetime] = None


# ============== DIVIDEND MATH ==============

def split_fees(total_fees: float, config: DividendConfig) -> dict:
    """Split fees between dividend pool and company"""
    dividend_pool = total_fees * config.dividend_pool_percent
    company_revenue = total_fees * config.company_percent
    return {
        "dividend_pool": dividend_pool,
        "company_revenue": company_revenue
    }


def split_dividend_pool(dividend_pool: float, config: DividendConfig) -> dict:
    """Split dividend pool between base and outperformer pools"""
    base_pool = dividend_pool * config.base_dividend_percent
    outperformer_pool = dividend_pool * config.outperformer_percent
    return {
        "base_pool": base_pool,
        "outperformer_pool": outperformer_pool
    }


def calculate_player_dividend_shares(
    outperformer_pool: float,
    player_outperformances: Dict[str, float]  # player_id -> outperformance ratio
) -> Dict[str, float]:
    """
    Calculate each outperforming player's share of the pool

    Formula: player_share = (player_op / total_positive_op) * pool
    """
    # Filter to positive outperformers
    positive_op = {k: v for k, v in player_outperformances.items() if v > 0}
    total_positive = sum(positive_op.values())

    if total_positive == 0:
        return {}

    return {
        player_id: (op / total_positive) * outperformer_pool
        for player_id, op in positive_op.items()
    }


def calculate_user_dividend(
    user_holdings: Dict[str, float],  # player_id -> shares held
    total_shares_per_player: Dict[str, float],  # player_id -> total shares
    total_all_shares: float,
    base_pool: float,
    player_dividend_shares: Dict[str, float]  # player_id -> dividend amount
) -> dict:
    """
    Calculate a user's total dividend

    Base dividend: proportional to total shares held
    Outperformer dividend: proportional to shares of outperforming players
    """
    # Base dividend
    user_total_shares = sum(user_holdings.values())
    base_dividend = (user_total_shares / total_all_shares) * base_pool if total_all_shares > 0 else 0

    # Outperformer dividend
    outperformer_dividend = 0
    for player_id, shares in user_holdings.items():
        if player_id in player_dividend_shares:
            player_total = total_shares_per_player.get(player_id, 0)
            if player_total > 0:
                user_share = shares / player_total
                outperformer_dividend += player_dividend_shares[player_id] * user_share

    return {
        "base_dividend": base_dividend,
        "outperformer_dividend": outperformer_dividend,
        "total_dividend": base_dividend + outperformer_dividend
    }


# ============== MOCK DATA ==============

MOCK_WEEKLY_POOLS = {
    1: WeeklyDividendPool(
        week=1,
        total_fees=1000,
        company_revenue=330,
        dividend_pool=670,
        base_pool=134,
        outperformer_pool=536,
        distributed=True,
        distributed_at=datetime(2024, 1, 7)
    ),
    2: WeeklyDividendPool(
        week=2,
        total_fees=1250,
        company_revenue=412.5,
        dividend_pool=837.5,
        base_pool=167.5,
        outperformer_pool=670,
        distributed=True,
        distributed_at=datetime(2024, 1, 14)
    ),
    3: WeeklyDividendPool(
        week=3,
        total_fees=1500,
        company_revenue=495,
        dividend_pool=1005,
        base_pool=201,
        outperformer_pool=804,
        distributed=False
    ),
}

MOCK_USER_DIVIDENDS = {
    "0x1234...": {
        1: UserDividend(week=1, base_dividend=40.20, outperformer_dividend=250.13, total_dividend=290.33, claimed=True),
        2: UserDividend(week=2, base_dividend=55.80, outperformer_dividend=180.50, total_dividend=236.30, claimed=False),
    },
    "0x5678...": {
        1: UserDividend(week=1, base_dividend=35.10, outperformer_dividend=120.00, total_dividend=155.10, claimed=True),
        2: UserDividend(week=2, base_dividend=42.30, outperformer_dividend=95.20, total_dividend=137.50, claimed=True),
    },
}


# ============== ENDPOINTS ==============

@router.get("/config", response_model=DividendConfig)
async def get_dividend_config():
    """Get current dividend configuration"""
    return DividendConfig()


@router.get("/week/{week}", response_model=WeeklyDividendPool)
async def get_weekly_pool(week: int):
    """Get dividend pool info for a specific week"""
    if week not in MOCK_WEEKLY_POOLS:
        raise HTTPException(status_code=404, detail="Week not found")
    return MOCK_WEEKLY_POOLS[week]


@router.get("/week/{week}/players")
async def get_week_player_dividends(week: int):
    """Get dividend breakdown by player for a week"""
    # This would calculate actual player shares based on outperformance
    # Mock data for now
    return [
        PlayerDividendShare(
            player_id="lebron_james",
            player_name="LeBron James",
            outperformance=0.16,
            share_of_pool=0.45,
            dividend_amount=241.20
        ),
        PlayerDividendShare(
            player_id="stephen_curry",
            player_name="Stephen Curry",
            outperformance=0.12,
            share_of_pool=0.35,
            dividend_amount=187.60
        ),
    ]


@router.get("/user/{address}")
async def get_user_dividends(address: str):
    """Get all dividends for a user"""
    # Normalize address
    addr_lower = address.lower()

    # Mock lookup
    for mock_addr, dividends in MOCK_USER_DIVIDENDS.items():
        if mock_addr.lower().startswith(addr_lower[:6]):
            return {
                "address": address,
                "dividends": list(dividends.values()),
                "total_earned": sum(d.total_dividend for d in dividends.values()),
                "total_claimed": sum(d.total_dividend for d in dividends.values() if d.claimed),
                "total_unclaimed": sum(d.total_dividend for d in dividends.values() if not d.claimed)
            }

    return {
        "address": address,
        "dividends": [],
        "total_earned": 0,
        "total_claimed": 0,
        "total_unclaimed": 0
    }


@router.get("/user/{address}/week/{week}", response_model=UserDividend)
async def get_user_week_dividend(address: str, week: int):
    """Get user's dividend for a specific week"""
    addr_lower = address.lower()

    for mock_addr, dividends in MOCK_USER_DIVIDENDS.items():
        if mock_addr.lower().startswith(addr_lower[:6]):
            if week in dividends:
                return dividends[week]

    raise HTTPException(status_code=404, detail="Dividend not found")


@router.post("/calculate")
async def calculate_weekly_dividends(
    total_fees: float,
    player_outperformances: Dict[str, float],
    user_holdings: Dict[str, Dict[str, float]],  # address -> {player_id: shares}
    total_shares_per_player: Dict[str, float]
):
    """
    Calculate dividend distribution for all users

    This is the main calculation endpoint called by the admin/scheduler
    """
    config = DividendConfig()

    # Split fees
    fee_split = split_fees(total_fees, config)
    dividend_pool = fee_split["dividend_pool"]
    company_revenue = fee_split["company_revenue"]

    # Split dividend pool
    pool_split = split_dividend_pool(dividend_pool, config)
    base_pool = pool_split["base_pool"]
    outperformer_pool = pool_split["outperformer_pool"]

    # Calculate player dividend shares
    player_shares = calculate_player_dividend_shares(outperformer_pool, player_outperformances)

    # Calculate total shares
    total_all_shares = sum(
        sum(holdings.values())
        for holdings in user_holdings.values()
    )

    # Calculate each user's dividend
    user_dividends = {}
    for address, holdings in user_holdings.items():
        user_div = calculate_user_dividend(
            holdings,
            total_shares_per_player,
            total_all_shares,
            base_pool,
            player_shares
        )
        user_dividends[address] = user_div

    return {
        "total_fees": total_fees,
        "company_revenue": company_revenue,
        "dividend_pool": dividend_pool,
        "base_pool": base_pool,
        "outperformer_pool": outperformer_pool,
        "player_shares": player_shares,
        "user_dividends": user_dividends,
        "total_distributed": sum(d["total_dividend"] for d in user_dividends.values())
    }
