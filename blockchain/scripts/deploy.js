const hre = require("hardhat");

async function main() {
  console.log("Deploying MessageBoard...");

  const MessageBoard = await hre.ethers.getContractFactory("MessageBoard");
  const messageBoard = await MessageBoard.deploy();
  await messageBoard.waitForDeployment();

  const address = await messageBoard.getAddress();
  console.log(`MessageBoard deployed to: ${address}`);
  console.log("");
  console.log("Add this to your .env file:");
  console.log(`CONTRACT_ADDRESS=${address}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
