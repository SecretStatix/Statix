# Statix — Salehi Testing Guide

> **Network**: Base Sepolia (testnet — no real money involved)
> All tokens are fake. You can't break anything.

---

## Step 1 — Log in

Go to the Statix frontend URL. Sign up with your email. Once approved, log in.

Privy will create an **embedded wallet** for you automatically — no MetaMask or browser extension needed.

---

## Step 2 — Get test V-Bucks

V-Bucks are the fake payment token used on testnet (think fake USDC).

1. Go to any player page
2. Click **"Get V-Bucks"** (faucet button)
3. This gives you **300 V-Bucks** — request more anytime, it's unlimited

---

## Step 3 — Buy shares in some players

1. Go to the **Players** page
2. Pick 3–5 players and buy shares in each
3. **Your first buy ever will require 2 wallet confirmations** — one to unlock V-Bucks, one to buy. This is normal and only happens once.
4. After that, every buy is just 1 confirmation

For a good test, try to spread across different players so dividends are interesting. For example:
- Victor Wembanyama
- Dylan Harper
- Alperen Sengun

---

## Step 4 — Find your wallet address

You need your wallet address to add yourself to the distribution list.

1. Open the browser console on the Statix app (`Cmd+Option+J` on Mac, `F12` on Windows)
2. Or check the **Leaderboard** page — after buying shares, your address will appear there
3. It starts with `0x` and is 42 characters long

---

## Step 5 — Add yourself to active-users.json

This file tells the distribution script which wallets to snapshot.

Open `blockchain/active-users.json` — it looks like this:

```json
[
  "0x0d36931accb58d54200972bcc77036a4d0111dff",
  "0x3bfb7b71022012a40c4835c82f739d3e7ecb4db3"
]
```

Add your wallet address (in **lowercase**) to the array:

```json
[
  "0x0d36931accb58d54200972bcc77036a4d0111dff",
  "0x3bfb7b71022012a40c4835c82f739d3e7ecb4db3",
  "0xyourwalletaddresshere"
]
```

---

## Step 6 — Run the test distribution

This simulates the end-of-week dividend payout with fake fantasy point scores.

### 6a — Edit the performance data

Open `blockchain/scripts/admin/test-distribute.js` and find the `PERF` block near the top. This is where you decide which players "performed well" this fake week:

```javascript
const PERF = [
  { index: 3,  avgFpts: 48n * SCALE },  // Victor Wembanyama  — #1
  { index: 5,  avgFpts: 41n * SCALE },  // Dylan Harper       — #2
  { index: 11, avgFpts: 36n * SCALE },  // Alperen Sengun     — #3
  { index: 6,  avgFpts: 28n * SCALE },  // Nikola Jokic       — #4
  { index: 21, avgFpts: 22n * SCALE },  // Stephen Curry      — #5
];

const TOP_N = 5;
const TOP_ELIGIBLE = [3, 5, 11, 6, 21];
```

The `index` number matches each player's index in `deployments.json` — you can look them up there by name.

**Example scenario**: You bought Wembanyama, Dylan Harper, and Sengun. You set those three as the top performers. You should expect to receive dividends from both the base pool (you hold shares) and the top performer pool (your players ranked top-N).

### 6b — Run the script

```bash
cd blockchain
npm run test-distribute:sepolia
```

---

## Step 7 — What to expect

### Script output

The terminal should print something like this:

```
Deployer: 0x639D...
Current on-chain round: 1
Active users: 0xabc..., 0xdef..., 0xyour...
Hub balance: 15.000000 V-Bucks

1. Pausing trading...      ✓
2. Submitting fake avg FPts...   ✓ (5 players)
3. Marking top 5 eligible...     ✓
4. Snapshotting 3 users across 80 pools...
   Snapshotted 0xabc...
   Snapshotted 0xdef...
   Snapshotted 0xyour...
5. Distributing dividends (topN=5)...   ✓
6. Advancing round...   Now on round 2
   Trading unpaused.

=== EXPECTED DIVIDENDS (round 1) ===
  0xabc...:   4.512310 V-Bucks
  0xdef...:   7.231045 V-Bucks
  0xyour...:  3.256645 V-Bucks

Users can now claim via hub.claimDividend(1)
```

### What to verify in the frontend

1. **Dividends tab** — should show your unclaimed V-Bucks amount (matching the number printed above)
2. **Click "Claim all"** — triggers an on-chain transaction
3. After claiming, your **claim history** should appear at the bottom of the Dividends page showing the round, amount, and date
4. Run the portfolio snapshot (see below) — then check the **Leaderboard** to see your portfolio value updated

### Updating the leaderboard

The leaderboard is populated by a snapshot job that reads on-chain NAV for all wallets. You need to run it manually after trading or claiming dividends:

```bash
cd backend
./venv/bin/python snapshot_portfolios.py
```

Run this:
- After buying shares (so you appear on the leaderboard)
- After claiming dividends (so your updated portfolio value shows)

Once it runs, refresh the Leaderboard page and your entry should appear with the correct portfolio value.

### What good looks like

| Check | Expected |
|-------|----------|
| Script runs without error | Yes |
| `EXPECTED DIVIDENDS` shows non-zero for your wallet | Yes |
| Dividends tab shows unclaimed amount | Yes |
| Claim transaction goes through | Yes |
| Claim history shows the round | Yes |
| Leaderboard portfolio value increases | Yes |

### What could go wrong

| Symptom | Likely cause |
|---------|--------------|
| `Hub has no balance` error | Nobody traded yet — buy shares first (Step 3) |
| Your wallet shows 0 dividends | Your address isn't in `active-users.json`, or you weren't snapshotted |
| Buy button does nothing | Close and reopen the trade modal, try again |
| Transaction reverts | Make sure you're on Base Sepolia (chain ID 84532) |
| Claim shows 0 but script said otherwise | Indexer hasn't caught up — wait 30 seconds and refresh |

---

## How dividends work (quick reference)

Every round, the dividend pool (funded by 2% trading fees) is split:

- **20% base pool** — shared by all shareholders, proportional to how many shares you hold across all players
- **80% top performer pool** — split among holders of the top-N ranked players, weighted by `(player's avg FPts) × (your share fraction of that pool)`

So if you hold Wembanyama (ranked #1) and Wemby accounts for a big chunk of his pool, you earn a lot from the top performer slice. Holding shares in lower-ranked or unranked players still earns you base pool dividends.

---

## Redeployment (if you ever need a fresh start)

If the contracts are stale or you want a completely clean test environment:

### 1 — Deploy new contracts

```bash
cd blockchain
npm run deploy:sepolia
```

This rewrites `blockchain/deployments.json` with new addresses.

### 2 — Update frontend contract addresses

Open `frontend/lib/abis.ts`, scroll to the very bottom, and update `CONTRACTS` with the new addresses:

```typescript
export const CONTRACTS = {
  StatixRouter: "0xNEW_ADDRESS",
  DividendHub:  "0xNEW_ADDRESS",
  DBucks:       "0xNEW_ADDRESS",
  PoolFactory:  "0xNEW_ADDRESS",
};
```

> This is the most commonly missed step. Old addresses = silent transaction failures.

### 3 — Reset the indexer state

```bash
echo '{}' > backend/indexer_state.json
```

### 4 — Clear Supabase tables

In Supabase → SQL Editor, run:

```sql
TRUNCATE TABLE public.transactions RESTART IDENTITY CASCADE;
TRUNCATE TABLE public.pool_price_snapshots RESTART IDENTITY CASCADE;
TRUNCATE TABLE public.dividend_claims RESTART IDENTITY CASCADE;
TRUNCATE TABLE public.round_distributions RESTART IDENTITY CASCADE;
```

Do **not** clear `profiles` or `auth.users` — those are login accounts.

### 5 — Restart the backend

```bash
cd backend
uvicorn main:app --reload --port 8000
```

Then start from Step 1 of this guide.
