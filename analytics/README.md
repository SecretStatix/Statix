# Statix Fantasy Formula Simulation

Compares two fantasy scoring formulas across multiple NBA seasons to determine the optimal scoring model for the Statix platform.

## Formulas

### V2 — Original Simple
| Stat | Weight |
|------|--------|
| PTS | ×1 |
| REB | ×1.2 |
| AST | ×1.5 |
| STL | ×2 |
| BLK | ×2 |
| 3PM | ×0.5 |
| TOV | −1.5 |
| Double-Double | +2 bonus |
| Triple-Double | +5 bonus |

### V2.5 — Efficiency + Defense
All of V2, plus:
| Stat | Weight |
|------|--------|
| OREB | ×0.5 (extra, on top of REB) |
| +/- | ×0.2 |
| Missed FG | −0.5 |
| Missed FT | −0.3 |

## Output Files

All Excel files are in `output/`:

| File | Contents |
|------|----------|
| `regular_season_2024_25.xlsx` | Part 1: 2024-25 regular season weekly cycle analysis |
| `regular_season_2025_26.xlsx` | Part 1: 2025-26 regular season weekly cycle analysis |
| `playoffs_2023_24.xlsx` | Part 2: 2023-24 playoff round analysis |
| `playoffs_2024_25.xlsx` | Part 2: 2024-25 playoff round analysis |
| `formula_comparison_master.xlsx` | Part 3: Combined summary across all datasets |

### Regular Season Sheets (per file)
1. **Cycle Summary** — cycle number, dates, games per team range
2. **Top 10 Per Cycle (V2)** — weekly top 10 with V2 formula stats
3. **Top 10 Per Cycle (V2.5)** — weekly top 10 with V2.5 formula + efficiency stats
4. **Side-by-Side Comparison** — overlap count per cycle, players unique to each formula
5. **Player Frequency** — how often each player appeared in top 10 under each formula
6. **Player Tier Analysis** — Elite (>40%), Mid-Tier (15-40%), Fringe (5-15%), Never (<5%)

### Playoff Sheets (per file)
1. **Round Summary** — series matchups, results, game counts
2. **Top Per Round (V2)** — top performers per round with V2 scoring
3. **Top Per Round (V2.5)** — top performers per round with V2.5 scoring
4. **Side-by-Side Comparison** — formula overlap per round
5. **Playoff MVP Tracker** — weighted cumulative ranking (R1×1, R2×1.5, CF×2, Finals×3)
6. **V2 vs V2.5 Difference** — biggest movers between formulas with efficiency stats

### Master Summary Sheets
1. **Summary** — overlap % across all datasets
2. **Benefited by V2.5** — top 10 "efficient two-way players" who gain from V2.5
3. **Hurt by V2.5** — top 10 "high-volume inefficient" players who lose
4. **Ideal Statix Roster** — top 20 players by total V2.5 top-10 appearances

## How to Run

```bash
# Full analysis (all parts)
python analytics/run_formula_sim.py

# Individual parts
python analytics/run_formula_sim.py --regular
python analytics/run_formula_sim.py --playoffs
python analytics/run_formula_sim.py --master
```

First run fetches from NBA API and caches as CSV in `cache/`. Subsequent runs use cache.

## Data Sources

- **nba_api** `LeagueGameLog` endpoint — all player game logs per season in one call
- Cached as `cache/league_gamelog_{season}_{type}.csv`

## Known Limitations

- **Player of the Week bonus** (+10 per-game avg) is NOT included. The nba_api does not have a reliable POTW endpoint. Add winners manually or update Excel files directly.
- **2025-26 data** depends on NBA API availability for the current season.
- Playoff round detection parses GAME_ID format; falls back to date-based clustering if format doesn't match.

## Dependencies

```
nba_api>=1.11
pandas>=2.0
openpyxl>=3.1
```
