const hre = require("hardhat");

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  console.log("Deploying contracts with account:", deployer.address);

  // For testnet, we'll deploy a mock USDC
  // On mainnet, use the real USDC address: 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913

  // 1. Deploy Mock USDC (for testing)
  console.log("\n1. Deploying Mock USDC...");
  const MockUSDC = await hre.ethers.getContractFactory("MockUSDC");
  const usdc = await MockUSDC.deploy();
  await usdc.waitForDeployment();
  const usdcAddress = await usdc.getAddress();
  console.log("   Mock USDC deployed to:", usdcAddress);

  // 2. Deploy DividendDistributor
  console.log("\n2. Deploying DividendDistributor...");
  const DividendDistributor = await hre.ethers.getContractFactory("DividendDistributor");
  const distributor = await DividendDistributor.deploy(usdcAddress, deployer.address);
  await distributor.waitForDeployment();
  const distributorAddress = await distributor.getAddress();
  console.log("   DividendDistributor deployed to:", distributorAddress);

  // 3. Deploy a sample PlayerToken (LeBron James)
  console.log("\n3. Deploying PlayerToken (LeBron James)...");
  const PlayerToken = await hre.ethers.getContractFactory("PlayerToken");
  const projectedPoints = hre.ethers.parseEther("1500"); // 1500 fantasy points projected
  const lebronToken = await PlayerToken.deploy(
    "LeBron James",
    "LEBRON",
    "lebron_james_2024",
    projectedPoints,
    deployer.address
  );
  await lebronToken.waitForDeployment();
  const lebronAddress = await lebronToken.getAddress();
  console.log("   LeBron Token deployed to:", lebronAddress);

  // 4. Deploy PlayerAMM for LeBron
  console.log("\n4. Deploying PlayerAMM for LeBron...");
  const PlayerAMM = await hre.ethers.getContractFactory("PlayerAMM");
  const initialShares = hre.ethers.parseEther("1000"); // 1000 virtual shares
  const initialCash = hre.ethers.parseEther("10000");  // $10,000 virtual cash = $10/share
  const lebronAMM = await PlayerAMM.deploy(
    lebronAddress,
    usdcAddress,
    distributorAddress,
    deployer.address, // protocol fee recipient
    initialShares,
    initialCash,
    deployer.address
  );
  await lebronAMM.waitForDeployment();
  const ammAddress = await lebronAMM.getAddress();
  console.log("   LeBron AMM deployed to:", ammAddress);

  // 5. Configure contracts
  console.log("\n5. Configuring contracts...");

  // Set AMM on PlayerToken
  await lebronToken.setAMM(ammAddress);
  console.log("   - Set AMM on LeBron token");

  // Register player in distributor
  await distributor.registerPlayer(lebronAddress);
  console.log("   - Registered LeBron in distributor");

  // Register AMM in distributor
  await distributor.registerAMM(ammAddress);
  console.log("   - Registered AMM in distributor");

  // 6. Mint some USDC to deployer for testing
  console.log("\n6. Minting test USDC...");
  const mintAmount = hre.ethers.parseUnits("100000", 6); // 100,000 USDC
  await usdc.mint(deployer.address, mintAmount);
  console.log("   Minted 100,000 USDC to deployer");

  // Summary
  console.log("\n" + "=".repeat(60));
  console.log("DEPLOYMENT SUMMARY");
  console.log("=".repeat(60));
  console.log("Mock USDC:           ", usdcAddress);
  console.log("DividendDistributor: ", distributorAddress);
  console.log("LeBron Token:        ", lebronAddress);
  console.log("LeBron AMM:          ", ammAddress);
  console.log("=".repeat(60));

  // Save addresses to file
  const fs = require("fs");
  const addresses = {
    usdc: usdcAddress,
    distributor: distributorAddress,
    players: {
      lebron: {
        token: lebronAddress,
        amm: ammAddress,
      },
    },
  };
  fs.writeFileSync(
    "deployed-addresses.json",
    JSON.stringify(addresses, null, 2)
  );
  console.log("\nAddresses saved to deployed-addresses.json");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
