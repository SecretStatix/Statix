/**
 * Generates players.json from the NBA API cache for deployment.
 * Run: node scripts/generate-players.js
 *
 * NOTE: For the MVP, players.json is manually curated (50 hand-picked players).
 * This script is a convenience tool for regenerating from cache when needed.
 * The canonical players.json should be reviewed before deployment.
 */
const fs = require("fs");
const path = require("path");

/**
 * Normalize unicode to ASCII and generate a clean underscore-separated ID.
 * Must match backend/nba_stats.py generate_player_id() exactly.
 */
function generatePlayerId(name) {
  const ascii = name.normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
  return ascii.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
}

function generateSymbol(name) {
  const parts = name.split(" ");
  const firstName = parts[0];
  const lastName = parts[parts.length - 1];
  return (lastName.slice(0, 4) + firstName[0]).toUpperCase().replace(/[^A-Z]/g, "");
}

const cachePath = path.join(__dirname, "..", "..", "backend", "player_cache.json");
const outputPath = path.join(__dirname, "players.json");

if (!fs.existsSync(cachePath)) {
  console.error("Run the NBA stats fetcher first: cd ../backend && python3 nba_stats.py");
  process.exit(1);
}

const cache = JSON.parse(fs.readFileSync(cachePath, "utf8"));
const players = cache.players.map((p) => ({
  id: generatePlayerId(p.name),
  nba_id: p.nba_id,
  name: p.name,
  team: p.team,
  position: p.position || "F",
  symbol: generateSymbol(p.name),
  avg_fantasy_points: p.avg_fantasy_points,
  weekly_projection: p.weekly_projection,
  season_projection: p.season_projection,
  avg_stats: p.avg_stats,
}));

fs.writeFileSync(outputPath, JSON.stringify(players, null, 2));
console.log(`Generated ${players.length} players -> ${outputPath}`);
players.forEach((p, i) => {
  console.log(`  ${i + 1}. ${p.name} (${p.id}) [${p.symbol}] - Weekly: ${p.weekly_projection}`);
});
