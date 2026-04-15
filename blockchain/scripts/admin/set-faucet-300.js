/**
 * One-time: set faucet limit to 300 VBucks on the already-deployed DBucks contract.
 * Run this once to match the new faucet-config.json (changed from 1000 → 300).
 *
 * Usage: npm run set-faucet:sepolia
 */
const hre = require("hardhat");
const deployments = require("../../deployments.json");

async function main() {
  const dbucks = await hre.ethers.getContractAt("DBucks", deployments.contracts.DBucks);

  const newLimit = 300n * 10n ** 6n;
  const tx = await dbucks.setFaucetMode(true, newLimit);
  await tx.wait();

  console.log(`Faucet limit set to 300 VBucks. Done.`);
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
