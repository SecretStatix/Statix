# Statix — Development Handoff

This document summarizes what was built in this session, how the system works, and how to run, wire, and deploy it.

---

## What Was Built in This Session

### 1. Player Profile Enhancements
- **Top Transactions table** — Shows top 10 transactions (buys/sells by volume) for a player in the past 7 days
- **Shortened Recent Games** — Limited to last 5 games, moved below transactions
- **Backend endpoint** — `GET /api/trading/transactions?player_index=X&limit=10&days=7`
- **Demo data** — Mock transactions when `NEXT_PUBLIC_DEMO_MODE=true`

### 2. Design & Branding (Statix)
- **Rebrand** — "Dividend Fantasy" → "Statix" across navbar, hero, layout metadata, auth pages, NDA
- **Trading platform feel** — Green for Buy, red for Sell (buttons, badges, CTA)
- **ATHLETE MARKET** badge — Stock-market style badge on home hero
- **Input visibility fix** — Trade modal and auth inputs use dark background and visible text (fixes white-on-white bug)
- **Design polish** — Shadows, backdrop blur on modal, symbol badges, card hover states

### 3. Code Quality
- **Comments** — Clarified demo mode, API wiring, and endpoint purposes
- **Branding** — Backend, Supabase schema, and API comments updated to Statix

---

## How Everything Works

### Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              FRONTEND (Next.js)                              │
│  lib/api.ts → Backend API (or demo-data.ts when DEMO=true)                   │
│  hooks/useContracts.ts → On-chain reads (wagmi) via deployments.json         │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                    ┌─────────────────┴─────────────────┐
                    ▼                                   ▼
         ┌─────────────────────┐             ┌─────────────────────┐
         │    BACKEND (FastAPI) │             │  BLOCKCHAIN (Base)   │
         │  /api/players        │             │  DividendFantasy     │
         │  /api/trading        │             │  DBucks (payment)    │
         │  /api/dividends      │             │  Buy/sell on-chain   │
         │  /api/admin          │             └─────────────────────┘
         └──────────┬───────────┘
                    │
                    ▼
         ┌─────────────────────┐
         │   SUPABASE (opt)    │
         │  transactions       │
         │  dividend_claims    │
         │  weekly_performance │
         └─────────────────────┘
```

### Demo Mode vs Real Data

| Mode | `NEXT_PUBLIC_DEMO_MODE` | Data Source |
|------|-------------------------|-------------|
| Demo | `true` | `lib/demo-data.ts` — mock players, games, transactions, leaderboard. No backend required. |
| Real | `false` | Backend API + Supabase. Requires `NEXT_PUBLIC_API_URL` and backend running. |

**To disable demo mode:** Set `NEXT_PUBLIC_DEMO_MODE=false` in `.env.local`, delete `lib/demo-data.ts`, and remove the 5 DEMO checks in `lib/api.ts`.

### Data Flow

- **Players** — Backend `/api/players/` (or demo). On-chain prices from `useAllPlayers()` / `usePlayerPrice()`.
- **Games** — Backend `/api/players/{id}/games` (or demo `getDemoPlayerGames`).
- **Transactions** — Backend `/api/trading/transactions` (or demo `getDemoPlayerTransactions`). Backend reads from Supabase `transactions` table or in-memory fallback.
- **Trading** — On-chain via `useBuyShares` / `useSellShares`. After successful tx, frontend calls `/api/trading/log-transaction` to log to Supabase.
- **Leaderboard** — Backend `/api/dividends/leaderboard` (or demo).

---

## Git Flow & Push Instructions

### Your Flow (Push Your Branch)

1. **Commit and push your branch:**
   ```bash
   git add .
   git status
   git commit -m "Statix: player transactions, design polish, rebrand"
   git push origin <your-branch-name>
   ```

2. **Create a Pull Request** on GitHub: your-branch → main

3. **Request review** from your collaborator

### Collaborator Flow (Pull, Review, Wire, Merge)

1. **Fetch and checkout your branch:**
   ```bash
   git fetch origin
   git checkout <your-branch-name>
   ```

2. **Review changes** (and optionally run locally)

3. **Wire to real data** (see Wiring section below)

4. **Merge via PR** — Approve and merge your PR into `main` when ready

5. **Delete the feature branch** after merge (optional)

---

## Run & Wire Instructions

### Prerequisites
- Node.js 18+
- Python 3.10+ (for backend)
- WalletConnect Project ID: https://cloud.walletconnect.com

### 1. Frontend (Local)

```bash
cd frontend
npm install
cp .env.example .env.local
# Edit .env.local:
# - NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=your-id
# - NEXT_PUBLIC_DEMO_MODE=true (for UI preview, no backend)
# - NEXT_PUBLIC_SUPABASE_* (for auth)
npm run dev
```

Open http://localhost:3000

**Demo mode** — With `NEXT_PUBLIC_DEMO_MODE=true`, the app runs without backend. You’ll see mock players, transactions, and games.

### 2. Backend (Local)

```bash
cd backend
python -m venv venv
source venv/bin/activate   # or `venv\Scripts\activate` on Windows
pip install -r requirements.txt
cp .env.example .env
# Edit .env: SUPABASE_URL, SUPABASE_KEY, RPC_URL
uvicorn main:app --reload --port 8000
```

### 3. Supabase Wiring

1. Create a project at https://supabase.com
2. In Supabase SQL Editor, run `backend/supabase_schema.sql`
3. Add to `backend/.env`:
   - `SUPABASE_URL` — Project URL
   - `SUPABASE_KEY` — Service role key (for backend writes)

4. Add to `frontend/.env.local`:
   - `NEXT_PUBLIC_SUPABASE_URL` — Project URL
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` — Anon key (for auth)

### 4. Switch to Real Data

1. Set `NEXT_PUBLIC_DEMO_MODE=false` in `frontend/.env.local`
2. Set `NEXT_PUBLIC_API_URL=http://localhost:8000` (or deployed backend URL)
3. Ensure backend is running and can reach Supabase
4. Ensure contracts are deployed and `frontend/deployments.json` has correct addresses

### 5. Deploy

- **Backend** — Railway, Render, or similar: `uvicorn main:app --host 0.0.0.0 --port 8000`
- **Frontend** — Vercel: connect repo, set env vars, build command `npm run build`, start `npm run start`
- **Contracts** — Base Sepolia: `cd blockchain && npm run deploy:sepolia` (requires deployer wallet with testnet ETH)

---

## File Structure (Key Paths)

```
frontend/
├── app/
│   ├── layout.tsx          # Root layout, metadata
│   ├── page.tsx            # Home (hero, market grid)
│   ├── player/[id]/page.tsx # Player profile (chart, top transactions, recent games)
│   ├── dividends/          # Dividends page
│   ├── leaderboard/        # Leaderboard (uses getLeaderboard)
│   ├── login/, signup/, forgot-password/, reset-password/  # Auth
│   └── providers.tsx       # Wagmi + RainbowKit
├── components/
│   ├── Navbar.tsx
│   ├── PlayerGrid.tsx
│   ├── PlayerCard.tsx
│   ├── TradeModal.tsx
│   ├── PlayerTradingPanel.tsx
│   ├── Portfolio.tsx
│   └── DividendSummary.tsx
├── lib/
│   ├── api.ts              # API client + demo gate
│   ├── demo-data.ts        # Mock data (only when DEMO=true)
│   ├── abis.ts             # Contract ABIs + addresses from deployments.json
│   └── supabase.ts         # Supabase client (auth)
├── hooks/
│   └── useContracts.ts     # All on-chain reads/writes
└── .env.local              # Env vars (see .env.example)

backend/
├── main.py
├── routes/
│   ├── players.py
│   ├── trading.py          # contracts, quote, transactions, log-transaction
│   ├── dividends.py
│   └── admin.py
├── db.py                   # Supabase client + in-memory fallback
├── supabase_schema.sql
└── .env
```

---

## Quick Reference

| Task | Command / Action |
|------|------------------|
| Frontend dev (demo) | `cd frontend && npm run dev` |
| Backend dev | `cd backend && uvicorn main:app --reload` |
| Disable demo | `NEXT_PUBLIC_DEMO_MODE=false` + `NEXT_PUBLIC_API_URL` |
| Deploy contracts | `cd blockchain && npm run deploy:sepolia` |
| Run DB schema | Paste `backend/supabase_schema.sql` in Supabase SQL Editor |
