# Statix V2 MVP — Handoff Document

**Branch:** `StatixV2`  
**Date:** April 2026  
**Status:** Implementation complete — needs fresh deploy + testing

---

## What Statix Is

NBA player trading platform on Base Sepolia (Ethereum L2). Users receive 1,000 V-Bucks (testnet USDC), buy/sell player shares via an AMM, and earn dividends funded by trading fees. The contest runs through the NBA playoffs; final portfolio value determines prize winners ($250 / $100 / $50).

---

## V2 Changes Summary (vs V1)

| Area | V1 | V2 |
|------|----|----|
| Dividend cycles | Weekly (7-day) | Playoff round-based |
| Top performer count | Fixed top 10 | Variable: 10 / 5 / 3 / 2 per round |
| Fan pool weighting | Absolute FPts total | Per-game avg FPts |
| Tracking mechanism | Week-end holdings snapshot | Holdings at distribution time |
| Trading fee | 1.5% | 2% |
| Starting balance | 100,000 V-Bucks | 1,000 V-Bucks |
| Fantasy scoring | PTS×1, REB×1.2, AST×1.5, STL×3, BLK×3, TOV×-1 | PTS×1, REB×1.2, AST×1.5, STL×2, BLK×2, 3PM×0.5, TOV×-1.5, DD+2, TD+5 |
| Player roster | 50 mixed | 51 playoff players from 20 teams |
| Leaderboard | Dividend earnings ranked | Portfolio value ranked |
| Rules page | None | Full rules/how-it-works page at /rules |
| Trading freeze UI | None | Banner when tradingPaused = true |

---

## Architecture

### Smart Contracts (`blockchain/contracts/`)

```
MockUSDC.sol       — test USDC (6 decimals)
DBucks.sol         — V-Bucks payment token (USDC-backed, faucet mode for testnet)
PoolFactory.sol    — deploys and registers PlayerPool contracts
PlayerPool.sol     — per-player AMM pool (constant product x*y=k)
StatixRouter.sol   — single entry point for buy/sell, fees, pause, blacklist
DividendHub.sol    — round-based dividend distribution and claims
IPlayerPool.sol    — interface used by Router and DividendHub
```

### DividendHub V2 Flow

```
Admin steps each round:
1. setRoundPerformanceBatch(poolIdxs[], avgFptsScaled[])   -- per-game avg FPts x 1e6
2. setTopPerformerEligible(poolIdxs[])                     -- top N pools
3. snapshotUserHoldings(user, poolIdxs[])                  -- for every active user
4. distributeDividends(topN)                               -- locks fees, records pool totals
5. [users claim] claimDividend(round) or claimMultipleRounds(rounds[])
6. advanceRound()                                          -- increments currentRound

Round to topN mapping:
  Round 1 (16 teams): topN = 10
  Round 2 (8 teams):  topN = 5
  Conf Finals (4):    topN = 3
  NBA Finals (2):     topN = 2
```

### Dividend Math

```
Fee split: 2% fee -> 67% to DividendHub, 33% to protocol

Dividend pool split:
  20% base pool  -> all holders pro-rata (user_total_shares / all_shares)
  80% top pool   -> top-N holders, weighted by avg FPts and share count

For top-N player i:
  player_pool_share[i] = top_pool x (avgFpts[i] / sum_of_top_N_avgFpts)
  user_div_from_i = player_pool_share[i] x (user_holdings[i] / total_holdings[i])

Total user dividend = base_dividend + sum(user_div_from_i)
```

### Fantasy Scoring Formula

```
FPts = PTS x 1.0 + REB x 1.2 + AST x 1.5 + STL x 2.0 + BLK x 2.0
     + 3PM x 0.5 + TOV x -1.5
     + DD bonus (+2 if 10+ in 2 stat categories)
     + TD bonus (+5 if 10+ in 3 stat categories)

DD/TD categories: PTS, REB, AST, STL, BLK
Min games played: 1 (players with 0 GP score 0 avg FPts and are ineligible)
```

---

## Player Roster (51 players, 20 teams)

### Western Conference (10 teams, 23 players)

| Team | Player | NBA ID |
|------|--------|--------|
| OKC | Shai Gilgeous-Alexander | 1628983 |
| OKC | Jalen Williams | 1631114 |
| OKC | Chet Holmgren | 1631096 |
| SAS | Victor Wembanyama | 1641705 |
| SAS | De'Aaron Fox | 1628368 |
| SAS | Dylan Harper | 1642844 |
| DEN | Nikola Jokic | 203999 |
| DEN | Jamal Murray | 1627750 |
| LAL | Luka Doncic | 1629029 |
| LAL | LeBron James | 2544 |
| LAL | Austin Reaves | 1630559 |
| HOU | Alperen Sengun | 1630578 |
| HOU | Amen Thompson | 1641731 |
| HOU | Kevin Durant | 201142 |
| MIN | Anthony Edwards | 1630162 |
| MIN | Julius Randle | 203944 |
| PHX | Devin Booker | 1626164 |
| PHX | Jalen Green | 1630224 |
| LAC | Kawhi Leonard | 202695 |
| LAC | Ivica Zubac | 1627826 |
| POR | Deni Avdija | 1629656 |
| GSW | Stephen Curry | 201939 |
| GSW | Kristaps Porzingis | 204001 |

### Eastern Conference (10 teams, 28 players)

| Team | Player | NBA ID |
|------|--------|--------|
| DET | Cade Cunningham | 1630595 |
| DET | Jalen Duren | 1631107 |
| BOS | Jaylen Brown | 1627759 |
| BOS | Jayson Tatum | 1628369 |
| BOS | Derrick White | 1628401 |
| BOS | Nikola Vucevic | 202696 |
| NYK | Jalen Brunson | 1628973 |
| NYK | Karl-Anthony Towns | 1626157 |
| NYK | Mikal Bridges | 1628969 |
| CLE | Donovan Mitchell | 1628378 |
| CLE | Evan Mobley | 1630596 |
| CLE | James Harden | 201935 |
| CLE | Jarrett Allen | 1628386 |
| ATL | Jalen Johnson | 1630552 |
| ATL | Nickeil Alexander-Walker | 1629638 |
| TOR | Scottie Barnes | 1630567 |
| TOR | RJ Barrett | 1629628 |
| TOR | Brandon Ingram | 1627742 |
| ORL | Franz Wagner | 1630532 |
| ORL | Paolo Banchero | 1631094 |
| ORL | Desmond Bane | 1630217 |
| CHA | LaMelo Ball | 1630163 |
| CHA | Brandon Miller | 1641715 |
| CHA | Kon Knueppel | 1642851 |
| PHI | Tyrese Maxey | 1630178 |
| PHI | Joel Embiid | 203954 |
| MIA | Bam Adebayo | 1628389 |
| MIA | Tyler Herro | 1629639 |

---

## Files Changed in V2

### Smart Contracts
| File | What changed |
|------|-------------|
| `blockchain/contracts/DividendHub.sol` | Full rewrite: round-based, holdings snapshots (not share-seconds), variable topN, claimMultipleRounds, snapshotUserHoldings reads holdings() directly from PlayerPool |
| `blockchain/contracts/PlayerPool.sol` | Removed week-snapshot system (weekEndHoldings, lastSnapshotWeek, _snapshotHoldings, IDividendHubWeek interface); buy/sell no longer call hub |
| `blockchain/contracts/IPlayerPool.sol` | Removed snapshotTotalShares, snapshotUserHoldings, weekEndHoldings, lastSnapshotWeek |
| `blockchain/contracts/StatixRouter.sol` | feeBps = 200 (2%) |
| `blockchain/contracts/test/PlayerPoolMocks.sol` | Removed currentWeek, setCurrentWeek, old snapshot forwarding methods; feeBps default updated to 200 |

### Scripts
| File | What changed |
|------|-------------|
| `blockchain/scripts/distribute-dividends.js` | Full rewrite: round-based, TOP_N env var, ROUND_START/ROUND_END, calls update-round-stats backend, snapshots user holdings, calls distributeDividends(topN), advanceRound() |
| `blockchain/scripts/players.json` | 51 V2 playoff players replacing old 50-player list |

### Backend
| File | What changed |
|------|-------------|
| `backend/nba_stats.py` | New scoring: STL=2, BLK=2, FG3M=0.5, TOV=-1.5, DD+2/TD+5; per-game FPts computed per row then averaged; FG3M added to avg_stats |
| `backend/routes/admin.py` | Added POST /update-round-stats endpoint returning avg_fpts_scaled and games_played per player |
| `backend/routes/dividends.py` | fee_rate 0.015 -> 0.02 |
| `backend/routes/trading.py` | fee_rate 0.015 -> 0.02 |

### Frontend
| File | What changed |
|------|-------------|
| `frontend/lib/faucet-config.json` | faucetLimitHuman 100000 -> 1000, faucetUiMintPerClickHuman -> 1000 |
| `frontend/lib/abis.ts` | Regenerated from compiled artifacts; has currentRound, claimMultipleRounds, snapshotUserHoldings; CONTRACTS block at bottom |
| `frontend/hooks/useContracts.ts` | useCurrentWeek reads currentRound; claimMultipleRounds (was claimMultipleWeeks); added useTradingPaused |
| `frontend/components/DividendSummary.tsx` | week -> round language throughout |
| `frontend/components/Portfolio.tsx` | D-Bucks -> V-Bucks in UI text |
| `frontend/components/TradeModal.tsx` | Fee (1.5%) -> Fee (2%), D-Bucks -> V-Bucks |
| `frontend/components/Navbar.tsx` | Added Rules link (BookOpen icon) |
| `frontend/components/NavbarWrapper.tsx` | Added TradingFreezeBanner below navbar |
| `frontend/components/TradingFreezeBanner.tsx` | New: reads tradingPaused from StatixRouter, shows amber banner |
| `frontend/app/dividends/page.tsx` | Weekly distributions -> Playoff distributions |
| `frontend/app/leaderboard/page.tsx` | Rewritten: portfolio value ranking, prize tiers ($250/$100/$50), shows portfolio_value column |
| `frontend/app/rules/page.tsx` | New page: overview, trading, fantasy scoring table, dividend mechanics, prizes, eligibility |

---

## What Still Needs Attention

### REQUIRED Before Deploy

**1. Fresh Contract Deploy**
Current deployments.json addresses are from a PREVIOUS deploy and do NOT have V2 contract code.
```bash
cd blockchain
npm run deploy:sepolia
```
Then copy new addresses into:
- `frontend/deployments.json`
- `frontend/public/deployments.json`
- Update CONTRACTS block at bottom of `frontend/lib/abis.ts`

**3. DBucks Faucet On-Chain**
After deploy, the on-chain faucetLimit in DBucks must be 1,000 V-Bucks = `1_000_000_000` (scaled 6 decimals).
The deploy script reads from `frontend/lib/faucet-config.json` automatically. Verify after deploy:
```bash
cast call $DBUCKS_ADDR "faucetLimit()" --rpc-url base-sepolia
# Should return: 1000000000
```

**4. Player Cache Refresh**
`backend/player_cache.json` has stale 2024-25 season data. Force refresh:
```bash
curl -X GET https://your-backend/api/admin/refresh-players \
  -H "Authorization: Bearer $ADMIN_KEY"
```

### IMPORTANT Before First Distribution

**5. active-users.json**
The distribution script reads `blockchain/active-users.json` to know which wallets to snapshot.
Create this file before running distributions:
```json
["0xWallet1", "0xWallet2", "0xWallet3"]
```
Or set `SNAPSHOT_USERS=0xWallet1,0xWallet2` env var. Without this, no user holdings are snapshotted and everyone gets zero dividend.

**6. Supabase round_performance Table**
The new `update-round-stats` endpoint upserts into `supabase.table("round_performance")`.
Create this table:
```sql
create table round_performance (
  id bigserial primary key,
  round int not null,
  player_index int not null,
  games_played int,
  avg_fpts float,
  unique(round, player_index)
);
```

### NICE TO HAVE

**7. Leaderboard portfolio_value field**
The rewritten leaderboard page expects `leader.portfolio_value` from the backend.
The current Supabase RPC `get_dividend_leaderboard` likely only returns dividend totals.
The page falls back to `total_earned` if `portfolio_value` is missing, so it still works.
For the full spec, update the RPC to compute: V-Bucks balance + shares x price + unclaimed dividends.

**8. Test Suite**
`blockchain/test/DividendHub.test.js` and `PlayerPool.test.js` reference removed functions
(currentWeek, weekEndHoldings, snapshotTotalShares, etc.) and will fail.
Rewrite tests for the new round-based API before running the test suite.

**9. math_explained.md**
Update the fantasy scoring formula section to reflect V2 scoring (STL=2, BLK=2, 3PM=0.5, TOV=-1.5, DD/TD bonuses).

**10. ADMIN_GUIDE.md**
Update blockchain/ADMIN_GUIDE.md if it exists with the new distribution playbook.

---

## Admin Distribution Playbook

```bash
cd blockchain

# Round 1 (top 10):
TOP_N=10 \
ROUND_START=2025-04-19 \
ROUND_END=2025-04-28 \
BACKEND_URL=https://your-backend.com \
ADMIN_KEY=your-secret \
npx hardhat run scripts/distribute-dividends.js --network base-sepolia

# Round 2 (top 5):
TOP_N=5 ROUND_START=... ROUND_END=... ...same...

# Conference Finals (top 3):
TOP_N=3 ...

# NBA Finals (top 2):
TOP_N=2 ...
```

Script auto-flow:
1. Fetches per-game avg FPts from `/api/admin/update-round-stats` (aborts if unavailable)
2. Pauses trading via StatixRouter
3. Submits avg FPts on-chain via `setRoundPerformanceBatch`
4. Marks top-N eligible via `setTopPerformerEligible`
5. Snapshots every user in `active-users.json` via `snapshotUserHoldings`
6. Checks Hub balance (skips + unpauses if no fees)
7. Calls `distributeDividends(topN)`
8. Calls `advanceRound()`
9. Unpauses trading (or unpauses on error)

---

## Deploy Checklist

```
[ ] Run: cd blockchain && npm run deploy:sepolia
[ ] Copy new addresses to frontend/deployments.json
[ ] Copy same to frontend/public/deployments.json
[ ] Update CONTRACTS block in frontend/lib/abis.ts
[ ] Verify: cast call $DBUCKS "faucetLimit()" == 1000000000
[ ] Refresh player cache via admin API
[ ] Create blockchain/active-users.json with approved user wallets
[ ] Create round_performance table in Supabase
[ ] Smoke test: buy shares -> check Hub balance -> distribute -> claim dividend
[ ] Check TradingFreezeBanner appears when setTradingPaused(true) is called
[ ] Check /rules page loads and reads correctly
[ ] Check /leaderboard shows prize tiers
[ ] Check /dividends shows Round N (not Week N)
```

---

## Environment Variables

```bash
# Backend (.env)
ADMIN_KEY=<secret>
SUPABASE_URL=<url>
SUPABASE_KEY=<anon-key>

# Blockchain scripts (.env in blockchain/)
PRIVATE_KEY=<deployer-wallet-private-key>
ADMIN_KEY=<same secret as backend>
BACKEND_URL=https://your-backend.com

# Per-distribution run (env vars, not stored):
TOP_N=10           # 10 / 5 / 3 / 2
ROUND_START=YYYY-MM-DD
ROUND_END=YYYY-MM-DD
SNAPSHOT_USERS=0xABC,0xDEF   # Optional override if no active-users.json
```

---

## Current Contract Addresses (STALE — redeploy before use)

```
StatixRouter:  0xEcf00aefb5fFC1DC8B415098b1538fF92d70b876
DividendHub:   0x8308293da57F8D17e947ebaE55546Ab1E49860C5
DBucks:        0x0054198B8E85423b15E08De2D2f48C1Af51297cD
PoolFactory:   0x9aa3E38674519521B811b73E3a2f85eAed1a77D8
Network:       Base Sepolia (chainId 84532)
```

These addresses point to the OLD V1 contracts. Running distribute or any write operation against these will fail or produce wrong results. REDEPLOY FIRST.

---

## V2 Spec Quick Reference

```
Fantasy:  FPts = PTS*1 + REB*1.2 + AST*1.5 + STL*2 + BLK*2 + 3PM*0.5 + TOV*-1.5 + DD(+2) + TD(+5)
Fee:      2% per trade -> 67% DividendHub, 33% protocol
Split:    20% base (all holders) + 80% top-N (avg FPts weighted)
Start:    1,000 V-Bucks per approved user
Prizes:   1st $250 / 2nd $100 / 3rd $50 (final portfolio value)
Min GP:   1 game in the round to qualify for top-N
Players:  51 across 20 playoff teams
```
