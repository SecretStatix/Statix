"""
Centralized application constants for Statix.

Single source of truth for fee rates, dividend splits, fantasy scoring weights,
and player count. All backend modules import constants from here — no duplicated
magic numbers across files.
"""

# ── Fantasy scoring weights ──────────────────────────────────────────────────
# Used by nba_stats.calculate_fantasy_points and admin round-stats pipeline.
# Must stay in sync with distribute-dividends.js SCORING object.
SCORING: dict[str, float] = {
    "PTS": 1.0,
    "REB": 1.2,
    "AST": 1.5,
    "STL": 2.0,
    "BLK": 2.0,
    "FG3M": 0.5,
    "TOV": -1.5,
    "DD_BONUS": 2.0,
    "TD_BONUS": 5.0,
}

# ── Fee & dividend parameters ─────────────────────────────────────────────────
# Must match StatixRouter.sol feeBps = 200 and DividendHub split.
FEE_RATE: float = 0.02           # 2% charged on every trade
DIVIDEND_POOL_PCT: float = 0.67  # of fee revenue → DividendHub pool
COMPANY_PCT: float = 0.33        # of fee revenue → protocol wallet
BASE_POOL_PCT: float = 0.20      # of dividend pool → all shareholders (proportional)
TOP_PERFORMER_PCT: float = 0.80  # of dividend pool → top-N fantasy scorers

# ── Top-N cutoff by playoff round ─────────────────────────────────────────────
# Must match distribute-dividends.js TOP_N_BY_ROUND and the Rules page.
# Key = round number (1-based), value = number of eligible top performers.
TOP_N_BY_ROUND: dict[int, int] = {1: 10, 2: 5, 3: 3, 4: 1}

# ── Pool parameters ───────────────────────────────────────────────────────────
PLAYER_COUNT: int = 80           # total deployed PlayerPool contracts
INITIAL_POOL_PRICE: float = 10.0 # DBucks/share at listing (virtual curve start)
TOKEN_DECIMALS: int = 6          # DBucks/USDC on-chain decimals
