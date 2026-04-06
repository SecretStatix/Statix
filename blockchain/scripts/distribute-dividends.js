/**
 * Weekly Dividend Distribution Script
 *
 * Usage:
 *   WEEK_START=2025-02-10 WEEK_END=2025-02-16 npx hardhat run scripts/distribute-dividends.js --network base-sepolia
 *
 * Steps:
 *   1. Fetches actual NBA fantasy points from backend API (aborts if unavailable)
 *   2. Pauses trading via Router
 *   3. Submits actual FPts on-chain, selects top 10 by absolute fantasy points
 *   4. Checks Hub balance
 *   5. Distributes dividends via DividendHub
 *   6. Advances to next week, unpauses trading
 */
const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:8000";
const ADMIN_KEY = process.env.ADMIN_KEY;
if (!ADMIN_KEY) {
  console.error("ADMIN_KEY env var is required");
  process.exit(1);
}

async function main() {
  const deployments = JSON.parse(
    fs.readFileSync(path.join(__dirname, "..", "deployments.json"), "utf8")
  );

  // New architecture: Router for pause/unpause, Hub for dividends
  const routerAddress = deployments.contracts.StatixRouter;
  const hubAddress = deployments.contracts.DividendHub;

  const router = await hre.ethers.getContractAt("StatixRouter", routerAddress);
  const hub = await hre.ethers.getContractAt("DividendHub", hubAddress);
  const factoryAddress = deployments.contracts.PoolFactory;
  const factory = await hre.ethers.getContractAt("PoolFactory", factoryAddress);

  const currentWeek = await hub.currentWeek();
  console.log(`Current week: ${currentWeek}`);

  const weekStart = process.env.WEEK_START;
  const weekEnd = process.env.WEEK_END;

  if (!weekStart || !weekEnd) {
    console.error("Set WEEK_START and WEEK_END env vars (YYYY-MM-DD format)");
    console.error(`Example: WEEK_START=2025-02-10 WEEK_END=2025-02-16 npm run distribute:local`);
    console.error(`\nCurrent week on-chain: ${currentWeek}`);
    process.exit(1);
  }

  const startDate = new Date(weekStart + "T00:00:00Z");
  const endDate = new Date(weekEnd + "T00:00:00Z");
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  if (isNaN(startDate) || isNaN(endDate)) {
    console.error("Invalid date format. Use YYYY-MM-DD.");
    process.exit(1);
  }

  if (startDate.getUTCDay() !== 1) {
    console.error(`WEEK_START (${weekStart}) is not a Monday (day=${startDate.getUTCDay()}).`);
    process.exit(1);
  }

  if (endDate.getUTCDay() !== 0) {
    console.error(`WEEK_END (${weekEnd}) is not a Sunday (day=${endDate.getUTCDay()}).`);
    process.exit(1);
  }

  const diffDays = (endDate - startDate) / (1000 * 60 * 60 * 24);
  if (diffDays !== 6) {
    console.error(`WEEK_START to WEEK_END must be exactly 6 days apart (Mon–Sun), got ${diffDays}.`);
    process.exit(1);
  }

  if (endDate >= today) {
    console.error(`WEEK_END (${weekEnd}) has not passed yet. Wait until the week is over to distribute.`);
    process.exit(1);
  }

  // 1. Fetch stats from backend (before any on-chain state changes)
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
    if (!res.ok) {
      throw new Error(`Backend returned ${res.status}: ${await res.text()}`);
    }
    const data = await res.json();
    if (!data.on_chain_data || !data.on_chain_data.player_indices?.length) {
      throw new Error("Backend returned empty on_chain_data");
    }
    console.log(`   Players updated: ${data.players_updated}, Errors: ${data.errors}`);
    onChainData = data.on_chain_data;
  } catch (err) {
    console.error(`\nFATAL: Could not fetch stats from backend — aborting.`);
    console.error(`   ${err.message}`);
    console.error(`   No on-chain state was modified. Safe to retry.`);
    process.exit(1);
  }

  // 2. Pause trading via Router (only after data is confirmed)
  console.log("\n2. Pausing trading...");
  const pauseTx = await router.setTradingPaused(true);
  await pauseTx.wait();
  console.log("   Trading paused.");

  try {
    // 3. Submit actual fantasy points on-chain
    console.log("\n3a. Submitting actual fantasy points on-chain...");
    const setBatchTx = await hub.setWeeklyPerformanceBatch(
      onChainData.player_indices.map((i) => BigInt(i)),
      onChainData.actual_points_scaled.map((v) => BigInt(v))
    );
    await setBatchTx.wait();
    console.log("   Fantasy points set!");

    // 3b. Rank all players by absolute fantasy points, select top N
    const TOP_N = 10;
    console.log(`\n3b. Selecting top ${TOP_N} performers by absolute fantasy points...`);
    const players = [];
    for (let i = 0; i < onChainData.player_indices.length; i++) {
      const idx = onChainData.player_indices[i];
      const fpts = BigInt(onChainData.actual_points_scaled[i]);
      if (fpts > 0n) {
        players.push({ index: idx, fpts });
      }
    }

    players.sort((a, b) => (a.fpts < b.fpts ? 1 : a.fpts > b.fpts ? -1 : 0));
    const eligible = players.slice(0, TOP_N);

    console.log(`   ${players.length} active players, top ${eligible.length} eligible:`);
    eligible.forEach((e, rank) =>
      console.log(`     #${rank + 1} Player #${e.index}: ${hre.ethers.formatUnits(e.fpts, 6)} FPts`)
    );

    const eligibleTx = await hub.setTopPerformerEligible(eligible.map((e) => e.index));
    await eligibleTx.wait();
    console.log("   Top performers submitted on-chain!");

    // 4. Check Hub balance (accumulated fees from pools)
    const dbucksAddress = deployments.contracts.DBucks;
    const dbucks = await hre.ethers.getContractAt("DBucks", dbucksAddress);
    const hubBalance = await dbucks.balanceOf(hubAddress);
    console.log(`\n4. Hub balance (accumulated fees): ${hre.ethers.formatUnits(hubBalance, 6)} D-Bucks`);

    if (hubBalance === 0n) {
      console.log("   No fees to distribute. Users need to trade first!");
      console.log("   Skipping distribution and week advance. Unpausing trading.");
      const unpauseTx = await router.setTradingPaused(false);
      await unpauseTx.wait();
      console.log("   Trading unpaused.");
      return;
    }

    // 5. Distribute dividends via Hub
    console.log("\n5. Distributing dividends...");
    const distTx = await hub.distributeDividends();
    await distTx.wait();
    console.log("   Dividends distributed!");

    // 6. Advance week via Hub, unpause trading via Router
    console.log("\n6. Advancing to next week...");
    const advanceTx = await hub.advanceWeek();
    await advanceTx.wait();
    const newWeek = await hub.currentWeek();
    console.log(`   Now on week ${newWeek}`);

    // Unpause trading
    const unpauseTx = await router.setTradingPaused(false);
    await unpauseTx.wait();
    console.log("   Trading unpaused.");

    console.log("\nDone! Users can now claim their dividends for week " + currentWeek);
    console.log(`  Claim via: hub.claimDividend(${currentWeek})`);
  } catch (error) {
    console.error("\nError during distribution:", error.message);
    console.log("Attempting to unpause trading...");
    try {
      const unpauseTx = await router.setTradingPaused(false);
      await unpauseTx.wait();
      console.log("Trading unpaused after error.");
    } catch (e) {
      console.error("CRITICAL: Failed to unpause trading! Manual intervention needed.");
    }
    throw error;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
