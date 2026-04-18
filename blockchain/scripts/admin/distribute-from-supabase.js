/**
 * Dividend distribution using real round_performance data from Supabase.
 *
 * Usage:
 *   TOP_N=10 npx hardhat run scripts/admin/distribute-from-supabase.js --network base-sepolia
 *
 * Prerequisites:
 *   1. Run update_daily.sh (fresh player cache)
 *   2. Run update-round-stats via local backend (writes to round_performance in Supabase)
 *   3. Run this script
 *
 * TOP_N values: Round 1=10, Round 2=5, Conf Finals=3, Finals=1
 */

const hre = require("hardhat");
const fs = require("fs");
const path = require("path");
const https = require("https");

const SUPABASE_URL = process.env.SUPABASE_URL || "https://xjziifyynavxyljvwjkz.supabase.co";
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:8000";
const ADMIN_KEY = process.env.ADMIN_KEY;
const TOP_N = parseInt(process.env.TOP_N || "10");

if (!ADMIN_KEY) { console.error("ADMIN_KEY env var required"); process.exit(1); }
if (!SUPABASE_KEY) { console.error("SUPABASE_SERVICE_ROLE_KEY env var required"); process.exit(1); }
if (![1, 3, 5, 10].includes(TOP_N)) { console.error(`TOP_N must be 1, 3, 5, or 10`); process.exit(1); }

const deployments = JSON.parse(
  fs.readFileSync(path.join(__dirname, "..", "..", "deployments.json"), "utf8")
);

async function fetchJSON(url, opts = {}) {
  const res = await fetch(url, opts);
  if (!res.ok) throw new Error(`${url} returned ${res.status}: ${await res.text()}`);
  return res.json();
}

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  console.log("Deployer:", await deployer.getAddress());

  const router  = await hre.ethers.getContractAt("StatixRouter", deployments.contracts.StatixRouter);
  const hub     = await hre.ethers.getContractAt("DividendHub",  deployments.contracts.DividendHub);
  const factory = await hre.ethers.getContractAt("PoolFactory",  deployments.contracts.PoolFactory);
  const dbucks  = await hre.ethers.getContractAt("DBucks",       deployments.contracts.DBucks);

  const currentRound = await hub.currentRound();
  console.log(`\nCurrent on-chain round: ${currentRound}`);

  // 1. Read round_performance from Supabase
  console.log(`\n1. Reading round ${currentRound} performance from Supabase...`);
  const perfRes = await fetchJSON(
    `${SUPABASE_URL}/rest/v1/round_performance?round=eq.${currentRound}&select=player_index,avg_fpts,games_played&order=avg_fpts.desc`,
    { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } }
  );
  if (!perfRes.length) {
    console.error(`No round_performance rows for round ${currentRound}. Run update-round-stats first.`);
    process.exit(1);
  }
  console.log(`   ${perfRes.length} players loaded from Supabase.`);

  const SCALE = 10n ** 6n;
  const allPerf = perfRes.map(r => ({
    index: r.player_index,
    avgFpts: BigInt(Math.round(r.avg_fpts * 1e6)),
    games_played: r.games_played,
  }));

  const topEligible = allPerf
    .filter(p => p.avgFpts > 0n && p.games_played >= 1)
    .sort((a, b) => (b.avgFpts > a.avgFpts ? 1 : -1))
    .slice(0, TOP_N)
    .map(p => p.index);

  console.log(`\n   Top ${TOP_N} performers:`);
  allPerf
    .filter(p => topEligible.includes(p.index))
    .forEach((p, i) => console.log(`   ${i + 1}. pool ${p.index} — ${(Number(p.avgFpts) / 1e6).toFixed(2)} avg FPts`));

  // 2. Load snapshot wallets from backend
  console.log("\n2. Loading approved wallets from backend...");
  const walletsData = await fetchJSON(
    `${BACKEND_URL}/api/admin/snapshot-wallets`,
    { headers: { Authorization: `Bearer ${ADMIN_KEY}` } }
  );
  const activeUsers = walletsData.wallets;
  if (!activeUsers.length) {
    console.error("No approved wallets found. Make sure users have wallet_address set in profiles.");
    process.exit(1);
  }
  console.log(`   ${activeUsers.length} wallet(s): ${activeUsers.join(", ")}`);

  // 3. Check hub balance
  const hubBalance = await dbucks.balanceOf(deployments.contracts.DividendHub);
  console.log(`\nHub balance: ${hre.ethers.formatUnits(hubBalance, 6)} V-Bucks`);
  if (hubBalance === 0n) {
    console.error("Hub has no balance — users need to trade first to generate fees.");
    process.exit(1);
  }

  // 4. Pause trading
  console.log("\n4. Pausing trading...");
  await (await router.setTradingPaused(true)).wait();
  console.log("   Paused.");

  try {
    // 5. Submit avg FPts on-chain
    console.log("\n5. Submitting avg FPts on-chain...");
    await (await hub.setRoundPerformanceBatch(
      allPerf.map(p => BigInt(p.index)),
      allPerf.map(p => p.avgFpts),
    )).wait();
    console.log(`   ${allPerf.length} player performances submitted.`);

    // 6. Mark top-N eligible
    console.log(`\n6. Marking top ${TOP_N} eligible: pools ${topEligible.join(", ")}...`);
    await (await hub.setTopPerformerEligible(topEligible.map(BigInt))).wait();
    console.log("   Top performers marked.");

    // 7. Snapshot user holdings
    const poolCount = await factory.poolCount();
    const allPoolIdxs = Array.from({ length: Number(poolCount) }, (_, i) => BigInt(i));
    console.log(`\n7. Snapshotting ${activeUsers.length} users across ${poolCount} pools...`);
    for (const user of activeUsers) {
      await (await hub.snapshotUserHoldings(user, allPoolIdxs)).wait();
      console.log(`   Snapshotted ${user}`);
    }

    // 8. Distribute
    console.log(`\n8. Distributing dividends (topN=${TOP_N})...`);
    await (await hub.distributeDividends(BigInt(TOP_N))).wait();
    console.log("   Distributed!");

    // 9. Advance round
    console.log("\n9. Advancing round...");
    await (await hub.advanceRound()).wait();
    const newRound = await hub.currentRound();
    console.log(`   Now on round ${newRound}`);

    // 10. Unpause
    await (await router.setTradingPaused(false)).wait();
    console.log("   Trading unpaused.");

    // Show dividends
    console.log(`\n=== DIVIDENDS (round ${currentRound}) ===`);
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
