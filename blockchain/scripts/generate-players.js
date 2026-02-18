/**
 * Generates players.json from the NBA API cache for deployment.
 * Run: node scripts/generate-players.js
 */
const fs = require("fs");
const path = require("path");

const cachePath = path.join(__dirname, "..", "..", "backend", "player_cache.json");
const outputPath = path.join(__dirname, "players.json");

if (!fs.existsSync(cachePath)) {
  console.error("Run the NBA stats fetcher first: cd ../backend && python3 nba_stats.py");
  process.exit(1);
}

const cache = JSON.parse(fs.readFileSync(cachePath, "utf8"));
const players = cache.players.map((p) => {
  // Generate token symbol from name (first 3 chars of last name + first initial)
  const parts = p.name.split(" ");
  const firstName = parts[0];
  const lastName = parts[parts.length - 1];
  const symbol = (lastName.slice(0, 4) + firstName[0]).toUpperCase().replace(/[^A-Z]/g, "");

  // Generate clean ID
  const id = p.name.toLowerCase().replace(/[^a-z0-9]/g, "_").replace(/_+/g, "_");

  return {
    id: id,
    nba_id: p.nba_id,
    name: p.name,
    team: p.team,
    position: p.position || "F",
    symbol: symbol,
    avg_fantasy_points: p.avg_fantasy_points,
    weekly_projection: p.weekly_projection,
    season_projection: p.season_projection,
    avg_stats: p.avg_stats,
  };
});

fs.writeFileSync(outputPath, JSON.stringify(players, null, 2));
console.log(`Generated ${players.length} players -> ${outputPath}`);
players.forEach((p, i) => {
  console.log(`  ${i + 1}. ${p.name} (${p.symbol}) - Weekly: ${p.weekly_projection}`);
});
