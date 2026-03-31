// Demo data for UI preview — only used when NEXT_PUBLIC_DEMO_MODE=true
//
// To remove demo mode: (1) Delete this file. (2) In lib/api.ts, remove the
// DEMO import and the 5 "if (DEMO) return ..." checks. (3) Remove
// NEXT_PUBLIC_DEMO_MODE from .env.local.
//
// These 15 players match indices 0-14 from players.json (2025-26 season).

const DEMO_PLAYERS = [
  { index: 0, id: "nikola_jokic", name: "Nikola Jokic", team: "DEN", symbol: "JOKIN", position: "C", nba_id: 203999, avg_fantasy_points: 64.0, weekly_projection: 224.0, season_projection: 5248 },
  { index: 1, id: "luka_doncic", name: "Luka Doncic", team: "LAL", symbol: "DONCL", position: "PG", nba_id: 1629029, avg_fantasy_points: 55.0, weekly_projection: 192.5, season_projection: 4510 },
  { index: 2, id: "shai_gilgeous_alexander", name: "Shai Gilgeous-Alexander", team: "OKC", symbol: "GILS", position: "PG", nba_id: 1628983, avg_fantasy_points: 54.0, weekly_projection: 189.0, season_projection: 4428 },
  { index: 3, id: "giannis_antetokounmpo", name: "Giannis Antetokounmpo", team: "MIL", symbol: "ANTEG", position: "PF", nba_id: 203507, avg_fantasy_points: 52.0, weekly_projection: 182.0, season_projection: 4264 },
  { index: 4, id: "victor_wembanyama", name: "Victor Wembanyama", team: "SAS", symbol: "WEMBV", position: "C", nba_id: 1641705, avg_fantasy_points: 50.0, weekly_projection: 175.0, season_projection: 4100 },
  { index: 5, id: "anthony_edwards", name: "Anthony Edwards", team: "MIN", symbol: "EDWAA", position: "SG", nba_id: 1630162, avg_fantasy_points: 46.0, weekly_projection: 161.0, season_projection: 3772 },
  { index: 6, id: "jaylen_brown", name: "Jaylen Brown", team: "BOS", symbol: "BROWJ", position: "SG", nba_id: 1627759, avg_fantasy_points: 44.0, weekly_projection: 154.0, season_projection: 3608 },
  { index: 7, id: "tyrese_maxey", name: "Tyrese Maxey", team: "PHI", symbol: "MAXET", position: "PG", nba_id: 1630178, avg_fantasy_points: 43.0, weekly_projection: 150.5, season_projection: 3526 },
  { index: 8, id: "donovan_mitchell", name: "Donovan Mitchell", team: "CLE", symbol: "MITCD", position: "SG", nba_id: 1628378, avg_fantasy_points: 42.0, weekly_projection: 147.0, season_projection: 3444 },
  { index: 9, id: "kevin_durant", name: "Kevin Durant", team: "HOU", symbol: "DURK", position: "SF", nba_id: 201142, avg_fantasy_points: 41.0, weekly_projection: 143.5, season_projection: 3362 },
  { index: 10, id: "jalen_brunson", name: "Jalen Brunson", team: "NYK", symbol: "BRUNJ", position: "PG", nba_id: 1628973, avg_fantasy_points: 40.5, weekly_projection: 141.8, season_projection: 3321 },
  { index: 11, id: "cade_cunningham", name: "Cade Cunningham", team: "DET", symbol: "CUNNC", position: "PG", nba_id: 1630595, avg_fantasy_points: 46.0, weekly_projection: 161.0, season_projection: 3772 },
  { index: 12, id: "jalen_johnson", name: "Jalen Johnson", team: "ATL", symbol: "JOHNJ", position: "PF", nba_id: 1630552, avg_fantasy_points: 42.0, weekly_projection: 147.0, season_projection: 3444 },
  { index: 13, id: "jayson_tatum", name: "Jayson Tatum", team: "BOS", symbol: "TATUJ", position: "SF", nba_id: 1628369, avg_fantasy_points: 44.0, weekly_projection: 154.0, season_projection: 3608 },
  { index: 14, id: "lebron_james", name: "LeBron James", team: "LAL", symbol: "JAMEL", position: "SF", nba_id: 2544, avg_fantasy_points: 42.0, weekly_projection: 147.0, season_projection: 3444 },
];

const DEMO_PRICES: Record<string, number> = {
  "nikola_jokic": 15.80,
  "luka_doncic": 14.20,
  "shai_gilgeous_alexander": 13.50,
  "giannis_antetokounmpo": 13.20,
  "victor_wembanyama": 12.80,
  "anthony_edwards": 11.90,
  "jaylen_brown": 11.50,
  "tyrese_maxey": 11.35,
  "donovan_mitchell": 10.85,
  "kevin_durant": 10.70,
  "jalen_brunson": 10.50,
  "cade_cunningham": 11.15,
  "jalen_johnson": 10.40,
  "jayson_tatum": 11.00,
  "lebron_james": 10.60,
};

const DEMO_AVG_STATS: Record<string, Record<string, number>> = {
  "nikola_jokic": { PTS: 28.0, REB: 12.6, AST: 10.5, STL: 1.4, BLK: 0.9, TOV: 3.2 },
  "luka_doncic": { PTS: 33.4, REB: 8.5, AST: 8.3, STL: 1.3, BLK: 0.5, TOV: 3.8 },
  "shai_gilgeous_alexander": { PTS: 31.5, REB: 5.5, AST: 6.1, STL: 2.0, BLK: 0.9, TOV: 2.8 },
  "giannis_antetokounmpo": { PTS: 27.6, REB: 9.8, AST: 5.4, STL: 1.2, BLK: 1.5, TOV: 3.4 },
  "victor_wembanyama": { PTS: 24.2, REB: 11.1, AST: 3.9, STL: 1.2, BLK: 3.8, TOV: 2.5 },
  "anthony_edwards": { PTS: 29.5, REB: 5.4, AST: 5.1, STL: 1.3, BLK: 0.5, TOV: 3.0 },
  "jaylen_brown": { PTS: 28.5, REB: 5.8, AST: 3.6, STL: 1.2, BLK: 0.5, TOV: 2.6 },
  "tyrese_maxey": { PTS: 29.0, REB: 3.8, AST: 6.2, STL: 1.0, BLK: 0.4, TOV: 2.4 },
  "donovan_mitchell": { PTS: 28.0, REB: 4.6, AST: 5.1, STL: 1.5, BLK: 0.3, TOV: 2.9 },
  "kevin_durant": { PTS: 26.0, REB: 6.6, AST: 5.0, STL: 0.7, BLK: 1.4, TOV: 3.1 },
  "jalen_brunson": { PTS: 26.1, REB: 3.5, AST: 7.4, STL: 0.9, BLK: 0.3, TOV: 2.5 },
  "cade_cunningham": { PTS: 25.7, REB: 5.7, AST: 9.7, STL: 1.1, BLK: 0.4, TOV: 3.2 },
  "jalen_johnson": { PTS: 22.5, REB: 9.2, AST: 5.5, STL: 1.2, BLK: 0.8, TOV: 2.3 },
  "jayson_tatum": { PTS: 26.5, REB: 8.1, AST: 4.9, STL: 1.0, BLK: 0.7, TOV: 2.5 },
  "lebron_james": { PTS: 23.5, REB: 7.5, AST: 8.0, STL: 1.0, BLK: 0.5, TOV: 3.2 },
};

const OPPONENTS = ["vs LAL", "@ BOS", "vs MIA", "@ GSW", "vs PHX", "@ CHI", "vs NYK", "@ DEN", "vs DAL", "@ MIL", "vs CLE", "@ ORL", "vs HOU", "@ SAC", "vs PHI", "@ TOR", "vs ATL", "@ MIN", "vs POR", "@ IND"];

function generateGameLog(playerId: string, numGames: number) {
  const stats = DEMO_AVG_STATS[playerId] || DEMO_AVG_STATS["nikola_jokic"];
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

export function getDemoRecentTransactions(limit = 15) {
  const sides = ["buy", "sell"] as const;
  const wallets = [
    "0x7a3b...4f2e", "0x9c1d...8e3f", "0x2f5a...1b7c", "0x6e8c...3d9a", "0x4b2e...7f1d",
    "0x1a2c...5e6f", "0x3b4d...7a8b", "0x5c6e...9d0e", "0x7d8e...1f2a", "0x9e0f...3b4c",
  ];
  const out: { wallet_address: string; player_index: number; player_name: string; side: string; shares: number; cost: number; tx_hash: string; created_at: string }[] = [];
  const now = new Date();
  for (let i = 0; i < limit; i++) {
    const player = DEMO_PLAYERS[Math.floor(Math.random() * DEMO_PLAYERS.length)];
    const side = sides[Math.floor(Math.random() * 2)];
    const shares = 1 + Math.floor(Math.random() * 30);
    const price = DEMO_PRICES[player.id] || 10;
    const cost = Math.round(shares * price * 100) / 100;
    const d = new Date(now);
    d.setMinutes(d.getMinutes() - i * 12 - Math.floor(Math.random() * 30));
    out.push({
      wallet_address: wallets[Math.floor(Math.random() * wallets.length)],
      player_index: player.index,
      player_name: player.name,
      side,
      shares,
      cost,
      tx_hash: `0x${Math.random().toString(16).slice(2, 10)}...${Math.random().toString(16).slice(2, 6)}`,
      created_at: d.toISOString(),
    });
  }
  return out;
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
