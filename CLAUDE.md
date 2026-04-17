# Statix — Project Context

NBA player trading platform on Base (Ethereum L2). Users trade player shares via AMM, earn weekly dividends based on real NBA performance.

## Current Architecture (Statix V3)

### Smart Contracts (blockchain/contracts/)
Modular 6-contract system deployed via `scripts/deploy-statix.js`:
- **PlayerPool.sol** — Per-player AMM pool (constant product x*y=k, virtual shares/cash)
- **PoolFactory.sol** — Deploys and registers PlayerPool contracts
- **StatixRouter.sol** — Single entry point for buy/sell, fees, pause, blacklist, allowlist, kill switch
- **DividendHub.sol** — Periodic dividend distribution (20% base / 80% top 10 fantasy scorers) and claims
- **DBucks.sol** — USDC-backed payment token with faucet mode for testnet
- **MockUSDC.sol** — Test USDC (6 decimals)
- **IPlayerPool.sol** — Interface for pool interactions

### Backend (backend/)
FastAPI server with 4 route groups:
- `/api/players/` — 50 NBA players from deployments.json + NBA API cache
- `/api/trading/` — AMM quotes, contract info, transaction logging
- `/api/dividends/` — weekly dividend info, claims, leaderboard
- `/api/admin/` — weekly stats updates, cache refresh (admin-key protected)
- `nba_stats.py` — real NBA data from stats.nba.com, cached in player_cache.json
- `chain.py` — reads deployments.json and contract ABIs
- `db.py` — Supabase client with in-memory fallback

### Frontend (frontend/)
- Next.js 14 + TypeScript + Tailwind CSS
- **Auth**: Supabase (email/password) with approval gate (profiles.is_approved)
- **Wallet**: Privy (embedded wallets, no MetaMask required) + Wagmi
- **Modes**: DEMO (mock API data), PREVIEW (mock auth+wallet), normal (real everything)
- Key hooks in `hooks/useContracts.ts` target StatixRouter, DividendHub, DBucks

## Key Technical Details
- AMM: constant product (x*y=k), 1000 virtual shares, $10,000 virtual cash, $10/share starting price
- Fees: 2% per trade → 67% to DividendHub, 33% to protocol
- Dividends: 20% base (all holders), 80% top performer pool (top N players by absolute fantasy points — Round 1: 10, Round 2: 5, Conf Finals: 3, Finals: 1)
- Token decimals: 6 (matching USDC)
- Network: Base Sepolia (chain ID 84532)

## Scripts (blockchain/)
| Command | What it does |
|---------|-------------|
| `npm run compile` | Compile Solidity contracts |
| `npm run deploy:sepolia` | Deploy Statix stack to Base Sepolia |
| `npm run generate-players` | Build players.json from NBA API cache |
| `npm run distribute:sepolia` | Weekly admin: performance + dividends |

## Known Issues (as of cleanup)
- deployments.json has stale addresses from old DividendFantasy deployment — needs fresh deploy with deploy-statix.js
- player_cache.json is from 2024-25 season — needs refresh for 2025-26
- Demo data (15 players, hyphenated IDs) doesn't match real data (50 players, underscored IDs)
- Gas funding API (/api/fund-gas) has no rate limiting
