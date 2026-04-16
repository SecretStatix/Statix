/**
 * TEST DISTRIBUTION — fake performance data, no backend needed.
 *
 * Fake FPts (avg per game, scaled 1e6):
 *   #1 Victor Wembanyama  (pool  3): 48 FPts
 *   #2 Dylan Harper       (pool  5): 41 FPts
 *   #3 Cade Cunningham    (pool 23): 36 FPts
 *   #4 Filler             (pool 12): 22 FPts
 *   #5 Filler             (pool 14): 19 FPts
 *
 * Top-N = 5 for this test.
 * Active users read from blockchain/active-users.json.
 *
 * Usage:
 *   npx hardhat run scripts/admin/test-distribute.js --network base-sepolia
 */
const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

const deployments = JSON.parse(
  fs.readFileSync(path.join(__dirname, "..", "..", "deployments.json"), "utf8")
);

const SCALE = 10n ** 6n;

// Fake performance data
const PERF = [
  { index: 3,  avgFpts: 48n * SCALE },  // Wembanyama   — #1
  { index: 5,  avgFpts: 41n * SCALE },  // Dylan Harper — #2
  { index: 23, avgFpts: 36n * SCALE },  // Cade Cunningham — #3
  { index: 12, avgFpts: 22n * SCALE },  // filler #4
  { index: 14, avgFpts: 19n * SCALE },  // filler #5
];

// Top-5 eligible
const TOP_N = 5;
const TOP_ELIGIBLE = [3, 5, 23, 12, 14];

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  console.log("Deployer:", await deployer.getAddress());

  const router  = await hre.ethers.getContractAt("StatixRouter",  deployments.contracts.StatixRouter);
  const hub     = await hre.ethers.getContractAt("DividendHub",   deployments.contracts.DividendHub);
  const factory = await hre.ethers.getContractAt("PoolFactory",   deployments.contracts.PoolFactory);
  const dbucks  = await hre.ethers.getContractAt("DBucks",        deployments.contracts.DBucks);

  const currentRound = await hub.currentRound();
  console.log(`\nCurrent on-chain round: ${currentRound}`);

  // Load active users
  const usersFile = path.join(__dirname, "..", "..", "active-users.json");
  const activeUsers = JSON.parse(fs.readFileSync(usersFile, "utf8"));
  console.log(`Active users: ${activeUsers.join(", ")}`);

  const hubBalance = await dbucks.balanceOf(deployments.contracts.DividendHub);
  console.log(`Hub balance: ${hre.ethers.formatUnits(hubBalance, 6)} V-Bucks`);
  if (hubBalance === 0n) {
    console.error("Hub has no balance — users need to trade first.");
    process.exit(1);
  }

  // 1. Pause trading
  console.log("\n1. Pausing trading...");
  await (await router.setTradingPaused(true)).wait();
  console.log("   Paused.");

  try {
    // 2. Submit fake avg FPts on-chain
    console.log("\n2. Submitting fake avg FPts...");
    await (await hub.setRoundPerformanceBatch(
      PERF.map(p => BigInt(p.index)),
      PERF.map(p => p.avgFpts)
    )).wait();
    console.log(`   Submitted ${PERF.length} player performances.`);

    // 3. Mark top-N eligible
    console.log(`\n3. Marking top ${TOP_N} eligible: pools ${TOP_ELIGIBLE.join(", ")}...`);
    await (await hub.setTopPerformerEligible(TOP_ELIGIBLE.map(BigInt))).wait();
    console.log("   Top performers marked.");

    // 4. Snapshot user holdings
    const poolCount = await factory.poolCount();
    const allPoolIdxs = Array.from({ length: Number(poolCount) }, (_, i) => BigInt(i));
    console.log(`\n4. Snapshotting ${activeUsers.length} users across ${poolCount} pools...`);
    for (const user of activeUsers) {
      await (await hub.snapshotUserHoldings(user, allPoolIdxs)).wait();
      console.log(`   Snapshotted ${user}`);
    }

    // 5. Distribute dividends
    console.log(`\n5. Distributing dividends (topN=${TOP_N})...`);
    await (await hub.distributeDividends(BigInt(TOP_N))).wait();
    console.log("   Distributed!");

    // 6. Advance round
    console.log("\n6. Advancing round...");
    await (await hub.advanceRound()).wait();
    const newRound = await hub.currentRound();
    console.log(`   Now on round ${newRound}`);

    // 7. Unpause
    await (await router.setTradingPaused(false)).wait();
    console.log("   Trading unpaused.");

    // Show expected dividends per user
    console.log(`\n=== EXPECTED DIVIDENDS (round ${currentRound}) ===`);
    for (const user of activeUsers) {
      const div = await hub.calculateDividend(currentRound, user);
      console.log(`  ${user}: ${hre.ethers.formatUnits(div, 6)} V-Bucks`);
    }

    console.log(`\nUsers can now claim via hub.claimDividend(${currentRound})`);

  } catch (err) {
    console.error("\nError:", err.message);
    console.log("Unpausing trading...");
    try { await (await router.setTradingPaused(false)).wait(); } catch (_) {}
    throw err;
  }
}

main().catch(e => { console.error(e); process.exitCode = 1; });
