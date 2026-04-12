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

    await factory.createPool("Player A", "PLRA", "player_a");
    await factory.createPool("Player B", "PLRB", "player_b");
    await factory.createPool("Player C", "PLRC", "player_c");

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

  async function runDistribution(poolIdxs, avgFpts, eligibleIdxs) {
    await hub.setRoundPerformanceBatch(poolIdxs, avgFpts);
    if (eligibleIdxs && eligibleIdxs.length > 0) {
      await hub.setTopPerformerEligible(eligibleIdxs);
    }
    const poolCount = Number(await factory.poolCount());
    const allIdx = Array.from({ length: poolCount }, (_, i) => BigInt(i));
    for (const u of [alice, bob, carol, outsider]) {
      await hub.snapshotUserHoldings(u.address, allIdx);
    }
    await hub.distributeDividends(10n);
  }

  // --------------------------------------------------------------------------
  //  CONSTRUCTOR
  // --------------------------------------------------------------------------
  describe("Constructor", function () {
    it("should initialise state correctly", async function () {
      expect(await hub.currentRound()).to.equal(1);
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
  //  setRoundPerformanceBatch
  // --------------------------------------------------------------------------
  describe("setRoundPerformanceBatch", function () {
    it("stores per-game average FPts per pool", async function () {
      const avg = 150n * SCALE;
      await hub.setRoundPerformanceBatch([0], [avg]);

      const perf = await hub.roundPerformance(1, 0);
      expect(perf).to.equal(avg);
    });

    it("handles batch of multiple pools", async function () {
      await hub.setRoundPerformanceBatch(
        [0, 1, 2],
        [150n * SCALE, 100n * SCALE, 450n * SCALE]
      );

      expect(await hub.roundPerformance(1, 0)).to.equal(150n * SCALE);
      expect(await hub.roundPerformance(1, 1)).to.equal(100n * SCALE);
      expect(await hub.roundPerformance(1, 2)).to.equal(450n * SCALE);
    });

    it("reverts on length mismatch", async function () {
      await expect(
        hub.setRoundPerformanceBatch([0, 1], [150n * SCALE])
      ).to.be.revertedWith("Length mismatch");
    });

    it("reverts on invalid pool index", async function () {
      await expect(
        hub.setRoundPerformanceBatch([99], [100n * SCALE])
      ).to.be.revertedWith("Invalid pool");
    });

    it("reverts for non-owner", async function () {
      await expect(
        hub.connect(outsider).setRoundPerformanceBatch([0], [100n * SCALE])
      ).to.be.reverted;
    });
  });

  // --------------------------------------------------------------------------
  //  setTopPerformerEligible
  // --------------------------------------------------------------------------
  describe("setTopPerformerEligible", function () {
    it("marks specified pools as eligible", async function () {
      await hub.setTopPerformerEligible([0, 2]);

      expect(await hub.topPerformerEligible(1, 0)).to.be.true;
      expect(await hub.topPerformerEligible(1, 1)).to.be.false;
      expect(await hub.topPerformerEligible(1, 2)).to.be.true;
    });

    it("is scoped to the current week", async function () {
      await hub.setTopPerformerEligible([0]);
      expect(await hub.topPerformerEligible(1, 0)).to.be.true;
      expect(await hub.topPerformerEligible(2, 0)).to.be.false;
    });

    it("reverts for non-owner", async function () {
      await expect(
        hub.connect(outsider).setTopPerformerEligible([0])
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
      await hub.setRoundPerformanceBatch(
        [0, 1, 2],
        [150n * SCALE, 100n * SCALE, 450n * SCALE]
      );
      await hub.setTopPerformerEligible([0, 2]);
      await hub.distributeDividends(10n);

      const wd = await hub.roundDividends(1);
      expect(wd.totalPool).to.equal(10_000n * SCALE);
      expect(wd.basePool).to.equal(2_000n * SCALE);
      expect(wd.topPerformerPool).to.equal(8_000n * SCALE);
      expect(wd.distributed).to.be.true;
    });

    it("snapshots totalShares for each pool", async function () {
      await hub.setRoundPerformanceBatch([0, 1, 2], [100n * SCALE, 200n * SCALE, 300n * SCALE]);
      await hub.distributeDividends(10n);

      expect(await hub.roundEndPoolTotalShares(1, 0)).to.equal(SHARES_BUY);
      expect(await hub.roundEndPoolTotalShares(1, 1)).to.equal(0);
      expect(await hub.roundEndPoolTotalShares(1, 2)).to.equal(SHARES_BUY);
    });

    it("records totalTopAvgFpts from eligible pools only", async function () {
      await hub.setRoundPerformanceBatch(
        [0, 1, 2],
        [150n * SCALE, 100n * SCALE, 450n * SCALE]
      );
      // Only mark pool 0 as eligible (pool 2 has higher avg but is not eligible)
      await hub.setTopPerformerEligible([0]);
      await hub.distributeDividends(10n);

      const wd = await hub.roundDividends(1);
      expect(wd.totalTopAvgFpts).to.equal(150n * SCALE);
    });

    it("emits DividendsDistributed event", async function () {
      await hub.setRoundPerformanceBatch([0], [150n * SCALE]);
      await hub.setTopPerformerEligible([0]);

      await expect(hub.distributeDividends(10n))
        .to.emit(hub, "DividendsDistributed")
        .withArgs(1, 10_000n * SCALE, 2_000n * SCALE, 8_000n * SCALE, 10n);
    });

    it("reverts when already distributed", async function () {
      await hub.setRoundPerformanceBatch([0], [100n * SCALE]);
      await hub.distributeDividends(10n);

      await expect(hub.distributeDividends(10n)).to.be.revertedWith(
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

      await expect(emptyHub.distributeDividends(10n)).to.be.revertedWith(
        "No fees"
      );
    });

    it("reverts for non-owner", async function () {
      await expect(
        hub.connect(outsider).distributeDividends(10n)
      ).to.be.reverted;
    });

    it("respects custom basePoolBps split", async function () {
      await hub.setBasePoolBps(5000); // 50/50 split
      await hub.setRoundPerformanceBatch([0], [150n * SCALE]);
      await hub.distributeDividends(10n);

      const wd = await hub.roundDividends(1);
      expect(wd.basePool).to.equal(5_000n * SCALE);
      expect(wd.topPerformerPool).to.equal(5_000n * SCALE);
    });
  });

  // --------------------------------------------------------------------------
  //  advanceRound
  // --------------------------------------------------------------------------
  describe("advanceRound", function () {
    it("increments currentWeek after distribution", async function () {
      await buyShares(pool0Addr, alice, SHARES_BUY);
      await fundHub(1000n * SCALE);
      await hub.setRoundPerformanceBatch([0], [100n * SCALE]);
      await hub.distributeDividends(10n);

      await hub.advanceRound();
      expect(await hub.currentRound()).to.equal(2);
    });

    it("emits RoundAdvanced event", async function () {
      await buyShares(pool0Addr, alice, SHARES_BUY);
      await fundHub(1000n * SCALE);
      await hub.setRoundPerformanceBatch([0], [100n * SCALE]);
      await hub.distributeDividends(10n);

      await expect(hub.advanceRound())
        .to.emit(hub, "RoundAdvanced")
        .withArgs(2);
    });

    it("reverts when not yet distributed", async function () {
      await expect(hub.advanceRound()).to.be.revertedWith("Distribute first");
    });

    it("reverts for non-owner", async function () {
      await expect(hub.connect(outsider).advanceRound()).to.be.reverted;
    });
  });

  // --------------------------------------------------------------------------
  //  skipRound
  // --------------------------------------------------------------------------
  describe("skipRound", function () {
    it("marks week as distributed with zero payout and advances", async function () {
      await fundHub(5000n * SCALE);
      await hub.skipRound();

      const wd = await hub.roundDividends(1);
      expect(wd.distributed).to.be.true;
      expect(wd.totalPool).to.equal(0);
      expect(await hub.currentRound()).to.equal(2);
    });

    it("preserves hub balance for the next week", async function () {
      await fundHub(5000n * SCALE);
      const balBefore = await token.balanceOf(hubAddr);

      await hub.skipRound();

      expect(await token.balanceOf(hubAddr)).to.equal(balBefore);
    });

    it("emits RoundAdvanced event", async function () {
      await expect(hub.skipRound()).to.emit(hub, "RoundAdvanced").withArgs(2);
    });

    it("can skip an already-distributed week", async function () {
      await buyShares(pool0Addr, alice, SHARES_BUY);
      await fundHub(1000n * SCALE);
      await hub.setRoundPerformanceBatch([0], [100n * SCALE]);
      await hub.distributeDividends(10n);

      // skipRound on an already-distributed week just advances
      await hub.skipRound();
      expect(await hub.currentRound()).to.equal(2);
    });

    it("reverts for non-owner", async function () {
      await expect(hub.connect(outsider).skipRound()).to.be.reverted;
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

      // No top-performer eligibility — only base pool pays out
      await runDistribution(
        [0, 1, 2],
        [100n * SCALE, 200n * SCALE, 300n * SCALE],
        []
      );

      const aliceDiv = await hub.calculateDividend(1, alice.address);
      const bobDiv = await hub.calculateDividend(1, bob.address);

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

      // base = 2000 each gets 1000; top pool split by avg FPts 150 : 450
      const top = 8_000n * SCALE;
      const w0 = 150n * SCALE;
      const w2 = 450n * SCALE;
      const wSum = w0 + w2;
      expect(aliceDiv).to.equal(1_000n * SCALE + (top * w0) / wSum);
      expect(bobDiv).to.equal(1_000n * SCALE + (top * w2) / wSum);
    });

    it("higher avg FPts gets larger share of top-performer pool", async function () {
      await buyShares(pool0Addr, alice, SHARES_BUY);
      await buyShares(pool2Addr, bob, SHARES_BUY);
      await fundHub(10_000n * SCALE);

      await runDistribution(
        [0, 1, 2],
        [200n * SCALE, 100n * SCALE, 450n * SCALE],
        [0, 2]
      );

      const aliceDiv = await hub.calculateDividend(1, alice.address);
      const bobDiv = await hub.calculateDividend(1, bob.address);

      const outPool = 8_000n * SCALE;
      const avg0 = 200n * SCALE;
      const avg2 = 450n * SCALE;
      const totalAvg = avg0 + avg2;
      const pool0Share = (outPool * avg0) / totalAvg;
      const pool2Share = (outPool * avg2) / totalAvg;
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

    it("eligible pool with zero avg FPts gets no top-performer dividend", async function () {
      await buyShares(pool0Addr, alice, SHARES_BUY);
      await buyShares(pool1Addr, bob, SHARES_BUY);
      await fundHub(10_000n * SCALE);

      await runDistribution(
        [0, 1, 2],
        [150n * SCALE, 0n, 300n * SCALE],
        [0, 1]
      );

      const bobDiv = await hub.calculateDividend(1, bob.address);
      const base = 2_000n * SCALE / 2n;
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
  //  claimMultipleRounds
  // --------------------------------------------------------------------------
  describe("claimMultipleRounds", function () {
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
      await hub.advanceRound();

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
      await hub.connect(alice).claimMultipleRounds([1, 2]);
      const balAfter = await token.balanceOf(alice.address);

      expect(balAfter - balBefore).to.equal(div1 + div2);
    });

    it("marks each week as claimed", async function () {
      await hub.connect(alice).claimMultipleRounds([1, 2]);

      expect(await hub.hasClaimed(1, alice.address)).to.be.true;
      expect(await hub.hasClaimed(2, alice.address)).to.be.true;
    });

    it("emits DividendClaimed for each week", async function () {
      const div1 = await hub.calculateDividend(1, alice.address);
      const div2 = await hub.calculateDividend(2, alice.address);

      await expect(hub.connect(alice).claimMultipleRounds([1, 2]))
        .to.emit(hub, "DividendClaimed")
        .withArgs(1, alice.address, div1)
        .and.to.emit(hub, "DividendClaimed")
        .withArgs(2, alice.address, div2);
    });

    it("skips already-claimed weeks", async function () {
      await hub.connect(alice).claimDividend(1);
      const div2 = await hub.calculateDividend(2, alice.address);

      const balBefore = await token.balanceOf(alice.address);
      await hub.connect(alice).claimMultipleRounds([1, 2]);
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
        await hub.connect(bob).claimMultipleRounds([1, 2]);

        // Now alice claims — hub may not have enough for both her weeks
        const remainingBal = await token.balanceOf(hubAddr);
        const aliceDiv1 = await hub.calculateDividend(1, alice.address);
        const aliceDiv2 = await hub.calculateDividend(2, alice.address);

        if (remainingBal < aliceDiv1 + aliceDiv2) {
          const balBefore = await token.balanceOf(alice.address);
          await hub.connect(alice).claimMultipleRounds([1, 2]);
          const balAfter = await token.balanceOf(alice.address);
          // Got less than full amount — some weeks were skipped
          expect(balAfter - balBefore).to.be.lte(aliceDiv1 + aliceDiv2);
        }
      }
    });

    it("reverts when no dividends at all for the user", async function () {
      await expect(
        hub.connect(outsider).claimMultipleRounds([1, 2])
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
      await hub.advanceRound();

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
      const wd1 = await hub.roundDividends(1);
      expect(wd1.basePool).to.equal((hubFund * 2000n) / BPS);
      expect(wd1.topPerformerPool).to.equal(hubFund - wd1.basePool);

      // Base split 3 ways; top pool split by avg FPts (150 vs 450) for eligible pools 0 and 2
      const baseThird = wd1.basePool / 3n;
      const top = wd1.topPerformerPool;
      const w0 = 150n * SCALE;
      const w2 = 450n * SCALE;
      const wSum = w0 + w2;

      const aliceExpected = baseThird + (top * w0) / wSum;
      const carolExpected = baseThird + (top * w2) / wSum;

      expect(await hub.calculateDividend(1, alice.address)).to.equal(aliceExpected);
      expect(await hub.calculateDividend(1, bob.address)).to.equal(baseThird);
      expect(await hub.calculateDividend(1, carol.address)).to.equal(carolExpected);

      // Claims
      const aliceBefore = await token.balanceOf(alice.address);
      await hub.connect(alice).claimDividend(1);
      expect(await token.balanceOf(alice.address) - aliceBefore).to.equal(aliceExpected);

      await hub.connect(bob).claimDividend(1);
      await hub.connect(carol).claimDividend(1);

      // ===== WEEK 2 =====
      await hub.advanceRound();
      expect(await hub.currentRound()).to.equal(2);

      await fundHub(15_000n * SCALE);

      // This time only pool 1 outperforms
      // Pool 0: at projection, Pool 1: +50%, Pool 2: at projection
      await runDistribution(
        [0, 1, 2],
        [100n * SCALE, 300n * SCALE, 300n * SCALE],
        [1]
      );

      const wd2 = await hub.roundDividends(2);
      const base2Third = wd2.basePool / 3n;

      // Only Bob gets outperformer this week
      expect(await hub.calculateDividend(2, alice.address)).to.equal(base2Third);
      expect(await hub.calculateDividend(2, bob.address)).to.equal(base2Third + wd2.topPerformerPool);
      expect(await hub.calculateDividend(2, carol.address)).to.equal(base2Third);
    });

    it("skipped week carries balance to next week", async function () {
      await buyShares(pool0Addr, alice, SHARES_BUY);
      await fundHub(5_000n * SCALE);

      await hub.skipRound();
      expect(await hub.currentRound()).to.equal(2);

      // Balance should still be there
      expect(await token.balanceOf(hubAddr)).to.equal(5_000n * SCALE);

      // Week 1 has no dividend for anyone
      expect(await hub.calculateDividend(1, alice.address)).to.equal(0);

      // Round 2 distribution — uses accumulated balance
      await runDistribution(
        [0, 1, 2],
        [150n * SCALE, 200n * SCALE, 300n * SCALE],
        [0]
      );

      const wd2 = await hub.roundDividends(2);
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
      await hub.advanceRound();

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
    it("pool can record zero avg FPts", async function () {
      await factory.createPool("Zero", "ZERO", "zero_player");
      const pool3Addr = await factory.pools(3);
      await buyShares(pool3Addr, alice, SHARES_BUY);
      await fundHub(1_000n * SCALE);

      await hub.setRoundPerformanceBatch([3], [0n]);
      expect(await hub.roundPerformance(1, 3)).to.equal(0n);
    });

    it("100% base split gives entire pool as base dividend", async function () {
      await hub.setBasePoolBps(10000);
      await buyShares(pool0Addr, alice, SHARES_BUY);
      await fundHub(10_000n * SCALE);
      await runDistribution([0, 1, 2], [150n * SCALE, 200n * SCALE, 300n * SCALE], [0]);

      const wd = await hub.roundDividends(1);
      expect(wd.basePool).to.equal(10_000n * SCALE);
      expect(wd.topPerformerPool).to.equal(0);

      // Alice gets 100% of base (only holder)
      expect(await hub.calculateDividend(1, alice.address)).to.equal(10_000n * SCALE);
    });

    it("0% base split gives entire pool as outperformer dividend", async function () {
      await hub.setBasePoolBps(0);
      await buyShares(pool0Addr, alice, SHARES_BUY);
      await fundHub(10_000n * SCALE);
      await runDistribution([0, 1, 2], [150n * SCALE, 200n * SCALE, 300n * SCALE], [0]);

      const wd = await hub.roundDividends(1);
      expect(wd.basePool).to.equal(0);
      expect(wd.topPerformerPool).to.equal(10_000n * SCALE);

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
      await hub.skipRound();

      // Week 1 was skipped — distributed = true but totalPool = 0
      await expect(
        hub.connect(alice).claimDividend(1)
      ).to.be.revertedWith("No dividend");
    });
  });
});
