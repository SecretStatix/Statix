/**
 * Deploys the H2H stack on top of an existing Statix deployment.
 *
 *   1. Reads collateral token (DBucks) address from deployments.json
 *      → set H2H_COLLATERAL=USDC env to use MockUSDC instead.
 *   2. Deploys BinaryCTF
 *   3. Deploys H2HOracle (owner = ORACLE_OWNER env || deployer)
 *   4. Deploys H2HCreator (owner = deployer, fee → DividendHub)
 *   5. Writes addresses into deployments.json under `h2h: { ... }` and copies to backend/frontend.
 *
 * Usage:
 *   npx hardhat run scripts/deploy-h2h.js --network base-sepolia
 *
 * Env:
 *   PRIVATE_KEY        — deployer (required for remote networks)
 *   ORACLE_OWNER       — wallet allowed to call resolve/voidMarket (default: deployer)
 *   H2H_FEE_BPS        — FPMM fee in bps (default: 200 = 2%)
 *   H2H_COLLATERAL     — DBUCKS (default) or USDC
 */
const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

const DEFAULT_FEE_BPS = 200;

async function getGasOverrides(deployer) {
  const feeData = await deployer.provider.getFeeData();
  return {
    maxFeePerGas: (feeData.maxFeePerGas ?? 0n) * 2n,
    maxPriorityFeePerGas: (feeData.maxPriorityFeePerGas ?? 0n) * 2n,
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

  const deploymentsPath = path.join(__dirname, "..", "deployments.json");
  if (!fs.existsSync(deploymentsPath)) {
    console.error(`Missing ${deploymentsPath}. Run deploy-statix.js first.`);
    process.exit(1);
  }
  const deployments = JSON.parse(fs.readFileSync(deploymentsPath, "utf-8"));

  const useUSDC = (process.env.H2H_COLLATERAL || "DBUCKS").toUpperCase() === "USDC";
  const collateral = useUSDC ? deployments.contracts.MockUSDC : deployments.contracts.DBucks;
  if (!collateral) {
    console.error(`Collateral address missing in deployments.contracts (${useUSDC ? "MockUSDC" : "DBucks"}).`);
    process.exit(1);
  }
  const feeRecipient = deployments.contracts.DividendHub;
  if (!feeRecipient) {
    console.error("DividendHub address missing — H2H fees route there. Run deploy-statix.js first.");
    process.exit(1);
  }

  const oracleOwner = process.env.ORACLE_OWNER || deployerAddress;
  const feeBps = parseInt(process.env.H2H_FEE_BPS || `${DEFAULT_FEE_BPS}`, 10);

  console.log("Collateral:", collateral, useUSDC ? "(MockUSDC)" : "(DBucks)");
  console.log("Fee recipient (DividendHub):", feeRecipient);
  console.log("Oracle owner:", oracleOwner);
  console.log("Fee bps:", feeBps);
  console.log();

  // 1. BinaryCTF
  console.log("1. Deploying BinaryCTF...");
  let gas = await getGasOverrides(deployer);
  const BinaryCTF = await hre.ethers.getContractFactory("BinaryCTF");
  const ctf = await BinaryCTF.deploy(gas);
  await ctf.waitForDeployment();
  const ctfAddress = await ctf.getAddress();
  console.log("   BinaryCTF:", ctfAddress);

  // 2. H2HOracle
  console.log("2. Deploying H2HOracle...");
  gas = await getGasOverrides(deployer);
  const H2HOracle = await hre.ethers.getContractFactory("H2HOracle");
  const oracle = await H2HOracle.deploy(oracleOwner, ctfAddress, gas);
  await oracle.waitForDeployment();
  const oracleAddress = await oracle.getAddress();
  console.log("   H2HOracle:", oracleAddress);

  // 3. H2HCreator
  console.log("3. Deploying H2HCreator...");
  gas = await getGasOverrides(deployer);
  const H2HCreator = await hre.ethers.getContractFactory("H2HCreator");
  const creator = await H2HCreator.deploy(
    deployerAddress,
    ctfAddress,
    collateral,
    oracleAddress,
    feeBps,
    feeRecipient,
    gas,
  );
  await creator.waitForDeployment();
  const creatorAddress = await creator.getAddress();
  console.log("   H2HCreator:", creatorAddress);

  // 4. Persist
  deployments.h2h = {
    BinaryCTF: ctfAddress,
    H2HOracle: oracleAddress,
    H2HCreator: creatorAddress,
    collateral,
    feeRecipient,
    feeBps,
    oracleOwner,
    deployedAt: new Date().toISOString(),
  };

  const targets = [
    deploymentsPath,
    path.join(__dirname, "..", "..", "backend", "deployments.json"),
    path.join(__dirname, "..", "..", "frontend", "deployments.json"),
    path.join(__dirname, "..", "..", "frontend", "public", "deployments.json"),
  ];
  for (const p of targets) {
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, JSON.stringify(deployments, null, 2));
  }
  console.log("\nDeployment written to:");
  targets.forEach((p) => console.log("  ", p));

  console.log("\n=== H2H DEPLOYMENT COMPLETE ===");
  console.log(`BinaryCTF:   ${ctfAddress}`);
  console.log(`H2HOracle:   ${oracleAddress}`);
  console.log(`H2HCreator:  ${creatorAddress}`);
  console.log(`\nNext: backend daemon calls H2HCreator.createMarket(questionId, playerA, playerB, seed) per game.`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
