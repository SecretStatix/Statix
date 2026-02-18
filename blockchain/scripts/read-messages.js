const hre = require("hardhat");
require("dotenv").config();

async function main() {
  const contractAddress = process.env.CONTRACT_ADDRESS;
  if (!contractAddress) {
    console.error("Set CONTRACT_ADDRESS in your .env file first");
    process.exit(1);
  }

  const MessageBoard = await hre.ethers.getContractFactory("MessageBoard");
  const messageBoard = MessageBoard.attach(contractAddress);

  const [signer] = await hre.ethers.getSigners();
  const myAddress = await signer.getAddress();
  console.log(`Reading messages for: ${myAddress}\n`);

  // Read inbox
  const inboxIds = await messageBoard.getInbox(myAddress);
  console.log(`--- INBOX (${inboxIds.length} messages) ---`);
  for (const id of inboxIds) {
    const [sender, , content, timestamp] = await messageBoard.getMessage(id);
    const date = new Date(Number(timestamp) * 1000).toISOString();
    console.log(`  [${id}] From: ${sender}`);
    console.log(`       Content: ${content}`);
    console.log(`       Time: ${date}\n`);
  }

  // Read sent
  const sentIds = await messageBoard.getSent(myAddress);
  console.log(`--- SENT (${sentIds.length} messages) ---`);
  for (const id of sentIds) {
    const [, recipient, content, timestamp] = await messageBoard.getMessage(id);
    const date = new Date(Number(timestamp) * 1000).toISOString();
    console.log(`  [${id}] To: ${recipient}`);
    console.log(`       Content: ${content}`);
    console.log(`       Time: ${date}\n`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
