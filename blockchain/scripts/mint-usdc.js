const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  const deployments = JSON.parse(
    fs.readFileSync(path.join(__dirname, "..", "deployments.json"), "utf8")
  );

  const recipient = process.env.RECIPIENT || (await hre.ethers.getSigners())[0].getAddress();
  const amount = hre.ethers.parseUnits(process.env.AMOUNT || "10000", 6); // Default 10,000 USDC

  const usdc = await hre.ethers.getContractAt("MockUSDC", deployments.contracts.MockUSDC);

  console.log(`Minting ${hre.ethers.formatUnits(amount, 6)} USDC to ${recipient}...`);
  const tx = await usdc.mint(recipient, amount);
  await tx.wait();

  const balance = await usdc.balanceOf(recipient);
  console.log(`Done! Balance: ${hre.ethers.formatUnits(balance, 6)} USDC`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
