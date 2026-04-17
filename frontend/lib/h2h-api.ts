// H2H API client — thin wrapper over /api/h2h/*.
// Kept fully separate from lib/api.ts so the core AMM surface is untouched.

export type MarketStatus = 'open' | 'resolved' | 'voided';
export type Side = 'A' | 'B';
export type Winner = 'A' | 'B' | 'void';

export interface PlayerRef {
  id: string;
  nba_id: number;
  name: string;
  team: string;
}

export interface MarketSummary {
  id: number;
  fpmm_address: string;
  status: MarketStatus;
  tip_off_at: string;
  player_a: PlayerRef;
  player_b: PlayerRef;
  implied_prob_a: number;
  total_volume: number;
  winner?: Winner | null;
}

export interface MarketDetail extends MarketSummary {
  condition_id: string;
  question_id: string;
  position_id_a: string;
  position_id_b: string;
  player_a_final_fp?: number | null;
  player_b_final_fp?: number | null;
  resolved_at?: string | null;
}

export interface LiveScore {
  captured_at: string;
  game_clock?: string | null;
  game_status?: string | null;
  player_a_fp?: number | null;
  player_a_minutes?: number | null;
  player_b_fp?: number | null;
  player_b_minutes?: number | null;
}

export interface TradeRecord {
  id: number;
  market_id: number;
  wallet_address: string;
  side: Side;
  action: 'buy' | 'sell';
  shares: number;
  cost_dbucks: number;
  price_per_share: number;
  tx_hash: string;
  created_at: string;
}

export interface UserPosition {
  market_id: number;
  shares_a: number;
  shares_b: number;
  avg_price_a?: number | null;
  avg_price_b?: number | null;
  redeemable: boolean;
}

export interface LPMetricsRow {
  market_id: number;
  player_a_name: string;
  player_b_name: string;
  status: string;
  tip_off_at: string;
  resolved_at: string | null;
  seed_collateral: number | null;
  fees_collected: number | null;
  total_volume: number | null;
  lp_pnl: number | null;
  lp_return_pct: number | null;
  effective_fee_rate: number | null;
  final_pool_skew: number | null;
}

async function fetchJson<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) },
  });
  if (!res.ok) throw new Error(`H2H API error: ${res.status} ${res.statusText}`);
  return res.json();
}

export async function listMarkets(status?: MarketStatus): Promise<MarketSummary[]> {
  const qs = status ? `?status=${status}` : '';
  return fetchJson<MarketSummary[]>(`/api/h2h/markets${qs}`);
}

export async function getMarket(id: number): Promise<MarketDetail> {
  return fetchJson<MarketDetail>(`/api/h2h/markets/${id}`);
}

export async function getMarketTrades(id: number, limit = 50): Promise<TradeRecord[]> {
  return fetchJson<TradeRecord[]>(`/api/h2h/markets/${id}/trades?limit=${limit}`);
}

export async function getMarketLive(id: number): Promise<LiveScore | null> {
  return fetchJson<LiveScore | null>(`/api/h2h/markets/${id}/live`);
}

export async function getUserPositions(wallet: string): Promise<UserPosition[]> {
  return fetchJson<UserPosition[]>(`/api/h2h/users/${wallet}/positions`);
}

export async function getLPMetrics(): Promise<LPMetricsRow[]> {
  return fetchJson<LPMetricsRow[]>(`/api/h2h/admin/lp-metrics`);
}
