#!/usr/bin/env python3
"""
Hourly wallet NAV snapshots → Supabase `wallet_portfolio_snapshots`.

  cd backend && ./venv/bin/python snapshot_portfolios.py

Schedule in production (e.g. cron):
  0 * * * * cd /path/to/backend && ./venv/bin/python snapshot_portfolios.py

Requires: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, RPC_URL (Base Sepolia).
Apply `supabase_schema.sql` section for wallet_portfolio_snapshots before first run.
"""
from snapshot.job import main

if __name__ == "__main__":
    main()
