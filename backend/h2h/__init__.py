"""Head-to-Head Markets module.

Polymarket-style binary prediction markets on per-game top-player fantasy
point matchups. Fully isolated from the core Statix AMM: shares no state,
no contracts, and no tables. Only integration point is the fee sweep into
the existing DividendHub address.

Layout:
    routes.py         FastAPI router mounted at /api/h2h
    schemas.py        Pydantic request/response models
    service.py        Market creation + top-player selection
    chain.py          H2H contract addresses + ABI helpers
    resolver.py       Autonomous oracle daemon (auto-resolves on game final)
    live_tracker.py   Polls NBA BoxScoreV2 for live FP during active games
    lp_metrics.py     LP P&L calculators (called at resolve time)
"""
