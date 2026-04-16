# Statix — Dividend Distribution & Portfolio Leaderboard: Full Test Report

**Date:** April 15, 2026  
**Tested by:** Kamyar  
**Network:** Base Sepolia (testnet)  
**Status:** All systems passed ✓

---

## Overview

This document covers everything we built, debugged, and tested in this session:

1. How the portfolio snapshot system works (Supabase + on-chain)
2. How the leaderboard is powered
3. Test 1 — triggering the first portfolio snapshot
4. Test 2 — running a full dividend distribution with fake performance data
5. Exact numbers and outcomes
6. What needs to be automated before launch
7. Instructions for teammates to reproduce the test

---

## 1. Architecture: How It All Fits Together

### The Core Formula

> **Portfolio NAV = V-Bucks cash balance + (shares × current AMM price) + unclaimed dividends**

This is the number shown on the leaderboard. It's calculated off-chain by reading three things from the blockchain:
- `DBucks.balanceOf(wallet)` → cash
- `StatixRouter.getPortfolio(wallet)` → shares + current value of each position
- `DividendHub.getUnclaimedDividends(wallet)` → any dividends distributed but not yet claimed

Until at least one dividend round has been distributed, the unclaimed amount is 0 for everyone — this is correct and fair, since nobody has any advantage over anyone else at that point.

---

### Supabase Tables Involved

#### `wallet_portfolio_snapshots`
Stores one row per wallet per UTC-hour. Written by the snapshot job.

| Column | Type | Description |
|--------|------|-------------|
| wallet_address | TEXT | Lowercase 0x address |
| snapshot_at | TIMESTAMPTZ | UTC hour bucket (e.g. 2026-04-15T22:00:00+00) |
| net_worth | NUMERIC | Total NAV (cash + positions + unclaimed) |
| cash_dbucks | NUMERIC | Raw V-Bucks balance |
| positions_value | NUMERIC | Current value of all share positions |

Primary key is `(wallet_address, snapshot_at)` — upserted each run, so re-running within the same hour overwrites the previous value rather than creating duplicates.

#### `transactions`
Every buy/sell is logged here by the indexer. The snapshot job reads **distinct wallet addresses** from this table to know which wallets to snapshot. No manual list needed — any wallet that has ever traded will automatically appear.

#### `dividend_claims`
Logs on-chain dividend claim events. Used by the leaderboard to show the "Dividends Earned" column.

#### `profiles`
Supabase auth table extended with:
- `wallet_address` — auto-saved from the Navbar when a user connects their wallet. Used to show a display name on the leaderboard instead of a raw wallet address.
- `is_approved` — MVP approval gate; admin flips this to true manually in Supabase dashboard.

---

### The `get_dividend_leaderboard()` SQL Function

A Postgres function called via Supabase RPC from the frontend. It:
1. Takes the **latest snapshot per wallet** from `wallet_portfolio_snapshots`
2. Joins to `profiles` to get a display name (falls back to `0xABCD…1234` format)
3. Joins to `dividend_claims` to sum total dividends earned
4. Returns top 50 wallets sorted by `net_worth` descending

```sql
SELECT * FROM get_dividend_leaderboard();
```

This is what the `/leaderboard` page calls on load.

---

### The Portfolio Snapshot Job

**File:** `backend/snapshot_portfolios.py` (entry point) → `backend/snapshot/job.py` (logic) → `backend/snapshot/chain_read.py` (on-chain reads)

**What it does on each run:**
1. Connects to Supabase
2. Fetches all distinct `wallet_address` values from the `transactions` table
3. For each wallet, calls `compute_wallet_nav(w3, wallet)` which reads the three on-chain values above
4. Upserts one row into `wallet_portfolio_snapshots` for the current UTC hour

**How to run it manually:**
```bash
cd /path/to/MVP/backend
./venv/bin/python snapshot_portfolios.py
```

**Output looks like:**
```
2026-04-15 18:11:28 INFO Snapshot bucket=2026-04-15T22:00:00+00:00 wallets=2
2026-04-15 18:11:29 INFO Done: {'bucket': '...', 'wallets_seen': 2, 'rows_upserted': 2, 'chain_read_errors': 0}
```

**How to automate it (hourly):**  
Salehi needs to add this as a Railway cron service. The cron expression is:

```
0 * * * *   cd /app && python snapshot_portfolios.py
```

This runs once per hour, on the hour. Until that's live, you can also trigger it via the admin API:

```bash
curl -X POST https://YOUR_BACKEND_URL/api/admin/run-snapshot \
  -H "Authorization: Bearer YOUR_ADMIN_KEY"
```

---

## 2. Test 1 — First Portfolio Snapshot

### Setup
Two wallets had traded on Base Sepolia (from the `transactions` table):

**Wallet A** — `0x0d36931accb58d54200972bcc77036a4d0111dff`
- Shai Gilgeous-Alexander: 5 shares (pool index 0)
- Nikola Jokic: 7 shares (pool index 6)
- Alperen Sengun: 11 shares (pool index 11)
- Jaylen Brown: 6 shares (pool index 25)

**Wallet B** — `0x3bfb7b71022012a40c4835c82f739d3e7ecb4db3`
- Shai Gilgeous-Alexander: 3 shares (pool index 0)
- Victor Wembanyama: 13 shares (pool index 3)
- Dylan Harper: 11 shares (pool index 5)

### Running the Snapshot
```bash
cd MVP/backend
./venv/bin/python snapshot_portfolios.py
```

### Result
```
wallets_seen: 2
rows_upserted: 2
chain_read_errors: 0
```

### Leaderboard After Test 1

| Rank | Wallet | Portfolio Value |
|------|--------|----------------|
| 1 | 0x3bfb…4db3 | $297.60 |
| 2 | 0x0d36…1dff | $296.81 |

Unclaimed dividends = $0 for both (no distribution had happened yet — this is correct). The leaderboard was populated and working.

---

## 3. Test 2 — Full Dividend Distribution

### The Dividend System Explained

Every trade on Statix charges a 2% fee. 67% of that fee goes to `DividendHub.sol`. At the end of each playoff round, the admin runs the distribution script which:

1. **Pauses trading**
2. **Submits per-game average fantasy points** for each player on-chain
3. **Marks the top-N players eligible** for the top performer bonus
4. **Snapshots every user's holdings** (the contract records how many shares each wallet held at the snapshot moment — this determines their claim)
5. **Distributes the pool** (splits into base + top performer pools)
6. **Advances the round counter**, unpauses trading

Users can then claim their dividends at any time from the Dividends page.

### Pool Split Formula

> **Total Hub Balance = Base Pool (20%) + Top Performer Pool (80%)**

- **Base Pool** — split pro-rata across ALL shareholders based on total shares held (across all players)
- **Top Performer Pool** — split among holders of top-N players, weighted by:
  - The player's avg FPts (how dominant the player was)
  - The user's share of that player's total pool

Example: if Sengun had 45 FPts and you hold 80% of all Sengun shares, you receive 80% of Sengun's slice of the top performer pool.

### Fake Performance Data Used

For this test we used made-up numbers to verify the math worked end to end. In production, the script fetches real stats from the NBA API via the backend.

| Player | Pool Index | Fake Avg FPts | Top Performer? |
|--------|-----------|---------------|----------------|
| Alperen Sengun | 11 | **45 FPts** | ✓ #1 |
| Jaylen Brown | 25 | **40 FPts** | ✓ #2 |
| Shai Gilgeous-Alexander | 0 | **35 FPts** | ✓ #3 |
| Pools 1,2,3,4,5,6,7,8,9,10 | 1–10 | 20 FPts each | ✗ fillers |

**Top-N = 3** (simulating Conference Finals round).

### Running the Test
```bash
cd MVP/blockchain
npm run test-distribute:sepolia
```

**Script location:** `blockchain/scripts/admin/test-distribute.js`

### Script Output
```
Deployer: 0x639Daa0d790Ff595A2203db01552A28b2339a3f4

Current on-chain round: 1
Active users: 0x0d36...1dff, 0x3bfb...4db3
Hub balance: 7.579839 V-Bucks

1. Pausing trading...
   Paused.
2. Submitting fake avg FPts...
   Submitted 13 player performances.
3. Marking top 3 eligible: pools 11, 25, 0...
   Top performers marked.
4. Snapshotting 2 users across 80 pools...
   Snapshotted 0x0d36...1dff
   Snapshotted 0x3bfb...4db3
5. Distributing dividends (topN=3)...
   Distributed!
6. Advancing round...
   Now on round 2
   Trading unpaused.

=== EXPECTED DIVIDENDS (round 1) ===
  0x0d36931accb58d54200972bcc77036a4d0111dff: 6.185689 V-Bucks
  0x3bfb7b71022012a40c4835c82f739d3e7ecb4db3: 1.394147 V-Bucks
```

### Why Did Wallet A Get So Much More?

**Total Hub balance:** 7.579839 V-Bucks  
- Base pool (20%): ~1.516 V-Bucks  
- Top performer pool (80%): ~6.064 V-Bucks

**Wallet A (0x0d36) held:**
- 11 shares of Sengun (#1, 45 FPts) → large slice of the #1 player's top performer allocation
- 6 shares of Jaylen Brown (#2, 40 FPts) → additional slice of the #2 player's allocation
- Also participates in the base pool

**Wallet B (0x3bfb) held:**
- 3 shares of Shai (#3, 35 FPts) → small slice of #3's allocation
- Wembanyama and Dylan Harper were NOT in the top 3, so no top performer bonus for those
- Also participates in the base pool (but had fewer total shares than Wallet A)

This is the intended game design: **holding top performers at the end of a round pays off significantly more** than holding average players.

### Checking Dividends on the Frontend

After the distribution ran, Wallet B (`0x3bfb`) showed on the Dividends page:
- **Unclaimed dividends: $1.39**
- **Current round: Round 2**
- **1 round pending**
- "Claim all (1 round)" button visible and functional

Claiming worked — the button triggered an on-chain `claimDividend(1)` call and the balance updated correctly.

### Leaderboard After Re-Running the Snapshot

After running `./venv/bin/python snapshot_portfolios.py` again, the snapshot now included unclaimed dividends in the NAV formula. The leaderboard updated:

| Rank | Wallet | Portfolio Value | Change |
|------|--------|----------------|--------|
| **1** | **0x0d36…1dff** | **$303.00** | +$6.19 (was #2 at $296.81) |
| **2** | 0x3bfb…4db3 | $298.99 | +$1.39 (was #1 at $297.60) |

**The rankings flipped.** Wallet A moved from #2 to #1 because it had ~$6.19 in unclaimed dividends (Sengun + JBrown positions), enough to overtake Wallet B's lead. This confirms the leaderboard correctly incorporates unclaimed dividends into portfolio value.

The dividend pool counter on the leaderboard page correctly updated to $0.00 after claims were processed.

---

## 4. What Needs to Be Done Before Launch

### Salehi's Tasks
- [ ] **Schedule the snapshot job as a Railway cron** (every hour: `0 * * * *`). Without this, the leaderboard only updates when someone manually runs the script.
- [ ] **Schedule the indexer** as a persistent Railway service (it logs trades to the `transactions` table, which is the source of wallets for the snapshot job).
- [ ] **Deploy backend to Railway** and hit `GET /api/admin/refresh-players` once to warm the NBA stats cache.

### Admin Workflow Each Playoff Round
When a real playoff round ends, run in order:

```bash
# From blockchain/
TOP_N=10 ROUND_START=2025-04-19 ROUND_END=2025-04-28 \
  npx hardhat run scripts/distribute-dividends.js --network base-sepolia
```

This hits the real backend for actual NBA stats. Make sure `blockchain/active-users.json` is populated with all wallet addresses that should receive snapshots. (Eventually Salehi will pull this list from the `transactions` table automatically.)

After distribution, optionally run an immediate snapshot so the leaderboard reflects unclaimed dividends right away:
```bash
cd backend && ./venv/bin/python snapshot_portfolios.py
```

### Weekly Faucet Top-Up
Each week, run this to give users another 100 V-Bucks of claimable faucet:
```bash
cd blockchain && npm run raise-faucet:sepolia
```

---

## 5. How to Reproduce This Test From Scratch

If you want to run the exact same test yourself:

### Prerequisites
- `blockchain/.env` with `PRIVATE_KEY` (deployer key)
- `backend/.env` with `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `RPC_URL`
- Two wallets that have traded (so they appear in the `transactions` table)

### Step 1: Confirm wallets are in the transactions table
```bash
# Via Supabase SQL Editor:
SELECT DISTINCT wallet_address FROM transactions;
```

### Step 2: Run the portfolio snapshot
```bash
cd MVP/backend
./venv/bin/python snapshot_portfolios.py
# Expected: rows_upserted equals number of trading wallets
```

### Step 3: Check the leaderboard
Open `localhost:3000/leaderboard` — you should see your wallets ranked by portfolio value. Dividends Earned will be $0.00 since no distribution has happened yet.

### Step 4: Run the test distribution
```bash
cd MVP/blockchain
# Edit blockchain/active-users.json to list your wallet addresses:
# ["0xYOUR_WALLET_1", "0xYOUR_WALLET_2"]

npm run test-distribute:sepolia
```

The script will print expected dividends per wallet at the end. Round advances from 1 → 2.

### Step 5: Check the Dividends page
Log in as each wallet. You should see:
- Unclaimed amount matching the script output
- "Claim all" button — click it to claim on-chain
- After claiming, the amount clears and the hub balance drops to $0

### Step 6: Re-run the snapshot
```bash
cd MVP/backend
./venv/bin/python snapshot_portfolios.py
```

### Step 7: Check the leaderboard again
Portfolio values should now be higher (by the unclaimed amount each wallet had). Rankings may change depending on who held more top-performer shares.

---

## 6. Known Bugs Fixed in This Session

| Bug | Root Cause | Fix |
|-----|-----------|-----|
| `snapshot_portfolios.py` failed with `float() argument must be a string or a real number, not 'list'` | `DividendHub.getUnclaimedDividends()` returns a tuple `(total, roundCount)` — code was trying to `float()` the whole tuple | Unpacked as `total, _round_count = hub.functions.getUnclaimedDividends(wallet).call()` |
| `get_dividend_leaderboard()` SQL function crashed with "column reference wallet_address is ambiguous" | PL/pgSQL treats column names as potential variable references — `wallet_address` appeared in both the inner subquery and the function body, creating ambiguity | Rewrote the function as `LANGUAGE sql` (not PL/pgSQL) which has no variable scope, and aliased the inner column to `w` |

---

## 7. Summary

Everything in this session worked end to end:

- Portfolio snapshot reads correct NAV from chain (cash + positions + unclaimed dividends)
- Leaderboard populates from snapshots, ranks correctly, updates when snapshot re-runs
- Dividend distribution processes in correct order (pause → submit perf → mark eligible → snapshot holdings → distribute → advance → unpause)
- Dividends page shows unclaimed amount, "Claim all" works, hub balance clears
- Rankings correctly reflect unclaimed dividends once snapshot re-runs — holding top performers at round end is meaningfully rewarded
- The only missing piece is automating the hourly snapshot as a Railway cron job
