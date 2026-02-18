"""
Dividend Fantasy - Core Math
============================

Pure math functions for:
1. AMM (Automated Market Maker) calculations
2. Dividend distribution calculations

No simulation - just the formulas.
"""

from typing import Dict


# =============================================================================
# AMM MATH
# =============================================================================

def amm_price(shares_in_pool: float, cash_in_pool: float) -> float:
    """
    Calculate current price per share.

    price = cash / shares
    """
    return cash_in_pool / shares_in_pool


def amm_buy_cost(shares_in_pool: float, cash_in_pool: float, shares_to_buy: float) -> dict:
    """
    Calculate cost to buy shares from AMM.

    Formula:
        k = shares × cash (constant)
        new_shares = shares - n
        new_cash = k / new_shares
        cost = new_cash - cash

    Returns:
        dict with cost, fee, total, avg_price, new_price
    """
    k = shares_in_pool * cash_in_pool

    new_shares = shares_in_pool - shares_to_buy
    new_cash = k / new_shares
    cost = new_cash - cash_in_pool

    avg_price = cost / shares_to_buy
    new_price = new_cash / new_shares

    return {
        'cost': cost,
        'avg_price': avg_price,
        'new_price': new_price,
        'slippage_pct': (avg_price - amm_price(shares_in_pool, cash_in_pool)) / amm_price(shares_in_pool, cash_in_pool) * 100
    }


def amm_sell_revenue(shares_in_pool: float, cash_in_pool: float, shares_to_sell: float) -> dict:
    """
    Calculate revenue from selling shares to AMM.

    Formula:
        k = shares × cash (constant)
        new_shares = shares + n
        new_cash = k / new_shares
        revenue = cash - new_cash

    Returns:
        dict with revenue, avg_price, new_price
    """
    k = shares_in_pool * cash_in_pool

    new_shares = shares_in_pool + shares_to_sell
    new_cash = k / new_shares
    revenue = cash_in_pool - new_cash

    avg_price = revenue / shares_to_sell
    new_price = new_cash / new_shares

    return {
        'revenue': revenue,
        'avg_price': avg_price,
        'new_price': new_price,
        'slippage_pct': (amm_price(shares_in_pool, cash_in_pool) - avg_price) / amm_price(shares_in_pool, cash_in_pool) * 100
    }


def apply_fee(amount: float, fee_pct: float = 0.015) -> dict:
    """
    Apply trading fee to a transaction.

    Returns:
        dict with gross, fee, net
    """
    fee = amount * fee_pct
    return {
        'gross': amount,
        'fee': fee,
        'net': amount - fee
    }


# =============================================================================
# DIVIDEND MATH
# =============================================================================

def split_fees(
    total_fees: float,
    dividend_pool_pct: float = 0.67,
    company_pct: float = 0.33
) -> dict:
    """
    Split collected fees between dividend pool and company.

    Returns:
        dict with dividend_pool, company_revenue
    """
    return {
        'dividend_pool': total_fees * dividend_pool_pct,
        'company_revenue': total_fees * company_pct
    }


def split_dividend_pool(
    dividend_pool: float,
    base_pct: float = 0.20,
    outperformer_pct: float = 0.80
) -> dict:
    """
    Split dividend pool between base (all holders) and outperformers.

    Returns:
        dict with base_pool, outperformer_pool
    """
    return {
        'base_pool': dividend_pool * base_pct,
        'outperformer_pool': dividend_pool * outperformer_pct
    }


def calc_outperformance(actual_points: float, projected_points: float) -> float:
    """
    Calculate outperformance ratio.

    Formula:
        outperformance = (actual - projected) / projected

    Returns:
        float: positive = beat projection, negative = missed
    """
    if projected_points == 0:
        return 0
    return (actual_points - projected_points) / projected_points


def distribute_base_dividend(
    base_pool: float,
    user_shares: Dict[str, float]  # user_id -> total shares held
) -> Dict[str, float]:
    """
    Distribute base dividend to ALL shareholders proportionally.

    Formula:
        base_per_share = base_pool / total_shares
        user_dividend = user_shares × base_per_share

    Returns:
        dict of user_id -> dividend amount
    """
    total_shares = sum(user_shares.values())

    if total_shares == 0:
        return {uid: 0 for uid in user_shares}

    base_per_share = base_pool / total_shares

    return {uid: shares * base_per_share for uid, shares in user_shares.items()}


def distribute_outperformer_dividend(
    outperformer_pool: float,
    player_outperformance: Dict[str, float],  # player_id -> outperformance ratio
    player_shareholders: Dict[str, Dict[str, float]]  # player_id -> {user_id: shares}
) -> Dict[str, float]:
    """
    Distribute outperformer dividend to shareholders of outperforming players.

    Formula:
        player_share = (player_op / total_positive_op) × outperformer_pool
        user_div = player_share × (user_shares / total_player_shares)

    Returns:
        dict of user_id -> dividend amount
    """
    # Filter to positive outperformers only
    positive_op = {pid: op for pid, op in player_outperformance.items() if op > 0}
    total_positive_op = sum(positive_op.values())

    if total_positive_op == 0:
        # No outperformers - collect all users and return 0
        all_users = set()
        for shareholders in player_shareholders.values():
            all_users.update(shareholders.keys())
        return {uid: 0 for uid in all_users}

    user_dividends = {}

    for player_id, op in positive_op.items():
        # This player's share of the pool
        player_pool = (op / total_positive_op) * outperformer_pool

        # Get shareholders
        shareholders = player_shareholders.get(player_id, {})
        total_shares = sum(shareholders.values())

        if total_shares == 0:
            continue

        # Distribute to shareholders
        div_per_share = player_pool / total_shares

        for user_id, shares in shareholders.items():
            if user_id not in user_dividends:
                user_dividends[user_id] = 0
            user_dividends[user_id] += shares * div_per_share

    return user_dividends


def calculate_weekly_dividends(
    total_fees: float,
    player_performances: Dict[str, float],  # player_id -> outperformance ratio
    player_shareholders: Dict[str, Dict[str, float]],  # player_id -> {user_id: shares}
    dividend_pool_pct: float = 0.67,
    base_dividend_pct: float = 0.20
) -> dict:
    """
    Complete weekly dividend calculation.

    Args:
        total_fees: Total trading fees collected this week
        player_performances: player_id -> outperformance ratio (can be negative)
        player_shareholders: player_id -> {user_id: shares_held}
        dividend_pool_pct: % of fees going to dividend pool (default 67%)
        base_dividend_pct: % of dividend pool for base dividend (default 20%)

    Returns:
        dict with full breakdown
    """
    # Step 1: Split fees
    fee_split = split_fees(total_fees, dividend_pool_pct, 1 - dividend_pool_pct)
    dividend_pool = fee_split['dividend_pool']
    company_revenue = fee_split['company_revenue']

    # Step 2: Split dividend pool
    pool_split = split_dividend_pool(dividend_pool, base_dividend_pct, 1 - base_dividend_pct)
    base_pool = pool_split['base_pool']
    outperformer_pool = pool_split['outperformer_pool']

    # Step 3: Calculate total shares per user (for base dividend)
    user_total_shares = {}
    for player_id, shareholders in player_shareholders.items():
        for user_id, shares in shareholders.items():
            if user_id not in user_total_shares:
                user_total_shares[user_id] = 0
            user_total_shares[user_id] += shares

    # Step 4: Distribute base dividend
    base_dividends = distribute_base_dividend(base_pool, user_total_shares)

    # Step 5: Distribute outperformer dividend
    outperformer_dividends = distribute_outperformer_dividend(
        outperformer_pool,
        player_performances,
        player_shareholders
    )

    # Step 6: Combine
    all_users = set(base_dividends.keys()) | set(outperformer_dividends.keys())
    user_dividends = {
        uid: base_dividends.get(uid, 0) + outperformer_dividends.get(uid, 0)
        for uid in all_users
    }

    return {
        'total_fees': total_fees,
        'company_revenue': company_revenue,
        'dividend_pool': dividend_pool,
        'base_pool': base_pool,
        'outperformer_pool': outperformer_pool,
        'base_dividends': base_dividends,
        'outperformer_dividends': outperformer_dividends,
        'user_dividends': user_dividends,
        'total_distributed': sum(user_dividends.values())
    }


# =============================================================================
# EXAMPLE USAGE
# =============================================================================

if __name__ == "__main__":
    print("=" * 60)
    print("AMM CALCULATIONS")
    print("=" * 60)

    # AMM example
    shares = 1000
    cash = 10000

    print(f"\nPool: {shares} shares, ${cash} cash")
    print(f"Price: ${amm_price(shares, cash):.2f}/share")

    # Buy 50 shares
    buy = amm_buy_cost(shares, cash, 50)
    print(f"\nBuy 50 shares:")
    print(f"  Cost: ${buy['cost']:.2f}")
    print(f"  Avg price: ${buy['avg_price']:.2f}")
    print(f"  Slippage: {buy['slippage_pct']:.2f}%")

    # With fee
    with_fee = apply_fee(buy['cost'], 0.015)
    print(f"  Fee (1.5%): ${with_fee['fee']:.2f}")
    print(f"  Total: ${buy['cost'] + with_fee['fee']:.2f}")

    print("\n" + "=" * 60)
    print("DIVIDEND CALCULATIONS")
    print("=" * 60)

    # Dividend example
    result = calculate_weekly_dividends(
        total_fees=1000,
        player_performances={
            'mahomes': 0.30,   # +30%
            'kelce': 0.15,    # +15%
            'hill': -0.10,    # -10%
        },
        player_shareholders={
            'mahomes': {'alice': 50, 'bob': 30, 'carol': 20},
            'kelce': {'alice': 40, 'carol': 60},
            'hill': {'bob': 80, 'carol': 20},
        }
    )

    print(f"\nFees collected: ${result['total_fees']:.2f}")
    print(f"Company revenue: ${result['company_revenue']:.2f}")
    print(f"Dividend pool: ${result['dividend_pool']:.2f}")
    print(f"  Base pool: ${result['base_pool']:.2f}")
    print(f"  Outperformer pool: ${result['outperformer_pool']:.2f}")

    print(f"\nUser dividends:")
    for user, div in sorted(result['user_dividends'].items()):
        base = result['base_dividends'].get(user, 0)
        outperf = result['outperformer_dividends'].get(user, 0)
        print(f"  {user}: ${div:.2f} (base: ${base:.2f}, outperformer: ${outperf:.2f})")

    print(f"\nTotal distributed: ${result['total_distributed']:.2f}")
    print(f"Verification: ${result['company_revenue'] + result['total_distributed']:.2f}")
