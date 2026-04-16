/**
 * Raise the DBucks faucet limit by 100 each week of the playoffs.
 *
 * Usage (run once per week after each playoff round):
 *   npm run raise-faucet:sepolia
 *
 * Schedule:
 *   Week 0 (launch):          limit = 300  (set by initial deploy)
 *   Week 1 (after round 1):   limit = 400
 *   Week 2 (after round 2):   limit = 500
 *   Week 3 (conf finals):     limit = 600
 *   Week 4 (finals):          limit = 700
 */
const hre = require("hardhat");
const deployments = require("../../deployments.json");

const DECIMALS = 6n;
const RAISE_AMOUNT = 100n * 10n ** DECIMALS; // 100 VBucks

async function main() {
  const dbucks = await hre.ethers.getContractAt("DBucks", deployments.contracts.DBucks);

  const currentLimit = await dbucks.faucetLimit();
  const newLimit = currentLimit + RAISE_AMOUNT;

  console.log(`Current faucet limit: ${hre.ethers.formatUnits(currentLimit, 6)} VBucks`);
  console.log(`Raising by 100 → new limit: ${hre.ethers.formatUnits(newLimit, 6)} VBucks`);

  const tx = await dbucks.setFaucetMode(true, newLimit);
  await tx.wait();

  console.log(`Done. Users can now claim up to ${hre.ethers.formatUnits(newLimit, 6)} VBucks total.`);
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
