/**
 * Weekly Dividend Distribution Script
 *
 * Usage:
 *   WEEK_START=2025-02-10 WEEK_END=2025-02-16 npx hardhat run scripts/distribute-dividends.js --network base-sepolia
 *
 * Steps:
 *   1. Fetches actual NBA stats for the week from backend API
 *   2. Submits performance data on-chain (setWeeklyPerformanceBatch)
 *   3. Distributes dividends (distributeDividends)
 *   4. Advances to next week (advanceWeek)
 */

const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:8000";
const ADMIN_KEY = process.env.ADMIN_KEY || "dev-admin-key";

async function main() {
  const deployments = JSON.parse(
    fs.readFileSync(path.join(__dirname, "..", "deployments.json"), "utf8")
  );

  const fantasyAddress = deployments.contracts.DividendFantasy;
  const fantasy = await hre.ethers.getContractAt("DividendFantasy", fantasyAddress);

  const currentWeek = await fantasy.currentWeek();
  console.log(`Current week: ${currentWeek}`);

  const weekStart = process.env.WEEK_START;
  const weekEnd = process.env.WEEK_END;

  if (!weekStart || !weekEnd) {
    console.error("Set WEEK_START and WEEK_END env vars (YYYY-MM-DD format)");
    console.error("Example: WEEK_START=2025-02-10 WEEK_END=2025-02-16 npm run distribute");
    process.exit(1);
  }

  // 1. Fetch stats from backend
  console.log(`\n1. Fetching NBA stats for ${weekStart} to ${weekEnd}...`);

  let onChainData;
  try {
    const res = await fetch(`${BACKEND_URL}/api/admin/update-weekly-stats`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${ADMIN_KEY}`,
      },
      body: JSON.stringify({
        week: Number(currentWeek),
        week_start: weekStart,
        week_end: weekEnd,
      }),
    });
    const data = await res.json();
    console.log(`   Players updated: ${data.players_updated}, Errors: ${data.errors}`);
    onChainData = data.on_chain_data;
  } catch (err) {
    console.error("Backend not available. Using mock data...");
    // Fallback: mock data for testing
    const players = deployments.players || [];
    onChainData = {
      player_indices: players.map((p) => p.index),
      actual_points_scaled: players.map((p) =>
        // Random actual between 80-120% of projection
        Math.round(p.weekly_projection * (0.8 + Math.random() * 0.4) * 1e6)
      ),
    };
    console.log(`   Using mock data for ${onChainData.player_indices.length} players`);
  }

  // 2. Submit performance on-chain
  console.log("\n2. Submitting performance data on-chain...");
  const setBatchTx = await fantasy.setWeeklyPerformanceBatch(
    onChainData.player_indices,
    onChainData.actual_points_scaled.map((v) => BigInt(v))
  );
  await setBatchTx.wait();
  console.log("   Performance set!");

  // 2b. Calculate top 30% outperformers off-chain and submit eligible list
  console.log("\n2b. Selecting top 30% outperformers...");
  const outperformers = [];
  for (let i = 0; i < onChainData.player_indices.length; i++) {
    const idx = onChainData.player_indices[i];
    const player = deployments.players.find((p) => p.index === idx);
    if (!player) continue;
    const weeklyProj = player.season_projection / 17;
    const actual = onChainData.actual_points_scaled[i] / 1e6;
    if (weeklyProj > 0 && actual > weeklyProj) {
      outperformers.push({ index: idx, outperf: (actual - weeklyProj) / weeklyProj });
    }
  }

  // Sort descending by outperformance, take top 30%
  outperformers.sort((a, b) => b.outperf - a.outperf);
  const top30Count = Math.max(1, Math.ceil(outperformers.length * 0.3));
  const eligible = outperformers.slice(0, top30Count);

  console.log(`   ${outperformers.length} outperformers total, top ${top30Count} eligible:`);
  eligible.forEach((e) => console.log(`     Player #${e.index}: +${(e.outperf * 100).toFixed(1)}%`));

  const eligibleTx = await fantasy.setOutperformerEligible(eligible.map((e) => e.index));
  await eligibleTx.wait();
  console.log("   Eligible list submitted on-chain!");

  // 3. Check if there are fees to distribute
  const totalFees = await fantasy.totalWeeklyFees();
  console.log(`\n3. Total weekly fees: ${hre.ethers.formatUnits(totalFees, 6)} USDC`);

  if (totalFees === 0n) {
    console.log("   No fees to distribute. Users need to trade first!");
    console.log("   Skipping distribution and week advance.");
    return;
  }

  // 4. Distribute dividends
  console.log("\n4. Distributing dividends...");
  const distTx = await fantasy.distributeDividends();
  await distTx.wait();
  console.log("   Dividends distributed!");

  // 5. Advance week
  console.log("\n5. Advancing to next week...");
  const advanceTx = await fantasy.advanceWeek();
  await advanceTx.wait();
  const newWeek = await fantasy.currentWeek();
  console.log(`   Now on week ${newWeek}`);

  console.log("\nDone! Users can now claim their dividends for week " + currentWeek);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
