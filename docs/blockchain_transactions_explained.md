# Blockchain Transactions in Dividend Fantasy — Detailed Walkthrough

This document explains every on-chain transaction in the Dividend Fantasy platform: how they're triggered, what happens at each layer of the stack, what gets stored, and when each one occurs.

---

## Table of Contents

1. [Prerequisites: Getting D-Bucks](#1-prerequisites-getting-d-bucks)
2. [Buying Player Shares](#2-buying-player-shares)
3. [Selling Player Shares](#3-selling-player-shares)
4. [Weekly Dividend Distribution (Admin)](#4-weekly-dividend-distribution-admin)
5. [Claiming Dividends (User)](#5-claiming-dividends-user)
6. [Summary of All On-Chain Transactions](#6-summary-of-all-on-chain-transactions)

---

## 1. Prerequisites: Getting D-Bucks

Before a user can trade, they need D-Bucks — the platform's casino-chip style ERC-20 token that wraps USDC 1:1.

### Testnet (Current Setup): Faucet

Since there's no real USDC on Base Sepolia, the `DBucks` contract has a **faucet mode** enabled.

**When it happens:** User clicks a "Get D-Bucks" button in the frontend.

**Frontend code (`useContracts.ts`):**
```typescript
export function useFaucetDBucks() {
  const { writeContract, data: hash, isPending } = useWriteContract();

  const faucet = (amount: number) => {
    writeContract({
      address: CONTRACTS.DBucks,
      abi: DBucksABI,
      functionName: "faucet",
      args: [parseUnits(amount.toString(), 6)],  // e.g., 1000 * 1e6
    });
  };
  // ...
}
```

**What happens on-chain (`DBucks.sol → faucet()`):**
1. Checks `faucetMode` is enabled
2. Checks `faucetMinted[msg.sender] + amount <= faucetLimit` (100,000 D-Bucks max per address)
3. Records `faucetMinted[msg.sender] += amount`
4. Mints D-Bucks to the user: `_mint(msg.sender, amount)`
5. Emits `FaucetMint(user, amount)`

**On-chain state changed:**
- `faucetMinted[user]` — tracks cumulative free mints
- ERC-20 `balanceOf(user)` — increases by `amount`
- ERC-20 `totalSupply` — increases by `amount`

### Production (Future): Deposit USDC

**What would happen on-chain (`DBucks.sol → deposit()`):**
1. Transfers USDC from user to DBucks contract: `usdc.safeTransferFrom(msg.sender, address(this), amount)`
2. Mints D-Bucks 1:1: `_mint(msg.sender, amount)`
3. Emits `Deposited(user, amount)`

This requires the user to first **approve** the DBucks contract to spend their USDC (a separate ERC-20 `approve()` transaction).

---

## 2. Buying Player Shares

### When it happens

User opens the trade modal on a player card, enters a share amount, and clicks "Buy".

### Full chain of calls

#### Step 1: User enters share amount → real-time on-chain quote

As the user types a number into the input field, the `useBuyQuote` hook fires a **read call** (not a transaction — costs nothing, no signature needed):

```
Frontend                                    Blockchain
────────                                    ──────────
useBuyQuote(playerIndex, shares)  ───────►  DividendFantasy.getBuyQuote(_playerIdx, _sharesOut)
                                  ◄───────  Returns: (cost, fee, total, newPrice)
```

The contract computes the quote using constant-product AMM math:
- `cost = (virtualCash × sharesOut) / (virtualShares - sharesOut)`
- `fee = cost × 150 / 10000` (1.5%)
- `total = cost + fee`
- `newPrice = (virtualCash + cost) × 1e6 / (virtualShares - sharesOut)`

If the chain is unreachable, the frontend has a **fallback client-side approximation** using the same formula with initial pool values (1000 shares, player.price × 1000 cash).

#### Step 2: Check D-Bucks allowance

Before buying, the contract needs permission to pull D-Bucks from the user. The frontend checks the current allowance via `useDBucksAllowance`:

```
Frontend                                    Blockchain
────────                                    ──────────
useDBucksAllowance(userAddress)   ───────►  DBucks.allowance(user, DividendFantasy)
                                  ◄───────  Returns: current allowance (uint256)
```

If `allowance < quote.total`, the user needs to approve first.

#### Step 3a (if needed): Approve D-Bucks spending

This is a **write transaction** — the user's wallet pops up for a signature.

```
Frontend                                    Blockchain
────────                                    ──────────
approve(quote.total * 1.1)        ───────►  DBucks.approve(DividendFantasy, amount)
  │                                           │
  │  User signs in wallet                     │  Sets allowance[user][DividendFantasy] = amount
  │                                           │  Emits Approval(user, DividendFantasy, amount)
  │                                  ◄───────  Transaction receipt
```

The 10% buffer (`* 1.1`) ensures that even if the price shifts slightly before the buy executes, the allowance is still sufficient. Over-approving is harmless — unused allowance just sits there.

#### Step 3b: Execute the buy

Another **write transaction** — the actual trade.

```
Frontend                                    Blockchain
────────                                    ──────────
buy(playerIndex, shares,          ───────►  DividendFantasy.buy(_playerIdx, _sharesOut, _maxCost)
    quote.total * 1.05)                       │
  │                                           │  1. Validation:
  │  User signs in wallet                     │     - Contract not killed
  │                                           │     - Trading not paused
  │                                           │     - User not blacklisted
  │                                           │     - Player index valid & active
  │                                           │
  │                                           │  2. AMM math:
  │                                           │     cost = getBuyCost(playerIdx, sharesOut)
  │                                           │     fee = cost × 150 / 10000  (1.5%)
  │                                           │     totalCost = cost + fee
  │                                           │     require(totalCost <= _maxCost)  ← slippage check
  │                                           │
  │                                           │  3. Token transfer:
  │                                           │     DBucks.transferFrom(user → contract, totalCost)
  │                                           │
  │                                           │  4. Fee distribution:
  │                                           │     dividendFee = fee × 6700 / 10000  (67% of fee)
  │                                           │     protocolFee = fee - dividendFee   (33% of fee)
  │                                           │     totalWeeklyFees += dividendFee
  │                                           │     Transfer protocolFee → protocolFeeRecipient
  │                                           │
  │                                           │  5. Snapshot past holdings (anti-gaming):
  │                                           │     For each un-snapshotted past week:
  │                                           │       weekEndHoldings[week][playerIdx][user] = current
  │                                           │
  │                                           │  6. Update AMM pool:
  │                                           │     virtualShares -= sharesOut
  │                                           │     virtualCash += cost
  │                                           │     totalShares += sharesOut
  │                                           │
  │                                           │  7. Credit user:
  │                                           │     holdings[playerIdx][user] += sharesOut
  │                                           │
  │                                           │  8. Emit Buy(playerIdx, buyer, shares, totalCost, fee)
  │                                  ◄───────  Transaction receipt (includes event logs)
```

The `_maxCost` parameter (`quote.total * 1.05`) is the 5% slippage tolerance. If someone else trades the same player between when the user saw the quote and when the transaction executes, shifting the price more than 5%, the transaction **reverts** and the user pays nothing (only gas).

#### Step 4: Post-trade — log to backend

After wagmi detects the transaction was confirmed on-chain (via `useWaitForTransactionReceipt`), the frontend fires a **non-critical** HTTP call to the backend:

```
Frontend                        Backend                         Supabase
────────                        ───────                         ────────
logTransaction(                 POST /api/trading/log-tx        INSERT INTO transactions
  walletAddress,         ────►    Pydantic validates      ────►   (wallet_address,
  playerIndex,                    the request body                 player_index, side,
  "buy", shares,                                                   shares, cost, tx_hash)
  cost, txHash
)
```

This is purely for analytics and leaderboard. If it fails, the trade is still valid on-chain. The `.catch(console.error)` in the frontend silently logs any errors.

#### On-chain state after a buy

| Storage variable | Change |
|---|---|
| `holdings[playerIdx][buyer]` | **+sharesOut** |
| `players[playerIdx].virtualShares` | **-sharesOut** |
| `players[playerIdx].virtualCash` | **+cost** |
| `players[playerIdx].totalShares` | **+sharesOut** |
| `totalWeeklyFees` | **+dividendFee** (67% of fee) |
| `weekEndHoldings[w][playerIdx][user]` | Snapshotted for any past un-snapshotted weeks |
| D-Bucks `balanceOf(user)` | **-totalCost** |
| D-Bucks `balanceOf(DividendFantasy)` | **+(cost + dividendFee)** |
| D-Bucks `balanceOf(protocolFeeRecipient)` | **+protocolFee** |

---

## 3. Selling Player Shares

### When it happens

User opens the trade modal, switches to the "Sell" tab, enters a share amount, and clicks "Sell".

### How it differs from buying

Selling follows the same frontend flow but in reverse. No approval step is needed — the contract already holds the user's shares in `holdings[]`, and the contract itself sends D-Bucks to the user.

#### The on-chain execution

```
Frontend                                    Blockchain
────────                                    ──────────
sell(playerIndex, shares,         ───────►  DividendFantasy.sell(_playerIdx, _sharesIn, _minRevenue)
    quote.total * 0.95)                       │
  │                                           │  1. Validation:
  │  User signs in wallet                     │     - Contract not killed
  │                                           │     - Trading not paused
  │                                           │     - Player index valid
  │                                           │     - User has enough shares:
  │                                           │       holdings[playerIdx][user] >= sharesIn
  │                                           │
  │                                           │  2. AMM math:
  │                                           │     revenue = getSellRevenue(playerIdx, sharesIn)
  │                                           │       = (virtualCash × sharesIn) / (virtualShares + sharesIn)
  │                                           │     fee = revenue × 150 / 10000  (1.5%)
  │                                           │     netRevenue = revenue - fee
  │                                           │     require(netRevenue >= _minRevenue)  ← slippage check
  │                                           │
  │                                           │  3. Fee distribution (same as buy):
  │                                           │     dividendFee = fee × 67%
  │                                           │     protocolFee = fee × 33%
  │                                           │     totalWeeklyFees += dividendFee
  │                                           │     Transfer protocolFee → protocolFeeRecipient
  │                                           │
  │                                           │  4. Snapshot past holdings
  │                                           │
  │                                           │  5. Update AMM pool:
  │                                           │     virtualShares += sharesIn   (shares return to pool)
  │                                           │     virtualCash -= revenue      (cash leaves pool)
  │                                           │     totalShares -= sharesIn
  │                                           │
  │                                           │  6. Debit user:
  │                                           │     holdings[playerIdx][user] -= sharesIn
  │                                           │
  │                                           │  7. Pay user:
  │                                           │     DBucks.transfer(user, netRevenue)
  │                                           │
  │                                           │  8. Emit Sell(playerIdx, seller, shares, netRevenue, fee)
  │                                  ◄───────  Transaction receipt
```

**Key difference from buy:** The `_minRevenue` parameter (`quote.total * 0.95`) protects in the other direction — if the price drops more than 5% before execution, the transaction reverts and the user keeps their shares.

**Note on blacklisted users:** Blacklisted addresses **can sell** but **cannot buy**. This ensures banned users aren't trapped with no way to exit their positions.

#### On-chain state after a sell

| Storage variable | Change |
|---|---|
| `holdings[playerIdx][seller]` | **-sharesIn** |
| `players[playerIdx].virtualShares` | **+sharesIn** |
| `players[playerIdx].virtualCash` | **-revenue** |
| `players[playerIdx].totalShares` | **-sharesIn** |
| `totalWeeklyFees` | **+dividendFee** |
| D-Bucks `balanceOf(user)` | **+netRevenue** |
| D-Bucks `balanceOf(DividendFantasy)` | **-(netRevenue + protocolFee)** |
| D-Bucks `balanceOf(protocolFeeRecipient)` | **+protocolFee** |

---

## 4. Weekly Dividend Distribution (Admin)

### When it happens

At the end of each NBA week, an admin runs the `distribute-dividends.js` script manually:

```bash
WEEK_START=2025-02-10 WEEK_END=2025-02-16 \
ADMIN_KEY=<secret> \
npx hardhat run scripts/distribute-dividends.js --network base-sepolia
```

This triggers a **sequence of 5 on-chain transactions**, all signed by the contract owner's wallet via Hardhat. Here's the full process:

---

### Transaction 1: Pause Trading

```
Admin Script                                Blockchain
────────────                                ──────────
fantasy.setTradingPaused(true)    ───────►  DividendFantasy.setTradingPaused(true)
                                              │ require(msg.sender == owner)
                                              │ tradingPaused = true
                                              │ Emit TradingPaused(true)
```

**Why:** Prevents users from buying/selling during the distribution window, which would mess up the snapshot of who held what at week's end. All buy/sell calls will revert with "Trading paused" until this is lifted.

---

### Transaction 2: Submit Weekly Performance Data

Before this on-chain transaction, the script calls the **backend API** to get real NBA stats:

```
Admin Script                     Backend                          NBA API
────────────                     ───────                          ───────
POST /api/admin/                 fetch_top_players()       ────►  stats.nba.com
  update-weekly-stats     ────►  get_weekly_actuals()      ────►  (player game logs)
  {week, week_start,             │
   week_end}              ◄────  Returns: {on_chain_data:
                                   player_indices: [0,1,2,...],
                                   actual_points_scaled: [189000000, ...]}
```

The backend returns actual fantasy points scaled to 1e6 (matching the contract's precision). Then the script submits this on-chain:

```
Admin Script                                Blockchain
────────────                                ──────────
fantasy.setWeeklyPerformanceBatch(  ──────► DividendFantasy.setWeeklyPerformanceBatch(
  [0, 1, 2, ..., 49],                        _playerIdxs, _actualPoints)
  [189000000, 201000000, ...]                   │
)                                               │ require(msg.sender == owner)
                                                │
                                                │ For each player:
                                                │   weeklyProjection = projectedPoints / 17
                                                │   outperformance = (actual - projected) × 1e18 / projected
                                                │   weeklyPerformance[currentWeek][playerIdx] = {
                                                │     actualPoints,
                                                │     projectedPoints: weeklyProjection,
                                                │     outperformance
                                                │   }
```

**On-chain state changed:**
- `weeklyPerformance[week][playerIdx]` — set for every player with their actual points, projected points, and outperformance ratio.

---

### Transaction 3: Set Outperformer Eligibility

The script computes off-chain which players are in the top 30% of outperformers, then submits the eligible list:

```
Admin Script                                Blockchain
────────────                                ──────────
(Off-chain: sort players by                 DividendFantasy.setOutperformerEligible(
 outperformance, take top 30%)                _playerIdxs)
                                                │
fantasy.setOutperformerEligible(    ──────►      │ require(msg.sender == owner)
  [3, 12, 7, ...]  // eligible                  │ For each playerIdx:
)                                               │   outperformerEligible[currentWeek][playerIdx] = true
```

**Why this is done off-chain:** Sorting all 50 players on-chain would be gas-expensive. The admin script sorts them in JavaScript and only submits the result.

**On-chain state changed:**
- `outperformerEligible[week][playerIdx]` — set to `true` for the top 30% outperformers.

---

### Transaction 4: Distribute Dividends

```
Admin Script                                Blockchain
────────────                                ──────────
fantasy.distributeDividends()     ───────►  DividendFantasy.distributeDividends()
                                              │
                                              │ require(msg.sender == owner)
                                              │ require(!weeklyDividends[currentWeek].distributed)
                                              │ require(totalWeeklyFees > 0)
                                              │
                                              │ 1. Split the accumulated fee pool:
                                              │    totalPool = totalWeeklyFees
                                              │    basePool = totalPool × 20%
                                              │    outperformerPool = totalPool × 80%
                                              │
                                              │ 2. For each player (0..49):
                                              │    a. Snapshot totalShares at distribution:
                                              │       weekEndTotalShares[week][playerIdx]
                                              │         = players[playerIdx].totalShares
                                              │
                                              │    b. Sum positive outperformance for eligible players:
                                              │       if outperformance > 0 AND eligible:
                                              │         totalPositiveOutperf += outperformance
                                              │
                                              │ 3. Store dividend info:
                                              │    weeklyDividends[currentWeek] = {
                                              │      totalPool, basePool, outperformerPool,
                                              │      totalPositiveOutperf, distributed: true
                                              │    }
                                              │
                                              │ 4. Emit DividendsDistributed(week, totalPool,
                                              │      basePool, outperformerPool)
```

**Critical detail:** This does NOT transfer any tokens. It only **records the pool sizes and snapshots** the total shares per player. The actual D-Bucks stay in the contract. Users claim their individual share later.

**On-chain state changed:**
- `weeklyDividends[currentWeek]` — pool sizes and `distributed = true`
- `weekEndTotalShares[week][playerIdx]` — snapshotted for all 50 players

---

### Transaction 5: Advance to Next Week

```
Admin Script                                Blockchain
────────────                                ──────────
fantasy.advanceWeek()             ───────►  DividendFantasy.advanceWeek()
                                              │
                                              │ require(msg.sender == owner)
                                              │ require(weeklyDividends[currentWeek].distributed)
                                              │
                                              │ currentWeek++
                                              │ totalWeeklyFees = 0   (reset for new week)
                                              │ tradingPaused = false  (auto-unpause!)
                                              │
                                              │ Emit WeekAdvanced(currentWeek)
```

**On-chain state changed:**
- `currentWeek` — incremented (e.g., 1 → 2)
- `totalWeeklyFees` — reset to 0 (new week, fresh fee accumulator)
- `tradingPaused` — set to `false` (trading resumes automatically)

**Error handling:** If any of transactions 2–5 fail, the script catches the error and attempts to unpause trading so users aren't stuck unable to trade.

---

## 5. Claiming Dividends (User)

### When it happens

After the admin has distributed dividends for a week, users visit the `/dividends` page and click "Claim All".

### Frontend flow

The `DividendSummary` component first reads unclaimed dividends (a **read call**, no transaction):

```
Frontend                                    Blockchain
────────                                    ──────────
useUnclaimedDividends(address)    ───────►  DividendFantasy.getUnclaimedDividends(user)
                                              │ Loops through all weeks 1..currentWeek
                                              │ For each: if distributed AND not claimed:
                                              │   dividend = calculateDividend(week, user)
                                              │   total += dividend
                                  ◄───────  Returns: (totalAmount, weekCount)
```

The `calculateDividend` function computes the user's share for a given week:

```
For each player (0..49):
  userShares = weekEndHoldings[week][playerIdx][user]  (snapshotted balance)
  playerTotal = weekEndTotalShares[week][playerIdx]

  // BASE DIVIDEND (20% pool):
  totalUserShares += userShares
  totalAllShares += playerTotal

  // OUTPERFORMER DIVIDEND (80% pool):
  if player outperformed AND eligible AND playerTotal > 0:
    playerPool = outperformerPool × playerOutperformance / totalPositiveOutperf
    outperformerDividend += playerPool × userShares / playerTotal

baseDividend = basePool × totalUserShares / totalAllShares

TOTAL = baseDividend + outperformerDividend
```

### The claim transaction

When the user clicks "Claim All", the frontend sends an array of all week numbers:

```
Frontend                                    Blockchain
────────                                    ──────────
claimAll([1, 2, 3, ...])         ───────►  DividendFantasy.claimMultipleWeeks(_weeks)
                                              │
  User signs in wallet                        │ require(!killed)
                                              │
                                              │ For each week in _weeks:
                                              │   if distributed AND not already claimed:
                                              │     dividend = calculateDividend(week, user)
                                              │     if dividend > 0:
                                              │       hasClaimed[week][user] = true
                                              │       total += dividend
                                              │
                                              │ require(total > 0)
                                              │
                                              │ // Safety cap:
                                              │ if total > contract's D-Bucks balance:
                                              │   total = contract's balance
                                              │
                                              │ DBucks.transfer(user, total)
                                  ◄───────  Transaction receipt
```

**On-chain state changed:**
- `hasClaimed[week][user]` — set to `true` for each claimed week
- D-Bucks `balanceOf(user)` — **+total dividend**
- D-Bucks `balanceOf(DividendFantasy)` — **-total dividend**

**Note:** The contract automatically skips weeks that were already claimed or have no dividend, so sending all weeks is safe and gas-efficient (no need for the frontend to figure out exactly which weeks are unclaimed).

---

## 6. Summary of All On-Chain Transactions

### User-Initiated Transactions

| Action | Contract Function | When | Who Signs |
|---|---|---|---|
| Get test D-Bucks | `DBucks.faucet(amount)` | User wants funds to trade | User's wallet |
| Approve D-Bucks for trading | `DBucks.approve(DividendFantasy, amount)` | Before first buy (or if allowance depleted) | User's wallet |
| Buy player shares | `DividendFantasy.buy(playerIdx, shares, maxCost)` | User clicks Buy in trade modal | User's wallet |
| Sell player shares | `DividendFantasy.sell(playerIdx, shares, minRevenue)` | User clicks Sell in trade modal | User's wallet |
| Claim dividends | `DividendFantasy.claimMultipleWeeks(weeks[])` | User clicks Claim All on dividends page | User's wallet |

### Admin-Initiated Transactions (Weekly Cycle)

| Step | Contract Function | When | Who Signs |
|---|---|---|---|
| 1. Pause trading | `setTradingPaused(true)` | Start of weekly distribution | Contract owner |
| 2. Submit performance | `setWeeklyPerformanceBatch(indices[], points[])` | After fetching NBA stats | Contract owner |
| 3. Set outperformers | `setOutperformerEligible(indices[])` | After sorting outperformance off-chain | Contract owner |
| 4. Distribute dividends | `distributeDividends()` | After performance data is set | Contract owner |
| 5. Advance week | `advanceWeek()` | After distribution; unpauses trading | Contract owner |

### Events Emitted (Logged, Not Stored in Contract State)

| Event | Emitted By | Data |
|---|---|---|
| `Buy` | `buy()` | playerIndex, buyer, shares, cost, fee |
| `Sell` | `sell()` | playerIndex, seller, shares, revenue, fee |
| `DividendsDistributed` | `distributeDividends()` | week, totalPool, basePool, outperformerPool |
| `DividendClaimed` | `claimDividend()` | week, user, amount |
| `WeekAdvanced` | `advanceWeek()` | newWeek |
| `TradingPaused` | `setTradingPaused()` | paused (bool) |
| `FaucetMint` | `faucet()` | user, amount |
| `PlayerAdded` | `addPlayers()` | index, name, symbol |

### Token Flow Diagram

```
                    ┌─────────────┐
        deposit ──► │             │ ◄── faucet (testnet: free mint)
        USDC        │   DBucks    │
        withdraw ◄──│  Contract   │
        USDC        │             │
                    └──────┬──────┘
                           │ D-Bucks (ERC-20 transfers)
                           │
                    ┌──────▼──────┐
     buy: user ──► │             │ ──► protocolFeeRecipient (33% of fee)
     pays D-Bucks   │  Dividend   │
                    │  Fantasy    │
     sell: user ◄──│  Contract   │ ──► claimDividend: user receives D-Bucks
     gets D-Bucks   │             │
                    │ (holds the  │
                    │  dividend   │
                    │  pool)      │
                    └─────────────┘
```

