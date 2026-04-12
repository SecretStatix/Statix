/**
 * Playoff Round Dividend Distribution Script
 *
 * Usage:
 *   TOP_N=10 ROUND_START=2025-04-19 ROUND_END=2025-04-28 \
 *     npx hardhat run scripts/distribute-dividends.js --network base-sepolia
 *
 * TOP_N values per round:
 *   Round 1 (16 teams): 10
 *   Round 2 (8 teams):  5
 *   Conf Finals (4):    3
 *   NBA Finals (2):     2
 *
 * Steps:
 *   1. Fetch per-game avg FPts from backend for the round window
 *   2. Pause trading via Router
 *   3. Submit avg FPts on-chain, mark top-N eligible
 *   4. Snapshot all user holdings for the current round
 *   5. Check Hub balance
 *   6. Distribute dividends via DividendHub
 *   7. Advance to next round, unpause trading
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

const TOP_N = parseInt(process.env.TOP_N || "10");
if (![2, 3, 5, 10].includes(TOP_N)) {
  console.error(`TOP_N must be 2, 3, 5, or 10 (got ${TOP_N})`);
  process.exit(1);
}

async function main() {
  const deployments = JSON.parse(
    fs.readFileSync(path.join(__dirname, "..", "deployments.json"), "utf8")
  );

  const routerAddress = deployments.contracts.StatixRouter;
  const hubAddress = deployments.contracts.DividendHub;
  const factoryAddress = deployments.contracts.PoolFactory;

  const router = await hre.ethers.getContractAt("StatixRouter", routerAddress);
  const hub = await hre.ethers.getContractAt("DividendHub", hubAddress);
  const factory = await hre.ethers.getContractAt("PoolFactory", factoryAddress);

  const currentRound = await hub.currentRound();
  console.log(`Current round: ${currentRound}`);

  const roundStart = process.env.ROUND_START;
  const roundEnd = process.env.ROUND_END;

  if (!roundStart || !roundEnd) {
    console.error("Set ROUND_START and ROUND_END env vars (YYYY-MM-DD format)");
    console.error(`Example: TOP_N=10 ROUND_START=2025-04-19 ROUND_END=2025-04-28 npm run distribute:sepolia`);
    console.error(`\nCurrent round on-chain: ${currentRound}`);
    process.exit(1);
  }

  const endDate = new Date(roundEnd + "T00:00:00Z");
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  if (endDate >= today) {
    console.error(`ROUND_END (${roundEnd}) has not passed yet. Wait until the round is over to distribute.`);
    process.exit(1);
  }

  // 1. Fetch stats from backend (before any on-chain state changes)
  console.log(`\n1. Fetching NBA stats for round ${currentRound} (${roundStart} to ${roundEnd})...`);

  let onChainData;
  try {
    const res = await fetch(`${BACKEND_URL}/api/admin/update-round-stats`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${ADMIN_KEY}`,
      },
      body: JSON.stringify({
        round: Number(currentRound),
        round_start: roundStart,
        round_end: roundEnd,
        top_n: TOP_N,
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

  // 2. Pause trading via Router
  console.log("\n2. Pausing trading...");
  const pauseTx = await router.setTradingPaused(true);
  await pauseTx.wait();
  console.log("   Trading paused.");

  try {
    // 3a. Submit per-game avg FPts on-chain
    console.log("\n3a. Submitting per-game avg FPts on-chain...");
    const setBatchTx = await hub.setRoundPerformanceBatch(
      onChainData.player_indices.map((i) => BigInt(i)),
      onChainData.avg_fpts_scaled.map((v) => BigInt(v))
    );
    await setBatchTx.wait();
    console.log("   Avg FPts set!");

    // 3b. Rank by avg FPts, select top N
    console.log(`\n3b. Selecting top ${TOP_N} performers by avg FPts...`);
    const players = [];
    for (let i = 0; i < onChainData.player_indices.length; i++) {
      const idx = onChainData.player_indices[i];
      const fpts = BigInt(onChainData.avg_fpts_scaled[i]);
      const gamesPlayed = onChainData.games_played?.[i] ?? 999;
      if (fpts > 0n && gamesPlayed >= 1) {
        players.push({ index: idx, fpts });
      }
    }

    players.sort((a, b) => (a.fpts < b.fpts ? 1 : a.fpts > b.fpts ? -1 : 0));
    const eligible = players.slice(0, TOP_N);

    console.log(`   ${players.length} qualifying players (min 2 GP), top ${eligible.length} eligible:`);
    eligible.forEach((e, rank) =>
      console.log(`     #${rank + 1} Pool #${e.index}: ${hre.ethers.formatUnits(e.fpts, 6)} FPts/G`)
    );

    const eligibleTx = await hub.setTopPerformerEligible(eligible.map((e) => BigInt(e.index)));
    await eligibleTx.wait();
    console.log("   Top performers submitted on-chain!");

    // 4. Snapshot all user holdings for this round
    console.log("\n4. Snapshotting user holdings...");
    const poolCount = await factory.poolCount();
    const allPoolIdxs = Array.from({ length: Number(poolCount) }, (_, i) => BigInt(i));

    // Collect active users from deployments or env
    const usersFile = path.join(__dirname, "..", "active-users.json");
    let activeUsers = [];
    if (fs.existsSync(usersFile)) {
      activeUsers = JSON.parse(fs.readFileSync(usersFile, "utf8"));
    } else if (process.env.SNAPSHOT_USERS) {
      activeUsers = process.env.SNAPSHOT_USERS.split(",").map(u => u.trim());
    }

    if (activeUsers.length === 0) {
      console.log("   WARNING: No active users to snapshot (create active-users.json or set SNAPSHOT_USERS env).");
    } else {
      console.log(`   Snapshotting ${activeUsers.length} users across ${poolCount} pools...`);
      for (const user of activeUsers) {
        const snapTx = await hub.snapshotUserHoldings(user, allPoolIdxs);
        await snapTx.wait();
        process.stdout.write(".");
      }
      console.log("\n   Snapshots complete!");
    }

    // 5. Check Hub balance
    const dbucksAddress = deployments.contracts.DBucks;
    const dbucks = await hre.ethers.getContractAt("DBucks", dbucksAddress);
    const hubBalance = await dbucks.balanceOf(hubAddress);
    console.log(`\n5. Hub balance (accumulated fees): ${hre.ethers.formatUnits(hubBalance, 6)} V-Bucks`);

    if (hubBalance === 0n) {
      console.log("   No fees to distribute. Users need to trade first!");
      console.log("   Skipping distribution and round advance. Unpausing trading.");
      const unpauseTx = await router.setTradingPaused(false);
      await unpauseTx.wait();
      console.log("   Trading unpaused.");
      return;
    }

    // 6. Distribute dividends
    console.log(`\n6. Distributing dividends (top ${TOP_N})...`);
    const distTx = await hub.distributeDividends(BigInt(TOP_N));
    await distTx.wait();
    console.log("   Dividends distributed!");

    // 7. Advance round, unpause trading
    console.log("\n7. Advancing to next round...");
    const advanceTx = await hub.advanceRound();
    await advanceTx.wait();
    const newRound = await hub.currentRound();
    console.log(`   Now on round ${newRound}`);

    const unpauseTx = await router.setTradingPaused(false);
    await unpauseTx.wait();
    console.log("   Trading unpaused.");

    console.log(`\nDone! Users can now claim their dividends for round ${currentRound}`);
    console.log(`  Claim via: hub.claimDividend(${currentRound})`);
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
