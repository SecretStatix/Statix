const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("MessageBoard", function () {
  let messageBoard;
  let owner, addr1, addr2;

  beforeEach(async function () {
    [owner, addr1, addr2] = await ethers.getSigners();
    const MessageBoard = await ethers.getContractFactory("MessageBoard");
    messageBoard = await MessageBoard.deploy();
  });

  it("should send a message and store it", async function () {
    await messageBoard.sendMessage(addr1.address, "Hello addr1!");

    const total = await messageBoard.totalMessages();
    expect(total).to.equal(1);

    const [sender, recipient, content] = await messageBoard.getMessage(0);
    expect(sender).to.equal(owner.address);
    expect(recipient).to.equal(addr1.address);
    expect(content).to.equal("Hello addr1!");
  });

  it("should emit MessageSent event", async function () {
    await expect(messageBoard.sendMessage(addr1.address, "Test event"))
      .to.emit(messageBoard, "MessageSent")
      .withArgs(0, owner.address, addr1.address, "Test event", (val) => val > 0);
  });

  it("should track inbox and sent", async function () {
    await messageBoard.sendMessage(addr1.address, "msg1");
    await messageBoard.connect(addr1).sendMessage(addr2.address, "msg2");
    await messageBoard.sendMessage(addr1.address, "msg3");

    const inbox = await messageBoard.getInbox(addr1.address);
    expect(inbox.length).to.equal(2);

    const sent = await messageBoard.getSent(owner.address);
    expect(sent.length).to.equal(2);
  });

  it("should reject empty messages", async function () {
    await expect(
      messageBoard.sendMessage(addr1.address, "")
    ).to.be.revertedWith("Message cannot be empty");
  });

  it("should reject zero address recipient", async function () {
    await expect(
      messageBoard.sendMessage(ethers.ZeroAddress, "Hello")
    ).to.be.revertedWith("Cannot send to zero address");
  });
});
