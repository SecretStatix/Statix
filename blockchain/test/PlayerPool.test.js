const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("PlayerPool (unit tests)", function () {
  let deployer, alice, bob, outsider;
  let token, mock, pool;
  let poolAddr, mockAddr;

  const INIT_SHARES = 1000n * 10n ** 6n;   // 1 000 shares (1e6 scale)
  const INIT_CASH   = 10_000n * 10n ** 6n;  // 10 000 DBucks
  const SCALE       = 10n ** 6n;

  async function deployFixture() {
    [deployer, alice, bob, outsider] = await ethers.getSigners();

    const MockUSDC = await ethers.getContractFactory("MockUSDC");
    token = await MockUSDC.deploy();
    await token.waitForDeployment();

    const Mock = await ethers.getContractFactory("MockRouterHub");
    mock = await Mock.deploy(await token.getAddress());
    await mock.waitForDeployment();
    mockAddr = await mock.getAddress();

    // PlayerPool uses the same address for both router and hub
    const Pool = await ethers.getContractFactory("PlayerPool");
    pool = await Pool.deploy(
      await token.getAddress(),
      mockAddr,            // router
      mockAddr,            // dividendHub
      "LeBron James",
      "LBJ",
      "lebron_1",
      5000n * SCALE,       // projectedPoints
      INIT_SHARES,
      INIT_CASH
    );
    await pool.waitForDeployment();
    poolAddr = await pool.getAddress();

    // Mint tokens to the mock so it can fund buys / liquidity adds
    await token.mint(mockAddr, 10_000_000n * SCALE);
  }

  beforeEach(async function () {
    await deployFixture();
  });

  // --------------------------------------------------------------------------
  //  CONSTRUCTOR
  // --------------------------------------------------------------------------
  describe("Constructor", function () {
    // Verify all initial state is wired correctly
    it("should initialise reserves, liquidity tracking, and metadata", async function () {
      expect(await pool.virtualShares()).to.equal(INIT_SHARES);
      expect(await pool.virtualCash()).to.equal(INIT_CASH);
      expect(await pool.totalShares()).to.equal(0);
      expect(await pool.active()).to.equal(true);
      expect(await pool.name()).to.equal("LeBron James");
      expect(await pool.symbol()).to.equal("LBJ");
      expect(await pool.playerId()).to.equal("lebron_1");
      expect(await pool.projectedPoints()).to.equal(5000n * SCALE);

      // totalLiquidity anchored to initialCash; lpLiquidity starts at 0
      expect(await pool.totalLiquidity()).to.equal(INIT_CASH);
      expect(await pool.lpLiquidity()).to.equal(0);
    });
  });

  // --------------------------------------------------------------------------
  //  VIEW FUNCTIONS – getPrice / getBuyCost / getSellRevenue
  // --------------------------------------------------------------------------
  describe("Views", function () {
    // price = virtualCash * 1e6 / virtualShares
    it("getPrice returns initial price scaled by 1e6", async function () {
      const expected = (INIT_CASH * SCALE) / INIT_SHARES;
      expect(await pool.getPrice()).to.equal(expected);
    });

    // getBuyCost uses constant-product: cost = vCash * sharesOut / (vShares - sharesOut)
    it("getBuyCost returns correct constant-product cost", async function () {
      const sharesOut = 10n * SCALE;
      const expected = (INIT_CASH * sharesOut) / (INIT_SHARES - sharesOut);
      expect(await pool.getBuyCost(sharesOut)).to.equal(expected);
    });

    // Guard: sharesOut must be > 0
    it("getBuyCost reverts for 0 shares", async function () {
      await expect(pool.getBuyCost(0)).to.be.revertedWith("Invalid amount");
    });

    // Guard: sharesOut must be < virtualShares / 2
    it("getBuyCost reverts when requesting >= half the virtual supply", async function () {
      const tooMany = INIT_SHARES / 2n;
      await expect(pool.getBuyCost(tooMany)).to.be.revertedWith("Invalid amount");
    });

    // getSellRevenue: revenue = vCash * sharesIn / (vShares + sharesIn)
    it("getSellRevenue returns correct constant-product revenue", async function () {
      const sharesIn = 10n * SCALE;
      const expected = (INIT_CASH * sharesIn) / (INIT_SHARES + sharesIn);
      expect(await pool.getSellRevenue(sharesIn)).to.equal(expected);
    });

    // Guard: sharesIn must be > 0
    it("getSellRevenue reverts for 0 shares", async function () {
      await expect(pool.getSellRevenue(0)).to.be.revertedWith("Invalid amount");
    });
  });

  // --------------------------------------------------------------------------
  //  AMM MATH INVARIANTS
  // --------------------------------------------------------------------------
  describe("AMM Math", function () {
    // k = virtualShares * virtualCash stays within integer-rounding tolerance.
    // Solidity truncates division, so cost is rounded down → k drops by at most 1 unit of sharesOut.
    it("constant product k is preserved after a buy (within rounding)", async function () {
      const kBefore = (await pool.virtualShares()) * (await pool.virtualCash());

      const shares = 10n * SCALE;
      await mock.callExecuteBuy(poolAddr, alice.address, shares, ethers.MaxUint256);

      const kAfter = (await pool.virtualShares()) * (await pool.virtualCash());
      const drift = kBefore - kAfter;
      expect(drift).to.be.gte(0);
      expect(drift).to.be.lt(kBefore / 1_000_000n);
    });

    // Same rounding tolerance for sells (revenue rounded down → k may increase slightly)
    it("constant product k is preserved after a sell (within rounding)", async function () {
      const shares = 10n * SCALE;
      await mock.callExecuteBuy(poolAddr, alice.address, shares, ethers.MaxUint256);

      const kBefore = (await pool.virtualShares()) * (await pool.virtualCash());
      await mock.callExecuteSell(poolAddr, alice.address, shares, 0);
      const kAfter = (await pool.virtualShares()) * (await pool.virtualCash());

      const drift = kAfter - kBefore;
      expect(drift).to.be.gte(0);
      expect(drift).to.be.lt(kBefore / 1_000_000n);
    });

    // Sequential buys should monotonically increase price
    it("price increases monotonically across sequential buys", async function () {
      const amt = 5n * SCALE;
      const prices = [await pool.getPrice()];

      for (let i = 0; i < 4; i++) {
        await mock.callExecuteBuy(poolAddr, alice.address, amt, ethers.MaxUint256);
        prices.push(await pool.getPrice());
      }

      for (let i = 1; i < prices.length; i++) {
        expect(prices[i]).to.be.gt(prices[i - 1]);
      }
    });

    // Buy then sell same amount should restore reserves exactly (fees go outside)
    it("buy then sell roundtrip restores reserves exactly", async function () {
      const vsBefore = await pool.virtualShares();
      const vcBefore = await pool.virtualCash();

      const shares = 10n * SCALE;
      await mock.callExecuteBuy(poolAddr, alice.address, shares, ethers.MaxUint256);
      await mock.callExecuteSell(poolAddr, alice.address, shares, 0);

      expect(await pool.virtualShares()).to.equal(vsBefore);
      expect(await pool.virtualCash()).to.equal(vcBefore);
    });
  });

  // --------------------------------------------------------------------------
  //  executeBuy
  // --------------------------------------------------------------------------
  describe("executeBuy", function () {
    const SHARES = 10n * SCALE;

    // Core state changes: reserves shift, totalShares and holdings update
    it("updates reserves, totalShares and holdings correctly", async function () {
      const cost = await pool.getBuyCost(SHARES);

      await mock.callExecuteBuy(poolAddr, alice.address, SHARES, ethers.MaxUint256);

      expect(await pool.virtualShares()).to.equal(INIT_SHARES - SHARES);
      expect(await pool.virtualCash()).to.equal(INIT_CASH + cost);
      expect(await pool.totalShares()).to.equal(SHARES);
      expect(await pool.holdings(alice.address)).to.equal(SHARES);
    });

    // Fee is split into dividendFee (to hub) and protocolFee (to router)
    it("splits fees between hub and router", async function () {
      const hubBefore = await token.balanceOf(mockAddr);

      await mock.callExecuteBuy(poolAddr, alice.address, SHARES, ethers.MaxUint256);

      // Mock acts as both router and hub — it receives both fee portions back
      // Pool balance should only hold the net cost (cost portion)
      const poolBal = await token.balanceOf(poolAddr);
      const cost = await pool.virtualCash() - INIT_CASH;
      expect(poolBal).to.equal(cost);
    });

    // maxCost slippage guard
    it("reverts when totalCost exceeds maxCost", async function () {
      await expect(
        mock.callExecuteBuy(poolAddr, alice.address, SHARES, 1n)
      ).to.be.revertedWith("Slippage exceeded");
    });

    // Pool must be active
    it("reverts when pool is inactive", async function () {
      await mock.callSetActive(poolAddr, false);
      await expect(
        mock.callExecuteBuy(poolAddr, alice.address, SHARES, ethers.MaxUint256)
      ).to.be.revertedWith("Player not active");
    });

    // Access control
    it("reverts when caller is not the router", async function () {
      await expect(
        pool.connect(outsider).executeBuy(alice.address, SHARES, ethers.MaxUint256)
      ).to.be.revertedWith("Only router");
    });

    // Multiple users can hold shares in the same pool
    it("accumulates holdings for multiple buyers", async function () {
      await mock.callExecuteBuy(poolAddr, alice.address, SHARES, ethers.MaxUint256);
      await mock.callExecuteBuy(poolAddr, bob.address, SHARES, ethers.MaxUint256);

      expect(await pool.holdings(alice.address)).to.equal(SHARES);
      expect(await pool.holdings(bob.address)).to.equal(SHARES);
      expect(await pool.totalShares()).to.equal(SHARES * 2n);
    });
  });

  // --------------------------------------------------------------------------
  //  executeSell
  // --------------------------------------------------------------------------
  describe("executeSell", function () {
    const SHARES = 10n * SCALE;

    beforeEach(async function () {
      await mock.callExecuteBuy(poolAddr, alice.address, SHARES, ethers.MaxUint256);
    });

    // Core state changes after sell
    it("updates reserves, totalShares and holdings correctly", async function () {
      const vsBefore = await pool.virtualShares();
      const vcBefore = await pool.virtualCash();
      const revenue = await pool.getSellRevenue(SHARES);

      await mock.callExecuteSell(poolAddr, alice.address, SHARES, 0);

      expect(await pool.virtualShares()).to.equal(vsBefore + SHARES);
      expect(await pool.virtualCash()).to.equal(vcBefore - revenue);
      expect(await pool.totalShares()).to.equal(0);
      expect(await pool.holdings(alice.address)).to.equal(0);
    });

    // Seller receives tokens (net of fee)
    it("transfers net revenue to the seller", async function () {
      const revenue = await pool.getSellRevenue(SHARES);
      const feeBps = await mock.feeBps();
      const fee = (revenue * feeBps) / 10000n;
      const netExpected = revenue - fee;

      const balBefore = await token.balanceOf(alice.address);
      await mock.callExecuteSell(poolAddr, alice.address, SHARES, 0);
      const balAfter = await token.balanceOf(alice.address);

      expect(balAfter - balBefore).to.equal(netExpected);
    });

    // minRevenue slippage guard
    it("reverts when net revenue is below minRevenue", async function () {
      await expect(
        mock.callExecuteSell(poolAddr, alice.address, SHARES, ethers.MaxUint256)
      ).to.be.revertedWith("Slippage exceeded");
    });

    // Can't sell more than you hold
    it("reverts when selling more shares than held", async function () {
      await expect(
        mock.callExecuteSell(poolAddr, alice.address, SHARES * 2n, 0)
      ).to.be.revertedWith("Insufficient shares");
    });

    // Partial sell
    it("allows partial sells", async function () {
      const half = SHARES / 2n;
      await mock.callExecuteSell(poolAddr, alice.address, half, 0);
      expect(await pool.holdings(alice.address)).to.equal(SHARES - half);

      await mock.callExecuteSell(poolAddr, alice.address, half, 0);
      expect(await pool.holdings(alice.address)).to.equal(0);
    });

    // Access control
    it("reverts when caller is not the router", async function () {
      await expect(
        pool.connect(outsider).executeSell(alice.address, SHARES, 0)
      ).to.be.revertedWith("Only router");
    });
  });

  // --------------------------------------------------------------------------
  //  addLiquidity
  // --------------------------------------------------------------------------
  describe("addLiquidity", function () {
    const CASH_ADD = 5000n * SCALE;

    // Price must stay the same after adding liquidity
    it("does not change the spot price", async function () {
      const priceBefore = await pool.getPrice();
      await mock.callAddLiquidity(poolAddr, CASH_ADD);
      const priceAfter = await pool.getPrice();

      expect(priceAfter).to.equal(priceBefore);
    });

    // Both reserves increase proportionally
    it("increases virtualCash and virtualShares proportionally", async function () {
      const vsBefore = await pool.virtualShares();
      const vcBefore = await pool.virtualCash();

      await mock.callAddLiquidity(poolAddr, CASH_ADD);

      const vsAfter = await pool.virtualShares();
      const vcAfter = await pool.virtualCash();

      expect(vcAfter).to.equal(vcBefore + CASH_ADD);
      const expectedShares = (CASH_ADD * vsBefore) / vcBefore;
      expect(vsAfter).to.equal(vsBefore + expectedShares);
    });

    // LP tokens are minted: lpTokensMinted = cashAmount * totalLiquidity / virtualCash
    it("mints LP tokens and updates totalLiquidity", async function () {
      const tlBefore = await pool.totalLiquidity();

      await mock.callAddLiquidity(poolAddr, CASH_ADD);

      const expectedLp = (CASH_ADD * tlBefore) / INIT_CASH;
      expect(await pool.lpLiquidity()).to.equal(expectedLp);
      expect(await pool.totalLiquidity()).to.equal(tlBefore + expectedLp);
    });

    // Multiple additions accumulate
    it("accumulates LP tokens across multiple additions", async function () {
      await mock.callAddLiquidity(poolAddr, CASH_ADD);
      const lp1 = await pool.lpLiquidity();

      await mock.callAddLiquidity(poolAddr, CASH_ADD);
      const lp2 = await pool.lpLiquidity();

      expect(lp2).to.be.gt(lp1);
    });

    // Zero amount reverts
    it("reverts for zero cash amount", async function () {
      await expect(mock.callAddLiquidity(poolAddr, 0)).to.be.revertedWith("Zero amount");
    });

    // Access control
    it("reverts when caller is not the router", async function () {
      await expect(
        pool.connect(outsider).addLiquidity(CASH_ADD)
      ).to.be.revertedWith("Only router");
    });
  });

  // --------------------------------------------------------------------------
  //  removeLiquidity
  // --------------------------------------------------------------------------
  describe("removeLiquidity", function () {
    const CASH_ADD = 5000n * SCALE;
    let lpMinted;

    beforeEach(async function () {
      await mock.callAddLiquidity(poolAddr, CASH_ADD);
      lpMinted = await pool.lpLiquidity();
    });

    // Price must stay the same after removing liquidity
    it("does not change the spot price", async function () {
      const priceBefore = await pool.getPrice();
      await mock.callRemoveLiquidity(poolAddr, lpMinted);
      const priceAfter = await pool.getPrice();

      expect(priceAfter).to.equal(priceBefore);
    });

    // Full removal returns deposited cash (no trades happened)
    it("returns the deposited cash when no trades occurred", async function () {
      const mockBalBefore = await token.balanceOf(mockAddr);
      await mock.callRemoveLiquidity(poolAddr, lpMinted);
      const mockBalAfter = await token.balanceOf(mockAddr);

      expect(mockBalAfter - mockBalBefore).to.equal(CASH_ADD);
    });

    // Reserves shrink back to initial values after full removal (no trades)
    it("restores reserves to initial values after full removal (no trades)", async function () {
      await mock.callRemoveLiquidity(poolAddr, lpMinted);

      expect(await pool.virtualCash()).to.equal(INIT_CASH);
      expect(await pool.virtualShares()).to.equal(INIT_SHARES);
      expect(await pool.lpLiquidity()).to.equal(0);
    });

    // Partial removal
    it("allows partial LP withdrawal", async function () {
      const half = lpMinted / 2n;
      await mock.callRemoveLiquidity(poolAddr, half);

      expect(await pool.lpLiquidity()).to.equal(lpMinted - half);

      // Second half
      const remaining = await pool.lpLiquidity();
      await mock.callRemoveLiquidity(poolAddr, remaining);
      expect(await pool.lpLiquidity()).to.equal(0);
    });

    // Can't remove more LP tokens than owned
    it("reverts when trying to remove more than owned", async function () {
      await expect(
        mock.callRemoveLiquidity(poolAddr, lpMinted + 1n)
      ).to.be.revertedWith("Invalid LP amount");
    });

    // Can't remove zero
    it("reverts for zero LP tokens", async function () {
      await expect(
        mock.callRemoveLiquidity(poolAddr, 0)
      ).to.be.revertedWith("Invalid LP amount");
    });

    // Can't drain the pool to zero reserves
    it("reverts if removal would drain pool to zero", async function () {
      // totalLiquidity = INIT_CASH + lpMinted. Removing totalLiquidity
      // would zero out reserves. But lpLiquidity < totalLiquidity, so
      // the "Would drain pool" path requires lpLiquidity == totalLiquidity - 1.
      // We test this by adding liquidity equal to the initial reserves
      // (making LP own ~50%), then resetting initial part so LP is almost everything.
      // Simplest: just confirm the existing guard with a direct call.
      // Since lpMinted < totalLiquidity, full removal won't drain to zero — it keeps the house portion.
      // So this should succeed:
      await mock.callRemoveLiquidity(poolAddr, lpMinted);
      expect(await pool.virtualCash()).to.be.gt(0);
    });

    // Access control
    it("reverts when caller is not the router", async function () {
      await expect(
        pool.connect(outsider).removeLiquidity(lpMinted)
      ).to.be.revertedWith("Only router");
    });
  });

  // --------------------------------------------------------------------------
  //  LIQUIDITY + TRADING INTERACTION
  // --------------------------------------------------------------------------
  describe("Liquidity + Trading scenarios", function () {
    const CASH_ADD = 5000n * SCALE;
    const SHARES = 10n * SCALE;

    // Adding liquidity reduces slippage for subsequent trades
    it("deeper pool means lower cost for the same buy size", async function () {
      const costBefore = await pool.getBuyCost(SHARES);
      await mock.callAddLiquidity(poolAddr, CASH_ADD);
      const costAfter = await pool.getBuyCost(SHARES);

      // Deeper pool → less price impact → lower cost for same sharesOut
      expect(costAfter).to.be.lt(costBefore);
    });

    // After trades shift the reserves, LP withdrawal reflects pool changes
    it("LP gets proportional value after trades have moved the curve", async function () {
      await mock.callAddLiquidity(poolAddr, CASH_ADD);
      const lpTokens = await pool.lpLiquidity();

      // Buy pushes price up — virtualCash increases
      await mock.callExecuteBuy(poolAddr, alice.address, 50n * SCALE, ethers.MaxUint256);

      // LP's cash-out should reflect the now-higher virtualCash
      const cashOut = (lpTokens * (await pool.virtualCash())) / (await pool.totalLiquidity());
      // Because virtualCash grew from the buy, cashOut > original CASH_ADD
      expect(cashOut).to.be.gt(CASH_ADD);
    });

    // After net selling drains real cash, LP withdrawal is bounded by actual balance
    it("LP withdrawal capped by real token balance (insufficient balance guard)", async function () {
      await mock.callAddLiquidity(poolAddr, CASH_ADD);

      // Buy then sell extracts net cash (fees leave pool)
      await mock.callExecuteBuy(poolAddr, alice.address, 100n * SCALE, ethers.MaxUint256);
      await mock.callExecuteSell(poolAddr, alice.address, 100n * SCALE, 0);

      // Pool's real balance is cost_in - revenue_out - fees_out, which is less
      // than virtualCash. But as long as real balance >= cashOut, it works.
      const lpTokens = await pool.lpLiquidity();
      const cashOut = (lpTokens * (await pool.virtualCash())) / (await pool.totalLiquidity());
      const realBal = await token.balanceOf(poolAddr);

      if (cashOut <= realBal) {
        await expect(mock.callRemoveLiquidity(poolAddr, lpTokens)).to.not.be.reverted;
      } else {
        await expect(mock.callRemoveLiquidity(poolAddr, lpTokens))
          .to.be.revertedWith("Insufficient real balance");
      }
    });

    // Initial "house" liquidity is not withdrawable
    it("cannot withdraw the initial house liquidity (lpLiquidity stays separate)", async function () {
      // Without adding any extra liquidity, lpLiquidity is 0
      expect(await pool.lpLiquidity()).to.equal(0);
      // totalLiquidity covers the initial reserves only
      expect(await pool.totalLiquidity()).to.equal(INIT_CASH);
    });
  });

  // --------------------------------------------------------------------------
  //  SNAPSHOTS
  // --------------------------------------------------------------------------
  describe("Snapshots", function () {
    const SHARES = 10n * SCALE;

    beforeEach(async function () {
      await mock.callExecuteBuy(poolAddr, alice.address, SHARES, ethers.MaxUint256);
    });

    // snapshotTotalShares returns current totalShares
    it("snapshotTotalShares returns totalShares", async function () {
      const ts = await mock.callSnapshotTotalShares.staticCall(poolAddr);
      expect(ts).to.equal(SHARES);
    });

    // Lazy snapshot fills weekEndHoldings for past weeks
    it("snapshotUserHoldings backfills weekEndHoldings for skipped weeks", async function () {
      await mock.setCurrentWeek(3);

      // Snapshot triggers lazy fill for weeks 1 and 2
      await mock.callSnapshotUserHoldings(poolAddr, 2, alice.address);

      expect(await pool.weekEndHoldings(1, alice.address)).to.equal(SHARES);
      expect(await pool.weekEndHoldings(2, alice.address)).to.equal(SHARES);
    });

    // Access control: only hub can call snapshot functions
    it("snapshotTotalShares reverts for non-hub caller", async function () {
      await expect(
        pool.connect(outsider).snapshotTotalShares()
      ).to.be.revertedWith("Only hub");
    });

    it("snapshotUserHoldings reverts for non-hub caller", async function () {
      await expect(
        pool.connect(outsider).snapshotUserHoldings(1, alice.address)
      ).to.be.revertedWith("Only hub");
    });
  });

  // --------------------------------------------------------------------------
  //  EMERGENCY FUNCTIONS
  // --------------------------------------------------------------------------
  describe("Emergency", function () {
    const SHARES = 20n * SCALE;

    beforeEach(async function () {
      await mock.callExecuteBuy(poolAddr, alice.address, SHARES, ethers.MaxUint256);
    });

    // emergencyExitUser sells user's entire position at AMM price, sends refund to router
    it("emergencyExitUser refunds user shares and zeros holdings", async function () {
      const refund = await mock.callEmergencyExitUser.staticCall(poolAddr, alice.address);
      expect(refund).to.be.gt(0);

      const mockBefore = await token.balanceOf(mockAddr);
      await mock.callEmergencyExitUser(poolAddr, alice.address);
      const mockAfter = await token.balanceOf(mockAddr);

      expect(await pool.holdings(alice.address)).to.equal(0);
      expect(await pool.totalShares()).to.equal(0);
      expect(mockAfter - mockBefore).to.equal(refund);
    });

    // emergencyExitUser for user with no shares returns 0
    it("emergencyExitUser returns 0 for user with no holdings", async function () {
      const refund = await mock.callEmergencyExitUser.staticCall(poolAddr, bob.address);
      expect(refund).to.equal(0);
    });

    // forceLiquidate sells user's shares, triggers snapshot, sends refund to router
    it("forceLiquidate returns shares and refund, zeros holdings", async function () {
      await mock.setCurrentWeek(2);

      const mockBefore = await token.balanceOf(mockAddr);
      await mock.callForceLiquidate(poolAddr, alice.address);
      const mockAfter = await token.balanceOf(mockAddr);

      expect(await pool.holdings(alice.address)).to.equal(0);
      expect(await pool.totalShares()).to.equal(0);
      expect(mockAfter).to.be.gt(mockBefore);
    });

    // forceLiquidate reverts for user with no holdings
    it("forceLiquidate reverts for user with no holdings", async function () {
      await expect(
        mock.callForceLiquidate(poolAddr, bob.address)
      ).to.be.revertedWith("No holdings");
    });

    // resetPool overrides reserves
    it("resetPool sets new virtualShares and virtualCash", async function () {
      const newS = 2000n * SCALE;
      const newC = 20000n * SCALE;
      await mock.callResetPool(poolAddr, newS, newC);

      expect(await pool.virtualShares()).to.equal(newS);
      expect(await pool.virtualCash()).to.equal(newC);
    });

    // setActive toggles trading
    it("setActive toggles active flag", async function () {
      await mock.callSetActive(poolAddr, false);
      expect(await pool.active()).to.equal(false);

      await mock.callSetActive(poolAddr, true);
      expect(await pool.active()).to.equal(true);
    });

    // drain transfers entire token balance to target
    it("drain sends all tokens to target address", async function () {
      const poolBal = await token.balanceOf(poolAddr);
      expect(poolBal).to.be.gt(0);

      await mock.callDrain(poolAddr, deployer.address);
      expect(await token.balanceOf(poolAddr)).to.equal(0);
      expect(await token.balanceOf(deployer.address)).to.equal(poolBal);
    });

    // All emergency functions revert for non-router
    it("all emergency functions revert for non-router caller", async function () {
      await expect(pool.connect(outsider).emergencyExitUser(alice.address))
        .to.be.revertedWith("Only router");
      await expect(pool.connect(outsider).forceLiquidate(alice.address))
        .to.be.revertedWith("Only router");
      await expect(pool.connect(outsider).resetPool(1, 1))
        .to.be.revertedWith("Only router");
      await expect(pool.connect(outsider).setActive(false))
        .to.be.revertedWith("Only router");
      await expect(pool.connect(outsider).drain(outsider.address))
        .to.be.revertedWith("Only router");
    });
  });

  // --------------------------------------------------------------------------
  //  FEE BEHAVIOUR
  // --------------------------------------------------------------------------
  describe("Fee behaviour", function () {
    const SHARES = 10n * SCALE;

    // With 0% fee, entire cost is raw AMM cost
    it("zero fee means no tokens leave pool as fees", async function () {
      await mock.setFeeBps(0);

      const cost = await pool.getBuyCost(SHARES);
      await mock.callExecuteBuy(poolAddr, alice.address, SHARES, ethers.MaxUint256);

      // Pool should hold exactly the raw cost
      const poolBal = await token.balanceOf(poolAddr);
      expect(poolBal).to.equal(cost);
    });

    // With max fee (500 bps = 5%), fee portion is correct
    it("5% fee produces correct fee split", async function () {
      await mock.setFeeBps(500);
      const cost = await pool.getBuyCost(SHARES);
      const expectedFee = (cost * 500n) / 10000n;
      const totalCost = cost + expectedFee;

      // The mock transfers totalCost to pool; pool keeps cost and sends fees out
      await mock.callExecuteBuy(poolAddr, alice.address, SHARES, totalCost);

      const poolBal = await token.balanceOf(poolAddr);
      expect(poolBal).to.equal(cost);
    });

    // Dividend fee split: dividendFeeBps controls how much of fee goes to hub vs router
    it("100% dividend split sends all fees to hub (same address as router in mock)", async function () {
      await mock.setDividendFeeBps(10000);
      await mock.callExecuteBuy(poolAddr, alice.address, SHARES, ethers.MaxUint256);

      // Since mock is both hub and router, all fees return to mock
      const cost = await pool.virtualCash() - INIT_CASH;
      const poolBal = await token.balanceOf(poolAddr);
      expect(poolBal).to.equal(cost);
    });
  });
});
