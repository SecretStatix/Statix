const { expect } = require("chai");
const { ethers } = require("hardhat");

/**
 * Full-stack integration tests.
 *
 * Real production contracts (no mocks):
 *   MockUSDC → DBucks → PoolFactory → StatixRouter → DividendHub → PlayerPool×5
 *
 * Focus: cross-contract invariants and multi-step lifecycles.
 */
describe("Integration (full-stack)", function () {
  let deployer, alice, bob, carol, dave, feeRecipient;
  let usdc, dbucks, factory, router, hub;
  let usdcAddr, dbucksAddr, factoryAddr, routerAddr, hubAddr;
  let poolAddrs;

  const SCALE = 10n ** 6n;
  const BPS = 10000n;
  const FAUCET_LIMIT = 500_000n * SCALE;
  const SHARES = 10n * SCALE;

  async function deployFixture() {
    [deployer, alice, bob, carol, dave, feeRecipient] =
      await ethers.getSigners();

    const MockUSDC = await ethers.getContractFactory("MockUSDC");
    usdc = await MockUSDC.deploy();
    await usdc.waitForDeployment();
    usdcAddr = await usdc.getAddress();

    const DBucks = await ethers.getContractFactory("DBucks");
    dbucks = await DBucks.deploy(usdcAddr, true, FAUCET_LIMIT);
    await dbucks.waitForDeployment();
    dbucksAddr = await dbucks.getAddress();

    const PoolFactory = await ethers.getContractFactory("PoolFactory");
    factory = await PoolFactory.deploy(dbucksAddr);
    await factory.waitForDeployment();
    factoryAddr = await factory.getAddress();

    const StatixRouter = await ethers.getContractFactory("StatixRouter");
    router = await StatixRouter.deploy(
      dbucksAddr,
      factoryAddr,
      feeRecipient.address
    );
    await router.waitForDeployment();
    routerAddr = await router.getAddress();

    const DividendHub = await ethers.getContractFactory("DividendHub");
    hub = await DividendHub.deploy(dbucksAddr, factoryAddr, routerAddr);
    await hub.waitForDeployment();
    hubAddr = await hub.getAddress();

    await factory.setRouter(routerAddr);
    await factory.setDividendHub(hubAddr);

    await factory.createPoolsBatch(
      ["Player A", "Player B", "Player C", "Player D", "Player E"],
      ["PLRA", "PLRB", "PLRC", "PLRD", "PLRE"],
      ["player_a", "player_b", "player_c", "player_d", "player_e"]
    );

    poolAddrs = [];
    for (let i = 0; i < 5; i++) {
      poolAddrs.push(await factory.pools(i));
    }

    for (const user of [alice, bob, carol, dave]) {
      await dbucks.connect(user).faucet(FAUCET_LIMIT);
      await dbucks.connect(user).approve(routerAddr, ethers.MaxUint256);
    }
  }

  beforeEach(async function () {
    await deployFixture();
  });

  function pool(idx) {
    return ethers.getContractAt("IPlayerPool", poolAddrs[idx]);
  }

  async function buy(user, poolIdx, shares) {
    await router.connect(user).buy(poolIdx, shares, ethers.MaxUint256);
  }

  async function sell(user, poolIdx, shares) {
    await router.connect(user).sell(poolIdx, shares, 0);
  }

  async function fundHubDirect(amount) {
    await usdc.mint(deployer.address, amount);
    await usdc.approve(dbucksAddr, amount);
    await dbucks.deposit(amount);
    await dbucks.transfer(hubAddr, amount);
  }

  async function distributeWeek(poolIdxs, avgFpts, eligibleIdxs) {
    const poolCount = Number(await factory.poolCount());
    const allIdx = Array.from({ length: poolCount }, (_, i) => BigInt(i));
    await hub.setRoundPerformanceBatch(poolIdxs, avgFpts);
    if (eligibleIdxs && eligibleIdxs.length > 0) {
      await hub.setTopPerformerEligible(eligibleIdxs);
    }
    for (const u of [deployer, alice, bob, carol, dave]) {
      await hub.snapshotUserHoldings(u.address, allIdx);
    }
    await hub.distributeDividends(10n);
  }

  async function sumAllDbucks() {
    const users = [deployer, alice, bob, carol, dave, feeRecipient];
    let total = 0n;
    for (const u of users) {
      total += await dbucks.balanceOf(u.address);
    }
    for (const addr of poolAddrs) {
      total += await dbucks.balanceOf(addr);
    }
    total += await dbucks.balanceOf(hubAddr);
    total += await dbucks.balanceOf(routerAddr);
    total += await dbucks.balanceOf(dbucksAddr);
    return total;
  }

  describe("1. Full token lifecycle (USDC to USDC)", function () {
    it("complete round-trip: deposit, buy, earn dividend, sell, withdraw", async function () {
      const depositAmount = 10_000n * SCALE;

      await usdc.mint(alice.address, depositAmount);
      await usdc.connect(alice).approve(dbucksAddr, depositAmount);
      await dbucks.connect(alice).deposit(depositAmount);

      await buy(alice, 0, 20n * SCALE);

      await fundHubDirect(5_000n * SCALE);
      await distributeWeek(
        [0, 1, 2, 3, 4],
        [150n * SCALE, 200n * SCALE, 300n * SCALE, 100n * SCALE, 200n * SCALE],
        [0]
      );

      const divAmount = await hub.calculateDividend(1, alice.address);
      expect(divAmount).to.be.gt(0);
      await hub.connect(alice).claimDividend(1);

      await sell(alice, 0, 20n * SCALE);

      const usdcInContract = await usdc.balanceOf(dbucksAddr);
      const dbucksBefore = await dbucks.balanceOf(alice.address);
      const withdrawable =
        dbucksBefore < usdcInContract ? dbucksBefore : usdcInContract;
      await dbucks.connect(alice).withdraw(withdrawable);

      const finalUsdc = await usdc.balanceOf(alice.address);
      expect(finalUsdc).to.be.gt(0);
      expect(await dbucks.balanceOf(alice.address)).to.equal(
        dbucksBefore - withdrawable
      );
    });
  });

  describe("2. Fee accounting invariant", function () {
    it("all DBucks are accounted for after multiple trades across pools", async function () {
      const supplyBefore = await dbucks.totalSupply();

      await buy(alice, 0, SHARES);
      await buy(alice, 2, SHARES);
      await buy(bob, 1, 20n * SCALE);
      await buy(carol, 0, 15n * SCALE);
      await buy(dave, 4, SHARES);

      await sell(bob, 1, 10n * SCALE);
      await sell(alice, 0, 5n * SCALE);

      const supplyAfter = await dbucks.totalSupply();
      expect(supplyAfter).to.equal(supplyBefore);

      const totalAccounted = await sumAllDbucks();
      expect(totalAccounted).to.equal(supplyAfter);
    });

    it("fee splits sum to the exact total fee", async function () {
      const hubBefore = await dbucks.balanceOf(hubAddr);
      const feeBefore = await dbucks.balanceOf(feeRecipient.address);

      const p = await pool(0);
      const rawCost = await p.getBuyCost(SHARES);
      const feeBps = await router.feeBps();
      const divFeeBps = await router.dividendFeeBps();
      const expectedTotalFee = (rawCost * feeBps) / BPS;
      const expectedDivFee = (expectedTotalFee * divFeeBps) / BPS;
      const expectedProtocolFee = expectedTotalFee - expectedDivFee;

      await buy(alice, 0, SHARES);

      const hubGain = (await dbucks.balanceOf(hubAddr)) - hubBefore;
      const feeGain =
        (await dbucks.balanceOf(feeRecipient.address)) - feeBefore;

      expect(hubGain).to.equal(expectedDivFee);
      expect(feeGain).to.equal(expectedProtocolFee);
      expect(hubGain + feeGain).to.equal(expectedTotalFee);
    });
  });

  describe("3. Multi-pool dividend distribution", function () {
    it("distributes base and outperformer shares correctly across 5 pools and 4 users", async function () {
      await buy(alice, 0, 20n * SCALE);
      await buy(alice, 1, 10n * SCALE);
      await buy(bob, 2, 15n * SCALE);
      await buy(carol, 1, 10n * SCALE);
      await buy(carol, 3, 10n * SCALE);
      await buy(dave, 0, 10n * SCALE);
      await buy(dave, 4, 10n * SCALE);

      await fundHubDirect(100_000n * SCALE);

      await distributeWeek(
        [0, 1, 2, 3, 4],
        [
          150n * SCALE,
          100n * SCALE,
          450n * SCALE,
          50n * SCALE,
          200n * SCALE,
        ],
        [0, 2]
      );

      const wd = await hub.roundDividends(1);
      expect(wd.distributed).to.be.true;
      expect(wd.totalPool).to.be.gte(100_000n * SCALE);
      expect(wd.basePool).to.equal((wd.totalPool * 2000n) / BPS);
      expect(wd.topPerformerPool).to.equal(wd.totalPool - wd.basePool);

      const divAlice = await hub.calculateDividend(1, alice.address);
      const divBob = await hub.calculateDividend(1, bob.address);
      const divCarol = await hub.calculateDividend(1, carol.address);
      const divDave = await hub.calculateDividend(1, dave.address);

      expect(divAlice).to.be.gt(0);
      expect(divBob).to.be.gt(0);
      expect(divCarol).to.be.gt(0);
      expect(divDave).to.be.gt(0);

      expect(divBob).to.be.gt(divCarol);

      const totalDivs = divAlice + divBob + divCarol + divDave;
      const rounding = 5n * SCALE;
      expect(totalDivs).to.be.closeTo(wd.totalPool, rounding);
    });
  });

  describe("4. Multi-week lifecycle", function () {
    it("3-week cycle with trades, claims, skip, and claimMultipleWeeks", async function () {
      await buy(alice, 0, SHARES);
      await buy(bob, 1, SHARES);

      await fundHubDirect(10_000n * SCALE);
      await distributeWeek(
        [0, 1, 2, 3, 4],
        [150n * SCALE, 100n * SCALE, 300n * SCALE, 100n * SCALE, 200n * SCALE],
        [0]
      );

      await hub.connect(alice).claimDividend(1);

      await hub.advanceRound();
      expect(await hub.currentRound()).to.equal(2);

      await buy(carol, 2, SHARES);

      await fundHubDirect(10_000n * SCALE);
      await distributeWeek(
        [0, 1, 2, 3, 4],
        [100n * SCALE, 300n * SCALE, 450n * SCALE, 100n * SCALE, 200n * SCALE],
        [1, 2]
      );
      await hub.advanceRound();
      expect(await hub.currentRound()).to.equal(3);

      await hub.skipRound();
      expect(await hub.currentRound()).to.equal(4);

      expect(await hub.calculateDividend(3, alice.address)).to.equal(0);

      const [unclaimedTotal, unclaimedCount] =
        await hub.getUnclaimedDividends(bob.address);
      expect(unclaimedCount).to.equal(2);
      expect(unclaimedTotal).to.be.gt(0);

      const bobBefore = await dbucks.balanceOf(bob.address);
      await hub.connect(bob).claimMultipleRounds([1, 2, 3]);
      const bobAfter = await dbucks.balanceOf(bob.address);
      expect(bobAfter - bobBefore).to.equal(unclaimedTotal);

      const [carolTotal, carolCount] =
        await hub.getUnclaimedDividends(carol.address);
      expect(carolCount).to.equal(1);
      await hub.connect(carol).claimDividend(2);
    });
  });

  describe("5. Cross-week snapshot correctness", function () {
    it("user who sells in week 2 can claim week 1 based on snapshotted holdings", async function () {
      await buy(alice, 0, 20n * SCALE);

      await fundHubDirect(10_000n * SCALE);
      await distributeWeek(
        [0, 1, 2, 3, 4],
        [150n * SCALE, 200n * SCALE, 300n * SCALE, 100n * SCALE, 200n * SCALE],
        [0]
      );

      const div1 = await hub.calculateDividend(1, alice.address);
      expect(div1).to.be.gt(0);

      await hub.advanceRound();

      await sell(alice, 0, 20n * SCALE);
      const p0 = await pool(0);
      expect(await p0.holdings(alice.address)).to.equal(0);

      const div1After = await hub.calculateDividend(1, alice.address);
      expect(div1After).to.equal(div1);

      const balBefore = await dbucks.balanceOf(alice.address);
      await hub.connect(alice).claimDividend(1);
      const balAfter = await dbucks.balanceOf(alice.address);
      expect(balAfter - balBefore).to.equal(div1);
    });

    it("new buyer in week 2 does not get week 1 dividends", async function () {
      await buy(alice, 0, SHARES);

      await fundHubDirect(10_000n * SCALE);
      await distributeWeek(
        [0, 1, 2, 3, 4],
        [150n * SCALE, 200n * SCALE, 300n * SCALE, 100n * SCALE, 200n * SCALE],
        [0]
      );
      await hub.advanceRound();

      await buy(bob, 0, SHARES);

      expect(await hub.calculateDividend(1, bob.address)).to.equal(0);
    });
  });

  describe("6. Fee split through real stack", function () {
    it("buy fee split matches exact math (hub + recipient = total fee)", async function () {
      const hubBefore = await dbucks.balanceOf(hubAddr);
      const feeBefore = await dbucks.balanceOf(feeRecipient.address);
      const aliceBefore = await dbucks.balanceOf(alice.address);

      const p0 = await pool(0);
      const rawCost = await p0.getBuyCost(SHARES);
      const feeBps = await router.feeBps();
      const divFeeBps = await router.dividendFeeBps();
      const totalFee = (rawCost * feeBps) / BPS;
      const totalCost = rawCost + totalFee;

      await buy(alice, 0, SHARES);

      const aliceAfter = await dbucks.balanceOf(alice.address);
      expect(aliceBefore - aliceAfter).to.equal(totalCost);

      const hubGain = (await dbucks.balanceOf(hubAddr)) - hubBefore;
      const feeGain =
        (await dbucks.balanceOf(feeRecipient.address)) - feeBefore;
      expect(hubGain + feeGain).to.equal(totalFee);
      expect(hubGain).to.equal((totalFee * divFeeBps) / BPS);
      expect(feeGain).to.equal(totalFee - hubGain);
    });

    it("sell fee split matches exact math", async function () {
      await buy(alice, 0, SHARES);

      const hubBefore = await dbucks.balanceOf(hubAddr);
      const feeBefore = await dbucks.balanceOf(feeRecipient.address);

      const p0 = await pool(0);
      const rawRevenue = await p0.getSellRevenue(SHARES);
      const feeBps = await router.feeBps();
      const divFeeBps = await router.dividendFeeBps();
      const totalFee = (rawRevenue * feeBps) / BPS;
      const netRevenue = rawRevenue - totalFee;

      const aliceBefore = await dbucks.balanceOf(alice.address);
      await sell(alice, 0, SHARES);
      const aliceAfter = await dbucks.balanceOf(alice.address);

      expect(aliceAfter - aliceBefore).to.equal(netRevenue);

      const hubGain = (await dbucks.balanceOf(hubAddr)) - hubBefore;
      const feeGain =
        (await dbucks.balanceOf(feeRecipient.address)) - feeBefore;
      expect(hubGain + feeGain).to.equal(totalFee);
      expect(hubGain).to.equal((totalFee * divFeeBps) / BPS);
    });
  });

  describe("7. Emergency flow with pending dividends", function () {
    it("users can claim dividends after emergency shutdown, then exit", async function () {
      await buy(alice, 0, SHARES);
      await buy(bob, 1, SHARES);

      await fundHubDirect(10_000n * SCALE);
      await distributeWeek(
        [0, 1, 2, 3, 4],
        [150n * SCALE, 100n * SCALE, 300n * SCALE, 100n * SCALE, 200n * SCALE],
        [0]
      );

      const aliceDiv = await hub.calculateDividend(1, alice.address);
      expect(aliceDiv).to.be.gt(0);

      await router.emergencyShutdown();
      expect(await router.killed()).to.be.true;

      await expect(
        router.connect(carol).buy(0, SHARES, ethers.MaxUint256)
      ).to.be.revertedWith("Contract shut down");

      const aliceBefore = await dbucks.balanceOf(alice.address);
      await hub.connect(alice).claimDividend(1);
      expect(
        (await dbucks.balanceOf(alice.address)) - aliceBefore
      ).to.equal(aliceDiv);

      const aliceBeforeExit = await dbucks.balanceOf(alice.address);
      await router.connect(alice).emergencyExit();
      expect(await dbucks.balanceOf(alice.address)).to.be.gt(aliceBeforeExit);

      const p0 = await pool(0);
      expect(await p0.holdings(alice.address)).to.equal(0);
    });
  });

  describe("8. Post-launch pool addition", function () {
    it("new pools added mid-season are included in next distribution", async function () {
      await buy(alice, 0, SHARES);
      await fundHubDirect(10_000n * SCALE);
      await distributeWeek(
        [0, 1, 2, 3, 4],
        [150n * SCALE, 200n * SCALE, 300n * SCALE, 100n * SCALE, 200n * SCALE],
        [0]
      );
      await hub.advanceRound();

      await factory.createPool("New Player F", "PLRF", "player_f");
      await factory.createPool("New Player G", "PLRG", "player_g");

      const newPool5 = await factory.pools(5);
      const newPool6 = await factory.pools(6);
      expect(newPool5).to.not.equal(ethers.ZeroAddress);
      expect(newPool6).to.not.equal(ethers.ZeroAddress);
      poolAddrs.push(newPool5, newPool6);

      expect(await factory.poolCount()).to.equal(7);

      await buy(bob, 5, SHARES);

      await fundHubDirect(10_000n * SCALE);
      await distributeWeek(
        [0, 1, 2, 3, 4, 5, 6],
        [
          100n * SCALE,
          200n * SCALE,
          300n * SCALE,
          100n * SCALE,
          200n * SCALE,
          150n * SCALE,
          200n * SCALE,
        ],
        [5]
      );

      const bobDiv = await hub.calculateDividend(2, bob.address);
      expect(bobDiv).to.be.gt(0);

      await hub.connect(bob).claimDividend(2);
    });
  });

  describe("9. Conservation of value", function () {
    it("total DBucks across all addresses equals totalSupply after complex scenario", async function () {
      await buy(alice, 0, 20n * SCALE);
      await buy(alice, 2, 15n * SCALE);
      await buy(bob, 1, 25n * SCALE);
      await buy(carol, 3, 10n * SCALE);
      await buy(dave, 4, 10n * SCALE);
      await buy(dave, 0, 5n * SCALE);

      await sell(alice, 0, 10n * SCALE);
      await sell(bob, 1, 10n * SCALE);

      await fundHubDirect(20_000n * SCALE);
      await distributeWeek(
        [0, 1, 2, 3, 4],
        [150n * SCALE, 100n * SCALE, 450n * SCALE, 50n * SCALE, 200n * SCALE],
        [0, 2]
      );

      await hub.connect(alice).claimDividend(1);
      await hub.connect(dave).claimDividend(1);

      await hub.advanceRound();

      await buy(carol, 0, SHARES);
      await sell(dave, 4, 5n * SCALE);

      await fundHubDirect(15_000n * SCALE);
      await distributeWeek(
        [0, 1, 2, 3, 4],
        [100n * SCALE, 300n * SCALE, 300n * SCALE, 150n * SCALE, 100n * SCALE],
        [1, 3]
      );

      await hub.connect(bob).claimMultipleRounds([1, 2]);

      const totalSupply = await dbucks.totalSupply();
      const totalAccounted = await sumAllDbucks();
      expect(totalAccounted).to.equal(totalSupply);
    });

    it("no DBucks created or destroyed during trading (supply unchanged)", async function () {
      const supplyBefore = await dbucks.totalSupply();

      await buy(alice, 0, SHARES);
      await buy(bob, 1, 20n * SCALE);
      await sell(alice, 0, 5n * SCALE);
      await buy(carol, 2, SHARES);
      await sell(bob, 1, 20n * SCALE);

      const supplyAfter = await dbucks.totalSupply();
      expect(supplyAfter).to.equal(supplyBefore);
    });
  });
});
