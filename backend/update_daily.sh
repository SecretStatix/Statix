#!/bin/bash
# Daily player cache update — run each morning from the backend directory.
# Fetches season stats + last 10 games for all 80 players, commits, and pushes.
# Railway auto-redeploys with fresh data (~2 min after push).

set -e
cd "$(dirname "$0")"

echo "==> Rebuilding player cache (80 players, ~3 min)..."
python -c "
import os, json
os.remove('player_cache.json') if os.path.exists('player_cache.json') else None
from dotenv import load_dotenv
load_dotenv()
from nba_stats import fetch_curated_players
players = fetch_curated_players()
with_stats = sum(1 for p in players if p.get('avg_fantasy_points', 0) > 0)
with_games = sum(1 for p in players if p.get('recent_games'))
print(f'Done: {len(players)} players, {with_stats} with stats, {with_games} with recent games')
"

echo "==> Committing and pushing..."
cd ..
git add backend/player_cache.json
git commit -m "chore: daily player cache update $(date +%Y-%m-%d)"
git push origin main

echo "==> Done! Railway will redeploy in ~2 minutes."
