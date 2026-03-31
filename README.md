# Statix

NBA player trading platform with weekly dividends based on real fantasy performance. Built on Base (Ethereum L2).

Users trade shares of real NBA players using an AMM (automated market maker). Trading fees fund a weekly dividend pool, distributed to shareholders based on real player performance.

## How It Works

1. **Trade** — Buy/sell shares of 50 NBA players. Prices move via constant-product AMM (x * y = k).
2. **Fees** — 1.5% per trade: 67% to dividend pool, 33% to protocol.
3. **Dividends** — Weekly: 20% split among all holders, 80% to holders of outperforming players.
4. **Outperformance** — `(actual_fantasy_points - projected) / projected`. Beat the projection, earn more.

## Architecture

```
MVP/
├── blockchain/              # Solidity smart contracts (Hardhat)
│   ├── contracts/
│   │   ├── PlayerPool.sol        # Per-player AMM pool
│   │   ├── PoolFactory.sol       # Deploys and registers player pools
│   │   ├── StatixRouter.sol      # Trade entry point, fees, access control
│   │   ├── DividendHub.sol       # Weekly dividend distribution + claims
│   │   ├── DBucks.sol            # USDC-backed token with testnet faucet
│   │   ├── MockUSDC.sol          # Test USDC (6 decimals)
│   │   └── IPlayerPool.sol       # Pool interface
│   ├── scripts/
│   │   ├── deploy-statix.js      # Deploy full contract stack
│   │   ├── distribute-dividends.js # Weekly admin script
│   │   ├── generate-players.js   # Generate players.json from cache
│   │   └── players.json          # Curated 50-player roster (2025-26)
│   └── test/
│       └── Factory.test.js       # Contract test suite
│
├── backend/                 # Python FastAPI (see backend/README.md)
│   ├── main.py                   # API entry point
│   ├── routes/                   # /api/players, /api/trading, /api/dividends, /api/admin
│   ├── nba_stats.py              # NBA API integration + caching
│   ├── chain.py                  # Contract address/ABI loader
│   └── db.py                     # Supabase client
│
├── frontend/                # Next.js 14 + TypeScript + Tailwind
│   ├── app/                      # Pages: login, signup, portfolio, player, etc.
│   ├── components/               # PlayerGrid, TradeModal, Portfolio, etc.
│   ├── hooks/useContracts.ts     # Wagmi hooks for on-chain reads/writes
│   └── lib/                      # API client, auth, ABIs, demo data
│
└── simulations/             # Standalone AMM/dividend model simulations
```

## Quick Start

### Backend

```bash
cd backend
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload
```

#### Backend With Docker

```bash
# Build the runtime image
docker build -t statix-backend ./backend

# Run the API locally on http://localhost:8000
docker run --rm -p 8000:8000 --env-file backend/.env statix-backend

# Build and run the test image
docker build --target test -t statix-backend-test ./backend
docker run --rm statix-backend-test
```

If you have not created `backend/.env` yet, copy `backend/.env.example` first and fill in the values you need.

### Frontend

```bash
cd frontend
npm install
npm run dev
```

### Blockchain

```bash
cd blockchain
npm install
npx hardhat compile
npm run deploy:sepolia    # Deploy contracts to Base Sepolia
```

## Player Data

The 50 tradeable players are curated in `blockchain/scripts/players.json` (2025-26 season). Stats are fetched from stats.nba.com via the `nba_api` library, cached for 24 hours in `backend/player_cache.json`.

To refresh stats: `cd backend && python nba_stats.py`

## Environment Variables

See `.env.example` files in `backend/`, `frontend/`, and `blockchain/` for required configuration.

## Docs

- `blockchain/ADMIN_GUIDE.md` — Admin operations, configurable parameters
- `math_explained.md` — AMM and dividend formulas
- `HANDOFF.md` — Deployment and wiring instructions

## License

MIT
