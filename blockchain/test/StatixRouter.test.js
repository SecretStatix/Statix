const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("StatixRouter (unit tests)", function () {
  let deployer, alice, bob, feeRecipient, outsider;
  let token, factory, router, hub;
  let routerAddr, hubAddr, factoryAddr, pool0Addr, pool1Addr;

  const SCALE = 10n ** 6n;
  const BPS = 10000n;
  const SHARES = 10n * SCALE;
  const PROJ = 1700n * SCALE;

  async function deployFixture() {
    [deployer, alice, bob, feeRecipient, outsider] = await ethers.getSigners();

    const MockUSDC = await ethers.getContractFactory("MockUSDC");
    token = await MockUSDC.deploy();
    await token.waitForDeployment();

    const PoolFactory = await ethers.getContractFactory("PoolFactory");
    factory = await PoolFactory.deploy(await token.getAddress());
    await factory.waitForDeployment();
    factoryAddr = await factory.getAddress();

    const StatixRouter = await ethers.getContractFactory("StatixRouter");
    router = await StatixRouter.deploy(
      await token.getAddress(),
      factoryAddr,
      feeRecipient.address
    );
    await router.waitForDeployment();
    routerAddr = await router.getAddress();

    const DividendHub = await ethers.getContractFactory("DividendHub");
    hub = await DividendHub.deploy(
      await token.getAddress(),
      factoryAddr,
      routerAddr
    );
    await hub.waitForDeployment();
    hubAddr = await hub.getAddress();

    await factory.setRouter(routerAddr);
    await factory.setDividendHub(hubAddr);

    await factory.createPool("Player A", "PLRA", "player_a", PROJ);
    await factory.createPool("Player B", "PLRB", "player_b", PROJ);

    pool0Addr = await factory.pools(0);
    pool1Addr = await factory.pools(1);

    // Fund users and approve router
    const amount = 1_000_000n * SCALE;
    for (const user of [alice, bob]) {
      await token.mint(user.address, amount);
      await token.connect(user).approve(routerAddr, ethers.MaxUint256);
    }
  }

  beforeEach(async function () {
    await deployFixture();
  });

  function pool(addr) {
    return ethers.getContractAt("IPlayerPool", addr);
  }

  // --------------------------------------------------------------------------
  //  CONSTRUCTOR
  // --------------------------------------------------------------------------
  describe("Constructor", function () {
    it("should initialise state correctly", async function () {
      expect(await router.paymentToken()).to.equal(await token.getAddress());
      expect(await router.factory()).to.equal(factoryAddr);
      expect(await router.protocolFeeRecipient()).to.equal(feeRecipient.address);
      expect(await router.feeBps()).to.equal(150);
      expect(await router.dividendFeeBps()).to.equal(6700);
      expect(await router.killed()).to.be.false;
      expect(await router.tradingPaused()).to.be.false;
    });
  });

  // --------------------------------------------------------------------------
  //  FEE CONFIGURATION
  // --------------------------------------------------------------------------
  describe("Fee configuration", function () {
    describe("setFeeBps", function () {
      it("updates feeBps and emits event", async function () {
        await expect(router.setFeeBps(300))
          .to.emit(router, "FeeBpsUpdated")
          .withArgs(150, 300);
        expect(await router.feeBps()).to.equal(300);
      });

      it("allows 0 fee", async function () {
        await router.setFeeBps(0);
        expect(await router.feeBps()).to.equal(0);
      });

      it("allows max 5% fee", async function () {
        await router.setFeeBps(500);
        expect(await router.feeBps()).to.equal(500);
      });

      it("reverts when exceeding 5%", async function () {
        await expect(router.setFeeBps(501)).to.be.revertedWith(
          "Fee too high (max 5%)"
        );
      });

      it("reverts for non-owner", async function () {
        await expect(router.connect(outsider).setFeeBps(100)).to.be.reverted;
      });
    });

    describe("setDividendFeeBps", function () {
      it("updates dividendFeeBps and emits event", async function () {
        await expect(router.setDividendFeeBps(5000))
          .to.emit(router, "DividendFeeBpsUpdated")
          .withArgs(6700, 5000);
        expect(await router.dividendFeeBps()).to.equal(5000);
      });

      it("allows 100%", async function () {
        await router.setDividendFeeBps(10000);
        expect(await router.dividendFeeBps()).to.equal(10000);
      });

      it("reverts when exceeding 100%", async function () {
        await expect(router.setDividendFeeBps(10001)).to.be.revertedWith(
          "Cannot exceed 100%"
        );
      });

      it("reverts for non-owner", async function () {
        await expect(
          router.connect(outsider).setDividendFeeBps(5000)
        ).to.be.reverted;
      });
    });

    describe("setProtocolFeeRecipient", function () {
      it("updates recipient and emits event", async function () {
        await expect(router.setProtocolFeeRecipient(alice.address))
          .to.emit(router, "ProtocolFeeRecipientUpdated")
          .withArgs(feeRecipient.address, alice.address);
        expect(await router.protocolFeeRecipient()).to.equal(alice.address);
      });

      it("reverts for zero address", async function () {
        await expect(
          router.setProtocolFeeRecipient(ethers.ZeroAddress)
        ).to.be.revertedWith("Zero address");
      });

      it("reverts for non-owner", async function () {
        await expect(
          router.connect(outsider).setProtocolFeeRecipient(alice.address)
        ).to.be.reverted;
      });
    });
  });

  // --------------------------------------------------------------------------
  //  TRADING: buy
  // --------------------------------------------------------------------------
  describe("buy", function () {
    it("credits shares to buyer", async function () {
      await router.connect(alice).buy(0, SHARES, ethers.MaxUint256);
      const p = await pool(pool0Addr);
      expect(await p.holdings(alice.address)).to.equal(SHARES);
    });

    it("deducts tokens from buyer", async function () {
      const balBefore = await token.balanceOf(alice.address);
      await router.connect(alice).buy(0, SHARES, ethers.MaxUint256);
      const balAfter = await token.balanceOf(alice.address);
      expect(balBefore - balAfter).to.be.gt(0);
    });

    it("sends protocol fee to recipient", async function () {
      const feeBefore = await token.balanceOf(feeRecipient.address);
      await router.connect(alice).buy(0, SHARES, ethers.MaxUint256);
      const feeAfter = await token.balanceOf(feeRecipient.address);
      expect(feeAfter - feeBefore).to.be.gt(0);
    });

    it("sends dividend fee to hub", async function () {
      const hubBefore = await token.balanceOf(hubAddr);
      await router.connect(alice).buy(0, SHARES, ethers.MaxUint256);
      const hubAfter = await token.balanceOf(hubAddr);
      expect(hubAfter - hubBefore).to.be.gt(0);
    });

    it("splits fees correctly between hub and recipient", async function () {
      const hubBefore = await token.balanceOf(hubAddr);
      const feeBefore = await token.balanceOf(feeRecipient.address);

      const p = await pool(pool0Addr);
      const rawCost = await p.getBuyCost(SHARES);
      const fee = (rawCost * 150n) / BPS;
      const expectedDivFee = (fee * 6700n) / BPS;
      const expectedProtocolFee = fee - expectedDivFee;

      await router.connect(alice).buy(0, SHARES, ethers.MaxUint256);

      expect(await token.balanceOf(hubAddr) - hubBefore).to.equal(expectedDivFee);
      expect(await token.balanceOf(feeRecipient.address) - feeBefore).to.equal(expectedProtocolFee);
    });

    it("emits Buy event", async function () {
      await expect(router.connect(alice).buy(0, SHARES, ethers.MaxUint256))
        .to.emit(router, "Buy");
    });

    it("reverts when contract is killed", async function () {
      await router.emergencyShutdown();
      await expect(
        router.connect(alice).buy(0, SHARES, ethers.MaxUint256)
      ).to.be.revertedWith("Contract shut down");
    });

    it("reverts when trading is paused", async function () {
      await router.setTradingPaused(true);
      await expect(
        router.connect(alice).buy(0, SHARES, ethers.MaxUint256)
      ).to.be.revertedWith("Trading paused");
    });

    it("reverts for blacklisted user", async function () {
      await router.setBlacklist(alice.address, true);
      await expect(
        router.connect(alice).buy(0, SHARES, ethers.MaxUint256)
      ).to.be.revertedWith("Address banned");
    });

    it("reverts when allowlist is enabled and user not on it", async function () {
      await router.setAllowlistEnabled(true);
      await expect(
        router.connect(alice).buy(0, SHARES, ethers.MaxUint256)
      ).to.be.revertedWith("Not on allowlist");
    });

    it("succeeds for allowlisted user when allowlist enabled", async function () {
      await router.setAllowlistEnabled(true);
      await router.setAllowlist(alice.address, true);
      await router.connect(alice).buy(0, SHARES, ethers.MaxUint256);

      const p = await pool(pool0Addr);
      expect(await p.holdings(alice.address)).to.equal(SHARES);
    });

    it("reverts for invalid pool index", async function () {
      await expect(
        router.connect(alice).buy(99, SHARES, ethers.MaxUint256)
      ).to.be.revertedWith("Invalid pool");
    });

    it("reverts on slippage exceeded", async function () {
      await expect(
        router.connect(alice).buy(0, SHARES, 1)
      ).to.be.revertedWith("Slippage exceeded");
    });

    it("reverts when user has insufficient balance", async function () {
      await expect(
        router.connect(outsider).buy(0, SHARES, ethers.MaxUint256)
      ).to.be.reverted;
    });

    it("allows multiple users to buy in the same pool", async function () {
      await router.connect(alice).buy(0, SHARES, ethers.MaxUint256);
      await router.connect(bob).buy(0, SHARES, ethers.MaxUint256);

      const p = await pool(pool0Addr);
      expect(await p.holdings(alice.address)).to.equal(SHARES);
      expect(await p.holdings(bob.address)).to.equal(SHARES);
      expect(await p.totalShares()).to.equal(SHARES * 2n);
    });

    it("works with zero fee (no protocol/dividend fees)", async function () {
      await router.setFeeBps(0);

      const hubBefore = await token.balanceOf(hubAddr);
      const feeBefore = await token.balanceOf(feeRecipient.address);

      await router.connect(alice).buy(0, SHARES, ethers.MaxUint256);

      expect(await token.balanceOf(hubAddr) - hubBefore).to.equal(0);
      expect(await token.balanceOf(feeRecipient.address) - feeBefore).to.equal(0);

      const p = await pool(pool0Addr);
      expect(await p.holdings(alice.address)).to.equal(SHARES);
    });
  });

  // --------------------------------------------------------------------------
  //  TRADING: sell
  // --------------------------------------------------------------------------
  describe("sell", function () {
    beforeEach(async function () {
      await router.connect(alice).buy(0, SHARES, ethers.MaxUint256);
    });

    it("returns net revenue to seller", async function () {
      const balBefore = await token.balanceOf(alice.address);
      await router.connect(alice).sell(0, SHARES, 0);
      const balAfter = await token.balanceOf(alice.address);
      expect(balAfter - balBefore).to.be.gt(0);
    });

    it("deducts shares from seller", async function () {
      await router.connect(alice).sell(0, SHARES, 0);
      const p = await pool(pool0Addr);
      expect(await p.holdings(alice.address)).to.equal(0);
    });

    it("sends protocol fee to recipient on sell", async function () {
      const feeBefore = await token.balanceOf(feeRecipient.address);
      await router.connect(alice).sell(0, SHARES, 0);
      const feeAfter = await token.balanceOf(feeRecipient.address);
      expect(feeAfter - feeBefore).to.be.gt(0);
    });

    it("sends dividend fee to hub on sell", async function () {
      const hubBefore = await token.balanceOf(hubAddr);
      await router.connect(alice).sell(0, SHARES, 0);
      const hubAfter = await token.balanceOf(hubAddr);
      expect(hubAfter - hubBefore).to.be.gt(0);
    });

    it("emits Sell event", async function () {
      await expect(router.connect(alice).sell(0, SHARES, 0))
        .to.emit(router, "Sell");
    });

    it("reverts when contract is killed", async function () {
      await router.emergencyShutdown();
      await expect(
        router.connect(alice).sell(0, SHARES, 0)
      ).to.be.revertedWith("Contract shut down");
    });

    it("reverts when trading is paused", async function () {
      await router.setTradingPaused(true);
      await expect(
        router.connect(alice).sell(0, SHARES, 0)
      ).to.be.revertedWith("Trading paused");
    });

    it("allows blacklisted user to sell (not trapped)", async function () {
      await router.setBlacklist(alice.address, true);
      await router.connect(alice).sell(0, SHARES, 0);

      const p = await pool(pool0Addr);
      expect(await p.holdings(alice.address)).to.equal(0);
    });

    it("reverts for invalid pool index", async function () {
      await expect(
        router.connect(alice).sell(99, SHARES, 0)
      ).to.be.revertedWith("Invalid pool");
    });

    it("reverts when user has no shares", async function () {
      await expect(
        router.connect(bob).sell(0, SHARES, 0)
      ).to.be.revertedWith("Insufficient shares");
    });

    it("allows partial sell", async function () {
      const half = SHARES / 2n;
      await router.connect(alice).sell(0, half, 0);

      const p = await pool(pool0Addr);
      expect(await p.holdings(alice.address)).to.equal(SHARES - half);
    });
  });

  // --------------------------------------------------------------------------
  //  GLOBAL CONTROLS
  // --------------------------------------------------------------------------
  describe("Global controls", function () {
    describe("setTradingPaused", function () {
      it("toggles pause and emits event", async function () {
        await expect(router.setTradingPaused(true))
          .to.emit(router, "TradingPaused")
          .withArgs(true);
        expect(await router.tradingPaused()).to.be.true;

        await expect(router.setTradingPaused(false))
          .to.emit(router, "TradingPaused")
          .withArgs(false);
        expect(await router.tradingPaused()).to.be.false;
      });

      it("reverts for non-owner", async function () {
        await expect(
          router.connect(outsider).setTradingPaused(true)
        ).to.be.reverted;
      });
    });

    describe("setBlacklist", function () {
      it("marks user and emits event", async function () {
        await expect(router.setBlacklist(alice.address, true))
          .to.emit(router, "AddressBlacklisted")
          .withArgs(alice.address, true);
        expect(await router.blacklisted(alice.address)).to.be.true;
      });

      it("can un-blacklist a user", async function () {
        await router.setBlacklist(alice.address, true);
        await router.setBlacklist(alice.address, false);
        expect(await router.blacklisted(alice.address)).to.be.false;
      });

      it("reverts for non-owner", async function () {
        await expect(
          router.connect(outsider).setBlacklist(alice.address, true)
        ).to.be.reverted;
      });
    });

    describe("Allowlist", function () {
      it("setAllowlistEnabled toggles and emits event", async function () {
        await expect(router.setAllowlistEnabled(true))
          .to.emit(router, "AllowlistEnabled")
          .withArgs(true);
        expect(await router.allowlistEnabled()).to.be.true;
      });

      it("setAllowlist marks user and emits event", async function () {
        await expect(router.setAllowlist(alice.address, true))
          .to.emit(router, "AllowlistUpdated")
          .withArgs(alice.address, true);
        expect(await router.allowlisted(alice.address)).to.be.true;
      });

      it("setAllowlistBatch marks multiple users", async function () {
        await router.setAllowlistBatch(
          [alice.address, bob.address],
          true
        );
        expect(await router.allowlisted(alice.address)).to.be.true;
        expect(await router.allowlisted(bob.address)).to.be.true;
      });

      it("setAllowlistBatch can remove users", async function () {
        await router.setAllowlistBatch([alice.address], true);
        await router.setAllowlistBatch([alice.address], false);
        expect(await router.allowlisted(alice.address)).to.be.false;
      });

      it("all allowlist functions revert for non-owner", async function () {
        await expect(router.connect(outsider).setAllowlistEnabled(true)).to.be.reverted;
        await expect(router.connect(outsider).setAllowlist(alice.address, true)).to.be.reverted;
        await expect(
          router.connect(outsider).setAllowlistBatch([alice.address], true)
        ).to.be.reverted;
      });
    });
  });

  // --------------------------------------------------------------------------
  //  EMERGENCY CONTROLS
  // --------------------------------------------------------------------------
  describe("Emergency controls", function () {
    describe("emergencyShutdown", function () {
      it("sets killed and pauses trading, emits event", async function () {
        await expect(router.emergencyShutdown())
          .to.emit(router, "EmergencyShutdown");
        expect(await router.killed()).to.be.true;
        expect(await router.tradingPaused()).to.be.true;
      });

      it("reverts for non-owner", async function () {
        await expect(router.connect(outsider).emergencyShutdown()).to.be.reverted;
      });
    });

    describe("emergencyExit", function () {
      beforeEach(async function () {
        await router.connect(alice).buy(0, SHARES, ethers.MaxUint256);
        await router.connect(alice).buy(1, SHARES, ethers.MaxUint256);
      });

      it("refunds all positions across pools to user", async function () {
        await router.emergencyShutdown();

        const balBefore = await token.balanceOf(alice.address);
        await router.connect(alice).emergencyExit();
        const balAfter = await token.balanceOf(alice.address);

        expect(balAfter - balBefore).to.be.gt(0);

        // Holdings should be zeroed
        const p0 = await pool(pool0Addr);
        const p1 = await pool(pool1Addr);
        expect(await p0.holdings(alice.address)).to.equal(0);
        expect(await p1.holdings(alice.address)).to.equal(0);
      });

      it("emits EmergencyExit event", async function () {
        await router.emergencyShutdown();
        await expect(router.connect(alice).emergencyExit())
          .to.emit(router, "EmergencyExit");
      });

      it("reverts when not in emergency mode", async function () {
        await expect(
          router.connect(alice).emergencyExit()
        ).to.be.revertedWith("Not in emergency mode");
      });

      it("reverts when user has nothing to withdraw", async function () {
        await router.emergencyShutdown();
        await expect(
          router.connect(bob).emergencyExit()
        ).to.be.revertedWith("Nothing to withdraw");
      });
    });

    describe("emergencyDrain", function () {
      beforeEach(async function () {
        await router.connect(alice).buy(0, SHARES, ethers.MaxUint256);
      });

      it("drains all pool and router funds to target", async function () {
        await router.emergencyShutdown();

        const poolBal = await token.balanceOf(pool0Addr);
        expect(poolBal).to.be.gt(0);

        const targetBefore = await token.balanceOf(deployer.address);
        await router.emergencyDrain(deployer.address);
        const targetAfter = await token.balanceOf(deployer.address);

        expect(targetAfter - targetBefore).to.be.gt(0);
        expect(await token.balanceOf(pool0Addr)).to.equal(0);
      });

      it("emits EmergencyDrain event", async function () {
        await router.emergencyShutdown();
        await expect(router.emergencyDrain(deployer.address))
          .to.emit(router, "EmergencyDrain");
      });

      it("reverts when not shut down", async function () {
        await expect(
          router.emergencyDrain(deployer.address)
        ).to.be.revertedWith("Must shutdown first");
      });

      it("reverts for zero address", async function () {
        await router.emergencyShutdown();
        await expect(
          router.emergencyDrain(ethers.ZeroAddress)
        ).to.be.revertedWith("Invalid address");
      });

      it("reverts for non-owner", async function () {
        await router.emergencyShutdown();
        await expect(
          router.connect(outsider).emergencyDrain(deployer.address)
        ).to.be.reverted;
      });
    });

    describe("forceLiquidate", function () {
      beforeEach(async function () {
        await router.connect(alice).buy(0, SHARES, ethers.MaxUint256);
      });

      it("refunds user and zeros holdings", async function () {
        const balBefore = await token.balanceOf(alice.address);
        await router.forceLiquidate(alice.address, 0);
        const balAfter = await token.balanceOf(alice.address);

        expect(balAfter - balBefore).to.be.gt(0);
        const p = await pool(pool0Addr);
        expect(await p.holdings(alice.address)).to.equal(0);
      });

      it("emits ForceLiquidation event", async function () {
        await expect(router.forceLiquidate(alice.address, 0))
          .to.emit(router, "ForceLiquidation");
      });

      it("reverts for invalid pool", async function () {
        await expect(
          router.forceLiquidate(alice.address, 99)
        ).to.be.revertedWith("Invalid pool");
      });

      it("reverts when user has no holdings", async function () {
        await expect(
          router.forceLiquidate(bob.address, 0)
        ).to.be.revertedWith("No holdings");
      });

      it("reverts for non-owner", async function () {
        await expect(
          router.connect(outsider).forceLiquidate(alice.address, 0)
        ).to.be.reverted;
      });
    });

    describe("resetPlayerPool", function () {
      it("sets new reserves and emits event", async function () {
        const newS = 2000n * SCALE;
        const newC = 20000n * SCALE;

        await expect(router.resetPlayerPool(0, newS, newC))
          .to.emit(router, "PlayerPoolReset")
          .withArgs(0, newS, newC);

        const p = await pool(pool0Addr);
        expect(await p.virtualShares()).to.equal(newS);
        expect(await p.virtualCash()).to.equal(newC);
      });

      it("reverts for invalid pool", async function () {
        await expect(
          router.resetPlayerPool(99, 1000, 1000)
        ).to.be.revertedWith("Invalid pool");
      });

      it("reverts for non-owner", async function () {
        await expect(
          router.connect(outsider).resetPlayerPool(0, 1000, 1000)
        ).to.be.reverted;
      });
    });

    describe("setPlayerActive", function () {
      it("toggles pool active flag", async function () {
        await router.setPlayerActive(0, false);
        const p = await pool(pool0Addr);
        expect(await p.active()).to.be.false;

        await router.setPlayerActive(0, true);
        expect(await p.active()).to.be.true;
      });

      it("inactive pool rejects buys", async function () {
        await router.setPlayerActive(0, false);
        await expect(
          router.connect(alice).buy(0, SHARES, ethers.MaxUint256)
        ).to.be.revertedWith("Player not active");
      });

      it("reverts for invalid pool", async function () {
        await expect(
          router.setPlayerActive(99, false)
        ).to.be.revertedWith("Invalid pool");
      });

      it("reverts for non-owner", async function () {
        await expect(
          router.connect(outsider).setPlayerActive(0, false)
        ).to.be.reverted;
      });
    });
  });

  // --------------------------------------------------------------------------
  //  VIEW FUNCTIONS
  // --------------------------------------------------------------------------
  describe("View functions", function () {
    describe("getPrice", function () {
      it("returns initial price", async function () {
        const p = await pool(pool0Addr);
        const expected = await p.getPrice();
        expect(await router.getPrice(0)).to.equal(expected);
      });

      it("reverts for invalid pool", async function () {
        await expect(router.getPrice(99)).to.be.revertedWith("Invalid pool");
      });
    });

    describe("getBuyQuote", function () {
      it("returns correct cost, fee, total, and newPrice", async function () {
        const [cost, fee, total, newPrice] = await router.getBuyQuote(0, SHARES);

        const p = await pool(pool0Addr);
        const expectedCost = await p.getBuyCost(SHARES);
        const expectedFee = (expectedCost * 150n) / BPS;

        expect(cost).to.equal(expectedCost);
        expect(fee).to.equal(expectedFee);
        expect(total).to.equal(expectedCost + expectedFee);
        expect(newPrice).to.be.gt(await p.getPrice());
      });

      it("reverts for invalid pool", async function () {
        await expect(router.getBuyQuote(99, SHARES)).to.be.revertedWith(
          "Invalid pool"
        );
      });
    });

    describe("getSellQuote", function () {
      it("returns correct revenue, fee, net, and newPrice", async function () {
        const [revenue, fee, net, newPrice] = await router.getSellQuote(0, SHARES);

        const p = await pool(pool0Addr);
        const expectedRevenue = await p.getSellRevenue(SHARES);
        const expectedFee = (expectedRevenue * 150n) / BPS;

        expect(revenue).to.equal(expectedRevenue);
        expect(fee).to.equal(expectedFee);
        expect(net).to.equal(expectedRevenue - expectedFee);
        expect(newPrice).to.be.lt(await p.getPrice());
      });

      it("reverts for invalid pool", async function () {
        await expect(router.getSellQuote(99, SHARES)).to.be.revertedWith(
          "Invalid pool"
        );
      });
    });

    describe("getHoldings", function () {
      it("returns 0 for user with no holdings", async function () {
        expect(await router.getHoldings(0, alice.address)).to.equal(0);
      });

      it("returns correct holdings after buy", async function () {
        await router.connect(alice).buy(0, SHARES, ethers.MaxUint256);
        expect(await router.getHoldings(0, alice.address)).to.equal(SHARES);
      });

      it("returns 0 for invalid pool (does not revert)", async function () {
        expect(await router.getHoldings(99, alice.address)).to.equal(0);
      });
    });

    describe("getPortfolio", function () {
      it("returns empty arrays for user with no positions", async function () {
        const [idxs, shares, values] = await router.getPortfolio(alice.address);
        expect(idxs.length).to.equal(0);
        expect(shares.length).to.equal(0);
        expect(values.length).to.equal(0);
      });

      it("returns all held positions", async function () {
        await router.connect(alice).buy(0, SHARES, ethers.MaxUint256);
        await router.connect(alice).buy(1, SHARES, ethers.MaxUint256);

        const [idxs, shares, values] = await router.getPortfolio(alice.address);

        expect(idxs.length).to.equal(2);
        expect(idxs[0]).to.equal(0);
        expect(idxs[1]).to.equal(1);
        expect(shares[0]).to.equal(SHARES);
        expect(shares[1]).to.equal(SHARES);
        expect(values[0]).to.be.gt(0);
        expect(values[1]).to.be.gt(0);
      });
    });

    describe("getPortfolioPaginated", function () {
      beforeEach(async function () {
        await router.connect(alice).buy(0, SHARES, ethers.MaxUint256);
        await router.connect(alice).buy(1, SHARES, ethers.MaxUint256);
      });

      it("returns only pools within the specified range", async function () {
        const [idxs, shares, values] = await router.getPortfolioPaginated(
          alice.address, 0, 1
        );
        expect(idxs.length).to.equal(1);
        expect(idxs[0]).to.equal(0);
      });

      it("handles offset beyond pool count gracefully", async function () {
        const [idxs] = await router.getPortfolioPaginated(
          alice.address, 100, 10
        );
        expect(idxs.length).to.equal(0);
      });
    });

    describe("getAllPlayers", function () {
      it("returns info for all pools", async function () {
        const [names, symbols, prices, totalSharesArr] =
          await router.getAllPlayers();

        expect(names.length).to.equal(2);
        expect(names[0]).to.equal("Player A");
        expect(names[1]).to.equal("Player B");
        expect(symbols[0]).to.equal("PLRA");
        expect(symbols[1]).to.equal("PLRB");
        expect(prices[0]).to.be.gt(0);
        expect(totalSharesArr[0]).to.equal(0);
      });

      it("reflects updated totalShares after trades", async function () {
        await router.connect(alice).buy(0, SHARES, ethers.MaxUint256);
        const [, , , totalSharesArr] = await router.getAllPlayers();
        expect(totalSharesArr[0]).to.equal(SHARES);
      });
    });

    describe("getAllPlayersPaginated", function () {
      it("returns subset of players", async function () {
        const [names, symbols] = await router.getAllPlayersPaginated(0, 1);
        expect(names.length).to.equal(1);
        expect(names[0]).to.equal("Player A");
      });

      it("handles offset beyond pool count", async function () {
        const [names] = await router.getAllPlayersPaginated(100, 10);
        expect(names.length).to.equal(0);
      });
    });
  });

  // --------------------------------------------------------------------------
  //  INTEGRATION
  // --------------------------------------------------------------------------
  describe("Integration", function () {
    it("full buy-sell round trip: fees flow to correct destinations", async function () {
      const aliceBefore = await token.balanceOf(alice.address);
      const hubBefore = await token.balanceOf(hubAddr);
      const feeBefore = await token.balanceOf(feeRecipient.address);

      // Buy
      await router.connect(alice).buy(0, SHARES, ethers.MaxUint256);
      const afterBuy = await token.balanceOf(alice.address);
      const spent = aliceBefore - afterBuy;

      // Sell
      await router.connect(alice).sell(0, SHARES, 0);
      const afterSell = await token.balanceOf(alice.address);

      // User lost money (paid buy fee + sell fee + AMM spread)
      expect(afterSell).to.be.lt(aliceBefore);

      // Hub received dividend fees from both buy and sell
      const hubGain = (await token.balanceOf(hubAddr)) - hubBefore;
      expect(hubGain).to.be.gt(0);

      // Fee recipient received protocol fees from both buy and sell
      const feeGain = (await token.balanceOf(feeRecipient.address)) - feeBefore;
      expect(feeGain).to.be.gt(0);
    });

    it("buy increases price, sell decreases price", async function () {
      const priceBefore = await router.getPrice(0);

      await router.connect(alice).buy(0, SHARES, ethers.MaxUint256);
      const priceAfterBuy = await router.getPrice(0);
      expect(priceAfterBuy).to.be.gt(priceBefore);

      await router.connect(alice).sell(0, SHARES, 0);
      const priceAfterSell = await router.getPrice(0);
      expect(priceAfterSell).to.be.lt(priceAfterBuy);
      // Price returns to original after roundtrip (no fees in AMM)
      expect(priceAfterSell).to.equal(priceBefore);
    });

    it("emergency shutdown → exit → drain lifecycle", async function () {
      await router.connect(alice).buy(0, SHARES, ethers.MaxUint256);
      await router.connect(bob).buy(1, SHARES, ethers.MaxUint256);

      await router.emergencyShutdown();

      // Alice exits her positions
      const aliceBefore = await token.balanceOf(alice.address);
      await router.connect(alice).emergencyExit();
      expect(await token.balanceOf(alice.address)).to.be.gt(aliceBefore);

      // Bob does NOT exit — owner drains remaining funds (Bob's pool still has balance)
      const pool1Bal = await token.balanceOf(pool1Addr);
      expect(pool1Bal).to.be.gt(0);

      const deployerBefore = await token.balanceOf(deployer.address);
      await router.emergencyDrain(deployer.address);
      expect(await token.balanceOf(deployer.address)).to.be.gt(deployerBefore);

      // All pools drained
      expect(await token.balanceOf(pool0Addr)).to.equal(0);
      expect(await token.balanceOf(pool1Addr)).to.equal(0);
    });

    it("fee changes take effect on next trade", async function () {
      await router.setFeeBps(500); // 5%

      const p = await pool(pool0Addr);
      const rawCost = await p.getBuyCost(SHARES);
      const expectedFee = (rawCost * 500n) / BPS;

      const hubBefore = await token.balanceOf(hubAddr);
      const feeBefore = await token.balanceOf(feeRecipient.address);

      await router.connect(alice).buy(0, SHARES, ethers.MaxUint256);

      const totalFee =
        (await token.balanceOf(hubAddr)) -
        hubBefore +
        ((await token.balanceOf(feeRecipient.address)) - feeBefore);

      expect(totalFee).to.equal(expectedFee);
    });
  });
});
