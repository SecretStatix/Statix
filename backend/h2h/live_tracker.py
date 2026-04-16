"""Live fantasy-point tracker for in-progress games.

Filled in during P2. Flow (runs every 30s):
  1. Select markets with status='open' and tip_off_at < now < tip_off_at + 3h
  2. For each, fetch NBA BoxScoreV2 for that game_id
  3. Compute live FP for player A and B (minutes > 0)
  4. Insert h2h_live_scores row
  5. Frontend polls /api/h2h/markets/{id}/live every ~15s while game is active
"""


async def run_once() -> None:
    """One pass of the live tracker. TODO (P2)."""
    raise NotImplementedError("Populated in P2")
