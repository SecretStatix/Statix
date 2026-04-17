-- Head-to-Head Markets schema
-- Polymarket-style binary prediction markets on per-game top-player fantasy point matchups.
-- Mechanism: Gnosis Conditional Tokens Framework + FixedProductMarketMaker (CPMM).
-- Run in Supabase SQL editor alongside supabase_schema.sql.

-- ============================================================
-- h2h_markets — one row per H2H market (one per NBA game)
-- ============================================================
CREATE TABLE IF NOT EXISTS h2h_markets (
    id BIGSERIAL PRIMARY KEY,

    -- CTF identifiers
    condition_id TEXT UNIQUE NOT NULL,         -- bytes32 hex (0x…) from ConditionalTokens.prepareCondition
    question_id TEXT UNIQUE NOT NULL,          -- bytes32 hex, oracle-scoped question id
    fpmm_address TEXT UNIQUE NOT NULL,         -- FixedProductMarketMaker clone address
    position_id_a TEXT NOT NULL,               -- uint256 ERC-1155 tokenId for outcome A
    position_id_b TEXT NOT NULL,               -- uint256 ERC-1155 tokenId for outcome B

    -- Game / player context
    game_id TEXT NOT NULL,                     -- NBA game id (e.g., stats.nba.com game_id)
    tip_off_at TIMESTAMPTZ NOT NULL,

    player_a_id TEXT NOT NULL,                 -- matches players table id (underscored)
    player_a_nba_id INTEGER NOT NULL,
    player_a_name TEXT NOT NULL,
    player_a_team TEXT NOT NULL,
    player_b_id TEXT NOT NULL,
    player_b_nba_id INTEGER NOT NULL,
    player_b_name TEXT NOT NULL,
    player_b_team TEXT NOT NULL,

    -- State machine
    status TEXT NOT NULL DEFAULT 'open'
        CHECK (status IN ('open', 'resolved', 'voided')),
    winner TEXT
        CHECK (winner IN ('A', 'B', 'void') OR winner IS NULL),

    -- Resolution data
    player_a_final_fp NUMERIC,
    player_b_final_fp NUMERIC,
    resolved_at TIMESTAMPTZ,
    resolve_tx_hash TEXT,

    -- LP economics snapshot (populated at resolve time)
    seed_collateral NUMERIC,                   -- DBucks seeded by protocol as sole LP
    fees_collected NUMERIC DEFAULT 0,          -- LP fees withdrawn into DividendHub
    total_volume NUMERIC DEFAULT 0,            -- running sum of trade notional
    final_pool_a NUMERIC,                      -- pool balance outcome A at resolve
    final_pool_b NUMERIC,                      -- pool balance outcome B at resolve
    lp_pnl NUMERIC,                            -- final LP P&L vs. hold-collateral baseline (IL indicator)

    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_h2h_markets_status ON h2h_markets(status);
CREATE INDEX IF NOT EXISTS idx_h2h_markets_tipoff ON h2h_markets(tip_off_at);
CREATE INDEX IF NOT EXISTS idx_h2h_markets_game ON h2h_markets(game_id);

-- ============================================================
-- h2h_trades — every buy/sell on any H2H market
-- ============================================================
CREATE TABLE IF NOT EXISTS h2h_trades (
    id BIGSERIAL PRIMARY KEY,
    market_id BIGINT NOT NULL REFERENCES h2h_markets(id) ON DELETE CASCADE,
    wallet_address TEXT NOT NULL,

    side TEXT NOT NULL CHECK (side IN ('A', 'B')),
    action TEXT NOT NULL CHECK (action IN ('buy', 'sell')),
    shares NUMERIC NOT NULL,                   -- outcome-token amount (18dp on chain)
    cost_dbucks NUMERIC NOT NULL,              -- DBucks in (buy) or out (sell)
    price_per_share NUMERIC NOT NULL,          -- cost / shares, useful for charts

    tx_hash TEXT UNIQUE NOT NULL,
    block_number BIGINT NOT NULL,
    log_index INTEGER NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_h2h_trades_market ON h2h_trades(market_id);
CREATE INDEX IF NOT EXISTS idx_h2h_trades_wallet ON h2h_trades(wallet_address);
CREATE INDEX IF NOT EXISTS idx_h2h_trades_market_time ON h2h_trades(market_id, created_at);

-- ============================================================
-- h2h_pool_snapshots — periodic reserve snapshots for charts + LP metrics
-- Indexer / daemon writes one row per market per interval while status='open'
-- ============================================================
CREATE TABLE IF NOT EXISTS h2h_pool_snapshots (
    id BIGSERIAL PRIMARY KEY,
    market_id BIGINT NOT NULL REFERENCES h2h_markets(id) ON DELETE CASCADE,
    snapshot_at TIMESTAMPTZ NOT NULL,
    pool_a NUMERIC NOT NULL,                   -- outcome A token reserve in FPMM
    pool_b NUMERIC NOT NULL,                   -- outcome B token reserve in FPMM
    collateral_in_pool NUMERIC NOT NULL,       -- DBucks held by FPMM (ex accrued fees)
    accrued_fees NUMERIC NOT NULL DEFAULT 0,   -- fees credited to LP, not yet swept
    implied_prob_a NUMERIC NOT NULL,           -- pool_b / (pool_a + pool_b)
    UNIQUE (market_id, snapshot_at)
);

CREATE INDEX IF NOT EXISTS idx_h2h_pool_snapshots_market_time
    ON h2h_pool_snapshots(market_id, snapshot_at DESC);

-- ============================================================
-- h2h_live_scores — live fantasy points during in-progress games
-- Polled from NBA BoxScoreV2 every ~30s while a market's game is live
-- Only the latest row per market is meaningful; history kept for audit/charts
-- ============================================================
CREATE TABLE IF NOT EXISTS h2h_live_scores (
    id BIGSERIAL PRIMARY KEY,
    market_id BIGINT NOT NULL REFERENCES h2h_markets(id) ON DELETE CASCADE,
    captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    game_clock TEXT,                           -- e.g., "Q3 8:24"
    game_status TEXT,                          -- "scheduled" | "live" | "final" | "postponed"
    player_a_fp NUMERIC,
    player_a_minutes NUMERIC,
    player_b_fp NUMERIC,
    player_b_minutes NUMERIC
);

CREATE INDEX IF NOT EXISTS idx_h2h_live_scores_market_time
    ON h2h_live_scores(market_id, captured_at DESC);

-- ============================================================
-- h2h_lp_metrics — per-market LP P&L view for admin dashboard
-- Computed from markets + trades; updated at resolve time onto h2h_markets cols,
-- this view adds derived ratios.
-- ============================================================
CREATE OR REPLACE VIEW h2h_lp_metrics AS
SELECT
    m.id AS market_id,
    m.player_a_name,
    m.player_b_name,
    m.status,
    m.tip_off_at,
    m.resolved_at,
    m.seed_collateral,
    m.fees_collected,
    m.total_volume,
    m.lp_pnl,
    CASE
        WHEN COALESCE(m.seed_collateral, 0) > 0
        THEN m.lp_pnl / m.seed_collateral
        ELSE NULL
    END AS lp_return_pct,
    CASE
        WHEN COALESCE(m.total_volume, 0) > 0
        THEN m.fees_collected / m.total_volume
        ELSE NULL
    END AS effective_fee_rate,
    CASE
        WHEN COALESCE(m.final_pool_a, 0) + COALESCE(m.final_pool_b, 0) > 0
        THEN ABS(m.final_pool_a - m.final_pool_b)
             / (m.final_pool_a + m.final_pool_b)
        ELSE NULL
    END AS final_pool_skew
FROM h2h_markets m;

-- ============================================================
-- RLS policies
-- ============================================================
ALTER TABLE h2h_markets ENABLE ROW LEVEL SECURITY;
ALTER TABLE h2h_trades ENABLE ROW LEVEL SECURITY;
ALTER TABLE h2h_pool_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE h2h_live_scores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read" ON h2h_markets FOR SELECT USING (true);
CREATE POLICY "Public read" ON h2h_trades FOR SELECT USING (true);
CREATE POLICY "Public read" ON h2h_pool_snapshots FOR SELECT USING (true);
CREATE POLICY "Public read" ON h2h_live_scores FOR SELECT USING (true);

CREATE POLICY "Service insert" ON h2h_markets FOR INSERT WITH CHECK (auth.role() = 'service_role');
CREATE POLICY "Service update" ON h2h_markets FOR UPDATE USING (auth.role() = 'service_role');
CREATE POLICY "Service insert" ON h2h_trades FOR INSERT WITH CHECK (auth.role() = 'service_role');
CREATE POLICY "Service insert" ON h2h_pool_snapshots FOR INSERT WITH CHECK (auth.role() = 'service_role');
CREATE POLICY "Service insert" ON h2h_live_scores FOR INSERT WITH CHECK (auth.role() = 'service_role');
