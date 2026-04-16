"""LP P&L calculators.

Filled in during P2. At resolve time, computes:

  lp_pnl = final_collateral_claim - seed_collateral + fees_collected

Where `final_collateral_claim` is the DBucks the protocol (sole LP) can
withdraw from the FPMM after resolution by calling removeFunding and
redeemPositions on any outcome tokens it holds.

Separately snapshots skew, volume, effective fee rate into h2h_markets
so the admin dashboard can surface LP behavior before opening LPing up.
"""


def compute_and_store(market_id: int) -> None:
    """Compute LP metrics for a resolved market and write onto h2h_markets row.
    TODO (P2).
    """
    raise NotImplementedError("Populated in P2")
