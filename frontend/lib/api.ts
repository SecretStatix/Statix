// API client for Statix backend
// Demo mode: when NEXT_PUBLIC_DEMO_MODE=true, returns mock data from lib/demo-data.ts

import { getDemoPlayers, getDemoPlayer, getDemoPlayerGames, getDemoPlayerPriceHistory, getDemoPlayerTransactions, getDemoRecentTransactions, getDemoLeaderboard } from './demo-data';

const DEMO = process.env.NEXT_PUBLIC_DEMO_MODE === 'true'; // Remove this + 5 checks to disable demo

async function fetchAPI(path: string, options?: RequestInit) {
  const res = await fetch(path, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options?.headers,
    },
  });
  if (!res.ok) {
    throw new Error(`API error: ${res.status} ${res.statusText}`);
  }
  return res.json();
}

// Players
export async function getPlayers() {
  if (DEMO) return getDemoPlayers();
  // No trailing slash — Next.js 308-redirects `/api/players/` to `/api/players`,
  // costing an extra ~100ms round-trip on every market load.
  return fetchAPI("/api/players");
}

export async function getPlayer(id: string) {
  if (DEMO) return getDemoPlayer(id);
  return fetchAPI(`/api/players/${id}`);
}

export async function getPlayerGames(id: string, lastN = 10) {
  if (DEMO) return getDemoPlayerGames(id, lastN);
  return fetchAPI(`/api/players/${id}/games?last_n=${lastN}`);
}

export async function getPlayerPriceHistory(id: string, days = 90) {
  if (DEMO) return getDemoPlayerPriceHistory(id, days);
  return fetchAPI(`/api/players/${id}/price-history?days=${days}`);
}

export async function getPlayerTransactions(playerIndex: number, limit = 10, days = 7) {
  if (DEMO) return getDemoPlayerTransactions(playerIndex, limit);
  return fetchAPI(`/api/trading/transactions?player_index=${playerIndex}&limit=${limit}&days=${days}`);
}

// Recent transactions (activity feed)
export async function getRecentTransactions(limit = 15) {
  if (DEMO) return getDemoRecentTransactions(limit);
  return fetchAPI(`/api/trading/transactions/recent?limit=${limit}`);
}

// Teams with NBA games scheduled today (cached 30m on backend)
export async function getGamesToday(): Promise<{ date: string; teams: string[] }> {
  if (DEMO) return { date: new Date().toISOString().slice(0, 10), teams: [] };
  try {
    return await fetchAPI(`/api/players/games-today`);
  } catch {
    return { date: '', teams: [] };
  }
}

// Trading (contracts/quote: optional fallbacks; frontend uses on-chain reads via useContracts)
export async function getContracts() {
  return fetchAPI("/api/trading/contracts");
}

export async function getQuote(playerIndex: number, shares: number, side: "buy" | "sell") {
  return fetchAPI("/api/trading/quote", {
    method: "POST",
    body: JSON.stringify({ player_index: playerIndex, shares, side }),
  });
}

// Dividends (used by dividends page; leaderboard uses getLeaderboard)
export async function getDividendConfig() {
  return fetchAPI("/api/dividends/config");
}

export async function getWeekDividends(week: number) {
  return fetchAPI(`/api/dividends/week/${week}`);
}

export async function getUserDividends(walletAddress: string) {
  return fetchAPI(`/api/dividends/user/${walletAddress}`);
}

export async function getLeaderboard() {
  if (DEMO) return getDemoLeaderboard();
  return fetchAPI("/api/dividends/leaderboard");
}

export type PortfolioSnapshotPoint = {
  snapshot_at: string;
  net_worth: number;
  cash_dbucks: number;
  positions_value: number;
};

export type PortfolioSnapshotsResponse = {
  wallet_address: string;
  days: number;
  source: string;
  points: PortfolioSnapshotPoint[];
};

/** Hourly NAV history from Supabase (backend `wallet_portfolio_snapshots`). */
export async function getPortfolioSnapshots(wallet: string, days: number) {
  if (DEMO) {
    return {
      wallet_address: wallet.toLowerCase(),
      days,
      source: "none" as const,
      points: [] as PortfolioSnapshotPoint[],
    };
  }
  const q = new URLSearchParams({ wallet, days: String(days) });
  return fetchAPI(`/api/trading/portfolio-snapshots?${q}`) as Promise<PortfolioSnapshotsResponse>;
}
