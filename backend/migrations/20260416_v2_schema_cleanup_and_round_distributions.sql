-- Drop V1 tables (projection-beating model, unused auth table)
DROP TABLE IF EXISTS public.users CASCADE;
DROP TABLE IF EXISTS public.weekly_performance CASCADE;
DROP TABLE IF EXISTS public.fantasy_weekly_projections CASCADE;
DROP TABLE IF EXISTS public.weekly_dividends CASCADE;

-- Rename `week` → `round` in dividend_claims (V2 term)
ALTER TABLE public.dividend_claims RENAME COLUMN week TO round;

-- Add unique constraint so indexer can upsert on (round, wallet_address)
ALTER TABLE public.dividend_claims
  ADD CONSTRAINT dividend_claims_round_wallet_unique UNIQUE (round, wallet_address);

-- New table: one row per completed distribution round
CREATE TABLE IF NOT EXISTS public.round_distributions (
  id                 BIGSERIAL PRIMARY KEY,
  round              INTEGER NOT NULL UNIQUE,
  total_pool         NUMERIC NOT NULL DEFAULT 0,
  base_pool          NUMERIC NOT NULL DEFAULT 0,
  top_performer_pool NUMERIC NOT NULL DEFAULT 0,
  top_n              INTEGER NOT NULL DEFAULT 0,
  tx_hash            TEXT,
  distributed_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.round_distributions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read round_distributions"
  ON public.round_distributions FOR SELECT USING (true);
