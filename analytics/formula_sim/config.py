"""
Configuration for the Statix Fantasy Formula Simulation.
Season dates, formula weights, playoff structure, and output paths.
"""

from pathlib import Path

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------
ROOT = Path(__file__).resolve().parent.parent          # analytics/
CACHE_DIR = ROOT / "cache"
OUTPUT_DIR = ROOT / "output"

# ---------------------------------------------------------------------------
# Seasons — Regular Season
# ---------------------------------------------------------------------------
REGULAR_SEASONS = {
    "2024-25": {
        "start": "2024-10-22",
        "end": "2025-04-13",
    },
    "2025-26": {
        "start": "2025-10-28",
        "end": "2026-04-13",
    },
}

# ---------------------------------------------------------------------------
# Seasons — Playoffs
# ---------------------------------------------------------------------------
PLAYOFF_SEASONS = ["2023-24", "2024-25"]

# ---------------------------------------------------------------------------
# Cycle / eligibility settings
# ---------------------------------------------------------------------------
CYCLE_DAYS = 7          # weekly cycles for regular season
RS_MIN_GAMES = 1        # min games in a cycle to be eligible (regular season)
RS_TOP_N = 10           # top N per cycle (regular season)

# ---------------------------------------------------------------------------
# Playoff round definitions
# ---------------------------------------------------------------------------
PLAYOFF_ROUNDS = {
    1: {"name": "First Round",       "top_n": 10, "min_games": 2, "weight": 1.0},
    2: {"name": "Second Round",      "top_n": 5,  "min_games": 2, "weight": 1.5},
    3: {"name": "Conference Finals",  "top_n": 2,  "min_games": 2, "weight": 2.0},
    4: {"name": "Finals",            "top_n": 1,  "min_games": 2, "weight": 3.0},
}

# ---------------------------------------------------------------------------
# Stat columns needed from game logs
# ---------------------------------------------------------------------------
STAT_COLS = [
    "PTS", "REB", "OREB", "DREB", "AST", "STL", "BLK", "TOV",
    "FGM", "FGA", "FG3M", "FG3A", "FTM", "FTA", "PLUS_MINUS", "MIN",
]

# ---------------------------------------------------------------------------
# Player-of-the-Week bonus
# ---------------------------------------------------------------------------
POTW_BONUS = 10.0  # added to per-game avg if player won POTW that cycle

# ---------------------------------------------------------------------------
# Tier thresholds (fraction of cycles in top 10)
# ---------------------------------------------------------------------------
TIERS = {
    "Elite":    0.40,   # >40%
    "Mid-Tier": 0.15,   # 15-40%
    "Fringe":   0.05,   # 5-15%
    # below 5% = "Never"
}
