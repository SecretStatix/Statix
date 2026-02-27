// Demo data for UI preview — only used when NEXT_PUBLIC_DEMO_MODE=true
//
// To remove demo mode: (1) Delete this file. (2) In lib/api.ts, remove the
// DEMO import and the 5 "if (DEMO) return ..." checks. (3) Remove
// NEXT_PUBLIC_DEMO_MODE from .env.local.

const DEMO_PLAYERS = [
  { index: 0, id: "shai-gilgeous-alexander", name: "Shai Gilgeous-Alexander", team: "OKC", symbol: "SGA", position: "G", avg_fantasy_points: 54.0, weekly_projection: 189.0, season_projection: 4428 },
  { index: 1, id: "giannis-antetokounmpo", name: "Giannis Antetokounmpo", team: "MIL", symbol: "ANTEG", position: "F", avg_fantasy_points: 57.6, weekly_projection: 201.7, season_projection: 4725 },
  { index: 2, id: "nikola-jokic", name: "Nikola Jokic", team: "DEN", symbol: "JOKIN", position: "C", avg_fantasy_points: 64.0, weekly_projection: 224.1, season_projection: 5248 },
  { index: 3, id: "luka-doncic", name: "Luka Doncic", team: "LAL", symbol: "DONCL", position: "G", avg_fantasy_points: 52.3, weekly_projection: 183.1, season_projection: 4289 },
  { index: 4, id: "jayson-tatum", name: "Jayson Tatum", team: "BOS", symbol: "TATUJ", position: "F", avg_fantasy_points: 48.7, weekly_projection: 170.5, season_projection: 3993 },
  { index: 5, id: "anthony-davis", name: "Anthony Davis", team: "LAL", symbol: "DAVIA", position: "F", avg_fantasy_points: 50.1, weekly_projection: 175.4, season_projection: 4108 },
  { index: 6, id: "kevin-durant", name: "Kevin Durant", team: "PHX", symbol: "DURK", position: "F", avg_fantasy_points: 43.2, weekly_projection: 151.2, season_projection: 3542 },
  { index: 7, id: "anthony-edwards", name: "Anthony Edwards", team: "MIN", symbol: "EDWAA", position: "G", avg_fantasy_points: 44.8, weekly_projection: 156.8, season_projection: 3674 },
  { index: 8, id: "tyrese-haliburton", name: "Tyrese Haliburton", team: "IND", symbol: "HALIT", position: "G", avg_fantasy_points: 42.5, weekly_projection: 148.8, season_projection: 3485 },
  { index: 9, id: "victor-wembanyama", name: "Victor Wembanyama", team: "SAS", symbol: "WEMBV", position: "C", avg_fantasy_points: 46.3, weekly_projection: 162.1, season_projection: 3797 },
  { index: 10, id: "devin-booker", name: "Devin Booker", team: "PHX", symbol: "BOOKD", position: "G", avg_fantasy_points: 39.8, weekly_projection: 139.3, season_projection: 3264 },
  { index: 11, id: "lamelo-ball", name: "LaMelo Ball", team: "CHA", symbol: "BALLL", position: "G", avg_fantasy_points: 41.2, weekly_projection: 144.2, season_projection: 3378 },
  { index: 12, id: "ja-morant", name: "Ja Morant", team: "MEM", symbol: "MORJ", position: "G", avg_fantasy_points: 40.5, weekly_projection: 141.8, season_projection: 3321 },
  { index: 13, id: "joel-embiid", name: "Joel Embiid", team: "PHI", symbol: "EMBIJ", position: "C", avg_fantasy_points: 51.4, weekly_projection: 179.9, season_projection: 4215 },
  { index: 14, id: "donovan-mitchell", name: "Donovan Mitchell", team: "CLE", symbol: "MITCD", position: "G", avg_fantasy_points: 38.6, weekly_projection: 135.1, season_projection: 3165 },
];

const DEMO_PRICES: Record<string, number> = {
  "shai-gilgeous-alexander": 12.45,
  "giannis-antetokounmpo": 13.20,
  "nikola-jokic": 15.80,
  "luka-doncic": 11.90,
  "jayson-tatum": 11.35,
  "anthony-davis": 12.10,
  "kevin-durant": 10.50,
  "anthony-edwards": 10.85,
  "tyrese-haliburton": 9.70,
  "victor-wembanyama": 11.15,
  "devin-booker": 9.40,
  "lamelo-ball": 9.65,
  "ja-morant": 9.55,
  "joel-embiid": 13.70,
  "donovan-mitchell": 9.20,
};

const DEMO_AVG_STATS: Record<string, Record<string, number>> = {
  "shai-gilgeous-alexander": { PTS: 31.2, REB: 5.5, AST: 6.1, STL: 2.0, BLK: 0.9, TOV: 2.8 },
  "giannis-antetokounmpo": { PTS: 31.5, REB: 11.8, AST: 5.7, STL: 1.2, BLK: 1.5, TOV: 3.4 },
  "nikola-jokic": { PTS: 26.3, REB: 12.4, AST: 9.8, STL: 1.4, BLK: 0.9, TOV: 3.2 },
  "luka-doncic": { PTS: 28.7, REB: 8.3, AST: 8.1, STL: 1.3, BLK: 0.5, TOV: 3.6 },
  "jayson-tatum": { PTS: 26.9, REB: 8.1, AST: 4.9, STL: 1.0, BLK: 0.7, TOV: 2.5 },
  "anthony-davis": { PTS: 24.8, REB: 12.5, AST: 3.5, STL: 1.3, BLK: 2.3, TOV: 2.1 },
  "kevin-durant": { PTS: 27.2, REB: 6.6, AST: 5.0, STL: 0.7, BLK: 1.4, TOV: 3.1 },
  "anthony-edwards": { PTS: 25.9, REB: 5.4, AST: 5.1, STL: 1.3, BLK: 0.5, TOV: 3.0 },
  "tyrese-haliburton": { PTS: 20.1, REB: 3.7, AST: 10.4, STL: 1.2, BLK: 0.4, TOV: 2.7 },
  "victor-wembanyama": { PTS: 22.8, REB: 10.6, AST: 3.9, STL: 1.2, BLK: 3.6, TOV: 2.5 },
  "devin-booker": { PTS: 27.1, REB: 4.5, AST: 6.9, STL: 0.9, BLK: 0.3, TOV: 2.6 },
  "lamelo-ball": { PTS: 23.3, REB: 5.1, AST: 8.0, STL: 1.4, BLK: 0.3, TOV: 3.1 },
  "ja-morant": { PTS: 25.1, REB: 5.6, AST: 8.1, STL: 0.9, BLK: 0.3, TOV: 3.4 },
  "joel-embiid": { PTS: 33.1, REB: 11.2, AST: 5.7, STL: 1.0, BLK: 1.7, TOV: 3.6 },
  "donovan-mitchell": { PTS: 26.6, REB: 4.6, AST: 5.1, STL: 1.5, BLK: 0.3, TOV: 2.9 },
};

const OPPONENTS = ["vs LAL", "@ BOS", "vs MIA", "@ GSW", "vs PHX", "@ CHI", "vs NYK", "@ DEN", "vs DAL", "@ MIL", "vs CLE", "@ ORL", "vs HOU", "@ SAC", "vs PHI", "@ TOR", "vs ATL", "@ MIN", "vs POR", "@ IND"];

function generateGameLog(playerId: string, numGames: number) {
  const stats = DEMO_AVG_STATS[playerId] || DEMO_AVG_STATS["shai-gilgeous-alexander"];
  const games = [];

  for (let i = 0; i < numGames; i++) {
    const dayOffset = (numGames - i) * 2 + Math.floor(Math.random() * 2);
    const d = new Date();
    d.setDate(d.getDate() - dayOffset);
    const date = `${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}`;

    const variance = () => 0.7 + Math.random() * 0.6;
    const gameStats: Record<string, number> = {
      PTS: Math.round(stats.PTS * variance()),
      REB: Math.round(stats.REB * variance()),
      AST: Math.round(stats.AST * variance()),
      STL: Math.round(stats.STL * variance() * 1.5),
      BLK: Math.round(stats.BLK * variance() * 1.5),
      TOV: Math.round(stats.TOV * variance()),
    };

    const fpts = gameStats.PTS + gameStats.REB * 1.2 + gameStats.AST * 1.5 + gameStats.STL * 3 + gameStats.BLK * 3 - gameStats.TOV;
    const win = Math.random() > 0.4;

    games.push({
      date,
      matchup: OPPONENTS[i % OPPONENTS.length],
      result: win ? "W" : "L",
      stats: gameStats,
      fantasy_points: Math.round(fpts * 10) / 10,
    });
  }

  return games;
}

export function getDemoPlayers() {
  return DEMO_PLAYERS.map(p => ({
    ...p,
    price: DEMO_PRICES[p.id] || 10,
    avg_stats: DEMO_AVG_STATS[p.id] || {},
  }));
}

export function getDemoPlayer(id: string) {
  const p = DEMO_PLAYERS.find(p => p.id === id);
  if (!p) return null;
  return {
    ...p,
    price: DEMO_PRICES[p.id] || 10,
    avg_stats: DEMO_AVG_STATS[p.id] || {},
  };
}

export function getDemoPlayerGames(id: string, lastN = 20) {
  return {
    player_id: id,
    games: generateGameLog(id, lastN),
  };
}

export function getDemoPlayerTransactions(playerIndex: number, limit = 10) {
  const sides = ["buy", "sell"] as const;
  const wallets = [
    "0x7a3b...4f2e", "0x9c1d...8e3f", "0x2f5a...1b7c", "0x6e8c...3d9a", "0x4b2e...7f1d",
    "0x1a2c...5e6f", "0x3b4d...7a8b", "0x5c6e...9d0e", "0x7d8e...1f2a", "0x9e0f...3b4c",
  ];
  const out: { wallet_address: string; player_index: number; side: string; shares: number; cost: number; tx_hash: string; created_at: string }[] = [];
  const now = new Date();
  for (let i = 0; i < limit; i++) {
    const side = sides[i % 2];
    const shares = 5 + Math.floor(Math.random() * 45);
    const cost = Math.round((shares * (9 + Math.random() * 4)) * 100) / 100;
    const d = new Date(now);
    d.setHours(d.getHours() - i * 8 - Math.floor(Math.random() * 24));
    out.push({
      wallet_address: wallets[i % wallets.length],
      player_index: playerIndex,
      side,
      shares,
      cost,
      tx_hash: `0x${Math.random().toString(16).slice(2, 10)}...${Math.random().toString(16).slice(2, 6)}`,
      created_at: d.toISOString(),
    });
  }
  return out.sort((a, b) => b.cost - a.cost).slice(0, limit);
}

export function getDemoLeaderboard() {
  return [
    { wallet_address: "0x7a3b...4f2e1234567890abcdef1234567890ab", total_earned: "342.50", weeks_claimed: 4 },
    { wallet_address: "0x9c1d...8e3f1234567890abcdef1234567890cd", total_earned: "285.20", weeks_claimed: 4 },
    { wallet_address: "0x2f5a...1b7c1234567890abcdef1234567890ef", total_earned: "198.75", weeks_claimed: 3 },
    { wallet_address: "0x6e8c...3d9a1234567890abcdef123456789012", total_earned: "156.30", weeks_claimed: 3 },
    { wallet_address: "0x4b2e...7f1d1234567890abcdef123456789034", total_earned: "124.80", weeks_claimed: 2 },
  ];
}
