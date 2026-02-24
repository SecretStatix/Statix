// API client for Dividend Fantasy backend

const API_URL = process.env.NEXT_PUBLIC_API_URL || "https://claude-foundation-production.up.railway.app";

async function fetchAPI(path: string, options?: RequestInit) {
  const res = await fetch(`${API_URL}${path}`, {
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
  return fetchAPI("/api/players/");
}

export async function getPlayer(id: string) {
  return fetchAPI(`/api/players/${id}`);
}

export async function getPlayerGames(id: string, lastN = 10) {
  return fetchAPI(`/api/players/${id}/games?last_n=${lastN}`);
}

// Trading
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
  txHash: string
) {
  return fetchAPI("/api/trading/log-transaction", {
    method: "POST",
    body: JSON.stringify({
      wallet_address: walletAddress,
      player_index: playerIndex,
      side,
      shares,
      cost,
      tx_hash: txHash,
    }),
  });
}

// Dividends
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
  return fetchAPI("/api/dividends/leaderboard");
}
