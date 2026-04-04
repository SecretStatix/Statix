-- Supabase Schema for Statix
-- Run this in Supabase SQL Editor when setting up

-- Users (tracked by wallet address)
CREATE TABLE IF NOT EXISTS users (
    wallet_address TEXT PRIMARY KEY,
    username TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Transaction history (logged by backend after on-chain tx)
CREATE TABLE IF NOT EXISTS transactions (
    id BIGSERIAL PRIMARY KEY,
    wallet_address TEXT NOT NULL,
    player_index INTEGER NOT NULL,
    side TEXT NOT NULL CHECK (side IN ('buy', 'sell')),
    shares NUMERIC NOT NULL,
    cost NUMERIC NOT NULL,
    tx_hash TEXT UNIQUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_transactions_wallet ON transactions(wallet_address);
CREATE INDEX idx_transactions_player ON transactions(player_index);

-- Weekly performance (actual vs projected)
CREATE TABLE IF NOT EXISTS weekly_performance (
    id BIGSERIAL PRIMARY KEY,
    week INTEGER NOT NULL,
    player_index INTEGER NOT NULL,
    actual_points NUMERIC NOT NULL,
    projected_points NUMERIC NOT NULL,
    outperformance NUMERIC NOT NULL,
    games_played INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(week, player_index)
);

-- Weekly dividend info
CREATE TABLE IF NOT EXISTS weekly_dividends (
    week INTEGER PRIMARY KEY,
    total_fees NUMERIC NOT NULL DEFAULT 0,
    total_pool NUMERIC NOT NULL DEFAULT 0,
    base_pool NUMERIC NOT NULL DEFAULT 0,
    outperformer_pool NUMERIC NOT NULL DEFAULT 0,
    distributed BOOLEAN DEFAULT FALSE,
    distributed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Dividend claims
CREATE TABLE IF NOT EXISTS dividend_claims (
    id BIGSERIAL PRIMARY KEY,
    week INTEGER NOT NULL,
    wallet_address TEXT NOT NULL,
    amount NUMERIC NOT NULL,
    tx_hash TEXT,
    claimed_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(week, wallet_address)
);

-- Leaderboard function
CREATE OR REPLACE FUNCTION get_dividend_leaderboard()
RETURNS TABLE (
    wallet_address TEXT,
    total_earned NUMERIC,
    weeks_claimed BIGINT
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        dc.wallet_address,
        SUM(dc.amount) as total_earned,
        COUNT(*) as weeks_claimed
    FROM dividend_claims dc
    GROUP BY dc.wallet_address
    ORDER BY total_earned DESC
    LIMIT 50;
END;
$$ LANGUAGE plpgsql;

-- Enable Row Level Security
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE dividend_claims ENABLE ROW LEVEL SECURITY;
ALTER TABLE weekly_performance ENABLE ROW LEVEL SECURITY;
ALTER TABLE weekly_dividends ENABLE ROW LEVEL SECURITY;

-- Public read policies (anyone can see leaderboard/transactions)
CREATE POLICY "Public read" ON transactions FOR SELECT USING (true);
CREATE POLICY "Public read" ON dividend_claims FOR SELECT USING (true);
CREATE POLICY "Public read" ON weekly_performance FOR SELECT USING (true);
CREATE POLICY "Public read" ON weekly_dividends FOR SELECT USING (true);
CREATE POLICY "Public read" ON users FOR SELECT USING (true);

-- Service role write policies (only backend with service_role key can write)
CREATE POLICY "Service insert" ON transactions FOR INSERT WITH CHECK (auth.role() = 'service_role');
CREATE POLICY "Service insert" ON dividend_claims FOR INSERT WITH CHECK (auth.role() = 'service_role');
CREATE POLICY "Service insert" ON weekly_performance FOR INSERT WITH CHECK (auth.role() = 'service_role');
CREATE POLICY "Service upsert" ON weekly_performance FOR UPDATE USING (auth.role() = 'service_role');
CREATE POLICY "Service insert" ON weekly_dividends FOR INSERT WITH CHECK (auth.role() = 'service_role');
CREATE POLICY "Service upsert" ON weekly_dividends FOR UPDATE USING (auth.role() = 'service_role');
CREATE POLICY "Service insert" ON users FOR INSERT WITH CHECK (auth.role() = 'service_role');

-- ============================================================
-- Migration: Add transaction detail columns (run in SQL editor)
-- ============================================================
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS player_name TEXT;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS fee NUMERIC DEFAULT 0;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS price_per_share NUMERIC DEFAULT 0;

-- ============================================================
-- Pool price snapshots (indexer: one row per trade from chain logs)
-- timestamp = block time; block_number + log_index order events within a block
-- ============================================================
CREATE TABLE IF NOT EXISTS pool_price_snapshots (
    id BIGSERIAL PRIMARY KEY,
    pool_index INTEGER NOT NULL,
    price NUMERIC NOT NULL,
    timestamp TIMESTAMPTZ NOT NULL,
    block_number BIGINT NOT NULL,
    log_index INTEGER NOT NULL,
    UNIQUE (block_number, log_index)
);

CREATE INDEX IF NOT EXISTS idx_pool_price_snapshots_pool_time
    ON pool_price_snapshots (pool_index, block_number, log_index);

ALTER TABLE pool_price_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read" ON pool_price_snapshots FOR SELECT USING (true);
CREATE POLICY "Service insert" ON pool_price_snapshots FOR INSERT WITH CHECK (auth.role() = 'service_role');

-- ============================================================
-- Wallet portfolio snapshots (cron job: hourly NAV per wallet)
-- net_worth = cash_dbucks + positions_value (all DBucks, 6dp on-chain → float here)
-- ============================================================
CREATE TABLE IF NOT EXISTS wallet_portfolio_snapshots (
    id BIGSERIAL PRIMARY KEY,
    wallet_address TEXT NOT NULL,
    snapshot_at TIMESTAMPTZ NOT NULL,
    net_worth NUMERIC NOT NULL,
    cash_dbucks NUMERIC NOT NULL,
    positions_value NUMERIC NOT NULL,
    UNIQUE (wallet_address, snapshot_at)
);

CREATE INDEX IF NOT EXISTS idx_wallet_portfolio_snapshots_wallet_time
    ON wallet_portfolio_snapshots (wallet_address, snapshot_at DESC);

ALTER TABLE wallet_portfolio_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read" ON wallet_portfolio_snapshots FOR SELECT USING (true);
CREATE POLICY "Service insert" ON wallet_portfolio_snapshots FOR INSERT WITH CHECK (auth.role() = 'service_role');
CREATE POLICY "Service update" ON wallet_portfolio_snapshots FOR UPDATE USING (auth.role() = 'service_role');
