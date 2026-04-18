/**
 * deploy-statix.js — Full Statix contract stack deployment script.
 *
 * Deploys in order: MockUSDC → DBucks → PoolFactory → StatixRouter → DividendHub,
 * then creates one PlayerPool per player in players.json via PoolFactory.
 * Writes all addresses + player data to backend/deployments.json so the backend
 * and indexer can hot-reload without a restart.
 *
 * Usage: npm run deploy:sepolia
 * Output: backend/deployments.json (overwritten on each run)
 */
const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

const PLAYERS = require("./players.json");

// Faucet cap (single source of truth: frontend/lib/faucet-config.json)
const FAUCET_CFG = require(path.join(__dirname, "..", "..", "frontend", "lib", "faucet-config.json"));
const FAUCET_LIMIT = BigInt(FAUCET_CFG.faucetLimitHuman) * 10n ** 6n;

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
    console.error(
      "No deployer account. Set PRIVATE_KEY in blockchain/.env (64 hex chars, or 0x + 64 hex chars).\n" +
        "Required for --network base-sepolia / base (remote networks have no default unlocked accounts)."
    );
    process.exit(1);
  }
  const deployerAddress = await deployer.getAddress();
  console.log("Deployer:", deployerAddress);

  const balance = await hre.ethers.provider.getBalance(deployerAddress);
  console.log("Balance:", hre.ethers.formatEther(balance), "ETH\n");

  // 1. Deploy MockUSDC
  console.log("1. Deploying MockUSDC...");
  const MockUSDC = await hre.ethers.getContractFactory("MockUSDC");
  let gas = await getGasOverrides(deployer);
  const usdc = await MockUSDC.deploy(gas);
  await usdc.waitForDeployment();
  const usdcAddress = await usdc.getAddress();
  console.log("   MockUSDC:", usdcAddress);
  await delay(5000);

  // 2. Deploy DBucks (faucet enabled on testnet only)
  const isTestnet = hre.network.name !== "base";
  console.log(`2. Deploying DBucks... (faucet: ${isTestnet ? "ENABLED" : "DISABLED — mainnet"})`);
  gas = await getGasOverrides(deployer);
  const DBucks = await hre.ethers.getContractFactory("DBucks");
  const dbucks = await DBucks.deploy(usdcAddress, isTestnet, isTestnet ? FAUCET_LIMIT : 0n, gas);
  await dbucks.waitForDeployment();
  const dbucksAddress = await dbucks.getAddress();
  console.log("   DBucks:", dbucksAddress);
  await delay(5000);

  // 3. Deploy PoolFactory
  console.log("3. Deploying PoolFactory...");
  gas = await getGasOverrides(deployer);
  const PoolFactory = await hre.ethers.getContractFactory("PoolFactory");
  const factory = await PoolFactory.deploy(dbucksAddress, gas);
  await factory.waitForDeployment();
  const factoryAddress = await factory.getAddress();
  console.log("   PoolFactory:", factoryAddress);
  await delay(5000);

  // 4. Deploy StatixRouter
  console.log("4. Deploying StatixRouter...");
  gas = await getGasOverrides(deployer);
  const StatixRouter = await hre.ethers.getContractFactory("StatixRouter");
  const router = await StatixRouter.deploy(dbucksAddress, factoryAddress, deployerAddress, gas);
  await router.waitForDeployment();
  const routerAddress = await router.getAddress();
  console.log("   StatixRouter:", routerAddress);
  await delay(5000);

  // 5. Deploy DividendHub
  console.log("5. Deploying DividendHub...");
  gas = await getGasOverrides(deployer);
  const DividendHub = await hre.ethers.getContractFactory("DividendHub");
  const hub = await DividendHub.deploy(dbucksAddress, factoryAddress, routerAddress, gas);
  await hub.waitForDeployment();
  const hubAddress = await hub.getAddress();
  console.log("   DividendHub:", hubAddress);
  await delay(5000);

  // 6. Wire up Factory: set router + hub
  console.log("6. Wiring Factory -> Router + Hub...");
  gas = await getGasOverrides(deployer);
  await (await factory.setRouter(routerAddress, gas)).wait();
  await delay(3000);
  gas = await getGasOverrides(deployer);
  await (await factory.setDividendHub(hubAddress, gas)).wait();
  console.log("   Factory wired.");
  await delay(3000);

  // 7. Create player pools with tiered starting prices
  // Tier 1 ($15): top 10 stars — 1000 shares / 15,000 cash
  // Tier 2 ($12.50): next 30 — 1000 shares / 12,500 cash
  // Tier 3 ($10): remaining 40 — 1000 shares / 10,000 cash
  const TIER1_IDS = new Set([
    "shai_gilgeous_alexander", "victor_wembanyama", "nikola_jokic", "luka_doncic",
    "anthony_edwards", "jayson_tatum", "jalen_brunson", "donovan_mitchell",
    "cade_cunningham", "stephen_curry",
  ]);
  const TIER2_IDS = new Set([
    "jalen_williams", "chet_holmgren", "de_aaron_fox", "dylan_harper", "jamal_murray",
    "lebron_james", "austin_reaves", "alperen_sengun", "kevin_durant", "amen_thompson",
    "julius_randle", "devin_booker", "jalen_green", "kawhi_leonard", "jaylen_brown",
    "karl_anthony_towns", "mikal_bridges", "evan_mobley", "james_harden", "paolo_banchero",
    "franz_wagner", "lamelo_ball", "tyrese_maxey", "joel_embiid", "bam_adebayo",
    "tyler_herro", "scottie_barnes", "brandon_ingram", "jalen_johnson", "og_anunoby",
  ]);

  const TIERS = [
    { label: "Tier 1 ($15)",   ids: TIER1_IDS,  shares: 1000n * 10n**6n, cash: 15000n * 10n**6n },
    { label: "Tier 2 ($12.50)", ids: TIER2_IDS, shares: 1000n * 10n**6n, cash: 12500n * 10n**6n },
    { label: "Tier 3 ($10)",   ids: null,        shares: 1000n * 10n**6n, cash: 10000n * 10n**6n },
  ];

  console.log(`\n7. Creating ${PLAYERS.length} player pools with tiered pricing...\n`);
  const BATCH_SIZE = 5;

  for (const tier of TIERS) {
    const tierPlayers = tier.ids === null
      ? PLAYERS.filter((p) => !TIER1_IDS.has(p.id) && !TIER2_IDS.has(p.id))
      : PLAYERS.filter((p) => tier.ids.has(p.id));

    if (tierPlayers.length === 0) continue;
    console.log(`   ${tier.label} — ${tierPlayers.length} players`);

    gas = await getGasOverrides(deployer);
    await (await factory.setDefaults(tier.shares, tier.cash, gas)).wait();
    await delay(2000);

    for (let i = 0; i < tierPlayers.length; i += BATCH_SIZE) {
      const batch = tierPlayers.slice(i, i + BATCH_SIZE);
      const names = batch.map((p) => p.name);
      const symbols = batch.map((p) => p.symbol);
      const playerIds = batch.map((p) => p.id);

      process.stdout.write(`     Batch: ${batch.map((p) => p.symbol).join(", ")}...`);

      gas = await getGasOverrides(deployer);
      const tx = await factory.createPoolsBatch(names, symbols, playerIds, gas);
      await tx.wait();
      console.log(" done");
      await delay(3000);
    }
  }

  // 8. Verify pool count
  const poolCount = await factory.poolCount();
  console.log(`\n   Total pools created: ${poolCount}`);

  // 9. Save deployment info
  const deployment = {
    network: hre.network.name,
    chainId: hre.network.config.chainId,
    deployer: deployerAddress,
    contracts: {
      MockUSDC: usdcAddress,
      DBucks: dbucksAddress,
      PoolFactory: factoryAddress,
      StatixRouter: routerAddress,
      DividendHub: hubAddress,
    },
    faucetMode: isTestnet,
    faucetLimit: (isTestnet ? FAUCET_LIMIT : 0n).toString(),
    players: [...PLAYERS.filter(p => TIER1_IDS.has(p.id)), ...PLAYERS.filter(p => TIER2_IDS.has(p.id)), ...PLAYERS.filter(p => !TIER1_IDS.has(p.id) && !TIER2_IDS.has(p.id))].map((p, idx) => ({
      index: idx,
      id: p.id,
      name: p.name,
      symbol: p.symbol,
      nba_id: p.nba_id,
      team: p.team,
      weekly_projection: p.weekly_projection ?? null,
    })),
    deployedAt: new Date().toISOString(),
  };

  const paths = [
    path.join(__dirname, "..", "deployments.json"),
    path.join(__dirname, "..", "..", "backend", "deployments.json"),
    path.join(__dirname, "..", "..", "frontend", "deployments.json"),
    path.join(__dirname, "..", "..", "frontend", "public", "deployments.json"),
  ];

  for (const p of paths) {
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, JSON.stringify(deployment, null, 2));
  }

  console.log("\nDeployment saved to:");
  paths.forEach((p) => console.log("  ", p));

  console.log("\n=== DEPLOYMENT COMPLETE ===");
  console.log(`MockUSDC:      ${usdcAddress}`);
  console.log(`DBucks:        ${dbucksAddress}`);
  console.log(`PoolFactory:   ${factoryAddress}`);
  console.log(`StatixRouter:  ${routerAddress}`);
  console.log(`DividendHub:   ${hubAddress}`);
  console.log(`Pools created: ${poolCount}`);
  console.log(`\nUser flow:`);
  console.log(
    `  Testnet: call DBucks.faucet() to get free D-Bucks (${Number(FAUCET_CFG.faucetLimitHuman).toLocaleString()} / address max)`,
  );
  console.log(`  Approve StatixRouter to spend D-Bucks (once)`);
  console.log(`  Then: router.buy(poolIndex, shares, maxCost) to trade!`);
  console.log(`  Claims: hub.claimDividend(week) or hub.claimMultipleWeeks([...])`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
