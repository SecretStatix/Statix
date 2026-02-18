const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

// Top 50 NBA players - loaded from cache or hardcoded
const PLAYERS = require("./players.json");

// Initial AMM parameters
const INITIAL_SHARES = hre.ethers.parseUnits("1000", 6); // 1000 shares (6 decimals like USDC)
const INITIAL_PRICE = hre.ethers.parseUnits("10", 6); // $10 per share
const INITIAL_CASH = INITIAL_SHARES * INITIAL_PRICE / hre.ethers.parseUnits("1", 6); // shares * price

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  const deployerAddress = await deployer.getAddress();
  console.log("Deploying with:", deployerAddress);

  const balance = await hre.ethers.provider.getBalance(deployerAddress);
  console.log("Balance:", hre.ethers.formatEther(balance), "ETH\n");

  const addresses = {
    deployer: deployerAddress,
    network: hre.network.name,
    mockUSDC: "",
    dividendDistributor: "",
    players: {},
  };

  // 1. Deploy MockUSDC
  console.log("1. Deploying MockUSDC...");
  const MockUSDC = await hre.ethers.getContractFactory("MockUSDC");
  const usdc = await MockUSDC.deploy();
  await usdc.waitForDeployment();
  addresses.mockUSDC = await usdc.getAddress();
  console.log("   MockUSDC:", addresses.mockUSDC);

  // 2. Deploy DividendDistributor
  console.log("2. Deploying DividendDistributor...");
  const DividendDistributor = await hre.ethers.getContractFactory("DividendDistributor");
  const distributor = await DividendDistributor.deploy(addresses.mockUSDC, deployerAddress);
  await distributor.waitForDeployment();
  addresses.dividendDistributor = await distributor.getAddress();
  console.log("   DividendDistributor:", addresses.dividendDistributor);

  // 3. Deploy Player Tokens + AMM pools
  console.log(`\n3. Deploying ${PLAYERS.length} Player Tokens + AMMs...\n`);

  const PlayerToken = await hre.ethers.getContractFactory("PlayerToken");
  const PlayerAMM = await hre.ethers.getContractFactory("PlayerAMM");

  for (let i = 0; i < PLAYERS.length; i++) {
    const player = PLAYERS[i];
    const symbol = player.symbol;
    const projectedPoints = hre.ethers.parseUnits(
      Math.round(player.season_projection).toString(), 18
    );

    process.stdout.write(`   [${i + 1}/${PLAYERS.length}] ${player.name} (${symbol})...`);

    // Deploy PlayerToken
    const token = await PlayerToken.deploy(
      `${player.name} Token`,
      symbol,
      player.id,
      projectedPoints,
      deployerAddress
    );
    await token.waitForDeployment();
    const tokenAddress = await token.getAddress();

    // Deploy PlayerAMM
    const amm = await PlayerAMM.deploy(
      tokenAddress,
      addresses.mockUSDC,
      addresses.dividendDistributor,
      deployerAddress, // protocol fee recipient
      INITIAL_SHARES,
      INITIAL_CASH,
      deployerAddress
    );
    await amm.waitForDeployment();
    const ammAddress = await amm.getAddress();

    // Set AMM on token
    const setAmmTx = await token.setAMM(ammAddress);
    await setAmmTx.wait();

    // Register player + AMM on distributor
    const regPlayerTx = await distributor.registerPlayer(tokenAddress);
    await regPlayerTx.wait();

    const regAmmTx = await distributor.registerAMM(ammAddress);
    await regAmmTx.wait();

    addresses.players[player.id] = {
      name: player.name,
      symbol: symbol,
      nba_id: player.nba_id,
      token: tokenAddress,
      amm: ammAddress,
      weekly_projection: player.weekly_projection,
      season_projection: player.season_projection,
    };

    console.log(" done");
  }

  // Save addresses to file
  const outputPath = path.join(__dirname, "..", "deployments.json");
  fs.writeFileSync(outputPath, JSON.stringify(addresses, null, 2));
  console.log(`\nAll addresses saved to: ${outputPath}`);

  // Also save a copy for the backend
  const backendPath = path.join(__dirname, "..", "..", "backend", "deployments.json");
  fs.writeFileSync(backendPath, JSON.stringify(addresses, null, 2));
  console.log(`Backend copy saved to: ${backendPath}`);

  // Save a copy for the frontend
  const frontendPath = path.join(__dirname, "..", "..", "frontend", "deployments.json");
  fs.writeFileSync(frontendPath, JSON.stringify(addresses, null, 2));
  console.log(`Frontend copy saved to: ${frontendPath}`);

  console.log("\nDeployment complete!");
  console.log(`MockUSDC: ${addresses.mockUSDC}`);
  console.log(`DividendDistributor: ${addresses.dividendDistributor}`);
  console.log(`Players deployed: ${Object.keys(addresses.players).length}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
