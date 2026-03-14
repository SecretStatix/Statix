// API client for Statix backend
// Demo mode: when NEXT_PUBLIC_DEMO_MODE=true, returns mock data from lib/demo-data.ts

import { getDemoPlayers, getDemoPlayer, getDemoPlayerGames, getDemoPlayerTransactions, getDemoRecentTransactions, getDemoLeaderboard } from './demo-data';

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
  return fetchAPI("/api/players/");
}

export async function getPlayer(id: string) {
  if (DEMO) return getDemoPlayer(id);
  return fetchAPI(`/api/players/${id}`);
}

export async function getPlayerGames(id: string, lastN = 10) {
  if (DEMO) return getDemoPlayerGames(id, lastN);
  return fetchAPI(`/api/players/${id}/games?last_n=${lastN}`);
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

export async function logTransaction(
  walletAddress: string,
  playerIndex: number,
  side: string,
  shares: number,
  cost: number,
  txHash: string,
  playerName?: string
) {
  if (DEMO) return { success: true };
  return fetchAPI("/api/trading/log-transaction", {
    method: "POST",
    body: JSON.stringify({
      wallet_address: walletAddress,
      player_index: playerIndex,
      side,
      shares,
      cost,
      tx_hash: txHash,
      player_name: playerName,
    }),
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
