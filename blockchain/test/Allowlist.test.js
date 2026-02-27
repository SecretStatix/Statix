const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("DividendFantasy Allowlist", function () {
  let fantasy, usdc;
  let owner, alice, bob;

  const INITIAL_SHARES = 1000n * 10n ** 6n; // 1000 shares (6 decimals)
  const INITIAL_CASH = 10000n * 10n ** 6n; // $10,000 (6 decimals)
  const BUY_SHARES = 10n * 10n ** 6n; // 10 shares
  const MAX_COST = 200n * 10n ** 6n; // generous slippage
  const MINT_AMOUNT = 100000n * 10n ** 6n; // 100k USDC

  beforeEach(async function () {
    [owner, alice, bob] = await ethers.getSigners();

    // Deploy MockUSDC
    const MockUSDC = await ethers.getContractFactory("MockUSDC");
    usdc = await MockUSDC.deploy();

    // Deploy DividendFantasy
    const DividendFantasy = await ethers.getContractFactory("DividendFantasy");
    fantasy = await DividendFantasy.deploy(await usdc.getAddress(), owner.address);

    // Add one player
    await fantasy.addPlayers(
      ["Test Player"],
      ["TEST"],
      ["test_1"],
      [100n * 10n ** 6n],
      INITIAL_SHARES,
      INITIAL_CASH
    );

    // Mint USDC to alice and bob, then approve
    await usdc.mint(alice.address, MINT_AMOUNT);
    await usdc.mint(bob.address, MINT_AMOUNT);
    await usdc.connect(alice).approve(await fantasy.getAddress(), MINT_AMOUNT);
    await usdc.connect(bob).approve(await fantasy.getAddress(), MINT_AMOUNT);
  });

  describe("Allowlist disabled (default)", function () {
    it("allowlistEnabled is false by default", async function () {
      expect(await fantasy.allowlistEnabled()).to.equal(false);
    });

    it("anyone can buy when allowlist is disabled", async function () {
      await expect(fantasy.connect(alice).buy(0, BUY_SHARES, MAX_COST))
        .to.emit(fantasy, "Buy");
      await expect(fantasy.connect(bob).buy(0, BUY_SHARES, MAX_COST))
        .to.emit(fantasy, "Buy");
    });
  });

  describe("Allowlist enabled", function () {
    beforeEach(async function () {
      await fantasy.setAllowlistEnabled(true);
    });

    it("non-allowlisted address cannot buy", async function () {
      await expect(
        fantasy.connect(alice).buy(0, BUY_SHARES, MAX_COST)
      ).to.be.revertedWith("Not on allowlist");
    });

    it("allowlisted address can buy", async function () {
      await fantasy.setAllowlist(alice.address, true);
      await expect(fantasy.connect(alice).buy(0, BUY_SHARES, MAX_COST))
        .to.emit(fantasy, "Buy");
    });

    it("sell always works regardless of allowlist", async function () {
      // First allowlist alice and let her buy
      await fantasy.setAllowlist(alice.address, true);
      await fantasy.connect(alice).buy(0, BUY_SHARES, MAX_COST);

      // Remove from allowlist
      await fantasy.setAllowlist(alice.address, false);

      // Sell should still work
      await expect(fantasy.connect(alice).sell(0, BUY_SHARES, 0))
        .to.emit(fantasy, "Sell");
    });

    it("emits AllowlistEnabled event", async function () {
      // Already enabled in beforeEach, test disable
      await expect(fantasy.setAllowlistEnabled(false))
        .to.emit(fantasy, "AllowlistEnabled")
        .withArgs(false);
    });

    it("emits AllowlistUpdated event", async function () {
      await expect(fantasy.setAllowlist(alice.address, true))
        .to.emit(fantasy, "AllowlistUpdated")
        .withArgs(alice.address, true);
    });
  });

  describe("Batch allowlist", function () {
    beforeEach(async function () {
      await fantasy.setAllowlistEnabled(true);
    });

    it("batch adds multiple addresses", async function () {
      await fantasy.setAllowlistBatch([alice.address, bob.address], true);

      // Both can buy
      await expect(fantasy.connect(alice).buy(0, BUY_SHARES, MAX_COST))
        .to.emit(fantasy, "Buy");
      await expect(fantasy.connect(bob).buy(0, BUY_SHARES, MAX_COST))
        .to.emit(fantasy, "Buy");
    });

    it("batch removes multiple addresses", async function () {
      await fantasy.setAllowlistBatch([alice.address, bob.address], true);
      await fantasy.setAllowlistBatch([alice.address, bob.address], false);

      await expect(
        fantasy.connect(alice).buy(0, BUY_SHARES, MAX_COST)
      ).to.be.revertedWith("Not on allowlist");
    });

    it("emits AllowlistUpdated for each address in batch", async function () {
      const tx = await fantasy.setAllowlistBatch([alice.address, bob.address], true);
      const receipt = await tx.wait();

      const events = receipt.logs.filter(
        (log) => {
          try {
            return fantasy.interface.parseLog(log)?.name === "AllowlistUpdated";
          } catch { return false; }
        }
      );
      expect(events.length).to.equal(2);
    });
  });

  describe("Access control", function () {
    it("only owner can setAllowlistEnabled", async function () {
      await expect(
        fantasy.connect(alice).setAllowlistEnabled(true)
      ).to.be.revertedWithCustomError(fantasy, "OwnableUnauthorizedAccount");
    });

    it("only owner can setAllowlist", async function () {
      await expect(
        fantasy.connect(alice).setAllowlist(bob.address, true)
      ).to.be.revertedWithCustomError(fantasy, "OwnableUnauthorizedAccount");
    });

    it("only owner can setAllowlistBatch", async function () {
      await expect(
        fantasy.connect(alice).setAllowlistBatch([bob.address], true)
      ).to.be.revertedWithCustomError(fantasy, "OwnableUnauthorizedAccount");
    });
  });
});
