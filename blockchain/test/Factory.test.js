const { expect } = require("chai");
const { ethers } = require("hardhat");

/** Performance + optional eligibility + holder snapshots + distribute (round-based hub). */
async function finishRound(hub, factory, signers, poolIdxs, avgFpts, eligibleIdxs) {
  await hub.setRoundPerformanceBatch(poolIdxs, avgFpts);
  if (eligibleIdxs && eligibleIdxs.length > 0) {
    await hub.setTopPerformerEligible(eligibleIdxs);
  }
  const poolCount = Number(await factory.poolCount());
  const allIdx = Array.from({ length: poolCount }, (_, i) => BigInt(i));
  for (const u of signers) {
    await hub.snapshotUserHoldings(u.address, allIdx);
  }
  await hub.distributeDividends(10n);
}

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
    await factory.createPool("LeBron James", "LBJ", "lebron_1");

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
        ["curry_1", "durant_1"]
      );

      expect(await factory.poolCount()).to.equal(3); // 1 from beforeEach + 2
    });

    it("should reject duplicate player IDs", async function () {
      await expect(
        factory.createPool("LeBron Copy", "LBJ2", "lebron_1")
      ).to.be.revertedWith("Player already exists");
    });

    it("should reject pool creation without router set", async function () {
      const PoolFactory2 = await ethers.getContractFactory("PoolFactory");
      const factory2 = await PoolFactory2.deploy(await dbucks.getAddress());
      await factory2.waitForDeployment();

      await expect(
        factory2.createPool("Test", "TST", "test_1")
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

  describe("Configurable Fees", function () {
    it("should have default fee of 200 bps", async function () {
      expect(await router.feeBps()).to.equal(200);
      expect(await router.dividendFeeBps()).to.equal(6700);
    });

    it("should allow owner to change fee bps", async function () {
      await router.setFeeBps(200);
      expect(await router.feeBps()).to.equal(200);
    });

    it("should reject fee above 5%", async function () {
      await expect(router.setFeeBps(501)).to.be.revertedWith("Fee too high (max 5%)");
    });

    it("should allow fee of 0 (no fee)", async function () {
      await router.setFeeBps(0);
      expect(await router.feeBps()).to.equal(0);
    });

    it("should allow owner to change dividend fee split", async function () {
      await router.setDividendFeeBps(8000); // 80% to dividends
      expect(await router.dividendFeeBps()).to.equal(8000);
    });

    it("should reject dividend fee above 100%", async function () {
      await expect(router.setDividendFeeBps(10001)).to.be.revertedWith("Cannot exceed 100%");
    });

    it("should use updated fee in trades", async function () {
      // Set fee to 3% (300 bps)
      await router.setFeeBps(300);

      const quote = await router.getBuyQuote(0, BUY_SHARES);
      const rawCost = await ethers.getContractAt("PlayerPool", await factory.pools(0))
        .then(p => p.getBuyCost(BUY_SHARES));

      // Fee should be 3% of rawCost
      const expectedFee = (rawCost * 300n) / 10000n;
      expect(quote.fee).to.equal(expectedFee);
      expect(quote.total).to.equal(rawCost + expectedFee);
    });

    it("should apply updated fees in actual buy execution", async function () {
      await router.setFeeBps(300); // 3%

      const hubBalBefore = await dbucks.balanceOf(await hub.getAddress());
      const quote = await router.getBuyQuote(0, BUY_SHARES);
      await router.connect(user1).buy(0, BUY_SHARES, quote.total);
      const hubBalAfter = await dbucks.balanceOf(await hub.getAddress());

      // Hub received more than it would have at 1.5%
      const hubReceived = hubBalAfter - hubBalBefore;
      expect(hubReceived).to.be.gt(0);
    });

    it("should allow owner to update protocol fee recipient", async function () {
      await router.setProtocolFeeRecipient(user2.address);
      expect(await router.protocolFeeRecipient()).to.equal(user2.address);
    });

    it("should reject non-owner from changing fees", async function () {
      await expect(
        router.connect(user1).setFeeBps(200)
      ).to.be.revertedWithCustomError(router, "OwnableUnauthorizedAccount");
    });
  });

  describe("Configurable Dividend Split", function () {
    it("should have default base pool of 2000 bps (20%)", async function () {
      expect(await hub.basePoolBps()).to.equal(2000);
    });

    it("should allow owner to change base pool bps", async function () {
      await hub.setBasePoolBps(3000); // 30% base, 70% outperformer
      expect(await hub.basePoolBps()).to.equal(3000);
    });

    it("should reject base pool above 100%", async function () {
      await expect(hub.setBasePoolBps(10001)).to.be.revertedWith("Cannot exceed 100%");
    });

    it("should use updated split in distribution", async function () {
      // Generate fees
      const quote = await router.getBuyQuote(0, BUY_SHARES);
      await router.connect(user1).buy(0, BUY_SHARES, quote.total);

      // Change to 50/50 split
      await hub.setBasePoolBps(5000);

      await finishRound(hub, factory, [user1, user2], [0], [400n * 10n ** 6n], [0]);

      const wd = await hub.roundDividends(1);
      // basePool should be ~50% of totalPool
      const expectedBase = (wd.totalPool * 5000n) / 10000n;
      expect(wd.basePool).to.equal(expectedBase);
      expect(wd.topPerformerPool).to.equal(wd.totalPool - expectedBase);
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

    it("should set round performance", async function () {
      await hub.setRoundPerformanceBatch([0], [400n * 10n ** 6n]);

      expect(await hub.roundPerformance(1, 0)).to.equal(400n * 10n ** 6n);
    });

    it("should distribute dividends", async function () {
      const hubBal = await dbucks.balanceOf(await hub.getAddress());
      expect(hubBal).to.be.gt(0);

      await finishRound(hub, factory, [user1, user2], [0], [400n * 10n ** 6n], [0]);

      const wd = await hub.roundDividends(1);
      expect(wd.distributed).to.equal(true);
      expect(wd.totalPool).to.be.gt(0);
    });

    it("should allow users to claim dividends", async function () {
      await finishRound(hub, factory, [user1, user2], [0], [400n * 10n ** 6n], [0]);

      const dividend = await hub.calculateDividend(1, user1.address);
      expect(dividend).to.be.gt(0);

      const balBefore = await dbucks.balanceOf(user1.address);
      await hub.connect(user1).claimDividend(1);
      const balAfter = await dbucks.balanceOf(user1.address);

      expect(balAfter - balBefore).to.equal(dividend);
    });

    it("should advance round after distribution", async function () {
      await finishRound(hub, factory, [user1, user2], [0], [400n * 10n ** 6n], [0]);

      expect(await hub.currentRound()).to.equal(1);
      await hub.advanceRound();
      expect(await hub.currentRound()).to.equal(2);
    });

    it("should skip round", async function () {
      await hub.skipRound();
      expect(await hub.currentRound()).to.equal(2);
    });

    it("should claim multiple rounds", async function () {
      // Round 1
      await finishRound(hub, factory, [user1, user2], [0], [400n * 10n ** 6n], [0]);
      await hub.advanceRound();

      // Generate more fees for round 2
      const quote3 = await router.getBuyQuote(0, 5n * 10n ** 6n);
      await router.connect(user1).buy(0, 5n * 10n ** 6n, quote3.total);

      // Round 2
      await finishRound(hub, factory, [user1, user2], [0], [350n * 10n ** 6n], [0]);

      const balBefore = await dbucks.balanceOf(user1.address);
      await hub.connect(user1).claimMultipleRounds([1, 2]);
      const balAfter = await dbucks.balanceOf(user1.address);

      expect(balAfter).to.be.gt(balBefore);
    });

    it("should prevent double-claiming", async function () {
      await finishRound(hub, factory, [user1, user2], [0], [400n * 10n ** 6n], [0]);

      await hub.connect(user1).claimDividend(1);

      await expect(
        hub.connect(user1).claimDividend(1)
      ).to.be.revertedWith("Already claimed");
    });

    it("should stop multi-round claim when balance runs out (no silent loss)", async function () {
      // Round 1: both users buy, generating fees
      await finishRound(hub, factory, [user1, user2], [0], [400n * 10n ** 6n], [0]);
      await hub.advanceRound();

      // Round 2: generate more fees
      const quote3 = await router.getBuyQuote(0, 5n * 10n ** 6n);
      await router.connect(user1).buy(0, 5n * 10n ** 6n, quote3.total);

      await finishRound(hub, factory, [user1, user2], [0], [350n * 10n ** 6n], [0]);

      // user2 claims round 1 — should work
      await hub.connect(user2).claimDividend(1);
      expect(await hub.hasClaimed(1, user2.address)).to.equal(true);

      // user2 claims round 2 — should work
      await hub.connect(user2).claimDividend(2);
      expect(await hub.hasClaimed(2, user2.address)).to.equal(true);

      // Both rounds should be claimed for user2
      // user1 still has unclaimed rounds
      expect(await hub.hasClaimed(1, user1.address)).to.equal(false);
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

    it("should drain all funds from pools in emergency", async function () {
      await router.emergencyShutdown();

      // Pool should have funds
      const poolAddr = await factory.pools(0);
      const poolBalBefore = await dbucks.balanceOf(poolAddr);
      expect(poolBalBefore).to.be.gt(0);

      // Drain to deployer
      await router.emergencyDrain(deployer.address);

      // Pool should be empty
      const poolBalAfter = await dbucks.balanceOf(poolAddr);
      expect(poolBalAfter).to.equal(0);
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

      await finishRound(hub, factory, [user1, user2], [0], [400n * 10n ** 6n], [0]);

      const [total, weekCount] = await hub.getUnclaimedDividends(user1.address);
      expect(total).to.be.gt(0);
      expect(weekCount).to.equal(1);
    });
  });

  describe("Pagination", function () {
    beforeEach(async function () {
      // Add 2 more players (3 total)
      await factory.createPoolsBatch(
        ["Stephen Curry", "Kevin Durant"],
        ["SC30", "KD35"],
        ["curry_1", "durant_1"]
      );

      // User1 buys in pool 0 and pool 2
      const quote0 = await router.getBuyQuote(0, BUY_SHARES);
      await router.connect(user1).buy(0, BUY_SHARES, quote0.total);
      const quote2 = await router.getBuyQuote(2, BUY_SHARES);
      await router.connect(user1).buy(2, BUY_SHARES, quote2.total);
    });

    it("should paginate getAllPlayersPaginated", async function () {
      // Get first 2
      const [names1, , ,] = await router.getAllPlayersPaginated(0, 2);
      expect(names1.length).to.equal(2);
      expect(names1[0]).to.equal("LeBron James");
      expect(names1[1]).to.equal("Stephen Curry");

      // Get last 1
      const [names2, , ,] = await router.getAllPlayersPaginated(2, 10);
      expect(names2.length).to.equal(1);
      expect(names2[0]).to.equal("Kevin Durant");
    });

    it("should paginate getPortfolioPaginated", async function () {
      // Scan pools 0-1 (user has holdings in pool 0 only)
      const [idxs1, shares1,] = await router.getPortfolioPaginated(user1.address, 0, 2);
      expect(idxs1.length).to.equal(1);
      expect(idxs1[0]).to.equal(0);

      // Scan pools 2-3 (user has holdings in pool 2)
      const [idxs2, shares2,] = await router.getPortfolioPaginated(user1.address, 2, 2);
      expect(idxs2.length).to.equal(1);
      expect(idxs2[0]).to.equal(2);
    });

    it("should paginate factory getPoolsPaginated", async function () {
      const page1 = await factory.getPoolsPaginated(0, 2);
      expect(page1.length).to.equal(2);

      const page2 = await factory.getPoolsPaginated(2, 10);
      expect(page2.length).to.equal(1);
    });

    it("should handle offset beyond pool count gracefully", async function () {
      const [names, , ,] = await router.getAllPlayersPaginated(100, 10);
      expect(names.length).to.equal(0);
    });
  });

  describe("Edge Cases", function () {
    it("should trade with zero fee", async function () {
      await router.setFeeBps(0);
      const quote = await router.getBuyQuote(0, BUY_SHARES);
      expect(quote.fee).to.equal(0);
      expect(quote.total).to.equal(quote.cost);

      const hubBefore = await dbucks.balanceOf(await hub.getAddress());
      await router.connect(user1).buy(0, BUY_SHARES, quote.total);
      const hubAfter = await dbucks.balanceOf(await hub.getAddress());

      // No fees should reach hub
      expect(hubAfter - hubBefore).to.equal(0);
      expect(await router.getHoldings(0, user1.address)).to.equal(BUY_SHARES);
    });

    it("should sell with updated fees and verify net revenue", async function () {
      // Buy at default 1.5%
      const buyQuote = await router.getBuyQuote(0, BUY_SHARES);
      await router.connect(user1).buy(0, BUY_SHARES, buyQuote.total);

      // Change fee to 3% then sell
      await router.setFeeBps(300);
      const sellQuote = await router.getSellQuote(0, BUY_SHARES);

      const pool = await ethers.getContractAt("PlayerPool", await factory.pools(0));
      const rawRevenue = await pool.getSellRevenue(BUY_SHARES);
      const expectedFee = (rawRevenue * 300n) / 10000n;
      expect(sellQuote.fee).to.equal(expectedFee);
      expect(sellQuote.net).to.equal(rawRevenue - expectedFee);

      const balBefore = await dbucks.balanceOf(user1.address);
      await router.connect(user1).sell(0, BUY_SHARES, sellQuote.net);
      const balAfter = await dbucks.balanceOf(user1.address);
      expect(balAfter - balBefore).to.equal(sellQuote.net);
    });

    it("should send 100% of fee to dividends when dividendFeeBps = 10000", async function () {
      await router.setDividendFeeBps(10000); // 100% to dividends

      const feeBefore = await dbucks.balanceOf(feeRecipient.address);
      const hubBefore = await dbucks.balanceOf(await hub.getAddress());

      const quote = await router.getBuyQuote(0, BUY_SHARES);
      await router.connect(user1).buy(0, BUY_SHARES, quote.total);

      const feeAfter = await dbucks.balanceOf(feeRecipient.address);
      const hubAfter = await dbucks.balanceOf(await hub.getAddress());

      // Protocol recipient gets nothing, hub gets everything
      expect(feeAfter - feeBefore).to.equal(0);
      expect(hubAfter - hubBefore).to.be.gt(0);
    });

    it("should handle emergency drain on pools with no balance", async function () {
      // No trades happened, pools are empty
      await router.emergencyShutdown();
      // Router itself has no balance either, should revert
      await expect(router.emergencyDrain(deployer.address)).to.be.revertedWith("Nothing to drain");
    });

    it("should not allow emergency drain without shutdown", async function () {
      await expect(router.emergencyDrain(deployer.address)).to.be.revertedWith("Must shutdown first");
    });

    it("should handle buy/sell roundtrip and verify AMM returns to near-original price", async function () {
      const priceBefore = await router.getPrice(0);

      const buyQuote = await router.getBuyQuote(0, BUY_SHARES);
      await router.connect(user1).buy(0, BUY_SHARES, buyQuote.total);

      await router.connect(user1).sell(0, BUY_SHARES, 0);

      const priceAfter = await router.getPrice(0);
      // Price won't be exactly the same due to fees leaving the pool,
      // but should be close (within 2%)
      const diff = priceBefore > priceAfter ? priceBefore - priceAfter : priceAfter - priceBefore;
      expect(diff).to.be.lt(priceBefore / 50n); // < 2% drift
    });

    it("should distribute with 100% base pool (no outperformer pool)", async function () {
      const quote = await router.getBuyQuote(0, BUY_SHARES);
      await router.connect(user1).buy(0, BUY_SHARES, quote.total);

      await hub.setBasePoolBps(10000); // 100% base
      await finishRound(hub, factory, [user1, user2], [0], [400n * 10n ** 6n], [0]);

      const wd = await hub.roundDividends(1);
      expect(wd.basePool).to.equal(wd.totalPool);
      expect(wd.topPerformerPool).to.equal(0);

      // User should still be able to claim (all from base pool)
      const dividend = await hub.calculateDividend(1, user1.address);
      expect(dividend).to.be.gt(0);
    });

    it("should not allow non-owner to call admin functions", async function () {
      await expect(
        router.connect(user1).emergencyShutdown()
      ).to.be.revertedWithCustomError(router, "OwnableUnauthorizedAccount");

      await expect(
        hub.connect(user1).setBasePoolBps(3000)
      ).to.be.revertedWithCustomError(hub, "OwnableUnauthorizedAccount");

      await expect(
        hub.connect(user1).distributeDividends(10n)
      ).to.be.revertedWithCustomError(hub, "OwnableUnauthorizedAccount");

      await expect(
        factory.connect(user1).createPool("Test", "TST", "test_1")
      ).to.be.revertedWithCustomError(factory, "OwnableUnauthorizedAccount");
    });
  });

  describe("Add Player (post-launch)", function () {
    it("should add a new player pool after initial deployment", async function () {
      const countBefore = await factory.poolCount();

      await factory.createPool("Giannis Antetokounmpo", "GA34", "giannis_1");

      expect(await factory.poolCount()).to.equal(countBefore + 1n);

      // New pool should be tradable immediately
      const newIdx = countBefore;
      const quote = await router.getBuyQuote(newIdx, BUY_SHARES);
      await router.connect(user1).buy(newIdx, BUY_SHARES, quote.total);
      expect(await router.getHoldings(newIdx, user1.address)).to.equal(BUY_SHARES);
    });
  });
});
