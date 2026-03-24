# Statix

> **NOTE:** This README needs a full rewrite. See `HANDOFF.md` and `blockchain/ADMIN_GUIDE.md` for current documentation.

NBA player trading platform with weekly dividends based on real fantasy performance. Built on Base (Ethereum L2).

## Quick Reference

```
MVP/
├── blockchain/         # Solidity smart contracts (Hardhat)
│   ├── contracts/
│   │   ├── PlayerPool.sol      # Per-player AMM pool (constant product)
│   │   ├── PoolFactory.sol     # Deploys and registers player pools
│   │   ├── StatixRouter.sol    # Single entry point for all trades
│   │   ├── DividendHub.sol     # Weekly dividend distribution + claims
│   │   ├── DBucks.sol          # USDC-backed payment token with faucet
│   │   ├── MockUSDC.sol        # Test USDC (6 decimals)
│   │   └── IPlayerPool.sol     # Pool interface
│   ├── scripts/
│   │   ├── deploy-statix.js    # Deploy all contracts to Base Sepolia
│   │   ├── distribute-dividends.js  # Weekly admin: performance + dividends
│   │   └── generate-players.js # Build players.json from NBA API cache
│   └── test/
│       └── Factory.test.js     # Main test suite
│
├── backend/            # Python FastAPI
│   ├── main.py               # API entry point
│   ├── routes/               # /api/players, /api/trading, /api/dividends, /api/admin
│   ├── nba_stats.py          # NBA API integration + caching
│   ├── chain.py              # Blockchain contract reads
│   └── db.py                 # Supabase client
│
├── frontend/           # Next.js 14 + TypeScript + Tailwind
│   ├── app/                  # App router pages (login, signup, portfolio, etc.)
│   ├── components/           # PlayerGrid, TradeModal, Portfolio, etc.
│   ├── hooks/useContracts.ts # Wagmi hooks for on-chain reads/writes
│   └── lib/                  # API client, auth, ABIs, demo data
│
└── simulations/        # Standalone AMM/dividend model simulations
```

## Setup

See `HANDOFF.md` for full run/wire/deploy instructions.

## License

MIT
