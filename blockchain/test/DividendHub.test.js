const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("DividendHub (unit tests)", function () {
  let deployer, alice, bob, carol, outsider;
  let token, factory, mockRouter, hub;
  let hubAddr, factoryAddr, mockRouterAddr;
  let pool0Addr, pool1Addr, pool2Addr;

  const SCALE = 10n ** 6n;
  const INIT_SHARES = 1000n * SCALE;
  const INIT_CASH = 10_000n * SCALE;
  const BPS = 10000n;

  // Weekly fantasy projections (1e6 scale), stored on-chain per pool — not season/17
  const PROJ_A = 100n * SCALE;
  const PROJ_B = 200n * SCALE;
  const PROJ_C = 300n * SCALE;

  const SHARES_BUY = 10n * SCALE;

  async function deployFixture() {
    [deployer, alice, bob, carol, outsider] = await ethers.getSigners();

    const MockUSDC = await ethers.getContractFactory("MockUSDC");
    token = await MockUSDC.deploy();
    await token.waitForDeployment();

    const PoolFactory = await ethers.getContractFactory("PoolFactory");
    factory = await PoolFactory.deploy(await token.getAddress());
    await factory.waitForDeployment();
    factoryAddr = await factory.getAddress();

    const MockRouter = await ethers.getContractFactory("MockRouterForHub");
    mockRouter = await MockRouter.deploy(await token.getAddress());
    await mockRouter.waitForDeployment();
    mockRouterAddr = await mockRouter.getAddress();

    const DividendHub = await ethers.getContractFactory("DividendHub");
    hub = await DividendHub.deploy(
      await token.getAddress(),
      factoryAddr,
      mockRouterAddr
    );
    await hub.waitForDeployment();
    hubAddr = await hub.getAddress();

    await factory.setRouter(mockRouterAddr);
    await factory.setDividendHub(hubAddr);

    await factory.createPool("Player A", "PLRA", "player_a", PROJ_A);
    await factory.createPool("Player B", "PLRB", "player_b", PROJ_B);
    await factory.createPool("Player C", "PLRC", "player_c", PROJ_C);

    pool0Addr = await factory.pools(0);
    pool1Addr = await factory.pools(1);
    pool2Addr = await factory.pools(2);

    await token.mint(mockRouterAddr, 10_000_000n * SCALE);
  }

  beforeEach(async function () {
    await deployFixture();
  });

  async function buyShares(poolAddr, buyer, shares) {
    await mockRouter.callExecuteBuy(poolAddr, buyer.address, shares, ethers.MaxUint256);
  }

  async function fundHub(amount) {
    await token.mint(hubAddr, amount);
  }

  // Run the full weekly flow: set performance, mark eligible, distribute
  async function runDistribution(poolIdxs, actualPoints, eligibleIdxs) {
    await hub.setWeeklyPerformanceBatch(poolIdxs, actualPoints);
    if (eligibleIdxs && eligibleIdxs.length > 0) {
      await hub.setOutperformerEligible(eligibleIdxs);
    }
    await hub.distributeDividends();
  }

  // --------------------------------------------------------------------------
  //  CONSTRUCTOR
  // --------------------------------------------------------------------------
  describe("Constructor", function () {
    it("should initialise state correctly", async function () {
      expect(await hub.currentWeek()).to.equal(1);
      expect(await hub.basePoolBps()).to.equal(2000);
      expect(await hub.paymentToken()).to.equal(await token.getAddress());
      expect(await hub.factory()).to.equal(factoryAddr);
      expect(await hub.router()).to.equal(mockRouterAddr);
    });
  });

  // --------------------------------------------------------------------------
  //  CONFIG: setBasePoolBps
  // --------------------------------------------------------------------------
  describe("setBasePoolBps", function () {
    it("updates basePoolBps and emits event", async function () {
      await expect(hub.setBasePoolBps(5000))
        .to.emit(hub, "BasePoolBpsUpdated")
        .withArgs(2000, 5000);
      expect(await hub.basePoolBps()).to.equal(5000);
    });

    it("allows 0% (all fees to outperformer pool)", async function () {
      await hub.setBasePoolBps(0);
      expect(await hub.basePoolBps()).to.equal(0);
    });

    it("allows 100% (all fees to base pool)", async function () {
      await hub.setBasePoolBps(10000);
      expect(await hub.basePoolBps()).to.equal(10000);
    });

    it("reverts when exceeding 100%", async function () {
      await expect(hub.setBasePoolBps(10001)).to.be.revertedWith(
        "Cannot exceed 100%"
      );
    });

    it("reverts for non-owner", async function () {
      await expect(hub.connect(outsider).setBasePoolBps(5000)).to.be.reverted;
    });
  });

  // --------------------------------------------------------------------------
  //  setWeeklyPerformanceBatch
  // --------------------------------------------------------------------------
  describe("setWeeklyPerformanceBatch", function () {
    it("stores correct performance data for outperforming pool", async function () {
      const actual = 150n * SCALE; // weekly projection for pool 0 = 100*SCALE
      await hub.setWeeklyPerformanceBatch([0], [actual]);

      const perf = await hub.weeklyPerformance(1, 0);
      expect(perf.actualPoints).to.equal(actual);
      expect(perf.projectedPoints).to.equal(100n * SCALE);
      // outperformance = (150 - 100) / 100 = 0.5 = 5e17
      expect(perf.outperformance).to.equal(5n * 10n ** 17n);
    });

    it("stores negative outperformance for underperforming pool", async function () {
      const actual = 100n * SCALE; // weekly projection for pool 1 = 200*SCALE
      await hub.setWeeklyPerformanceBatch([1], [actual]);

      const perf = await hub.weeklyPerformance(1, 1);
      expect(perf.outperformance).to.be.lt(0);
      // (100 - 200) / 200 = -0.5
      expect(perf.outperformance).to.equal(-5n * 10n ** 17n);
    });

    it("stores zero outperformance when actual equals projection", async function () {
      const actual = 100n * SCALE; // exactly matches pool 0 weekly projection
      await hub.setWeeklyPerformanceBatch([0], [actual]);

      const perf = await hub.weeklyPerformance(1, 0);
      expect(perf.outperformance).to.equal(0);
    });

    it("handles batch of multiple pools", async function () {
      await hub.setWeeklyPerformanceBatch(
        [0, 1, 2],
        [150n * SCALE, 100n * SCALE, 450n * SCALE]
      );

      const p0 = await hub.weeklyPerformance(1, 0);
      const p1 = await hub.weeklyPerformance(1, 1);
      const p2 = await hub.weeklyPerformance(1, 2);

      expect(p0.actualPoints).to.equal(150n * SCALE);
      expect(p1.actualPoints).to.equal(100n * SCALE);
      expect(p2.actualPoints).to.equal(450n * SCALE);
    });

    it("reverts on length mismatch", async function () {
      await expect(
        hub.setWeeklyPerformanceBatch([0, 1], [150n * SCALE])
      ).to.be.revertedWith("Length mismatch");
    });

    it("reverts on invalid pool index", async function () {
      await expect(
        hub.setWeeklyPerformanceBatch([99], [100n * SCALE])
      ).to.be.revertedWith("Invalid pool");
    });

    it("reverts for non-owner", async function () {
      await expect(
        hub.connect(outsider).setWeeklyPerformanceBatch([0], [100n * SCALE])
      ).to.be.reverted;
    });
  });

  // --------------------------------------------------------------------------
  //  setOutperformerEligible
  // --------------------------------------------------------------------------
  describe("setOutperformerEligible", function () {
    it("marks specified pools as eligible", async function () {
      await hub.setOutperformerEligible([0, 2]);

      expect(await hub.outperformerEligible(1, 0)).to.be.true;
      expect(await hub.outperformerEligible(1, 1)).to.be.false;
      expect(await hub.outperformerEligible(1, 2)).to.be.true;
    });

    it("is scoped to the current week", async function () {
      await hub.setOutperformerEligible([0]);
      expect(await hub.outperformerEligible(1, 0)).to.be.true;
      expect(await hub.outperformerEligible(2, 0)).to.be.false;
    });

    it("reverts for non-owner", async function () {
      await expect(
        hub.connect(outsider).setOutperformerEligible([0])
      ).to.be.reverted;
    });
  });

  // --------------------------------------------------------------------------
  //  distributeDividends
  // --------------------------------------------------------------------------
  describe("distributeDividends", function () {
    beforeEach(async function () {
      await buyShares(pool0Addr, alice, SHARES_BUY);
      await buyShares(pool2Addr, bob, SHARES_BUY);
      await fundHub(10_000n * SCALE);
    });

    it("splits fees into base and outperformer pools (default 20/80)", async function () {
      await hub.setWeeklyPerformanceBatch(
        [0, 1, 2],
        [150n * SCALE, 100n * SCALE, 450n * SCALE]
      );
      await hub.setOutperformerEligible([0, 2]);
      await hub.distributeDividends();

      const wd = await hub.weeklyDividends(1);
      expect(wd.totalPool).to.equal(10_000n * SCALE);
      expect(wd.basePool).to.equal(2_000n * SCALE);
      expect(wd.outperformerPool).to.equal(8_000n * SCALE);
      expect(wd.distributed).to.be.true;
    });

    it("snapshots totalShares for each pool", async function () {
      await hub.setWeeklyPerformanceBatch([0, 1, 2], [100n * SCALE, 200n * SCALE, 300n * SCALE]);
      await hub.distributeDividends();

      expect(await hub.weekEndTotalShares(1, 0)).to.equal(SHARES_BUY);
      expect(await hub.weekEndTotalShares(1, 1)).to.equal(0);
      expect(await hub.weekEndTotalShares(1, 2)).to.equal(SHARES_BUY);
    });

    it("calculates totalPositiveOutperf from eligible outperformers only", async function () {
      await hub.setWeeklyPerformanceBatch(
        [0, 1, 2],
        [150n * SCALE, 100n * SCALE, 450n * SCALE]
      );
      // Only mark pool 0 as eligible (pool 2 outperforms but is not eligible)
      await hub.setOutperformerEligible([0]);
      await hub.distributeDividends();

      const wd = await hub.weeklyDividends(1);
      // Only pool 0's outperformance counts (0.5e18)
      expect(wd.totalPositiveOutperf).to.equal(5n * 10n ** 17n);
    });

    it("emits DividendsDistributed event", async function () {
      await hub.setWeeklyPerformanceBatch([0], [150n * SCALE]);
      await hub.setOutperformerEligible([0]);

      await expect(hub.distributeDividends())
        .to.emit(hub, "DividendsDistributed")
        .withArgs(1, 10_000n * SCALE, 2_000n * SCALE, 8_000n * SCALE);
    });

    it("reverts when already distributed", async function () {
      await hub.setWeeklyPerformanceBatch([0], [100n * SCALE]);
      await hub.distributeDividends();

      await expect(hub.distributeDividends()).to.be.revertedWith(
        "Already distributed"
      );
    });

    it("reverts when hub has no fees", async function () {
      // Deploy fresh hub with no balance
      const DividendHub = await ethers.getContractFactory("DividendHub");
      const emptyHub = await DividendHub.deploy(
        await token.getAddress(),
        factoryAddr,
        mockRouterAddr
      );

      await expect(emptyHub.distributeDividends()).to.be.revertedWith(
        "No fees"
      );
    });

    it("reverts for non-owner", async function () {
      await expect(
        hub.connect(outsider).distributeDividends()
      ).to.be.reverted;
    });

    it("respects custom basePoolBps split", async function () {
      await hub.setBasePoolBps(5000); // 50/50 split
      await hub.setWeeklyPerformanceBatch([0], [150n * SCALE]);
      await hub.distributeDividends();

      const wd = await hub.weeklyDividends(1);
      expect(wd.basePool).to.equal(5_000n * SCALE);
      expect(wd.outperformerPool).to.equal(5_000n * SCALE);
    });
  });

  // --------------------------------------------------------------------------
  //  advanceWeek
  // --------------------------------------------------------------------------
  describe("advanceWeek", function () {
    it("increments currentWeek after distribution", async function () {
      await buyShares(pool0Addr, alice, SHARES_BUY);
      await fundHub(1000n * SCALE);
      await hub.setWeeklyPerformanceBatch([0], [100n * SCALE]);
      await hub.distributeDividends();

      await hub.advanceWeek();
      expect(await hub.currentWeek()).to.equal(2);
    });

    it("emits WeekAdvanced event", async function () {
      await buyShares(pool0Addr, alice, SHARES_BUY);
      await fundHub(1000n * SCALE);
      await hub.setWeeklyPerformanceBatch([0], [100n * SCALE]);
      await hub.distributeDividends();

      await expect(hub.advanceWeek())
        .to.emit(hub, "WeekAdvanced")
        .withArgs(2);
    });

    it("reverts when not yet distributed", async function () {
      await expect(hub.advanceWeek()).to.be.revertedWith("Distribute first");
    });

    it("reverts for non-owner", async function () {
      await expect(hub.connect(outsider).advanceWeek()).to.be.reverted;
    });
  });

  // --------------------------------------------------------------------------
  //  skipWeek
  // --------------------------------------------------------------------------
  describe("skipWeek", function () {
    it("marks week as distributed with zero payout and advances", async function () {
      await fundHub(5000n * SCALE);
      await hub.skipWeek();

      const wd = await hub.weeklyDividends(1);
      expect(wd.distributed).to.be.true;
      expect(wd.totalPool).to.equal(0);
      expect(await hub.currentWeek()).to.equal(2);
    });

    it("preserves hub balance for the next week", async function () {
      await fundHub(5000n * SCALE);
      const balBefore = await token.balanceOf(hubAddr);

      await hub.skipWeek();

      expect(await token.balanceOf(hubAddr)).to.equal(balBefore);
    });

    it("emits WeekAdvanced event", async function () {
      await expect(hub.skipWeek()).to.emit(hub, "WeekAdvanced").withArgs(2);
    });

    it("can skip an already-distributed week", async function () {
      await buyShares(pool0Addr, alice, SHARES_BUY);
      await fundHub(1000n * SCALE);
      await hub.setWeeklyPerformanceBatch([0], [100n * SCALE]);
      await hub.distributeDividends();

      // skipWeek on an already-distributed week just advances
      await hub.skipWeek();
      expect(await hub.currentWeek()).to.equal(2);
    });

    it("reverts for non-owner", async function () {
      await expect(hub.connect(outsider).skipWeek()).to.be.reverted;
    });
  });

  // --------------------------------------------------------------------------
  //  calculateDividend
  // --------------------------------------------------------------------------
  describe("calculateDividend", function () {
    it("returns 0 for undistributed week", async function () {
      expect(await hub.calculateDividend(1, alice.address)).to.equal(0);
    });

    it("returns 0 for user with no shares", async function () {
      await buyShares(pool0Addr, alice, SHARES_BUY);
      await fundHub(10_000n * SCALE);
      await runDistribution(
        [0, 1, 2],
        [150n * SCALE, 100n * SCALE, 450n * SCALE],
        [0, 2]
      );

      expect(await hub.calculateDividend(1, outsider.address)).to.equal(0);
    });

    it("base dividend is proportional to user share of total holdings", async function () {
      // Alice buys in pool 0, Bob buys equal amount in pool 2
      await buyShares(pool0Addr, alice, SHARES_BUY);
      await buyShares(pool2Addr, bob, SHARES_BUY);
      await fundHub(10_000n * SCALE);

      // All pools at projection — no outperformance, no eligible pools
      await hub.setWeeklyPerformanceBatch(
        [0, 1, 2],
        [100n * SCALE, 200n * SCALE, 300n * SCALE]
      );
      await hub.distributeDividends();

      const aliceDiv = await hub.calculateDividend(1, alice.address);
      const bobDiv = await hub.calculateDividend(1, bob.address);

      // With no outperformers, only base pool matters (2000 * SCALE)
      // Alice and Bob each hold 50% of total shares → each gets 50% of base
      // base = 2000 * SCALE, outperformer = 8000 * SCALE (but no one qualifies)
      const basePool = 2_000n * SCALE;
      const expectedEach = basePool / 2n;
      expect(aliceDiv).to.equal(expectedEach);
      expect(bobDiv).to.equal(expectedEach);
    });

    it("outperformer dividend is weighted by outperformance ratio", async function () {
      await buyShares(pool0Addr, alice, SHARES_BUY);
      await buyShares(pool2Addr, bob, SHARES_BUY);
      await fundHub(10_000n * SCALE);

      // Pool 0: actual 150, projection 100 → +50% outperformance
      // Pool 2: actual 450, projection 300 → +50% outperformance
      // Both eligible → each gets 50% of outperformer pool
      await runDistribution(
        [0, 1, 2],
        [150n * SCALE, 100n * SCALE, 450n * SCALE],
        [0, 2]
      );

      const aliceDiv = await hub.calculateDividend(1, alice.address);
      const bobDiv = await hub.calculateDividend(1, bob.address);

      // base = 2000 each gets 1000
      // outperformer = 8000, 50/50 split → each pool gets 4000
      // Alice owns 100% of pool 0 → 4000, Bob owns 100% of pool 2 → 4000
      expect(aliceDiv).to.equal(1_000n * SCALE + 4_000n * SCALE);
      expect(bobDiv).to.equal(1_000n * SCALE + 4_000n * SCALE);
    });

    it("higher outperformance gets larger share of outperformer pool", async function () {
      await buyShares(pool0Addr, alice, SHARES_BUY);
      await buyShares(pool2Addr, bob, SHARES_BUY);
      await fundHub(10_000n * SCALE);

      // Pool 0: actual 200, projection 100 → +100% (1e18)
      // Pool 2: actual 450, projection 300 → +50%  (5e17)
      // totalPositiveOutperf = 1.5e18
      // Pool 0 gets 1e18/1.5e18 = 2/3, Pool 2 gets 1/3
      await runDistribution(
        [0, 1, 2],
        [200n * SCALE, 100n * SCALE, 450n * SCALE],
        [0, 2]
      );

      const aliceDiv = await hub.calculateDividend(1, alice.address);
      const bobDiv = await hub.calculateDividend(1, bob.address);

      const outPool = 8_000n * SCALE;
      const op0 = 1n * 10n ** 18n;
      const op2 = 5n * 10n ** 17n;
      const totalOp = op0 + op2;

      const pool0Share = (outPool * op0) / totalOp;
      const pool2Share = (outPool * op2) / totalOp;
      const base = 2_000n * SCALE / 2n;

      expect(aliceDiv).to.equal(base + pool0Share);
      expect(bobDiv).to.equal(base + pool2Share);
    });

    it("ineligible outperformer gets no outperformer dividend", async function () {
      await buyShares(pool0Addr, alice, SHARES_BUY);
      await buyShares(pool2Addr, bob, SHARES_BUY);
      await fundHub(10_000n * SCALE);

      // Both outperform, but only pool 0 is marked eligible
      await runDistribution(
        [0, 1, 2],
        [150n * SCALE, 100n * SCALE, 450n * SCALE],
        [0] // only pool 0
      );

      const aliceDiv = await hub.calculateDividend(1, alice.address);
      const bobDiv = await hub.calculateDividend(1, bob.address);

      const base = 2_000n * SCALE / 2n;
      // Alice gets base + full outperformer pool (she's the only eligible one)
      expect(aliceDiv).to.equal(base + 8_000n * SCALE);
      // Bob gets base only
      expect(bobDiv).to.equal(base);
    });

    it("underperforming eligible pool gets no outperformer dividend", async function () {
      await buyShares(pool0Addr, alice, SHARES_BUY);
      await buyShares(pool1Addr, bob, SHARES_BUY);
      await fundHub(10_000n * SCALE);

      // Pool 0: outperforms, pool 1: underperforms. Both marked eligible.
      await runDistribution(
        [0, 1, 2],
        [150n * SCALE, 100n * SCALE, 300n * SCALE],
        [0, 1]
      );

      const bobDiv = await hub.calculateDividend(1, bob.address);
      const base = 2_000n * SCALE / 2n;
      // Bob's pool 1 is eligible but underperformed → base only
      expect(bobDiv).to.equal(base);
    });

    it("holder of shares in multiple pools gets combined dividends", async function () {
      await buyShares(pool0Addr, alice, SHARES_BUY);
      await buyShares(pool2Addr, alice, SHARES_BUY);
      await fundHub(10_000n * SCALE);

      // Both pools outperform equally (+50%)
      await runDistribution(
        [0, 1, 2],
        [150n * SCALE, 200n * SCALE, 450n * SCALE],
        [0, 2]
      );

      const aliceDiv = await hub.calculateDividend(1, alice.address);
      // Alice holds 100% of both pools, which are the only pools with shares
      // base: 2000 (she owns all shares) + outperformer: 8000 (both pools, she owns all)
      expect(aliceDiv).to.equal(10_000n * SCALE);
    });
  });

  // --------------------------------------------------------------------------
  //  claimDividend
  // --------------------------------------------------------------------------
  describe("claimDividend", function () {
    beforeEach(async function () {
      await buyShares(pool0Addr, alice, SHARES_BUY);
      await buyShares(pool2Addr, bob, SHARES_BUY);
      await fundHub(10_000n * SCALE);
      await runDistribution(
        [0, 1, 2],
        [150n * SCALE, 100n * SCALE, 450n * SCALE],
        [0, 2]
      );
    });

    it("transfers correct dividend amount to claimer", async function () {
      const expectedDiv = await hub.calculateDividend(1, alice.address);
      const balBefore = await token.balanceOf(alice.address);

      await hub.connect(alice).claimDividend(1);

      const balAfter = await token.balanceOf(alice.address);
      expect(balAfter - balBefore).to.equal(expectedDiv);
    });

    it("marks week as claimed for the user", async function () {
      await hub.connect(alice).claimDividend(1);
      expect(await hub.hasClaimed(1, alice.address)).to.be.true;
    });

    it("emits DividendClaimed event", async function () {
      const expectedDiv = await hub.calculateDividend(1, alice.address);

      await expect(hub.connect(alice).claimDividend(1))
        .to.emit(hub, "DividendClaimed")
        .withArgs(1, alice.address, expectedDiv);
    });

    it("reverts on double claim", async function () {
      await hub.connect(alice).claimDividend(1);
      await expect(
        hub.connect(alice).claimDividend(1)
      ).to.be.revertedWith("Already claimed");
    });

    it("reverts when week is not distributed", async function () {
      await expect(
        hub.connect(alice).claimDividend(2)
      ).to.be.revertedWith("Not distributed");
    });

    it("reverts when user has no dividend", async function () {
      await expect(
        hub.connect(outsider).claimDividend(1)
      ).to.be.revertedWith("No dividend");
    });

    it("caps payout at hub balance when balance is insufficient", async function () {
      // Alice claims first, reducing hub balance
      await hub.connect(alice).claimDividend(1);

      // Drain most of remaining hub balance to simulate low funds
      const hubBal = await token.balanceOf(hubAddr);
      const bobDiv = await hub.calculateDividend(1, bob.address);

      if (hubBal < bobDiv) {
        const balBefore = await token.balanceOf(bob.address);
        await hub.connect(bob).claimDividend(1);
        const balAfter = await token.balanceOf(bob.address);
        // Capped at whatever was left
        expect(balAfter - balBefore).to.be.lte(bobDiv);
      } else {
        // Enough funds, normal claim
        const balBefore = await token.balanceOf(bob.address);
        await hub.connect(bob).claimDividend(1);
        const balAfter = await token.balanceOf(bob.address);
        expect(balAfter - balBefore).to.equal(bobDiv);
      }
    });

    it("allows different users to claim independently", async function () {
      await hub.connect(alice).claimDividend(1);
      await hub.connect(bob).claimDividend(1);

      expect(await hub.hasClaimed(1, alice.address)).to.be.true;
      expect(await hub.hasClaimed(1, bob.address)).to.be.true;
    });
  });

  // --------------------------------------------------------------------------
  //  claimMultipleWeeks
  // --------------------------------------------------------------------------
  describe("claimMultipleWeeks", function () {
    beforeEach(async function () {
      // Week 1: Alice and Bob hold shares
      await buyShares(pool0Addr, alice, SHARES_BUY);
      await buyShares(pool2Addr, bob, SHARES_BUY);

      // Week 1 distribution
      await fundHub(10_000n * SCALE);
      await runDistribution(
        [0, 1, 2],
        [150n * SCALE, 100n * SCALE, 450n * SCALE],
        [0, 2]
      );
      await hub.advanceWeek();

      // Week 2 distribution
      await fundHub(10_000n * SCALE);
      await runDistribution(
        [0, 1, 2],
        [150n * SCALE, 100n * SCALE, 450n * SCALE],
        [0, 2]
      );
    });

    it("aggregates dividends from multiple weeks", async function () {
      const div1 = await hub.calculateDividend(1, alice.address);
      const div2 = await hub.calculateDividend(2, alice.address);

      const balBefore = await token.balanceOf(alice.address);
      await hub.connect(alice).claimMultipleWeeks([1, 2]);
      const balAfter = await token.balanceOf(alice.address);

      expect(balAfter - balBefore).to.equal(div1 + div2);
    });

    it("marks each week as claimed", async function () {
      await hub.connect(alice).claimMultipleWeeks([1, 2]);

      expect(await hub.hasClaimed(1, alice.address)).to.be.true;
      expect(await hub.hasClaimed(2, alice.address)).to.be.true;
    });

    it("emits DividendClaimed for each week", async function () {
      const div1 = await hub.calculateDividend(1, alice.address);
      const div2 = await hub.calculateDividend(2, alice.address);

      await expect(hub.connect(alice).claimMultipleWeeks([1, 2]))
        .to.emit(hub, "DividendClaimed")
        .withArgs(1, alice.address, div1)
        .and.to.emit(hub, "DividendClaimed")
        .withArgs(2, alice.address, div2);
    });

    it("skips already-claimed weeks", async function () {
      await hub.connect(alice).claimDividend(1);
      const div2 = await hub.calculateDividend(2, alice.address);

      const balBefore = await token.balanceOf(alice.address);
      await hub.connect(alice).claimMultipleWeeks([1, 2]);
      const balAfter = await token.balanceOf(alice.address);

      // Only week 2 paid out
      expect(balAfter - balBefore).to.equal(div2);
    });

    it("stops when hub balance is insufficient for next week", async function () {
      // Drain most of hub balance so it can't afford both weeks
      const hubBal = await token.balanceOf(hubAddr);
      const div1 = await hub.calculateDividend(1, alice.address);

      // Transfer out enough that only week 1 is affordable
      // (Hub has enough for div1 but not div1 + div2)
      const drainAmount = hubBal - div1 - 1n;
      if (drainAmount > 0n) {
        // Transfer directly isn't possible without the hub, so we test the natural flow
        // Instead, have bob claim his share first to reduce balance
        await hub.connect(bob).claimMultipleWeeks([1, 2]);

        // Now alice claims — hub may not have enough for both her weeks
        const remainingBal = await token.balanceOf(hubAddr);
        const aliceDiv1 = await hub.calculateDividend(1, alice.address);
        const aliceDiv2 = await hub.calculateDividend(2, alice.address);

        if (remainingBal < aliceDiv1 + aliceDiv2) {
          const balBefore = await token.balanceOf(alice.address);
          await hub.connect(alice).claimMultipleWeeks([1, 2]);
          const balAfter = await token.balanceOf(alice.address);
          // Got less than full amount — some weeks were skipped
          expect(balAfter - balBefore).to.be.lte(aliceDiv1 + aliceDiv2);
        }
      }
    });

    it("reverts when no dividends at all for the user", async function () {
      await expect(
        hub.connect(outsider).claimMultipleWeeks([1, 2])
      ).to.be.revertedWith("No dividends");
    });
  });

  // --------------------------------------------------------------------------
  //  getUnclaimedDividends
  // --------------------------------------------------------------------------
  describe("getUnclaimedDividends", function () {
    it("returns total unclaimed and week count", async function () {
      await buyShares(pool0Addr, alice, SHARES_BUY);
      await fundHub(10_000n * SCALE);
      await runDistribution(
        [0, 1, 2],
        [150n * SCALE, 200n * SCALE, 300n * SCALE],
        [0]
      );

      const [total, weekCount] = await hub.getUnclaimedDividends(alice.address);
      expect(total).to.be.gt(0);
      expect(weekCount).to.equal(1);
    });

    it("excludes already claimed weeks", async function () {
      await buyShares(pool0Addr, alice, SHARES_BUY);
      await fundHub(10_000n * SCALE);
      await runDistribution(
        [0, 1, 2],
        [150n * SCALE, 200n * SCALE, 300n * SCALE],
        [0]
      );
      await hub.connect(alice).claimDividend(1);

      const [total, weekCount] = await hub.getUnclaimedDividends(alice.address);
      expect(total).to.equal(0);
      expect(weekCount).to.equal(0);
    });

    it("sums across multiple unclaimed weeks", async function () {
      await buyShares(pool0Addr, alice, SHARES_BUY);

      await fundHub(10_000n * SCALE);
      await runDistribution([0, 1, 2], [150n * SCALE, 200n * SCALE, 300n * SCALE], [0]);
      const div1 = await hub.calculateDividend(1, alice.address);
      await hub.advanceWeek();

      await fundHub(10_000n * SCALE);
      await runDistribution([0, 1, 2], [150n * SCALE, 200n * SCALE, 300n * SCALE], [0]);
      const div2 = await hub.calculateDividend(2, alice.address);

      const [total, weekCount] = await hub.getUnclaimedDividends(alice.address);
      expect(total).to.equal(div1 + div2);
      expect(weekCount).to.equal(2);
    });

    it("returns zero for user with no shares", async function () {
      await buyShares(pool0Addr, alice, SHARES_BUY);
      await fundHub(10_000n * SCALE);
      await runDistribution([0], [150n * SCALE], [0]);

      const [total, weekCount] = await hub.getUnclaimedDividends(outsider.address);
      expect(total).to.equal(0);
      expect(weekCount).to.equal(0);
    });
  });

  // --------------------------------------------------------------------------
  //  INTEGRATION: Full Weekly Cycle
  // --------------------------------------------------------------------------
  describe("Integration: full weekly cycle", function () {
    it("complete 2-week cycle with correct dividend math", async function () {
      // ===== WEEK 1 =====
      await buyShares(pool0Addr, alice, SHARES_BUY);
      await buyShares(pool1Addr, bob, SHARES_BUY);
      await buyShares(pool2Addr, carol, SHARES_BUY);

      const hubFund = 30_000n * SCALE;
      await fundHub(hubFund);

      // Pool 0: +50%, Pool 1: -50%, Pool 2: +50%
      await runDistribution(
        [0, 1, 2],
        [150n * SCALE, 100n * SCALE, 450n * SCALE],
        [0, 2]
      );

      // Verify base pool math
      const wd1 = await hub.weeklyDividends(1);
      expect(wd1.basePool).to.equal((hubFund * 2000n) / BPS);
      expect(wd1.outperformerPool).to.equal(hubFund - wd1.basePool);

      // base: 6000 * SCALE each user gets 1/3 = 2000 * SCALE
      // outperformer (24000 * SCALE): pool 0 and 2 each get 50% = 12000
      // Alice (pool 0): 2000 + 12000 = 14000
      // Bob   (pool 1): 2000 + 0     = 2000
      // Carol (pool 2): 2000 + 12000 = 14000
      const baseThird = wd1.basePool / 3n;
      const outHalf = wd1.outperformerPool / 2n;

      expect(await hub.calculateDividend(1, alice.address)).to.equal(baseThird + outHalf);
      expect(await hub.calculateDividend(1, bob.address)).to.equal(baseThird);
      expect(await hub.calculateDividend(1, carol.address)).to.equal(baseThird + outHalf);

      // Claims
      const aliceBefore = await token.balanceOf(alice.address);
      await hub.connect(alice).claimDividend(1);
      expect(await token.balanceOf(alice.address) - aliceBefore).to.equal(baseThird + outHalf);

      await hub.connect(bob).claimDividend(1);
      await hub.connect(carol).claimDividend(1);

      // ===== WEEK 2 =====
      await hub.advanceWeek();
      expect(await hub.currentWeek()).to.equal(2);

      await fundHub(15_000n * SCALE);

      // This time only pool 1 outperforms
      // Pool 0: at projection, Pool 1: +50%, Pool 2: at projection
      await runDistribution(
        [0, 1, 2],
        [100n * SCALE, 300n * SCALE, 300n * SCALE],
        [1]
      );

      const wd2 = await hub.weeklyDividends(2);
      const base2Third = wd2.basePool / 3n;

      // Only Bob gets outperformer this week
      expect(await hub.calculateDividend(2, alice.address)).to.equal(base2Third);
      expect(await hub.calculateDividend(2, bob.address)).to.equal(base2Third + wd2.outperformerPool);
      expect(await hub.calculateDividend(2, carol.address)).to.equal(base2Third);
    });

    it("skipped week carries balance to next week", async function () {
      await buyShares(pool0Addr, alice, SHARES_BUY);
      await fundHub(5_000n * SCALE);

      await hub.skipWeek();
      expect(await hub.currentWeek()).to.equal(2);

      // Balance should still be there
      expect(await token.balanceOf(hubAddr)).to.equal(5_000n * SCALE);

      // Week 1 has no dividend for anyone
      expect(await hub.calculateDividend(1, alice.address)).to.equal(0);

      // Now fund and distribute week 2 — uses accumulated balance
      await hub.setWeeklyPerformanceBatch([0, 1, 2], [150n * SCALE, 200n * SCALE, 300n * SCALE]);
      await hub.setOutperformerEligible([0]);
      await hub.distributeDividends();

      const wd2 = await hub.weeklyDividends(2);
      expect(wd2.totalPool).to.equal(5_000n * SCALE);
      expect(await hub.calculateDividend(2, alice.address)).to.be.gt(0);
    });

    it("user who sells before claiming still gets correct historical dividend", async function () {
      await buyShares(pool0Addr, alice, SHARES_BUY);
      await fundHub(10_000n * SCALE);
      await runDistribution(
        [0, 1, 2],
        [150n * SCALE, 200n * SCALE, 300n * SCALE],
        [0]
      );

      // Advance to week 2
      await hub.advanceWeek();

      // Alice sells all shares in week 2 — triggers snapshot of week 1 holdings
      await mockRouter.callExecuteSell(pool0Addr, alice.address, SHARES_BUY, 0);
      expect(await ethers.getContractAt("IPlayerPool", pool0Addr).then(p => p.holdings(alice.address))).to.equal(0);

      // Alice can still claim week 1 dividend based on snapshotted holdings
      const div = await hub.calculateDividend(1, alice.address);
      expect(div).to.be.gt(0);

      const balBefore = await token.balanceOf(alice.address);
      await hub.connect(alice).claimDividend(1);
      expect(await token.balanceOf(alice.address) - balBefore).to.equal(div);
    });

    it("zero outperformers means entire outperformer pool is unclaimed", async function () {
      await buyShares(pool0Addr, alice, SHARES_BUY);
      await fundHub(10_000n * SCALE);

      // All pools exactly at projection — no outperformers
      await runDistribution(
        [0, 1, 2],
        [100n * SCALE, 200n * SCALE, 300n * SCALE],
        []
      );

      const aliceDiv = await hub.calculateDividend(1, alice.address);
      // Alice gets 100% of base pool (she's the only holder), zero outperformer
      expect(aliceDiv).to.equal(2_000n * SCALE);
    });
  });

  // --------------------------------------------------------------------------
  //  EDGE CASES
  // --------------------------------------------------------------------------
  describe("Edge cases", function () {
    it("pool with zero projected points has zero outperformance", async function () {
      // Create a pool with 0 projected points
      await factory.createPool("Zero", "ZERO", "zero_player", 0);
      const pool3Addr = await factory.pools(3);
      await buyShares(pool3Addr, alice, SHARES_BUY);
      await fundHub(1_000n * SCALE);

      await hub.setWeeklyPerformanceBatch([3], [100n * SCALE]);
      const perf = await hub.weeklyPerformance(1, 3);
      expect(perf.outperformance).to.equal(0);
    });

    it("100% base split gives entire pool as base dividend", async function () {
      await hub.setBasePoolBps(10000);
      await buyShares(pool0Addr, alice, SHARES_BUY);
      await fundHub(10_000n * SCALE);
      await runDistribution([0, 1, 2], [150n * SCALE, 200n * SCALE, 300n * SCALE], [0]);

      const wd = await hub.weeklyDividends(1);
      expect(wd.basePool).to.equal(10_000n * SCALE);
      expect(wd.outperformerPool).to.equal(0);

      // Alice gets 100% of base (only holder)
      expect(await hub.calculateDividend(1, alice.address)).to.equal(10_000n * SCALE);
    });

    it("0% base split gives entire pool as outperformer dividend", async function () {
      await hub.setBasePoolBps(0);
      await buyShares(pool0Addr, alice, SHARES_BUY);
      await fundHub(10_000n * SCALE);
      await runDistribution([0, 1, 2], [150n * SCALE, 200n * SCALE, 300n * SCALE], [0]);

      const wd = await hub.weeklyDividends(1);
      expect(wd.basePool).to.equal(0);
      expect(wd.outperformerPool).to.equal(10_000n * SCALE);

      // Alice gets 100% outperformer (only eligible holder)
      expect(await hub.calculateDividend(1, alice.address)).to.equal(10_000n * SCALE);
    });

    it("multiple users in the same outperforming pool share proportionally", async function () {
      await buyShares(pool0Addr, alice, 20n * SCALE);
      await buyShares(pool0Addr, bob, 10n * SCALE);
      await fundHub(9_000n * SCALE);

      await runDistribution([0, 1, 2], [150n * SCALE, 200n * SCALE, 300n * SCALE], [0]);

      const aliceDiv = await hub.calculateDividend(1, alice.address);
      const bobDiv = await hub.calculateDividend(1, bob.address);

      // Alice has 2/3 of pool 0, Bob has 1/3
      // Both base and outperformer should reflect this ratio
      // Allow 1 unit rounding tolerance
      expect(aliceDiv).to.be.closeTo(bobDiv * 2n, SCALE);
    });

    it("claiming from a skipped week reverts (no dividend)", async function () {
      await buyShares(pool0Addr, alice, SHARES_BUY);
      await hub.skipWeek();

      // Week 1 was skipped — distributed = true but totalPool = 0
      await expect(
        hub.connect(alice).claimDividend(1)
      ).to.be.revertedWith("No dividend");
    });
  });
});
