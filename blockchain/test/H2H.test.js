const { expect } = require("chai");
const { ethers } = require("hardhat");

const ZERO32 = "0x" + "00".repeat(32);
const E18 = 10n ** 18n;
const E6 = 10n ** 6n;

function id(s) {
  return ethers.keccak256(ethers.toUtf8Bytes(s));
}

describe("H2H — BinaryCTF + BinaryFPMM + Creator + Oracle", function () {
  let deployer, oracleOwner, lp, alice, bob, feeRecipient;
  let usdc, ctf, oracle, creator;

  const SEED = 100n * E6; // 100 collateral seed (MockUSDC is 6 decimals)

  // Use a mock 18-decimal collateral for cleaner test numbers; real prod uses DBucks (6).
  beforeEach(async function () {
    [deployer, oracleOwner, lp, alice, bob, feeRecipient] = await ethers.getSigners();

    // Reuse MockUSDC contract but pretend it's 18-decimal — actually MockUSDC is 6.
    // Deploy a vanilla ERC20-like via a tiny mintable token: we'll fake it using DBucks faucet.
    // Simpler: just use MockUSDC (6 decimals) and scale tests accordingly.
    const MockUSDC = await ethers.getContractFactory("MockUSDC");
    usdc = await MockUSDC.deploy();
    await usdc.waitForDeployment();

    const BinaryCTF = await ethers.getContractFactory("BinaryCTF");
    ctf = await BinaryCTF.deploy();
    await ctf.waitForDeployment();

    const H2HOracle = await ethers.getContractFactory("H2HOracle");
    oracle = await H2HOracle.deploy(oracleOwner.address, await ctf.getAddress());
    await oracle.waitForDeployment();

    const H2HCreator = await ethers.getContractFactory("H2HCreator");
    creator = await H2HCreator.deploy(
      deployer.address,
      await ctf.getAddress(),
      await usdc.getAddress(),
      await oracle.getAddress(),
      200, // 2%
      feeRecipient.address
    );
    await creator.waitForDeployment();

    // Mint USDC to test actors via MockUSDC.mint (deployer-only by default in mock).
    const MINT = 1_000_000n * E6;
    await usdc.mint(deployer.address, MINT);
    await usdc.mint(lp.address, MINT);
    await usdc.mint(alice.address, MINT);
    await usdc.mint(bob.address, MINT);
  });

  // -------------------------------------------------------------------
  // BinaryCTF
  // -------------------------------------------------------------------
  describe("BinaryCTF", function () {
    it("prepareCondition emits and stores oracle", async function () {
      const qid = id("game-1-A-vs-B");
      const condId = await ctf.getConditionId(oracleOwner.address, qid);
      await expect(ctf.prepareCondition(oracleOwner.address, qid))
        .to.emit(ctf, "ConditionPreparation")
        .withArgs(condId, oracleOwner.address, qid);
      expect(await ctf.conditionOracle(condId)).to.equal(oracleOwner.address);
    });

    it("rejects double prepare", async function () {
      const qid = id("dup");
      await ctf.prepareCondition(oracleOwner.address, qid);
      await expect(ctf.prepareCondition(oracleOwner.address, qid)).to.be.revertedWith("BinaryCTF: already prepared");
    });

    it("rejects zero oracle", async function () {
      await expect(ctf.prepareCondition(ethers.ZeroAddress, id("z"))).to.be.revertedWith("BinaryCTF: zero oracle");
    });

    it("split mints A+B equally and pulls collateral", async function () {
      const qid = id("split-test");
      await ctf.prepareCondition(oracleOwner.address, qid);
      const condId = await ctf.getConditionId(oracleOwner.address, qid);

      const amt = 50n * E6;
      await usdc.connect(alice).approve(await ctf.getAddress(), amt);
      const bal0 = await usdc.balanceOf(alice.address);
      await ctf.connect(alice).splitPosition(await usdc.getAddress(), condId, amt);

      const idA = await ctf.getPositionId(await usdc.getAddress(), condId, 1);
      const idB = await ctf.getPositionId(await usdc.getAddress(), condId, 2);
      expect(await ctf.balanceOf(alice.address, idA)).to.equal(amt);
      expect(await ctf.balanceOf(alice.address, idB)).to.equal(amt);
      expect(await usdc.balanceOf(alice.address)).to.equal(bal0 - amt);
    });

    it("merge burns A+B and returns collateral", async function () {
      const qid = id("merge-test");
      await ctf.prepareCondition(oracleOwner.address, qid);
      const condId = await ctf.getConditionId(oracleOwner.address, qid);
      const amt = 30n * E6;
      await usdc.connect(alice).approve(await ctf.getAddress(), amt);
      await ctf.connect(alice).splitPosition(await usdc.getAddress(), condId, amt);

      const before = await usdc.balanceOf(alice.address);
      await ctf.connect(alice).mergePositions(await usdc.getAddress(), condId, amt);
      expect(await usdc.balanceOf(alice.address)).to.equal(before + amt);

      const idA = await ctf.getPositionId(await usdc.getAddress(), condId, 1);
      const idB = await ctf.getPositionId(await usdc.getAddress(), condId, 2);
      expect(await ctf.balanceOf(alice.address, idA)).to.equal(0n);
      expect(await ctf.balanceOf(alice.address, idB)).to.equal(0n);
    });

    it("only oracle can reportPayouts", async function () {
      const qid = id("auth");
      await ctf.prepareCondition(oracleOwner.address, qid);
      await expect(ctf.connect(alice).reportPayouts(qid, [1, 0])).to.be.revertedWith("BinaryCTF: not oracle");
    });

    it("rejects bad payouts length and zero denominator", async function () {
      const qid = id("bad");
      await ctf.prepareCondition(oracleOwner.address, qid);
      await expect(ctf.connect(oracleOwner).reportPayouts(qid, [1, 0, 0])).to.be.revertedWith("BinaryCTF: bad payouts length");
      await expect(ctf.connect(oracleOwner).reportPayouts(qid, [0, 0])).to.be.revertedWith("BinaryCTF: zero denominator");
    });

    it("redeem after [1,0] pays full collateral to A holders only", async function () {
      const qid = id("payout-A");
      await ctf.prepareCondition(oracleOwner.address, qid);
      const condId = await ctf.getConditionId(oracleOwner.address, qid);
      const amt = 100n * E6;

      await usdc.connect(alice).approve(await ctf.getAddress(), amt);
      await ctf.connect(alice).splitPosition(await usdc.getAddress(), condId, amt);

      // Alice sends all B tokens to Bob
      const idB = await ctf.getPositionId(await usdc.getAddress(), condId, 2);
      await ctf.connect(alice).safeTransferFrom(alice.address, bob.address, idB, amt, "0x");

      await ctf.connect(oracleOwner).reportPayouts(qid, [1, 0]);

      const aliceBefore = await usdc.balanceOf(alice.address);
      const bobBefore = await usdc.balanceOf(bob.address);
      await ctf.connect(alice).redeemPositions(await usdc.getAddress(), condId);
      await ctf.connect(bob).redeemPositions(await usdc.getAddress(), condId);

      expect(await usdc.balanceOf(alice.address)).to.equal(aliceBefore + amt);
      expect(await usdc.balanceOf(bob.address)).to.equal(bobBefore); // bob holds only losing B
    });

    it("redeem after [1,1] tie splits collateral 50/50", async function () {
      const qid = id("payout-tie");
      await ctf.prepareCondition(oracleOwner.address, qid);
      const condId = await ctf.getConditionId(oracleOwner.address, qid);
      const amt = 100n * E6;

      await usdc.connect(alice).approve(await ctf.getAddress(), amt);
      await ctf.connect(alice).splitPosition(await usdc.getAddress(), condId, amt);
      const idB = await ctf.getPositionId(await usdc.getAddress(), condId, 2);
      await ctf.connect(alice).safeTransferFrom(alice.address, bob.address, idB, amt, "0x");

      await ctf.connect(oracleOwner).reportPayouts(qid, [1, 1]);

      const aliceBefore = await usdc.balanceOf(alice.address);
      const bobBefore = await usdc.balanceOf(bob.address);
      await ctf.connect(alice).redeemPositions(await usdc.getAddress(), condId);
      await ctf.connect(bob).redeemPositions(await usdc.getAddress(), condId);

      // Each holder has `amt` of one outcome → payout = amt * 1 / 2.
      expect(await usdc.balanceOf(alice.address)).to.equal(aliceBefore + amt / 2n);
      expect(await usdc.balanceOf(bob.address)).to.equal(bobBefore + amt / 2n);
    });

    it("rejects double resolve", async function () {
      const qid = id("dbl-resolve");
      await ctf.prepareCondition(oracleOwner.address, qid);
      await ctf.connect(oracleOwner).reportPayouts(qid, [1, 0]);
      await expect(ctf.connect(oracleOwner).reportPayouts(qid, [0, 1])).to.be.revertedWith("BinaryCTF: already resolved");
    });

    it("rejects split after resolve", async function () {
      const qid = id("post-resolve-split");
      await ctf.prepareCondition(oracleOwner.address, qid);
      const condId = await ctf.getConditionId(oracleOwner.address, qid);
      await ctf.connect(oracleOwner).reportPayouts(qid, [1, 0]);
      await usdc.connect(alice).approve(await ctf.getAddress(), 1n * E6);
      await expect(ctf.connect(alice).splitPosition(await usdc.getAddress(), condId, 1n * E6))
        .to.be.revertedWith("BinaryCTF: condition resolved");
    });

    it("getPositionId rejects bad indexSet", async function () {
      const condId = await ctf.getConditionId(oracleOwner.address, id("ix"));
      await expect(ctf.getPositionId(await usdc.getAddress(), condId, 0)).to.be.revertedWith("BinaryCTF: bad indexSet");
      await expect(ctf.getPositionId(await usdc.getAddress(), condId, 3)).to.be.revertedWith("BinaryCTF: bad indexSet");
    });
  });

  // -------------------------------------------------------------------
  // BinaryFPMM
  // -------------------------------------------------------------------
  describe("BinaryFPMM", function () {
    let qid, condId, fpmm;
    const FEE_BPS = 200n;

    beforeEach(async function () {
      qid = id("fpmm-game");
      // Use creator path to deploy + seed.
      await usdc.connect(deployer).approve(await creator.getAddress(), SEED);
      const tx = await creator.connect(deployer).createMarket(qid, id("pA"), id("pB"), SEED);
      const rc = await tx.wait();
      const ev = rc.logs.find((l) => {
        try {
          return creator.interface.parseLog(l).name === "H2HMarketCreated";
        } catch (_) {
          return false;
        }
      });
      const parsed = creator.interface.parseLog(ev);
      fpmm = await ethers.getContractAt("BinaryFPMM", parsed.args.fpmm);
      condId = parsed.args.conditionId;
    });

    it("seeds 50/50 and mints LP shares to deployer", async function () {
      const [a, b] = await fpmm.poolBalances();
      expect(a).to.equal(SEED);
      expect(b).to.equal(SEED);
      expect(await fpmm.balanceOf(deployer.address)).to.equal(SEED);
      expect(await fpmm.priceA()).to.equal(E18 / 2n); // 0.5
    });

    it("calcBuyAmount matches the formula Y = net(a+b+net)/(b+net)", async function () {
      const investment = 10n * E6;
      const fee = (investment * FEE_BPS) / 10_000n;
      const net = investment - fee;
      const expected = (net * (SEED + SEED + net)) / (SEED + net);
      expect(await fpmm.calcBuyAmount(investment, 0)).to.equal(expected);
    });

    it("buy preserves CPMM invariant", async function () {
      const inv = 10n * E6;
      await usdc.connect(alice).approve(await fpmm.getAddress(), inv);
      const kBefore = SEED * SEED;
      await fpmm.connect(alice).buy(inv, 0, 0);
      const [a, b] = await fpmm.poolBalances();
      // Allow small rounding tolerance (integer division)
      const kAfter = a * b;
      const diff = kAfter > kBefore ? kAfter - kBefore : kBefore - kAfter;
      expect(diff).to.be.lessThan(SEED); // very loose; should be ~0
    });

    it("buy → sell roundtrip returns ≈ same collateral minus 2x fee", async function () {
      const inv = 5n * E6;
      await usdc.connect(alice).approve(await fpmm.getAddress(), inv);
      const out = await fpmm.calcBuyAmount(inv, 0);
      const balBefore = await usdc.balanceOf(alice.address);
      await fpmm.connect(alice).buy(inv, 0, 0);

      // Approve CTF to move outcome tokens (ERC1155.setApprovalForAll)
      await ctf.connect(alice).setApprovalForAll(await fpmm.getAddress(), true);
      await fpmm.connect(alice).sell(out, 0, 0);
      const balAfter = await usdc.balanceOf(alice.address);

      // Should be close to inv * (1 - 2*fee) but with extra slippage; assert <= inv minus single fee.
      expect(balAfter).to.be.lessThan(balBefore);
      expect(balAfter).to.be.greaterThan(balBefore - inv);
    });

    it("slippage guard reverts when minOut not met", async function () {
      const inv = 1n * E6;
      await usdc.connect(alice).approve(await fpmm.getAddress(), inv);
      await expect(fpmm.connect(alice).buy(inv, 0, ethers.MaxUint256)).to.be.revertedWith("FPMM: slippage");
    });

    it("collected fees grow with each trade", async function () {
      const inv = 10n * E6;
      await usdc.connect(alice).approve(await fpmm.getAddress(), inv * 2n);
      const before = await fpmm.collectedFees();
      await fpmm.connect(alice).buy(inv, 0, 0);
      const after1 = await fpmm.collectedFees();
      expect(after1 - before).to.equal((inv * FEE_BPS) / 10_000n);
      await fpmm.connect(alice).buy(inv, 1, 0);
      const after2 = await fpmm.collectedFees();
      expect(after2 - after1).to.equal((inv * FEE_BPS) / 10_000n);
    });

    it("withdrawFees sends to feeRecipient and zeroes counter", async function () {
      const inv = 20n * E6;
      await usdc.connect(alice).approve(await fpmm.getAddress(), inv);
      await fpmm.connect(alice).buy(inv, 0, 0);
      const fees = await fpmm.collectedFees();
      const feeBalBefore = await usdc.balanceOf(feeRecipient.address);
      await fpmm.connect(alice).withdrawFees(); // anyone can call; sends to recipient
      expect(await usdc.balanceOf(feeRecipient.address)).to.equal(feeBalBefore + fees);
      expect(await fpmm.collectedFees()).to.equal(0n);
    });

    it("removeFunding returns proportional pool slice + auto-merges balanced part", async function () {
      // Initial seed is balanced; LP removes half → expects ~SEED/2 collateral back.
      const halfShares = SEED / 2n;
      const balBefore = await usdc.balanceOf(deployer.address);
      await fpmm.connect(deployer).removeFunding(halfShares);
      const balAfter = await usdc.balanceOf(deployer.address);
      expect(balAfter - balBefore).to.equal(SEED / 2n); // balanced pool, no excess outcome tokens
      expect(await fpmm.balanceOf(deployer.address)).to.equal(SEED / 2n);
    });

    it("end-to-end: buy → resolve [1,0] → winning side redeems for full payout", async function () {
      const inv = 20n * E6;
      await usdc.connect(alice).approve(await fpmm.getAddress(), inv);
      const aliceTokensA = await fpmm.calcBuyAmount(inv, 0);
      await fpmm.connect(alice).buy(inv, 0, 0);

      // Bob buys B
      await usdc.connect(bob).approve(await fpmm.getAddress(), inv);
      const bobTokensB = await fpmm.calcBuyAmount(inv, 1);
      await fpmm.connect(bob).buy(inv, 1, 0);

      // Resolve A wins via the oracle wrapper (FP units scaled x100)
      await oracle.connect(oracleOwner).resolve(qid, 4500n, 3200n);

      // Alice redeems winning A tokens; Bob's B tokens are worthless.
      const aliceBalBefore = await usdc.balanceOf(alice.address);
      const bobBalBefore = await usdc.balanceOf(bob.address);
      await ctf.connect(alice).redeemPositions(await usdc.getAddress(), condId);
      await ctf.connect(bob).redeemPositions(await usdc.getAddress(), condId);

      expect((await usdc.balanceOf(alice.address)) - aliceBalBefore).to.equal(aliceTokensA);
      expect((await usdc.balanceOf(bob.address)) - bobBalBefore).to.equal(0n);
    });
  });

  // -------------------------------------------------------------------
  // H2HCreator
  // -------------------------------------------------------------------
  describe("H2HCreator", function () {
    it("only owner can create markets", async function () {
      await usdc.connect(alice).approve(await creator.getAddress(), SEED);
      await expect(
        creator.connect(alice).createMarket(id("ux"), id("pa"), id("pb"), SEED)
      ).to.be.revertedWithCustomError(creator, "OwnableUnauthorizedAccount");
    });

    it("rejects duplicate questionId", async function () {
      await usdc.connect(deployer).approve(await creator.getAddress(), SEED * 2n);
      await creator.connect(deployer).createMarket(id("dup-q"), id("pa"), id("pb"), SEED);
      await expect(
        creator.connect(deployer).createMarket(id("dup-q"), id("pa"), id("pb"), SEED)
      ).to.be.revertedWith("Creator: already created");
    });

    it("rejects zero seed", async function () {
      await expect(
        creator.connect(deployer).createMarket(id("zs"), id("a"), id("b"), 0n)
      ).to.be.revertedWith("Creator: zero seed");
    });

    it("registers market in marketByQuestion lookup", async function () {
      await usdc.connect(deployer).approve(await creator.getAddress(), SEED);
      const qid = id("lookup");
      const tx = await creator.connect(deployer).createMarket(qid, id("a"), id("b"), SEED);
      await tx.wait();
      expect(await creator.marketByQuestion(qid)).to.not.equal(ethers.ZeroAddress);
    });
  });

  // -------------------------------------------------------------------
  // H2HOracle
  // -------------------------------------------------------------------
  describe("H2HOracle", function () {
    let qid;
    beforeEach(async function () {
      qid = id("oracle-game");
      await usdc.connect(deployer).approve(await creator.getAddress(), SEED);
      await creator.connect(deployer).createMarket(qid, id("pa"), id("pb"), SEED);
    });

    it("only owner can resolve", async function () {
      await expect(oracle.connect(alice).resolve(qid, 100n, 50n)).to.be.revertedWithCustomError(
        oracle,
        "OwnableUnauthorizedAccount"
      );
    });

    it("aFP > bFP → winner=A, payouts [1,0]", async function () {
      await expect(oracle.connect(oracleOwner).resolve(qid, 4500n, 3200n))
        .to.emit(oracle, "H2HMarketResolved");
      const condId = await ctf.getConditionId(await oracle.getAddress(), qid);
      expect(await ctf.payoutNumerators(condId, 0)).to.equal(1n);
      expect(await ctf.payoutNumerators(condId, 1)).to.equal(0n);
    });

    it("aFP < bFP → winner=B, payouts [0,1]", async function () {
      await oracle.connect(oracleOwner).resolve(qid, 1000n, 5000n);
      const condId = await ctf.getConditionId(await oracle.getAddress(), qid);
      expect(await ctf.payoutNumerators(condId, 0)).to.equal(0n);
      expect(await ctf.payoutNumerators(condId, 1)).to.equal(1n);
    });

    it("aFP == bFP → tie, payouts [1,1]", async function () {
      await oracle.connect(oracleOwner).resolve(qid, 2500n, 2500n);
      const condId = await ctf.getConditionId(await oracle.getAddress(), qid);
      expect(await ctf.payoutNumerators(condId, 0)).to.equal(1n);
      expect(await ctf.payoutNumerators(condId, 1)).to.equal(1n);
    });

    it("voidMarket sets [1,1]", async function () {
      await oracle.connect(oracleOwner).voidMarket(qid);
      const condId = await ctf.getConditionId(await oracle.getAddress(), qid);
      expect(await ctf.payoutNumerators(condId, 0)).to.equal(1n);
      expect(await ctf.payoutNumerators(condId, 1)).to.equal(1n);
    });

    it("rejects double resolve", async function () {
      await oracle.connect(oracleOwner).resolve(qid, 100n, 50n);
      await expect(oracle.connect(oracleOwner).resolve(qid, 200n, 100n)).to.be.revertedWith("Oracle: resolved");
    });

    it("rejects resolve after void and vice-versa", async function () {
      await oracle.connect(oracleOwner).voidMarket(qid);
      await expect(oracle.connect(oracleOwner).resolve(qid, 100n, 50n)).to.be.revertedWith("Oracle: resolved");
    });
  });
});
