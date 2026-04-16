"""Autonomous oracle daemon.

Filled in during P2. Flow (runs every 60s):
  1. Select markets with status='open' and tip_off_at < now - 30min
  2. For each, hit NBA BoxScoreV2 for the game_id
  3. If game is Final AND both players have MIN > 0:
        compute FP for A and B (via nba_stats.calculate_fantasy_points)
        if A > B:   payouts = [1, 0]
        elif B > A: payouts = [0, 1]
        else:       payouts = [1, 1]   # tie -> 50/50
  4. If game is Postponed, or either MIN == 0, or total_volume < $10:
        payouts = [1, 1]  (void, pro-rata refund)
  5. Sign + submit H2HOracle.resolve(question_id, a_fp, b_fp) with oracle key
  6. On confirmation, update h2h_markets row (status, winner, final_fps, etc.)
  7. Trigger lp_metrics.compute_and_store(market_id) to snapshot LP P&L
  8. Call FPMM.withdrawFees() and transfer collected DBucks to DividendHub
"""


async def run_once() -> None:
    """One pass of the resolver loop. TODO (P2)."""
    raise NotImplementedError("Populated in P2")
