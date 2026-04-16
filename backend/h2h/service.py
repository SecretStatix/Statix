"""Market creation + top-player selection.

Filled in during P2. Flow:
  1. Query NBA ScoreboardV2 for today's games
  2. For each game, pick top player per team by last-10-games avg FP
  3. Call H2HCreator.createMarket(...) via chain.py
  4. Insert h2h_markets row with returned condition_id / fpmm_address
"""

from typing import List


def pick_top_player_for_team(team_tricode: str) -> dict:
    """Return {id, nba_id, name, team, recent_avg_fp} for the team's top player
    by last-10-games average fantasy points.

    TODO (P2): implement — reuse nba_stats.fetch_player_game_log + calculate_fantasy_points.
    """
    raise NotImplementedError("Populated in P2")


def create_markets_for_today() -> List[int]:
    """Create an H2H market for every scheduled NBA game today.

    Returns list of newly-created market IDs (rows in h2h_markets).
    TODO (P2): implement.
    """
    raise NotImplementedError("Populated in P2")
