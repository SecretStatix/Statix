# Statix

**Trade NBA players like stocks.** Statix is a market where users buy and sell shares of NBA players, prices move with supply and demand, and holders earn dividends based on how those players actually perform.

🌐 **Live:** [playstatix.ca](https://www.playstatix.ca) · Closed beta on Base Sepolia (play money)

---

## The MVP

We launched the closed beta before the start of the **2026 NBA playoffs** and ran it as a playoff-long contest.

- **100+ beta testers** traded with play money (V-Bucks) on real smart contracts
- **$37.8K in on-chain trading volume** with no failed transactions
- **80 tradeable players** across every playoff team
- Dividends paid out every playoff round, funded entirely by trading fees
- Cash prizes for the top 3 portfolios, plus weekly raffles and performance bonuses

The beta showed real price discovery. Players' share prices climbed through strong series and dropped sharply the moment their team was eliminated. Users repriced on their own, without being told to.

---

## How It Works

1. **Pick a player.** Every player has their own market.
2. **Buy and sell shares.** Prices are set by an automated market maker (AMM), so they move as users trade.
3. **Earn dividends.** Each trade pays a 2% fee. Two-thirds of it goes into a dividend pool that is paid out to shareholders each playoff round:
   - **20%** goes to all holders, split by how many shares they hold
   - **80%** goes to holders of the round's top-performing players, weighted by fantasy points
4. **Climb the leaderboard.** Portfolios are ranked by total value.

---

## Architecture

```
            ┌──────────────────────────┐
            │  Frontend (Next.js 14)   │  Vercel
            │  Privy embedded wallets  │
            └────────────┬─────────────┘
                         │ REST
            ┌────────────▼─────────────┐
            │   Backend API (FastAPI)  │  Railway
            └────────────┬─────────────┘
                         │
  ┌──────────────────────┼───────────────────────┐
  │                      │                       │
┌─▼──────────────┐ ┌─────▼────────────┐ ┌────────▼─────────┐
│ Chain indexer  │ │ Portfolio        │ │ Trading bots     │
│ (Railway       │ │ snapshots        │ │ (30 bots,        │
│  worker)       │ │ (hourly cron)    │ │  scheduled)      │
└─┬──────────────┘ └─────┬────────────┘ └────────┬─────────┘
  │                      │                       │
  │              ┌───────▼────────┐              │
  │              │    Supabase    │              │
  │              │  (PostgreSQL)  │              │
  │              └────────────────┘              │
  │                                              │
┌─▼──────────────────────────────────────────────▼─┐
│     Smart contracts on Base (Ethereum L2)        │
└──────────────────────────────────────────────────┘
```

### Smart contracts (`blockchain/`)

Six Solidity contracts, deployed with Hardhat:

| Contract | Role |
|---|---|
| `PlayerPool` | Per-player AMM pool (constant product, x·y = k) |
| `PoolFactory` | Deploys and registers the 80 player pools |
| `StatixRouter` | Single entry point for buy/sell, fees, and emergency controls |
| `DividendHub` | Round-based dividend distribution and claims |
| `DBucks` | Payment token (V-Bucks) with a testnet faucet |
| `MockUSDC` | Test USDC |

### Backend (`backend/`)

- **FastAPI** with route groups for players, trading, dividends, and admin
- **Chain indexer** reads every buy and sell from the contracts and writes them to Supabase
- **NBA data pipeline** pulls real game stats and computes fantasy points for every player
- **Hourly portfolio snapshots** power the leaderboard and portfolio charts

### Frontend (`frontend/`)

- **Next.js 14**, TypeScript, Tailwind CSS
- **Privy embedded wallets**, so users never need MetaMask
- **Supabase auth** with an approval gate for the closed beta
- Live prices, price charts, portfolio tracking, leaderboard, and an admin dashboard

### Analytics and simulations

- `simulations/`: market simulation with bot traders, used to tune pricing and fees
- `analytics/`: comparison of fantasy-scoring formulas across past NBA seasons

---

## Tech Stack

**Frontend:** Next.js 14, React, TypeScript, Tailwind CSS, Wagmi, Privy
**Backend:** Python, FastAPI, Supabase (PostgreSQL)
**Blockchain:** Solidity, Hardhat, Base (Ethereum L2)
**Infrastructure:** Vercel, Railway, GitHub

---

## Repository Structure

```
analytics/     Fantasy-scoring formula analysis
backend/       FastAPI server, chain indexer, NBA data pipeline, snapshots
blockchain/    Solidity contracts, deploy scripts, and tests
frontend/      Next.js app
scripts/       Local dev-stack launcher
simulations/   Market simulation with bot traders
```

---

## Running Locally

```bash
# Backend
cd backend
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload

# Frontend
cd frontend
npm install
npm run dev

# Contracts
cd blockchain
npm install
npm run compile
npm test
```

Or start the whole stack (backend, indexer, contracts, frontend) at once:

```bash
./scripts/dev-stack.sh
```

Environment variables are needed for Supabase, Privy, and a deployer wallet. They are not included in this repository.

---

## What's Next

We're working toward regulatory approval so the next NBA season can launch with real money.

---

## Team

Built by co-founders **Kamyar Modabber**, **Sam Sayari** and **Sam Salehi**
