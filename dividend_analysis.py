"""
Dividend Viability Analysis
===========================
Testing if dividends are attractive with realistic numbers
"""

def analyze_scenario(
    num_users: int,
    investment_per_user: float,
    trades_per_user: int,
    num_players: int,
    trading_fee: float = 0.015,
    dividend_split: float = 0.67,
    base_dividend_pct: float = 0.20,
):
    """Analyze dividend attractiveness for a given scenario"""

    print("=" * 60)
    print(f"SCENARIO: {num_users} users, {num_players} players")
    print("=" * 60)

    # Weekly trading volume
    weekly_volume = num_users * investment_per_user * trades_per_user
    print(f"\nWeekly volume: ${weekly_volume:,.2f}")
    print(f"  ({num_users} users × ${investment_per_user} × {trades_per_user} trades)")

    # Fee pool
    total_fees = weekly_volume * trading_fee
    dividend_pool = total_fees * dividend_split
    protocol_revenue = total_fees * (1 - dividend_split)

    print(f"\nWeekly fees: ${total_fees:,.2f}")
    print(f"  Dividend pool: ${dividend_pool:,.2f} (67%)")
    print(f"  Protocol:      ${protocol_revenue:,.2f} (33%)")

    # Dividend split
    base_pool = dividend_pool * base_dividend_pct
    outperformer_pool = dividend_pool * (1 - base_dividend_pct)

    print(f"\nDividend breakdown:")
    print(f"  Base (all holders):    ${base_pool:,.2f} (20%)")
    print(f"  Outperformers (80%):   ${outperformer_pool:,.2f}")

    # Assume half the players outperform each week
    num_outperformers = num_players // 2
    avg_outperformer_pool = outperformer_pool / num_outperformers if num_outperformers > 0 else 0

    print(f"\nAssuming {num_outperformers} players outperform:")
    print(f"  Avg pool per outperformer: ${avg_outperformer_pool:,.2f}")

    # User perspective
    # Assume user owns ~5% of a single player (100 users / ~20 players per user on average)
    # Actually with 100 users and X players, if evenly distributed:
    avg_users_per_player = num_users / num_players
    user_ownership_pct = 1 / avg_users_per_player  # if evenly split

    # User's fee paid
    user_fee_paid = investment_per_user * trades_per_user * trading_fee

    # User's dividend received (if they hold an outperforming player)
    user_base_dividend = base_pool / num_users  # Equal split
    user_outperformer_dividend = avg_outperformer_pool * user_ownership_pct
    user_total_dividend = user_base_dividend + user_outperformer_dividend

    print(f"\n--- USER PERSPECTIVE (holding 1 outperforming player) ---")
    print(f"Fee paid this week:        ${user_fee_paid:.2f}")
    print(f"Base dividend received:    ${user_base_dividend:.2f}")
    print(f"Outperformer dividend:     ${user_outperformer_dividend:.2f}")
    print(f"Total dividend:            ${user_total_dividend:.2f}")
    print(f"Net:                       ${user_total_dividend - user_fee_paid:+.2f}")
    print(f"Dividend/Fee ratio:        {user_total_dividend/user_fee_paid:.2f}x")

    # Dividend yield
    dividend_yield = user_total_dividend / investment_per_user * 100
    annual_yield = dividend_yield * 52  # Annualized

    print(f"\nDividend yield (weekly):   {dividend_yield:.2f}%")
    print(f"Dividend yield (annual):   {annual_yield:.1f}%")

    # Is it attractive?
    print(f"\n--- VERDICT ---")
    if user_total_dividend > user_fee_paid:
        print(f"✓ User gets back MORE than fees paid")
    else:
        print(f"✗ User gets back LESS than fees paid")
        print(f"  They lose ${user_fee_paid - user_total_dividend:.2f}/week on average")

    if annual_yield > 20:
        print(f"✓ Yield ({annual_yield:.0f}%) is attractive (>20% APY)")
    elif annual_yield > 5:
        print(f"~ Yield ({annual_yield:.0f}%) is moderate (5-20% APY)")
    else:
        print(f"✗ Yield ({annual_yield:.0f}%) is too low (<5% APY)")

    return {
        'weekly_volume': weekly_volume,
        'total_fees': total_fees,
        'dividend_pool': dividend_pool,
        'user_dividend': user_total_dividend,
        'user_fee': user_fee_paid,
        'annual_yield': annual_yield
    }


print("\n" + "=" * 60)
print("YOUR SCENARIO: 100 users, $25/week, 1 trade, many players")
print("=" * 60 + "\n")

# Your exact scenario
analyze_scenario(
    num_users=100,
    investment_per_user=25,
    trades_per_user=1,
    num_players=50  # Covering 50 NBA players
)

print("\n\n")
analyze_scenario(
    num_users=100,
    investment_per_user=25,
    trades_per_user=1,
    num_players=10  # Only 10 NBA players
)

print("\n\n")
analyze_scenario(
    num_users=100,
    investment_per_user=25,
    trades_per_user=1,
    num_players=5  # Only 5 NBA players
)


print("\n\n" + "=" * 60)
print("THE REAL PROBLEM: VOLUME")
print("=" * 60)

print("""
With only $2,500/week in volume:
- Total fees: $37.50
- Dividend pool: $25.13
- Split among ALL users = tiny amounts

The dividend pool scales LINEARLY with volume.
Fewer players doesn't create more money - it just concentrates it.
""")

print("\n" + "=" * 60)
print("WHAT WOULD MAKE DIVIDENDS ATTRACTIVE?")
print("=" * 60)

# Test: What volume do we need for 20% annual yield?
print("\nTarget: 20% annual yield = ~0.4% weekly yield")
print("If user invests $25 and wants $0.10 back (0.4%)...")
print("With 100 users all wanting $0.10, we need $10 in dividends")
print("$10 dividends = $15 fees = $1000 volume")
print("But we only have $2500 volume... wait that should work!")

print("\nLet me recalculate more carefully...")

def detailed_analysis():
    print("\n--- DETAILED BREAKDOWN ---")

    users = 100
    investment = 25
    volume = users * investment  # $2500
    fee_rate = 0.015

    total_fees = volume * fee_rate  # $37.50
    dividend_pool = total_fees * 0.67  # $25.13

    # ALL users share the dividend pool
    # The pool is distributed based on holdings
    # Total value of all holdings = $2500 (everyone's investment)

    # If everyone invests equally and holds equally...
    # User's share of dividend = their holdings / total holdings
    # = $25 / $2500 = 1%
    # So each user gets 1% of dividend pool = $0.25

    user_dividend = dividend_pool / users
    user_fee = investment * fee_rate

    print(f"Total volume: ${volume}")
    print(f"Total fees: ${total_fees:.2f}")
    print(f"Dividend pool: ${dividend_pool:.2f}")
    print(f"User fee paid: ${user_fee:.2f}")
    print(f"User dividend (equal split): ${user_dividend:.2f}")
    print(f"Ratio: {user_dividend/user_fee:.2f}x")

    print("\n*** KEY INSIGHT ***")
    print("In a closed system with equal distribution:")
    print(f"  User pays: ${user_fee:.2f}")
    print(f"  User gets: ${user_dividend:.2f}")
    print(f"  Difference: ${user_dividend - user_fee:.2f}")
    print(f"\nThe ${total_fees * 0.33:.2f} difference is the PROTOCOL REVENUE")
    print("Users as a whole LOSE money (the protocol's cut)")
    print("Individual users can WIN by picking better players")
    print("But AVERAGE user always loses the protocol cut (33% of fees)")

detailed_analysis()


print("\n\n" + "=" * 60)
print("FEWER PLAYERS: DOES IT HELP?")
print("=" * 60)

print("""
Having fewer players does NOT increase total dividends.
The dividend pool is fixed based on trading volume.

What fewer players DOES do:
1. Concentrates trading volume (more liquidity per player)
2. Makes prices more stable (deeper pools)
3. Reduces complexity for users
4. Creates more competition for shares of each player

RECOMMENDATION:
Start with 5-10 top NBA players (LeBron, Curry, Giannis, etc.)
This concentrates attention and trading activity.
Expand as user base grows.

But the core problem remains:
- 100 users × $25 = $2,500 volume
- 1.5% fee = $37.50
- 67% to dividends = $25
- 33% to protocol = $12.50

Users collectively lose $12.50/week to the protocol.
That's $0.125/user/week or ~2.6% annual cost.

This IS acceptable if:
1. Users enjoy the game (entertainment value)
2. Skilled users can profit at expense of unskilled
3. Price appreciation makes up for dividend drag
""")


print("\n\n" + "=" * 60)
print("YOUR OPTIONS")
print("=" * 60)

print("""
OPTION 1: Accept Low Dividends
- Dividends are a bonus, not the main value prop
- Focus on price speculation and trading
- Like meme coins but with sports theme

OPTION 2: Lower Protocol Cut
- 10% protocol instead of 33%
- Users keep more
- Need higher volume to be profitable

OPTION 3: Add External Revenue
- Sponsored players (teams pay for exposure)
- Premium features
- Add that revenue to dividend pool

OPTION 4: Higher Trading Velocity
- More trades = more fees = more dividends
- Gamify trading (daily picks, streaks, etc.)
- Your 1 trade/week is very conservative
- DraftKings users make 10+ entries/week

OPTION 5: Wait for Scale
- At 1000 users, numbers work much better
- Focus on growth first, optimize unit economics later
- Use low fees as marketing (better than competitors)
""")

print("\n" + "=" * 60)
print("REALISTIC TARGETS")
print("=" * 60)

scenarios = [
    (100, 25, 1, "Current (conservative)"),
    (100, 25, 5, "More active trading"),
    (500, 25, 3, "500 users, moderate trading"),
    (1000, 50, 5, "1K users, engaged"),
]

print(f"\n{'Scenario':<30} {'Volume':<12} {'Fees':<10} {'Div Pool':<10} {'Per User':<10}")
print("-" * 72)

for users, inv, trades, name in scenarios:
    vol = users * inv * trades
    fees = vol * 0.015
    div_pool = fees * 0.67
    per_user = div_pool / users
    print(f"{name:<30} ${vol:<11,} ${fees:<9,.0f} ${div_pool:<9,.0f} ${per_user:<9,.2f}")
