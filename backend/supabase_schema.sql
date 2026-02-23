-- Supabase Schema for Dividend Fantasy
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

-- Service role write policies (backend uses service_role key to write)
CREATE POLICY "Service insert" ON transactions FOR INSERT WITH CHECK (true);
CREATE POLICY "Service insert" ON dividend_claims FOR INSERT WITH CHECK (true);
CREATE POLICY "Service insert" ON weekly_performance FOR INSERT WITH CHECK (true);
CREATE POLICY "Service upsert" ON weekly_performance FOR UPDATE USING (true);
CREATE POLICY "Service insert" ON weekly_dividends FOR INSERT WITH CHECK (true);
CREATE POLICY "Service upsert" ON weekly_dividends FOR UPDATE USING (true);
CREATE POLICY "Service insert" ON users FOR INSERT WITH CHECK (true);
