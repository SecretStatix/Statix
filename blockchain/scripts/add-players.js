/**
 * add-players.js
 *
 * Adds new players to an ALREADY-DEPLOYED PoolFactory without redeploying
 * the full contract stack. Safe to run while users are trading.
 *
 * Usage:
 *   npm run add-players:sepolia
 *
 * It reads blockchain/deployments.json to find the live PoolFactory address,
 * compares players.json against existing on-chain players, and only creates
 * pools for entries that don't exist yet. Updates all deployments.json files.
 */

const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

const ALL_PLAYERS = require("./players.json");

const DEPLOYMENT_PATHS = [
  path.join(__dirname, "..", "deployments.json"),
  path.join(__dirname, "..", "..", "backend", "deployments.json"),
  path.join(__dirname, "..", "..", "frontend", "deployments.json"),
  path.join(__dirname, "..", "..", "frontend", "public", "deployments.json"),
];

const delay = (ms) => new Promise((r) => setTimeout(r, ms));

async function getGasOverrides(deployer) {
  const feeData = await deployer.provider.getFeeData();
  return {
    maxFeePerGas: feeData.maxFeePerGas * 2n,
    maxPriorityFeePerGas: feeData.maxPriorityFeePerGas * 2n,
  };
}

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  if (!deployer) {
    console.error("No deployer account. Set PRIVATE_KEY in blockchain/.env");
    process.exit(1);
  }
  const deployerAddress = await deployer.getAddress();
  console.log("Deployer:", deployerAddress);

  // Load existing deployment
  const deploymentFile = DEPLOYMENT_PATHS[0];
  if (!fs.existsSync(deploymentFile)) {
    console.error("deployments.json not found — run deploy:sepolia first.");
    process.exit(1);
  }
  const deployment = JSON.parse(fs.readFileSync(deploymentFile, "utf8"));
  const factoryAddress = deployment.contracts.PoolFactory;
  console.log("PoolFactory:", factoryAddress);

  // Connect to live PoolFactory
  const factory = await hre.ethers.getContractAt("PoolFactory", factoryAddress);

  // Find which players don't have a pool yet
  const existingIds = new Set(deployment.players.map((p) => p.id));
  const newPlayers = ALL_PLAYERS.filter((p) => !existingIds.has(p.id));

  if (newPlayers.length === 0) {
    console.log("No new players to add — all already deployed.");
    return;
  }

  console.log(`\nAdding ${newPlayers.length} new player pools:\n`);
  newPlayers.forEach((p) => console.log(`  ${p.symbol} — ${p.name} (${p.team})`));

  // Create pools in batches of 5
  const BATCH_SIZE = 5;
  let startIndex = deployment.players.length;

  for (let i = 0; i < newPlayers.length; i += BATCH_SIZE) {
    const batch = newPlayers.slice(i, i + BATCH_SIZE);
    const names = batch.map((p) => p.name);
    const symbols = batch.map((p) => p.symbol);
    const playerIds = batch.map((p) => p.id);

    process.stdout.write(
      `  Batch ${Math.floor(i / BATCH_SIZE) + 1}: ${batch.map((p) => p.symbol).join(", ")}...`
    );

    const gas = await getGasOverrides(deployer);
    const tx = await factory.createPoolsBatch(names, symbols, playerIds, gas);
    await tx.wait();
    console.log(" done");
    await delay(3000);
  }

  // Verify on-chain count
  const poolCount = await factory.poolCount();
  console.log(`\nTotal pools on-chain: ${poolCount}`);

  // Update all deployments.json files
  const newPlayerEntries = newPlayers.map((p, i) => ({
    index: startIndex + i,
    id: p.id,
    name: p.name,
    symbol: p.symbol,
    nba_id: p.nba_id,
    team: p.team,
    weekly_projection: p.weekly_projection ?? null,
  }));

  const updatedDeployment = {
    ...deployment,
    players: [...deployment.players, ...newPlayerEntries],
    lastUpdated: new Date().toISOString(),
  };

  for (const p of DEPLOYMENT_PATHS) {
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, JSON.stringify(updatedDeployment, null, 2));
  }

  console.log("\ndeployments.json updated with new players.");
  console.log("\n=== DONE ===");
  console.log(`Added ${newPlayers.length} players (indices ${startIndex}–${startIndex + newPlayers.length - 1})`);
  console.log("Run backend cache refresh to get stats for the new players.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
