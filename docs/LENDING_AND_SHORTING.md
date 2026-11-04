# Lending & Shorting on Statix

Comprehensive design doc. Supersedes `SHORTING_DESIGN.md` for the lending/shorting feature.

This document is split into two halves:

1. **The theory** — explained without any finance background assumed.
2. **The implementation** — Solidity interfaces and how they plug into the contracts you already have.

Read part 1 even if you know finance. The mental model matters more than the jargon.

---

# Part 1 — The theory, in plain language

## The problem

Right now, the only way to make money on Statix is for a player's price to go up. You buy shares, you wait, you sell higher. The price goes up when other people buy and goes down when other people sell.

There are two big problems with this:

**Problem 1: You can't profit on bad takes.** If you watch the playoffs and you can clearly tell that some hyped player is overrated and his shares are about to crash — there's nothing you can do about it. You can refuse to buy, but you can't actually bet against him. The only people who can push his price down are people who already own him and are willing to sell.

**Problem 2: Price has a hard floor.** When a pool launches, the starting price is set (let's say $10). The math of the AMM means the price can go *up* from there as people buy, and back *down* as people sell, but it can never go *below* $10. Why? Because to push the price below $10, the pool would need to "sell" shares to itself — but nothing in the current system can do that. So a benchwarmer who is realistically worth $1 still trades at $10 if anyone bothers to look at his pool.

Both problems share the same root cause: the market is **one-sided**. Only buyers can move the price up, and only people who previously bought can move it down. Bears have no voice.

We want to add a second voice.

## The first new idea: lending

Imagine you collect rare basketball jerseys. You own a Steph Curry jersey worth $300, and you don't want to sell it because it might go up in value. But it's just sitting in your closet doing nothing.

A friend who runs a sports memorabilia shop says: "Hey, can I borrow that jersey for two weeks to display in my window? I'll pay you $20 for the rental, and I promise to return the same jersey at the end."

This is a great deal for you:
- You still own the jersey. You get it back.
- Whatever the jersey is worth at the end (more or less), it's still yours.
- You earned $20 for letting it sit in someone else's window instead of your closet.

You'd say yes. Your jersey was idle; now it's earning.

**Lending on Statix is exactly the same idea, but with player shares.** A user who's holding shares — someone who plans to keep them through the playoff round to collect dividends — can put those shares into a "lending pool." Other users can borrow them. The borrower pays a small ongoing fee. The lender keeps ownership of the shares the whole time and gets them back when the borrower returns them.

The lender's shares are working harder. That's it.

## The second new idea: shorting

Now back to the jersey example. Why would anyone want to *borrow* a jersey?

Imagine your friend the shop owner has a different reason. He thinks the Steph Curry jersey is overpriced right now because of recent hype, and he's pretty sure the price will drop in two weeks. So here's what he does:

1. He borrows your Steph Curry jersey. Pays you the $20 rental fee.
2. He sells it immediately to a customer for $300.
3. Two weeks later, hype has died down. He buys an identical Steph Curry jersey for $260.
4. He gives that replacement jersey back to you (you don't care which physical jersey, they're identical).
5. He pockets $300 - $260 = $40, minus the $20 he paid you. Net profit: $20.

He didn't own a jersey at the start. He doesn't own one at the end. But he made money because he correctly predicted the price would drop. He bet *against* the jersey.

This is **shorting**. He borrowed something, sold it high, and bought a replacement back when it was cheap.

The risks are real:
- If the jersey's price had gone *up* to $400 instead, he'd have to buy a replacement for $400 to give you back. He'd lose $100, plus the rental fee. Bad day.
- If the price went *way* up, his loss could be enormous. Unlike buying something (where the worst case is it goes to zero), with shorting the worst case is the price goes to infinity.

To protect against this, he has to put up a "deposit" before he's allowed to borrow — enough to cover potential losses. If the price moves against him too far, the system takes the deposit and forces him to buy back early. This is called **liquidation**. It hurts.

**Shorting on Statix is exactly this.** Bears borrow shares from the lending pool, sell them into the AMM (pushing the price down), and have to buy them back later at whatever the new price is. If they were right and the price dropped, they pocket the difference. If they were wrong, they lose their deposit.

## Why this is good for everyone

Once you have lending and shorting, the market starts working in both directions:

- **Holders earn extra income** from renting out their shares. They don't have to sell. They don't lose dividend rights. They just get paid for being patient.
- **Bears get to act on their opinions** instead of just sitting on the sidelines being right but powerless.
- **Prices become more accurate** because both sides of every opinion can put money behind it.
- **Eliminated players actually get priced down** instead of sitting forever at their starting price with zero volume.
- **The protocol earns more in fees** because every short opens a trade and every short closes a trade — two extra fee events per opinion.
- **The dividend pool grows** because those fees flow into it.

## How fees naturally find the right level

Here's a question: what should the rental fee be? If it's too low, no lender will bother. If it's too high, no borrower will bother. Who decides?

Nobody decides. The market decides automatically.

Imagine the lending pool for one player has 100 shares supplied by lenders, and 5 shares are currently borrowed. That's only 5% of the supply being used. There's tons of slack — borrowers can easily get more if they want. So the rental fee stays low to attract more borrowing.

Now imagine 90 of the 100 shares are borrowed. Now there's almost no slack. If a new bear wants to short, there's barely any supply left. The fee starts climbing fast — partly to discourage new borrowing (so existing lenders can pull out if they need to), and partly to attract new lenders (because high fees mean high yield, which pulls in new supply).

The percentage of supply that's being borrowed is called **utilization**. The system uses utilization to set the fee:

- Low utilization → low fee → low yield for lenders, cheap for borrowers
- High utilization → high fee → high yield for lenders, expensive for borrowers

This is self-balancing. When the system is too cold, fees drop and bring more borrowers in. When it's too hot, fees rise and bring more supply in (or push borrowers to close). The market finds equilibrium without anyone having to decide anything.

The shape of how the fee responds to utilization is called the **utilization curve**. It's gentle at first (so the cold market can warm up) and gets very steep near 100% utilization (so the hot market doesn't run out of liquidity). That steep part is called the "kink."

## How the lender's earnings get calculated

Two streams of income for lenders:

**Stream 1: Borrow fees from shorts.** When shorts pay rent on borrowed shares, that money gets distributed to all the lenders pro-rata (proportional to how much each lender supplied). This stream depends on utilization — if no shorts exist, no fees flow in.

**Stream 2: A slice of the player's trade fees.** Every buy and sell on a player's AMM already pays a 2% fee (split between dividends and protocol). We add a third slice: a piece of every trade fee on that player gets routed to the lenders of *that* player. This stream depends on volume — if a player is being heavily traded, lenders earn even when no shorts exist.

This combination is important. Stream 1 alone would mean lending is uninteresting on most players (because most players don't have lots of bears wanting to short them). Stream 2 makes lending attractive on any popular player, because popularity drives volume drives fees.

The lender doesn't have to do anything to earn either stream. They just supply shares and the math runs in the background. The UI shows them an annualized rate (the **supply APR**) so they can see at a glance whether it's worth their while.

## What "snapshot" means for dividends, and why it matters

Statix dividends are paid based on holdings at a specific moment — the **snapshot** at the end of each round. Whoever holds shares at the snapshot gets a piece of the dividend pool, weighted by how many they hold.

This creates a tricky question for shorting: who's holding the share when the snapshot happens? The lender (who originally bought it)? Or the AMM (who bought it back from the short close)? Or the new buyer?

To keep the dividend math clean and predictable, the rule is: **all shorts must close before the snapshot.** A few hours before the round ends, the system automatically force-closes any open short positions by buying back at the AMM. The lent shares go back to the lending pool, the lending pool credits each lender their share, and when the snapshot runs everyone's holdings look exactly like they would have without any shorts ever happening.

Lenders never lose their dividend rights. Borrowers know in advance that they have to be out before the deadline (or the system closes for them at whatever price the AMM gives, which might be bad).

## The cold-start problem (and why the protocol seeds the market)

There's a chicken-and-egg problem at launch. Day one of any new player pool:

- The lending pool is empty (no one's supplied yet).
- No shorts can open because there's nothing to borrow.
- No real lender will supply, because with zero borrowing the supply APR is also zero.
- Result: the lending market never starts.

The fix is for the **protocol itself to be the first lender**. The host company (you) mints itself a starter supply of shares for each player and deposits them into that player's lending pool from day one. Now there's borrowable inventory immediately. Shorts can open. As shorts open, utilization rises, supply APR climbs, and real lenders see an attractive yield and join. Over time the protocol's share of supply naturally shrinks as the market becomes self-sustaining.

This is the standard bootstrap pattern for any two-sided market — the platform provides the initial liquidity, then steps back as users take over.

The protocol doesn't take any directional bet doing this. It's not betting the player will go up or down. It's just providing infrastructure (borrowable shares) and earning rental fees in exchange. The shares come back when borrowers return them. The protocol's only "exposure" is to the price of shares it minted for free — which means it can never lose money in dollar terms. Best case it earns fees. Worst case the shares come back and sit there.

To keep this clean, **the protocol's seed shares don't earn dividends**. They earn lending fees only. This avoids the protocol claiming a piece of the dividend pool that should belong to actual users.

## How this affects the price floor (partially)

This is important and sometimes confusing.

Lending and shorting let bears push the price down — but **only as far down as the borrowed shares can push it**. There are two sources of borrowable shares:

1. **Shares previously bought from the AMM** by users who chose to lend them. These can only undo prior buying, so they alone can't push price below the starting price.
2. **Shares minted by the protocol as seed supply.** These never came from the AMM. When borrowers sell them into the AMM, they push the AMM into a state it couldn't otherwise reach — *below* the starting price.

So protocol-seeded lending **does partially break the floor**, but only while shorts are actively open against the seeded supply. When shorts close, the AMM bounces back toward the starting price.

For a *permanent* fix to the floor problem (so that a deep-bench player simply launches at $2 instead of $10), you need a separate change: launch each player with different initial reserves based on expected fantasy value. That's a config change, no new mechanism required, and it's complementary to lending/shorting rather than competing with it.

In summary, three tools work together:

| Tool | What it does | Status |
|---|---|---|
| **Tiered initial reserves** | Sets the right *starting* price per player. | Separate workstream — config change. |
| **Protocol-seeded lending** | Enables the market to discover prices below the starting price when bears actually want to. | Part of this design. |
| **User lending + shorting** | Lets the broader market participate in price discovery and earn yield. | Part of this design. |

---

# Part 2 — Implementation

## How it connects to what you already have

Current system, simplified:

```
User
 │
 ▼
StatixRouter ─── reads fees ───▶ (feeBps, dividendFeeBps)
 │
 ▼
PlayerPool ─── sends fees ───▶ DividendHub  (dividends snapshot/distribute)
                                   ▲
                                   │
                            PoolFactory (registry of pools)
```

After lending/shorting, the picture becomes:

```
User
 │
 ▼
StatixRouter ─── reads fees ───▶ (feeBps, dividendFeeBps, lenderFeeBps NEW)
 │
 ├──▶ PlayerPool ─── splits fees 3 ways ──┬──▶ DividendHub
 │      ▲                                  ├──▶ Router (protocol)
 │      │                                  └──▶ LendingPool[poolIdx] (NEW)
 │      │
 │  transferShares(from,to)  ◀─────────┐
 │                                      │
 ▼                                      │
ShortManager (NEW) ◀──── borrow/repay ─ LendingPool[poolIdx] (NEW)
 │                                      ▲
 │                                      │ supply / withdraw
 ▼                                      │
KinkedRateModel (NEW)                  Lender (user)
 (utilization curve)
                                       
DividendHub ── round-end freeze hook ──▶ ShortManager.freezeAndCloseAll()
                                    └──▶ LendingPool.freezeForRoundEnd()
```

### What's new

| Contract | Role |
|---|---|
| `LendingPool` | One per player. Holds supplied shares, accrues interest, distributes fees to suppliers. |
| `ShortManager` | Single contract. Opens/closes/liquidates short positions across all pools. |
| `IRateModel` + `KinkedRateModel` | Utilization curve. Pluggable so we can swap math without redeploying. |

### What changes in existing contracts

| Contract | Change | Reason |
|---|---|---|
| `PlayerPool.sol` | Add `transferShares(from, to, amount)` (router-only). | LendingPool needs to move shares between users without going through the AMM. |
| `PlayerPool.sol` | Add `mintTo(to, amount)` (router-only, admin-gated). | Protocol seed-lender needs to mint initial supply at deployment. |
| `PlayerPool.sol` | Modify `executeBuy`/`executeSell` to split the fee into 3 buckets instead of 2. | Lenders get a slice of trade fees. |
| `IPlayerPool.sol` | Update interface for the above. | Match. |
| `StatixRouter.sol` | Add `lenderFeeBps` config + `setLendingPool(idx, addr)` registry. | New fee parameter; router needs to know which lending pool serves which player. |
| `StatixRouter.sol` | Add `transferShares` passthrough that ShortManager can call. | ShortManager needs Router-mediated authority to move shares. |
| `StatixRouter.sol` | Add `seedLendingPool(idx, amount)` admin function. | One-shot bootstrap to mint protocol shares + supply to lending pool at deployment. |
| `DividendHub.sol` | Add `setShortManager`/`setLendingPoolRegistry` + call freeze hooks before snapshot. | Force shorts to close before the dividend snapshot for clean accounting. |
| `DividendHub.sol` | Add `dividendIneligible[address]` mapping; skip these in dividend math. | Protocol-seeded shares earn lending fees only, not dividends. |

Everything else (PoolFactory, DBucks, MockUSDC, the dividend snapshot/claim logic) is untouched.

---

## Solidity interfaces

### `IRateModel.sol`

Pluggable interest rate model. Pure math, no state.

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IRateModel {
    /// @notice Borrow rate at a given utilization, annualized in BPS (1e4 = 100%).
    function getBorrowRateBps(uint256 utilizationBps) external view returns (uint256);

    /// @notice Supply rate = borrowRate * utilization * (1 - reserveFactor), annualized in BPS.
    function getSupplyRateBps(uint256 utilizationBps, uint256 reserveFactorBps)
        external view returns (uint256);
}
```

`KinkedRateModel` is the concrete implementation:

```solidity
contract KinkedRateModel is IRateModel {
    uint256 public immutable baseRateBps;        // e.g. 0
    uint256 public immutable slope1Bps;          // e.g. 400 (4%)
    uint256 public immutable slope2Bps;          // e.g. 6000 (60%)
    uint256 public immutable optimalUtilBps;     // e.g. 8000 (80%)
    // ... constructor, getBorrowRateBps, getSupplyRateBps
}
```

### `ILendingPool.sol`

One deployed per player. Sibling to `PlayerPool`.

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface ILendingPool {
    // ============ EVENTS ============
    event Supplied(address indexed user, uint256 shares, uint256 newPrincipal);
    event Withdrawn(address indexed user, uint256 shares, uint256 interestPaidDBucks);
    event Borrowed(address indexed shortManager, uint256 shares);
    event Repaid(address indexed shortManager, uint256 shares, uint256 interestDBucks);
    event TradeFeeDistributed(uint256 amountDBucks);
    event Frozen();
    event Unfrozen();

    // ============ VIEWS ============
    function poolIdx() external view returns (uint256);
    function playerPool() external view returns (address);
    function paymentToken() external view returns (address);
    function rateModel() external view returns (address);

    function totalSupplied() external view returns (uint256);
    function totalBorrowed() external view returns (uint256);
    function utilizationBps() external view returns (uint256);
    function borrowRateBps() external view returns (uint256);     // annualized
    function supplyRateBps() external view returns (uint256);     // annualized
    function reserveFactorBps() external view returns (uint256);

    function lenderPrincipal(address user) external view returns (uint256);
    function lenderClaimable(address user)
        external view returns (uint256 sharesAvailable, uint256 dbucksEarned);

    function availableToBorrow() external view returns (uint256);
    function frozen() external view returns (bool);

    // ============ LENDER ACTIONS ============
    function supply(uint256 shares) external;
    function withdraw(uint256 shares) external returns (uint256 dbucksEarned);
    function withdrawAll() external returns (uint256 sharesReturned, uint256 dbucksEarned);

    // ============ BORROW (only ShortManager) ============
    function borrow(uint256 shares, address recipient) external;
    function repay(uint256 shares, uint256 interestDBucks) external;

    // ============ FEE INFLOW (only Router or PlayerPool) ============
    function receiveTradeFee(uint256 amount) external;

    // ============ ROUND-END HOOKS (only DividendHub) ============
    function freezeForRoundEnd() external;
    function unfreezeAfterRoundEnd() external;
}
```

Implementation notes:

- Interest accrual uses the standard **liquidity index** pattern (Aave-style). Two indices grow over time: `borrowIndex` and `supplyIndex`. A lender's balance in DBucks-terms = `principalShares × (currentSupplyIndex / indexAtDeposit)`.
- Shares supplied physically live in `PlayerPool.holdings[lendingPoolAddress]`. Lender balances inside `LendingPool` are bookkeeping only.
- `freezeForRoundEnd` blocks new supply/borrow/withdraw until `unfreezeAfterRoundEnd`. Set by DividendHub at snapshot time.

### `IShortManager.sol`

Single contract for all players' short positions.

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IShortManager {
    struct Position {
        address borrower;
        uint256 poolIdx;
        uint256 sharesOwed;
        uint256 collateralDBucks;
        uint256 entryPrice;            // for display
        uint256 borrowIndexSnapshot;   // for accruing interest owed
        uint256 openedAt;
        bool open;
    }

    // ============ EVENTS ============
    event ShortOpened(uint256 indexed positionId, address indexed borrower, uint256 indexed poolIdx, uint256 shares, uint256 collateral, uint256 entryPrice);
    event ShortClosed(uint256 indexed positionId, uint256 buybackCost, uint256 interestPaid, uint256 collateralReturned);
    event Liquidated(uint256 indexed positionId, address indexed liquidator, uint256 penaltyDBucks);
    event CollateralAdded(uint256 indexed positionId, uint256 amount);
    event ForceClosedAtRoundEnd(uint256 indexed positionId);

    // ============ VIEWS ============
    function getPosition(uint256 positionId) external view returns (Position memory);
    function healthFactorBps(uint256 positionId) external view returns (uint256); // <10000 = liquidatable
    function liquidationPrice(uint256 positionId) external view returns (uint256);
    function maxShortShares(uint256 poolIdx, uint256 collateralDBucks) external view returns (uint256);
    function getUserPositions(address user) external view returns (uint256[] memory);
    function totalShortInterestShares(uint256 poolIdx) external view returns (uint256);

    // ============ BORROWER ACTIONS ============
    function openShort(
        uint256 poolIdx,
        uint256 shares,
        uint256 collateralDBucks,
        uint256 minPrice  // slippage protection on AMM sell
    ) external returns (uint256 positionId);

    function closeShort(uint256 positionId, uint256 maxPrice) external; // slippage on buyback
    function addCollateral(uint256 positionId, uint256 amount) external;

    // ============ LIQUIDATION (anyone) ============
    function liquidate(uint256 positionId) external returns (uint256 penaltyDBucks);

    // ============ ROUND-END (only DividendHub) ============
    function freezeAndCloseAll() external;

    // ============ ADMIN ============
    function setMaxShortInterestBps(uint256 poolIdx, uint256 bps) external;  // cap as % of virtualShares
    function setLiquidationThresholdBps(uint256 bps) external;
    function setLiquidationPenaltyBps(uint256 bps) external;
    function setLiquidatorRewardBps(uint256 bps) external;  // share of penalty to liquidator
    function pause() external;
    function unpause() external;
}
```

Implementation notes:

- Position lifecycle: `openShort` pulls collateral from borrower → calls `LendingPool.borrow` → calls `Router.executeSellAsContract` (new) which routes through `PlayerPool.executeSell`. Proceeds add to position's collateral pool.
- `healthFactorBps` = `(collateral + amm_short_pnl) / required_margin`. Below 10000 (100%) = liquidatable.
- `freezeAndCloseAll` iterates open positions, calls AMM buybacks, returns shares to the appropriate `LendingPool`. Called by `DividendHub` before snapshot.
- Liquidation penalty: e.g. 5% of position size. Default split: 50% to liquidator, 50% to `DividendHub`.

### Modifications to existing interfaces

#### `IPlayerPool.sol` — add and modify

```solidity
interface IPlayerPool {
    // ... existing functions ...

    // NEW: signature changes — fee now splits 3 ways
    function executeBuy(address buyer, uint256 sharesOut, uint256 maxCost)
        external returns (uint256 totalCost, uint256 dividendFee, uint256 protocolFee, uint256 lenderFee);

    function executeSell(address seller, uint256 sharesIn, uint256 minRevenue)
        external returns (uint256 netRevenue, uint256 dividendFee, uint256 protocolFee, uint256 lenderFee);

    // NEW: holder-to-holder transfer for lending pool integration
    function transferShares(address from, address to, uint256 amount) external;

    // NEW: protocol seed-lender bootstrap. Mints shares directly into a holder's
    // balance without an AMM trade. Router-only; intended for deployment-time
    // seeding of the LendingPool. Increments totalShares.
    function mintTo(address to, uint256 amount) external;

    // NEW: the LendingPool address registered for this player (set by Router)
    function lendingPool() external view returns (address);
    function setLendingPool(address lp) external;  // onlyRouter
}
```

Note on `mintTo`: this is the only way to introduce shares without buying them from the AMM. Restricted to the Router, which itself restricts the call to admin-only (`seedLendingPool`). Use cases beyond initial seeding should be rare — every mint dilutes potential dividend recipients (mitigated by `dividendIneligible`, see DividendHub section).

#### `IFeeConfig` (lives at the bottom of `PlayerPool.sol`)

```solidity
interface IFeeConfig {
    function feeBps() external view returns (uint256);
    function dividendFeeBps() external view returns (uint256);
    function lenderFeeBps() external view returns (uint256);  // NEW
}
```

Default split when introducing the lender slice (sums to BPS = 10000 of the *fee*, not of the trade):

| Bucket | Old | New | Notes |
|---|---|---|---|
| Dividends | 67% | 50% | Still the largest slice. |
| Protocol | 33% | 25% | Slight cut. |
| Lenders | 0% | 25% | New stream, distributed pro-rata to suppliers of that player's pool. |

Total trade fee unchanged at 2%.

#### `StatixRouter.sol` — additions

```solidity
contract StatixRouter is Ownable, ReentrancyGuard, IFeeConfig {
    // ... existing ...

    uint256 public lenderFeeBps = 2500;  // NEW: 25% of fee
    address public shortManager;          // NEW
    address public protocolSeedLender;    // NEW: address that holds protocol seed-lender shares

    // poolIdx => LendingPool address
    mapping(uint256 => address) public lendingPools;

    function setLenderFeeBps(uint256 _bps) external onlyOwner;
    function setShortManager(address _sm) external onlyOwner;
    function setLendingPool(uint256 _poolIdx, address _lp) external onlyOwner;
    function setProtocolSeedLender(address _addr) external onlyOwner;

    /// @notice ShortManager-only entry to execute trades on behalf of itself.
    /// Bypasses blacklist/allowlist (ShortManager is privileged), still respects pause/kill.
    function executeAsShortManager(
        uint256 _poolIdx,
        bool isBuy,
        uint256 _shares,
        uint256 _slippageBound
    ) external returns (uint256);

    /// @notice ShortManager-only passthrough to move shares between holders inside a pool.
    function transferShares(uint256 _poolIdx, address _from, address _to, uint256 _amount) external;

    /// @notice One-shot bootstrap of a player's lending market.
    /// Mints `_seedShares` to `protocolSeedLender` via PlayerPool.mintTo,
    /// then has the seed-lender supply them to the LendingPool.
    /// Only callable once per pool (subsequent calls revert).
    /// Caller must be owner. Seed-lender address must already hold approval
    /// for the LendingPool, and be marked dividendIneligible in DividendHub.
    function seedLendingPool(uint256 _poolIdx, uint256 _seedShares) external onlyOwner;
}
```

#### `DividendHub.sol` — additions

```solidity
contract DividendHub is Ownable, ReentrancyGuard {
    // ... existing ...

    address public shortManager;
    // poolIdx => lendingPool
    mapping(uint256 => address) public lendingPools;

    /// @notice Addresses whose holdings are excluded from dividend math.
    /// Intended for protocol seed-lender + LendingPool addresses, so
    /// "system-owned" shares earn lending fees only and don't dilute users.
    mapping(address => bool) public dividendIneligible;

    function setShortManager(address _sm) external onlyOwner;
    function setLendingPool(uint256 _poolIdx, address _lp) external onlyOwner;
    function setDividendIneligible(address _addr, bool _ineligible) external onlyOwner;

    /// @notice Called by admin before distributeDividends. Closes all open shorts, freezes lending.
    function freezeForSnapshot() external onlyOwner {
        if (shortManager != address(0)) {
            IShortManager(shortManager).freezeAndCloseAll();
        }
        uint256 count = factory.poolCount();
        for (uint256 i = 0; i < count; i++) {
            address lp = lendingPools[i];
            if (lp != address(0)) ILendingPool(lp).freezeForRoundEnd();
        }
    }

    /// @notice Called after distributeDividends to resume lending.
    function unfreezeAfterSnapshot() external onlyOwner {
        uint256 count = factory.poolCount();
        for (uint256 i = 0; i < count; i++) {
            address lp = lendingPools[i];
            if (lp != address(0)) ILendingPool(lp).unfreezeAfterRoundEnd();
        }
    }
}
```

In the existing dividend math:

- `snapshotUserHoldings` should reject ineligible addresses (no-op).
- `distributeDividends` should subtract ineligible holdings from `roundEndTotalAllShares` and from each pool's `roundEndPoolTotalShares`, so the base-pool denominator only counts *eligible* shares. Otherwise eligible users' base dividend is diluted by the protocol's seed inventory.
- `calculateDividend` ignores ineligible users (they get 0).

The existing `distributeDividends` flow becomes:

1. Admin calls `freezeForSnapshot()` → all shorts force-close, lending freezes.
2. Admin runs `setRoundPerformanceBatch`, `setTopPerformerEligible`, `snapshotUserHoldings` as today (skipping ineligible addresses).
3. Admin calls `distributeDividends(_topN)` as today (using ineligibility-adjusted totals).
4. Admin calls `unfreezeAfterSnapshot()` → lending resumes for the next round.

---

## Protocol-seeded liquidity

The protocol bootstraps each lending market by minting itself starter shares and supplying them to the LendingPool at deployment time. This solves three problems at once:

1. **Cold start.** Users can short from day one instead of waiting for organic supply.
2. **Floor partial-fix.** Protocol-seeded shares can be sold into the AMM by shorts, pushing price below the starting price during open interest.
3. **Steady protocol revenue.** Seed shares earn the supply rate (borrow interest + 25% of trade fees) for as long as they remain supplied.

### Setup

A single dedicated EOA or contract address — `protocolSeedLender` — holds all seed positions. Marked `dividendIneligible` in DividendHub at deployment. Approves each player's `LendingPool` to pull shares (one-time setup).

### How shares get there

`PlayerPool.mintTo(protocolSeedLender, amount)` is the only path for shares to enter circulation without a buy. Restricted to Router. Router restricts to admin via `seedLendingPool`. The flow:

```
admin
  │ Router.seedLendingPool(poolIdx, seedShares)
  ▼
StatixRouter
  ├─ require(poolIdx not already seeded)
  ├─ PlayerPool.mintTo(protocolSeedLender, seedShares)   ← totalShares += seedShares
  └─ LendingPool.supplyOnBehalf(protocolSeedLender, seedShares)
       └─ PlayerPool.transferShares(protocolSeedLender, lendingPool, seedShares)
```

`LendingPool.supplyOnBehalf` is just `supply` with an explicit owner argument, callable only by Router.

### How much to seed per pool

Recommend tier-based, sized to expected pool volume:

| Tier | Seed shares | Rationale |
|---|---|---|
| Superstar | 200 | High volume, high short demand expected |
| Star | 200 | Same |
| Starter | 150 | Moderate volume |
| Rotation | 100 | Lower volume |
| Deep bench | 100 | Mainly to enable bear discovery on low-value players |

These numbers are starting points — tune after observing real utilization patterns in shadow mode (Phase 5).

### Seed shares and the AMM

The mint itself does **not** affect AMM state. `virtualShares` and `virtualCash` are unchanged. The starting price is unaffected. Only when a short borrows a seed share and sells it does the AMM state move.

This is why seeding is non-disruptive: it's pure infrastructure provision, not a price intervention.

### Risk profile

The protocol can never *lose dollars* on its seed lending. The seed shares were minted for free — there's no cost basis to recover. Worst case: the lender's claim shares come back valued at $0. Best case: continual borrow-fee + trade-fee-cut accrual.

The only risk is **liquidation cascade insolvency** — if a borrower's position goes deeply underwater faster than liquidators can act, the lent shares may not all be recoverable. This is the same risk every lender takes; the per-pool short interest cap (default 20% of `virtualShares`) is the primary mitigation.

### Long-term trajectory

As real lenders join, the protocol's share of total supply naturally shrinks. Day 1 the protocol might be 100% of supply. Day 30 it might be 20%. Day 90 it might be 5%. The protocol earns less in absolute terms over time, but the market is now self-sustaining — which is the goal.

The protocol *could* withdraw its seed shares once organic supply is sufficient, but this is risky: a sudden withdrawal could spike utilization and rates. Better to leave the seed permanently as a baseline floor of supply that prevents the market from going completely dry.

---

## Build plan

### Phase 1 — contracts
- [ ] `IRateModel.sol`, `KinkedRateModel.sol` (pure math, easy first deploy)
- [ ] `ILendingPool.sol`, `LendingPool.sol` (include `supplyOnBehalf` for protocol seeding)
- [ ] `IShortManager.sol`, `ShortManager.sol`
- [ ] Modify `PlayerPool.sol`: add `transferShares`, add `mintTo`, modify fee split into 3 buckets, add `lendingPool` slot
- [ ] Modify `IPlayerPool.sol` to match
- [ ] Modify `StatixRouter.sol`: `lenderFeeBps`, `lendingPools` registry, `shortManager`, `protocolSeedLender`, `executeAsShortManager`, `transferShares` passthrough, `seedLendingPool` admin function
- [ ] Modify `DividendHub.sol`: `freezeForSnapshot`, `unfreezeAfterSnapshot`, registries, `dividendIneligible` mapping + math adjustments
- [ ] Update `scripts/deploy-statix.js`:
  - Deploy rate model, deploy `LendingPool` per player, deploy `ShortManager`, wire registrations
  - Designate `protocolSeedLender` address; mark dividendIneligible in DividendHub
  - For each pool, call `Router.seedLendingPool(idx, tieredAmount)` to bootstrap supply

### Phase 2 — backend / indexer
- [ ] New tables: `lending_positions`, `short_positions`, `liquidation_events`, `lending_pool_state` (utilization snapshots)
- [ ] Indexer events: `Supplied`, `Withdrawn`, `Borrowed`, `Repaid`, `ShortOpened`, `ShortClosed`, `Liquidated`, `TradeFeeDistributed`
- [ ] New API routes: `/api/lending/`, `/api/shorts/`
- [ ] Compute supply/borrow APR server-side (off rate model + on-chain state) for cheap UI rendering

### Phase 3 — frontend
- [ ] "Lend" tab on `PlayerTradingPanel.tsx` — supply APR, utilization, your supply, withdraw
- [ ] "Short" mode in `TradeModal.tsx` — collateral slider, liquidation price, max loss, borrow APR
- [ ] Portfolio additions in `Portfolio.tsx` — open shorts with live PnL, supplied positions with accrued interest
- [ ] Update `/rules` page with mechanics + risk warnings

### Phase 4 — ops / safety
- [ ] Per-pool short interest cap configurable via Router (default 20% of `virtualShares`)
- [ ] Kill switch on `ShortManager` (mirrors existing AMM kill switch)
- [ ] Liquidation keeper bot (Railway worker) — scans `healthFactorBps`, calls `liquidate()`
- [ ] Round-end auto-flow: cron triggers `freezeForSnapshot` → snapshot → `unfreezeAfterSnapshot`

### Phase 5 — rollout
- [ ] Deploy to Base Sepolia, allowlist for testers
- [ ] One round in shadow mode: lending only, no shorting
- [ ] Open shorts on a small subset of pools (5 players) for one round
- [ ] Full rollout if metrics are healthy: utilization 30–80%, no liquidation cascades, dividend math unchanged

---

## Open questions to lock before phase 1

1. **Reserve factor.** What % of borrow interest goes to `DividendHub` instead of lenders? Recommend 10%.
2. **Liquidation threshold and penalty.** Recommend 110% maintenance margin, 5% penalty, 50/50 split between liquidator and `DividendHub`.
3. **Default per-pool short interest cap.** Recommend `min(20% of virtualShares, suppliedShares)`.
4. **Bot opt-in.** Recommend long-only for v1 to keep behavior interpretable. Phase 2 can add a `bearishness_score` and small short positions.
5. **UI gating.** Recommend hiding "Short" behind a "Pro mode" toggle to protect retail UX.
6. **Initial reserves redesign.** Strongly recommend pairing this work with per-player tiered initial reserves (separate doc) so the floor problem is permanently solved at launch, with seeded lending as the secondary mechanism for further bear-side discovery.
7. **Seed amount per tier.** Recommend the table above (200 / 200 / 150 / 100 / 100 by tier). Tune after shadow-mode observation.
8. **Seed-lender address type.** EOA vs. dedicated contract. Recommend a minimal dedicated contract with an emergency-recover function, owned by the protocol multisig.
9. **Public disclosure of seeding.** Should the UI show "X% of this player's lending supply is protocol-provided"? Recommend yes — it's a transparency win and signals the platform is bootstrapping the market in good faith.

---

## Decision summary

| Aspect | Choice |
|---|---|
| Lending model | Pooled / fungible (Aave-style), liquidity-index accrual |
| Borrow market | Cash-collateralized, AMM-routed open/close |
| Rate model | Per-pool kinked utilization curve, default `U_optimal=80%` |
| Lender yield | Borrow interest + 25% slice of player's trade fees |
| Round-end | Force-close all shorts, freeze lending, snapshot, unfreeze |
| Risk caps | Per-pool short interest as fraction of `virtualShares` |
| Bootstrap | Protocol seeds each LendingPool at deployment (tier-based amounts) |
| Seed shares dividends | Excluded via `dividendIneligible` mapping |
| Pricing floor | Partially addressed via protocol-seeded shorts (during open interest); permanent fix requires per-player initial reserves (separate workstream) |
| v1 scope | Humans only; bots stay long-only; "Short" gated behind Pro mode |
