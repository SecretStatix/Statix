#!/bin/bash
# Daily player cache update — run each morning from the backend directory.
# Fetches season stats + last 10 games for all 80 players, commits, and pushes.
# Railway auto-redeploys with fresh data (~2 min after push).

set -e
cd "$(dirname "$0")"

echo "==> Rebuilding player cache (80 players, ~3 min)..."
python -c "
import os, json, sys
os.remove('player_cache.json') if os.path.exists('player_cache.json') else None
from dotenv import load_dotenv
load_dotenv()
from nba_stats import fetch_curated_players
players = fetch_curated_players()
with_stats = sum(1 for p in players if p.get('avg_fantasy_points', 0) > 0)
with_games = sum(1 for p in players if p.get('recent_games'))
print(f'Done: {len(players)} players, {with_stats} with stats, {with_games} with recent games')

# Tier 1 players must never show 0 — flag loudly if any do.
TIER1 = ['Shai Gilgeous-Alexander','Victor Wembanyama','Nikola Jokic','Luka Doncic',
         'Anthony Edwards','Jayson Tatum','Jalen Brunson','Donovan Mitchell','Cade Cunningham']
broken = [p['name'] for p in players if p['name'] in TIER1 and p.get('avg_fantasy_points', 0) == 0]
if broken:
    print()
    print('WARNING: The following Tier 1 players have 0 avg_fantasy_points:')
    for name in broken:
        print(f'  - {name}')
    print('Their data fell back to recent games. Check for NBA API timeouts above.')
    print('Re-run update_daily.sh to retry fetching their season stats.')
"

echo "==> Committing and pushing..."
cd ..
git add backend/player_cache.json
git commit -m "chore: daily player cache update $(date +%Y-%m-%d)"
git push origin main

echo "==> Done! Railway will redeploy in ~2 minutes."
