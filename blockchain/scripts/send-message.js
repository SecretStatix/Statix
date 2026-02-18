const hre = require("hardhat");
require("dotenv").config();

async function main() {
  const contractAddress = process.env.CONTRACT_ADDRESS;
  if (!contractAddress) {
    console.error("Set CONTRACT_ADDRESS in your .env file first");
    process.exit(1);
  }

  // Change these values for your message
  const RECIPIENT = "0x639Daa0d790Ff595A2203db01552A28b2339a3f4"; // replace with actual recipient
  const MESSAGE = "Hello from the blockchain! I know you are a kuni!";

  const MessageBoard = await hre.ethers.getContractFactory("MessageBoard");
  const messageBoard = MessageBoard.attach(contractAddress);

  console.log(`Sending message to ${RECIPIENT}...`);
  const tx = await messageBoard.sendMessage(RECIPIENT, MESSAGE);
  const receipt = await tx.wait();

  console.log(`Message sent! Tx hash: ${receipt.hash}`);
  console.log(`Gas used: ${receipt.gasUsed.toString()}`);

  const total = await messageBoard.totalMessages();
  console.log(`Total messages on contract: ${total.toString()}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
