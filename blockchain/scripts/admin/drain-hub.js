/**
 * Drain all DBucks from DividendHub back to the deployer.
 * Use if the hub has stuck funds (e.g. seeded during deploy).
 *
 * Usage: npx hardhat run scripts/admin/drain-hub.js --network base-sepolia
 */
const hre = require("hardhat");
const deployments = require("../../deployments.json");

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  const hub = await hre.ethers.getContractAt("DividendHub", deployments.contracts.DividendHub);
  const dbucks = await hre.ethers.getContractAt("DBucks", deployments.contracts.DBucks);

  const balance = await dbucks.balanceOf(deployments.contracts.DividendHub);
  console.log(`DividendHub balance: ${hre.ethers.formatUnits(balance, 6)} VBucks`);

  if (balance === 0n) {
    console.log("Nothing to drain.");
    return;
  }

  const tx = await hub.emergencyDrain(deployer.address);
  await tx.wait();
  console.log(`Drained ${hre.ethers.formatUnits(balance, 6)} VBucks to ${deployer.address}`);
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
