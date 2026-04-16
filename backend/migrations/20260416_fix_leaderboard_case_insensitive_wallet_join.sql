-- Fix: leaderboard function wallet join was case-sensitive.
-- profiles.wallet_address stores checksummed mixed-case (0x3bFB...)
-- wallet_portfolio_snapshots stores lowercase (0x3bfb...)
-- Solution: LOWER(p.wallet_address) in the join so usernames resolve correctly.

DROP FUNCTION IF EXISTS get_dividend_leaderboard();

CREATE FUNCTION get_dividend_leaderboard()
RETURNS TABLE (
  wallet_address TEXT,
  display_name   TEXT,
  portfolio_value NUMERIC,
  total_earned   NUMERIC,
  weeks_claimed  BIGINT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT
    s.w                AS wallet_address,
    COALESCE(
      NULLIF(TRIM(p.username), ''),
      LEFT(s.w, 6) || '…' || RIGHT(s.w, 4)
    )                  AS display_name,
    s.net_worth        AS portfolio_value,
    COALESCE(dc.total_earned, 0)  AS total_earned,
    COALESCE(dc.weeks_claimed, 0) AS weeks_claimed
  FROM (
    SELECT DISTINCT ON (wallet_address)
      wallet_address AS w,
      net_worth
    FROM public.wallet_portfolio_snapshots
    ORDER BY wallet_address, snapshot_at DESC
  ) s
  LEFT JOIN public.profiles p ON LOWER(p.wallet_address) = s.w
  LEFT JOIN (
    SELECT wallet_address AS w, SUM(amount) AS total_earned, COUNT(*) AS weeks_claimed
    FROM public.dividend_claims
    GROUP BY wallet_address
  ) dc ON dc.w = s.w
  ORDER BY s.net_worth DESC
  LIMIT 50;
$$;
