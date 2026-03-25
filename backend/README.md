# Statix Backend

FastAPI server that provides player data, trading quotes, dividend info, and admin endpoints.

## Setup

```bash
cd backend
python -m venv venv
source venv/bin/activate        # macOS/Linux
pip install -r requirements.txt
```

## Run

```bash
uvicorn main:app --reload       # Development (auto-reload)
uvicorn main:app --host 0.0.0.0 --port 8000  # Production
```

## API Endpoints

### Players (`/api/players`)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/` | List all 50 players with stats |
| GET | `/{player_id}` | Get player by ID or index |
| GET | `/{player_id}/games` | Recent game log (`?last_n=10`, max 82) |

### Trading (`/api/trading`)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/contracts` | Contract addresses + ABIs for frontend |
| POST | `/quote` | AMM quote for buy/sell |
| GET | `/transactions` | Player transaction history |
| GET | `/transactions/recent` | Recent transactions across all players |
| POST | `/log-transaction` | Log completed on-chain tx |
| GET | `/history/{wallet}` | Wallet transaction history |
| GET | `/summary/{wallet}` | Wallet trading summary |

### Dividends (`/api/dividends`)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/config` | Dividend config (fee rates, splits) |
| GET | `/week/{week}` | Dividend info for a specific week |
| GET | `/user/{wallet}` | User dividend claims |
| GET | `/leaderboard` | Top dividend earners |

### Admin (`/api/admin`) — requires `Authorization: Bearer <ADMIN_KEY>`

| Method | Path | Description |
|--------|------|-------------|
| POST | `/update-weekly-stats` | Pull NBA stats for a week, compute fantasy points |
| POST | `/set-performance-manual` | Manual performance override |
| GET | `/refresh-players` | Force refresh player cache from NBA API |

## Player Data Pipeline

```
blockchain/scripts/players.json    (curated 50-player roster with nba_ids)
        ↓
nba_stats.py                       (fetches game logs from stats.nba.com per nba_id)
        ↓
player_cache.json                  (cached stats, refreshed every 24 hours)
        ↓
routes/players.py                  (merges deployment data + cached stats → API response)
```

To refresh the cache manually:

```bash
python nba_stats.py
```

This fetches game logs for all 50 curated players (~30 seconds) and caches the result.

## Key Files

| File | Purpose |
|------|---------|
| `main.py` | FastAPI app, CORS, route mounting |
| `nba_stats.py` | NBA API integration, fantasy scoring, caching |
| `chain.py` | Loads `deployments.json` and contract ABIs |
| `db.py` | Supabase client with in-memory fallback |
| `routes/players.py` | Player list and game log endpoints |
| `routes/trading.py` | Quotes, transaction logging |
| `routes/dividends.py` | Dividend config, claims, leaderboard |
| `routes/admin.py` | Weekly stats updates, cache refresh |
| `supabase_schema.sql` | Database schema for Supabase |

## Environment Variables

```bash
# .env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_KEY=your-service-role-key
ADMIN_KEY=your-admin-secret
RPC_URL=https://sepolia.base.org
ALLOWED_ORIGINS=http://localhost:3000,https://your-frontend.vercel.app
```

## Fantasy Scoring

| Stat | Weight |
|------|--------|
| PTS | ×1.0 |
| REB | ×1.2 |
| AST | ×1.5 |
| STL | ×3.0 |
| BLK | ×3.0 |
| TOV | ×(-1.0) |

Weekly projection = avg fantasy points per game × 3.5 games/week.

## Deployment

The `Procfile` is configured for Railway/Render:

```
web: uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000}
```
