const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("Factory Pattern (Router + Pool + Hub)", function () {
  let deployer, user1, user2, feeRecipient;
  let usdc, dbucks, factory, router, hub;

  const INITIAL_SHARES = 1000n * 10n ** 6n;
  const INITIAL_CASH = 10000n * 10n ** 6n;
  const FAUCET_LIMIT = 100000n * 10n ** 6n;
  const BUY_SHARES = 10n * 10n ** 6n; // 10 shares

  beforeEach(async function () {
    [deployer, user1, user2, feeRecipient] = await ethers.getSigners();

    // Deploy MockUSDC
    const MockUSDC = await ethers.getContractFactory("MockUSDC");
    usdc = await MockUSDC.deploy();
    await usdc.waitForDeployment();

    // Deploy DBucks (faucet mode)
    const DBucks = await ethers.getContractFactory("DBucks");
    dbucks = await DBucks.deploy(await usdc.getAddress(), true, FAUCET_LIMIT);
    await dbucks.waitForDeployment();

    // Deploy PoolFactory
    const PoolFactory = await ethers.getContractFactory("PoolFactory");
    factory = await PoolFactory.deploy(await dbucks.getAddress());
    await factory.waitForDeployment();

    // Deploy StatixRouter
    const StatixRouter = await ethers.getContractFactory("StatixRouter");
    router = await StatixRouter.deploy(
      await dbucks.getAddress(),
      await factory.getAddress(),
      feeRecipient.address
    );
    await router.waitForDeployment();

    // Deploy DividendHub
    const DividendHub = await ethers.getContractFactory("DividendHub");
    hub = await DividendHub.deploy(
      await dbucks.getAddress(),
      await factory.getAddress(),
      await router.getAddress()
    );
    await hub.waitForDeployment();

    // Wire factory
    await factory.setRouter(await router.getAddress());
    await factory.setDividendHub(await hub.getAddress());

    // Create a test player pool
    await factory.createPool("LeBron James", "LBJ", "lebron_1", 5000n * 10n ** 6n);

    // Give users DBucks via faucet
    await dbucks.connect(user1).faucet(FAUCET_LIMIT);
    await dbucks.connect(user2).faucet(FAUCET_LIMIT);

    // Users approve Router
    await dbucks.connect(user1).approve(await router.getAddress(), ethers.MaxUint256);
    await dbucks.connect(user2).approve(await router.getAddress(), ethers.MaxUint256);
  });

  describe("Pool Creation", function () {
    it("should create a pool with correct initial state", async function () {
      expect(await factory.poolCount()).to.equal(1);

      const poolAddr = await factory.pools(0);
      expect(poolAddr).to.not.equal(ethers.ZeroAddress);

      const pool = await ethers.getContractAt("PlayerPool", poolAddr);
      expect(await pool.name()).to.equal("LeBron James");
      expect(await pool.symbol()).to.equal("LBJ");
      expect(await pool.playerId()).to.equal("lebron_1");
      expect(await pool.virtualShares()).to.equal(INITIAL_SHARES);
      expect(await pool.virtualCash()).to.equal(INITIAL_CASH);
      expect(await pool.active()).to.equal(true);
    });

    it("should create pools in batch", async function () {
      await factory.createPoolsBatch(
        ["Stephen Curry", "Kevin Durant"],
        ["SC30", "KD35"],
        ["curry_1", "durant_1"],
        [4500n * 10n ** 6n, 4800n * 10n ** 6n]
      );

      expect(await factory.poolCount()).to.equal(3); // 1 from beforeEach + 2
    });

    it("should reject duplicate player IDs", async function () {
      await expect(
        factory.createPool("LeBron Copy", "LBJ2", "lebron_1", 5000n * 10n ** 6n)
      ).to.be.revertedWith("Player already exists");
    });

    it("should reject pool creation without router set", async function () {
      const PoolFactory2 = await ethers.getContractFactory("PoolFactory");
      const factory2 = await PoolFactory2.deploy(await dbucks.getAddress());
      await factory2.waitForDeployment();

      await expect(
        factory2.createPool("Test", "TST", "test_1", 1000n * 10n ** 6n)
      ).to.be.revertedWith("Router not set");
    });
  });

  describe("Buy", function () {
    it("should buy shares through router", async function () {
      const quote = await router.getBuyQuote(0, BUY_SHARES);
      const maxCost = quote.total;

      const balBefore = await dbucks.balanceOf(user1.address);
      await router.connect(user1).buy(0, BUY_SHARES, maxCost);
      const balAfter = await dbucks.balanceOf(user1.address);

      expect(balBefore - balAfter).to.equal(maxCost);
      expect(await router.getHoldings(0, user1.address)).to.equal(BUY_SHARES);
    });

    it("should revert on slippage exceeded", async function () {
      await expect(
        router.connect(user1).buy(0, BUY_SHARES, 1n) // way too low
      ).to.be.revertedWith("Slippage exceeded");
    });

    it("should revert when trading paused", async function () {
      await router.setTradingPaused(true);
      await expect(
        router.connect(user1).buy(0, BUY_SHARES, ethers.MaxUint256)
      ).to.be.revertedWith("Trading paused");
    });

    it("should revert when blacklisted", async function () {
      await router.setBlacklist(user1.address, true);
      await expect(
        router.connect(user1).buy(0, BUY_SHARES, ethers.MaxUint256)
      ).to.be.revertedWith("Address banned");
    });

    it("should revert when allowlist enabled and not on list", async function () {
      await router.setAllowlistEnabled(true);
      await expect(
        router.connect(user1).buy(0, BUY_SHARES, ethers.MaxUint256)
      ).to.be.revertedWith("Not on allowlist");
    });

    it("should allow buy when on allowlist", async function () {
      await router.setAllowlistEnabled(true);
      await router.setAllowlist(user1.address, true);

      const quote = await router.getBuyQuote(0, BUY_SHARES);
      await router.connect(user1).buy(0, BUY_SHARES, quote.total);
      expect(await router.getHoldings(0, user1.address)).to.equal(BUY_SHARES);
    });

    it("should send fees to hub and protocol recipient", async function () {
      const hubBalBefore = await dbucks.balanceOf(await hub.getAddress());
      const feeBalBefore = await dbucks.balanceOf(feeRecipient.address);

      const quote = await router.getBuyQuote(0, BUY_SHARES);
      await router.connect(user1).buy(0, BUY_SHARES, quote.total);

      const hubBalAfter = await dbucks.balanceOf(await hub.getAddress());
      const feeBalAfter = await dbucks.balanceOf(feeRecipient.address);

      // Hub should have received dividend fee (67% of total fee)
      expect(hubBalAfter).to.be.gt(hubBalBefore);
      // Protocol fee recipient should have received 33% of total fee
      expect(feeBalAfter).to.be.gt(feeBalBefore);
    });

    it("should increase AMM price after buy", async function () {
      const priceBefore = await router.getPrice(0);
      const quote = await router.getBuyQuote(0, BUY_SHARES);
      await router.connect(user1).buy(0, BUY_SHARES, quote.total);
      const priceAfter = await router.getPrice(0);

      expect(priceAfter).to.be.gt(priceBefore);
    });
  });

  describe("Sell", function () {
    beforeEach(async function () {
      // User1 buys shares first
      const quote = await router.getBuyQuote(0, BUY_SHARES);
      await router.connect(user1).buy(0, BUY_SHARES, quote.total);
    });

    it("should sell shares through router", async function () {
      const sellQuote = await router.getSellQuote(0, BUY_SHARES);
      const balBefore = await dbucks.balanceOf(user1.address);

      await router.connect(user1).sell(0, BUY_SHARES, sellQuote.net);

      const balAfter = await dbucks.balanceOf(user1.address);
      expect(balAfter - balBefore).to.equal(sellQuote.net);
      expect(await router.getHoldings(0, user1.address)).to.equal(0);
    });

    it("should revert selling more than held", async function () {
      const tooMany = BUY_SHARES * 2n;
      await expect(
        router.connect(user1).sell(0, tooMany, 0)
      ).to.be.revertedWith("Insufficient shares");
    });

    it("should allow blacklisted users to sell", async function () {
      await router.setBlacklist(user1.address, true);

      const sellQuote = await router.getSellQuote(0, BUY_SHARES);
      await router.connect(user1).sell(0, BUY_SHARES, sellQuote.net);
      expect(await router.getHoldings(0, user1.address)).to.equal(0);
    });

    it("should decrease AMM price after sell", async function () {
      const priceBefore = await router.getPrice(0);
      const sellQuote = await router.getSellQuote(0, BUY_SHARES);
      await router.connect(user1).sell(0, BUY_SHARES, sellQuote.net);
      const priceAfter = await router.getPrice(0);

      expect(priceAfter).to.be.lt(priceBefore);
    });
  });

  describe("Dividends", function () {
    beforeEach(async function () {
      // Both users buy shares to generate fees
      const quote1 = await router.getBuyQuote(0, BUY_SHARES);
      await router.connect(user1).buy(0, BUY_SHARES, quote1.total);

      const quote2 = await router.getBuyQuote(0, BUY_SHARES);
      await router.connect(user2).buy(0, BUY_SHARES, quote2.total);
    });

    it("should set weekly performance", async function () {
      await hub.setWeeklyPerformanceBatch([0], [400n * 10n ** 6n]);

      const perf = await hub.weeklyPerformance(1, 0);
      expect(perf.actualPoints).to.equal(400n * 10n ** 6n);
    });

    it("should distribute dividends", async function () {
      await hub.setWeeklyPerformanceBatch([0], [400n * 10n ** 6n]);
      await hub.setOutperformerEligible([0]);

      const hubBal = await dbucks.balanceOf(await hub.getAddress());
      expect(hubBal).to.be.gt(0);

      await hub.distributeDividends();

      const wd = await hub.weeklyDividends(1);
      expect(wd.distributed).to.equal(true);
      expect(wd.totalPool).to.be.gt(0);
    });

    it("should allow users to claim dividends", async function () {
      await hub.setWeeklyPerformanceBatch([0], [400n * 10n ** 6n]);
      await hub.setOutperformerEligible([0]);
      await hub.distributeDividends();

      const dividend = await hub.calculateDividend(1, user1.address);
      expect(dividend).to.be.gt(0);

      const balBefore = await dbucks.balanceOf(user1.address);
      await hub.connect(user1).claimDividend(1);
      const balAfter = await dbucks.balanceOf(user1.address);

      expect(balAfter - balBefore).to.equal(dividend);
    });

    it("should advance week after distribution", async function () {
      await hub.setWeeklyPerformanceBatch([0], [400n * 10n ** 6n]);
      await hub.setOutperformerEligible([0]);
      await hub.distributeDividends();

      expect(await hub.currentWeek()).to.equal(1);
      await hub.advanceWeek();
      expect(await hub.currentWeek()).to.equal(2);
    });

    it("should skip week", async function () {
      await hub.skipWeek();
      expect(await hub.currentWeek()).to.equal(2);
    });

    it("should claim multiple weeks", async function () {
      // Week 1
      await hub.setWeeklyPerformanceBatch([0], [400n * 10n ** 6n]);
      await hub.setOutperformerEligible([0]);
      await hub.distributeDividends();
      await hub.advanceWeek();

      // Generate more fees for week 2
      const quote3 = await router.getBuyQuote(0, 5n * 10n ** 6n);
      await router.connect(user1).buy(0, 5n * 10n ** 6n, quote3.total);

      // Week 2
      await hub.setWeeklyPerformanceBatch([0], [350n * 10n ** 6n]);
      await hub.setOutperformerEligible([0]);
      await hub.distributeDividends();

      const balBefore = await dbucks.balanceOf(user1.address);
      await hub.connect(user1).claimMultipleWeeks([1, 2]);
      const balAfter = await dbucks.balanceOf(user1.address);

      expect(balAfter).to.be.gt(balBefore);
    });

    it("should prevent double-claiming", async function () {
      await hub.setWeeklyPerformanceBatch([0], [400n * 10n ** 6n]);
      await hub.setOutperformerEligible([0]);
      await hub.distributeDividends();

      await hub.connect(user1).claimDividend(1);

      await expect(
        hub.connect(user1).claimDividend(1)
      ).to.be.revertedWith("Already claimed");
    });
  });

  describe("Emergency Controls", function () {
    beforeEach(async function () {
      const quote = await router.getBuyQuote(0, BUY_SHARES);
      await router.connect(user1).buy(0, BUY_SHARES, quote.total);
    });

    it("should emergency shutdown", async function () {
      await router.emergencyShutdown();
      expect(await router.killed()).to.equal(true);
      expect(await router.tradingPaused()).to.equal(true);
    });

    it("should block trading after shutdown", async function () {
      await router.emergencyShutdown();
      await expect(
        router.connect(user2).buy(0, BUY_SHARES, ethers.MaxUint256)
      ).to.be.revertedWith("Contract shut down");
    });

    it("should allow emergency exit after shutdown", async function () {
      await router.emergencyShutdown();

      const balBefore = await dbucks.balanceOf(user1.address);
      await router.connect(user1).emergencyExit();
      const balAfter = await dbucks.balanceOf(user1.address);

      expect(balAfter).to.be.gt(balBefore);
      expect(await router.getHoldings(0, user1.address)).to.equal(0);
    });

    it("should force liquidate a user", async function () {
      const balBefore = await dbucks.balanceOf(user1.address);
      await router.forceLiquidate(user1.address, 0);
      const balAfter = await dbucks.balanceOf(user1.address);

      expect(balAfter).to.be.gt(balBefore);
      expect(await router.getHoldings(0, user1.address)).to.equal(0);
    });

    it("should reset player pool", async function () {
      await router.resetPlayerPool(0, 2000n * 10n ** 6n, 20000n * 10n ** 6n);

      const poolAddr = await factory.pools(0);
      const pool = await ethers.getContractAt("PlayerPool", poolAddr);
      expect(await pool.virtualShares()).to.equal(2000n * 10n ** 6n);
      expect(await pool.virtualCash()).to.equal(20000n * 10n ** 6n);
    });

    it("should deactivate/reactivate player", async function () {
      await router.setPlayerActive(0, false);

      await expect(
        router.connect(user2).buy(0, BUY_SHARES, ethers.MaxUint256)
      ).to.be.revertedWith("Player not active");

      await router.setPlayerActive(0, true);
      const quote = await router.getBuyQuote(0, BUY_SHARES);
      await router.connect(user2).buy(0, BUY_SHARES, quote.total);
      expect(await router.getHoldings(0, user2.address)).to.equal(BUY_SHARES);
    });
  });

  describe("View Functions", function () {
    it("should get price", async function () {
      const price = await router.getPrice(0);
      // Initial price = virtualCash/virtualShares * 1e6 = 10e6 * 1e6 / 1e9 = 10e6
      expect(price).to.equal(10n * 10n ** 6n);
    });

    it("should get portfolio", async function () {
      const quote = await router.getBuyQuote(0, BUY_SHARES);
      await router.connect(user1).buy(0, BUY_SHARES, quote.total);

      const [poolIdxs, shares, values] = await router.getPortfolio(user1.address);
      expect(poolIdxs.length).to.equal(1);
      expect(poolIdxs[0]).to.equal(0);
      expect(shares[0]).to.equal(BUY_SHARES);
      expect(values[0]).to.be.gt(0);
    });

    it("should get all players", async function () {
      const [names, symbols, prices, totalSharesArr] = await router.getAllPlayers();
      expect(names.length).to.equal(1);
      expect(names[0]).to.equal("LeBron James");
      expect(symbols[0]).to.equal("LBJ");
    });

    it("should get unclaimed dividends", async function () {
      const quote = await router.getBuyQuote(0, BUY_SHARES);
      await router.connect(user1).buy(0, BUY_SHARES, quote.total);

      await hub.setWeeklyPerformanceBatch([0], [400n * 10n ** 6n]);
      await hub.setOutperformerEligible([0]);
      await hub.distributeDividends();

      const [total, weekCount] = await hub.getUnclaimedDividends(user1.address);
      expect(total).to.be.gt(0);
      expect(weekCount).to.equal(1);
    });
  });

  describe("Add Player (post-launch)", function () {
    it("should add a new player pool after initial deployment", async function () {
      const countBefore = await factory.poolCount();

      await factory.createPool("Giannis Antetokounmpo", "GA34", "giannis_1", 4800n * 10n ** 6n);

      expect(await factory.poolCount()).to.equal(countBefore + 1n);

      // New pool should be tradable immediately
      const newIdx = countBefore;
      const quote = await router.getBuyQuote(newIdx, BUY_SHARES);
      await router.connect(user1).buy(newIdx, BUY_SHARES, quote.total);
      expect(await router.getHoldings(newIdx, user1.address)).to.equal(BUY_SHARES);
    });
  });
});
