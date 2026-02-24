const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

const PLAYERS = require("./players.json");

// AMM initial parameters (scaled to 6 decimals like USDC)
const INITIAL_SHARES = 1000n * 10n ** 6n; // 1000 shares
const INITIAL_CASH = 10000n * 10n ** 6n;  // $10,000 (so price = $10/share)

// Faucet: 100,000 D-Bucks per address on testnet
const FAUCET_LIMIT = 100000n * 10n ** 6n;

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
  const deployerAddress = await deployer.getAddress();
  console.log("Deployer:", deployerAddress);

  const balance = await hre.ethers.provider.getBalance(deployerAddress);
  console.log("Balance:", hre.ethers.formatEther(balance), "ETH\n");

  // 1. Deploy MockUSDC (underlying asset — on mainnet this would be real USDC)
  console.log("1. Deploying MockUSDC (underlying)...");
  const MockUSDC = await hre.ethers.getContractFactory("MockUSDC");
  let gas = await getGasOverrides(deployer);
  const usdc = await MockUSDC.deploy(gas);
  await usdc.waitForDeployment();
  const usdcAddress = await usdc.getAddress();
  console.log("   MockUSDC:", usdcAddress);
  await delay(5000);

  // 2. Deploy DBucks (casino-chip wrapper)
  console.log("2. Deploying DBucks...");
  gas = await getGasOverrides(deployer);
  const DBucks = await hre.ethers.getContractFactory("DBucks");
  const dbucks = await DBucks.deploy(
    usdcAddress,
    true,        // faucet mode ON for testnet
    FAUCET_LIMIT,
    gas
  );
  await dbucks.waitForDeployment();
  const dbucksAddress = await dbucks.getAddress();
  console.log("   DBucks:", dbucksAddress);
  await delay(5000);

  // 3. Deploy DividendFantasy (uses DBucks as payment token)
  console.log("3. Deploying DividendFantasy...");
  gas = await getGasOverrides(deployer);
  const DividendFantasy = await hre.ethers.getContractFactory("DividendFantasy");
  const fantasy = await DividendFantasy.deploy(dbucksAddress, deployerAddress, gas);
  await fantasy.waitForDeployment();
  const fantasyAddress = await fantasy.getAddress();
  console.log("   DividendFantasy:", fantasyAddress);
  await delay(5000);

  // 4. Add players in batches of 10
  console.log(`\n4. Adding ${PLAYERS.length} players in batches...\n`);
  const BATCH_SIZE = 10;

  for (let i = 0; i < PLAYERS.length; i += BATCH_SIZE) {
    const batch = PLAYERS.slice(i, i + BATCH_SIZE);

    const names = batch.map((p) => p.name);
    const symbols = batch.map((p) => p.symbol);
    const playerIds = batch.map((p) => p.id);
    const projections = batch.map((p) =>
      BigInt(Math.round(p.season_projection * 1e6))
    );

    process.stdout.write(`   Batch ${Math.floor(i / BATCH_SIZE) + 1}: ${batch.map((p) => p.symbol).join(", ")}...`);

    gas = await getGasOverrides(deployer);
    const tx = await fantasy.addPlayers(
      names, symbols, playerIds, projections,
      INITIAL_SHARES, INITIAL_CASH,
      gas
    );
    await tx.wait();
    console.log(" done");
    await delay(3000);
  }

  // 5. Seed D-Bucks into the DividendFantasy contract for dividend payouts
  // Mint MockUSDC to deployer, deposit into DBucks, transfer to contract
  console.log("\n5. Seeding D-Bucks for dividend pool...");
  const seedAmount = 1000000n * 10n ** 6n; // 1M

  gas = await getGasOverrides(deployer);
  await (await usdc.mint(deployerAddress, seedAmount, gas)).wait();
  await delay(3000);

  gas = await getGasOverrides(deployer);
  await (await usdc.approve(dbucksAddress, seedAmount, gas)).wait();
  await delay(3000);

  gas = await getGasOverrides(deployer);
  await (await dbucks.deposit(seedAmount, gas)).wait();
  await delay(3000);

  gas = await getGasOverrides(deployer);
  await (await dbucks.transfer(fantasyAddress, seedAmount, gas)).wait();
  console.log("   Seeded 1,000,000 D-Bucks to contract");

  // 6. Save deployment info
  const deployment = {
    network: hre.network.name,
    chainId: hre.network.config.chainId,
    deployer: deployerAddress,
    contracts: {
      MockUSDC: usdcAddress,
      DBucks: dbucksAddress,
      DividendFantasy: fantasyAddress,
    },
    faucetMode: true,
    faucetLimit: "100000",
    players: PLAYERS.map((p, idx) => ({
      index: idx,
      id: p.id,
      name: p.name,
      symbol: p.symbol,
      nba_id: p.nba_id,
      team: p.team,
      weekly_projection: p.weekly_projection,
      season_projection: p.season_projection,
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
  console.log(`MockUSDC:        ${usdcAddress}`);
  console.log(`DBucks:          ${dbucksAddress}`);
  console.log(`DividendFantasy: ${fantasyAddress}`);
  console.log(`Players added:   ${PLAYERS.length}`);
  console.log(`\nUser flow:`);
  console.log(`  Testnet: call DBucks.faucet() to get free D-Bucks (100k limit)`);
  console.log(`  Mainnet: deposit USDC via DBucks.deposit() to get D-Bucks`);
  console.log(`  Then: approve DividendFantasy to spend D-Bucks, and trade!`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
