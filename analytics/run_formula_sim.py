#!/usr/bin/env python3
"""
Statix Fantasy Formula Simulation — Main Entry Point

Compares V2 (original) and V2.5 (efficiency+defense) scoring formulas
across regular seasons (2024-25, 2025-26) and playoffs (2023-24, 2024-25).

Usage:
    python analytics/run_formula_sim.py              # run everything
    python analytics/run_formula_sim.py --regular     # regular season only
    python analytics/run_formula_sim.py --playoffs    # playoffs only
    python analytics/run_formula_sim.py --master      # master summary only (requires prior runs)

First run fetches from NBA API and caches as CSV (~4 calls with 0.5s delay).
Subsequent runs use cache and finish quickly.
"""

import argparse
import sys
from pathlib import Path

# Allow running from repo root
sys.path.insert(0, str(Path(__file__).resolve().parent))

from formula_sim.config import REGULAR_SEASONS, PLAYOFF_SEASONS
from formula_sim.data import load_all_data
from formula_sim.regular_season import analyse_regular_season, write_regular_season_excel
from formula_sim.playoffs import analyse_playoffs, write_playoffs_excel
from formula_sim.master import build_master, write_master_excel


def main():
    parser = argparse.ArgumentParser(description="Statix Fantasy Formula Simulation")
    parser.add_argument("--regular", action="store_true", help="Run regular season only")
    parser.add_argument("--playoffs", action="store_true", help="Run playoffs only")
    parser.add_argument("--master", action="store_true", help="Run master summary only")
    args = parser.parse_args()

    run_all = not (args.regular or args.playoffs or args.master)
    do_regular = run_all or args.regular
    do_playoffs = run_all or args.playoffs
    do_master = run_all or args.master

    print("=" * 65)
    print("  Statix Fantasy Formula Simulation")
    print("  V2 (Original Simple) vs V2.5 (Efficiency + Defense)")
    print("=" * 65)

    # ── Data Collection ──────────────────────────────────────────────────
    reg_seasons = REGULAR_SEASONS if do_regular else {}
    po_seasons = PLAYOFF_SEASONS if do_playoffs else []
    data = load_all_data(reg_seasons, po_seasons)

    all_meta = []

    # ── Part 1: Regular Season ───────────────────────────────────────────
    if do_regular:
        print("\n" + "=" * 65)
        print("  PART 1: REGULAR SEASON ANALYSIS")
        print("=" * 65)
        for season, df in data["regular"].items():
            result = analyse_regular_season(df, season)
            write_regular_season_excel(result, season)
            all_meta.append(result["meta"])
            _print_season_summary(result["meta"], "regular")

    # ── Part 2: Playoffs ─────────────────────────────────────────────────
    if do_playoffs:
        print("\n" + "=" * 65)
        print("  PART 2: PLAYOFF ANALYSIS")
        print("=" * 65)
        for season, df in data["playoffs"].items():
            result = analyse_playoffs(df, season)
            write_playoffs_excel(result, season)
            all_meta.append(result["meta"])
            _print_season_summary(result["meta"], "playoffs")

    # ── Part 3: Master Summary ───────────────────────────────────────────
    if do_master and all_meta:
        print("\n" + "=" * 65)
        print("  PART 3: COMBINED MASTER SUMMARY")
        print("=" * 65)
        sheets = build_master(all_meta)
        write_master_excel(sheets)

        # Quick console summary
        summary = sheets.get("Summary")
        if summary is not None and not summary.empty:
            print("\n  Overlap Summary:")
            for _, row in summary.iterrows():
                print(f"    {row['Dataset']:40s}  Overlap: {row['Avg Overlap %']}%")

        roster = sheets.get("Ideal Statix Roster")
        if roster is not None and not roster.empty:
            print("\n  Top 5 Ideal Statix Roster (V2.5):")
            for _, row in roster.head(5).iterrows():
                print(f"    #{int(row['Rank'])}  {row['Player']:25s}  "
                      f"{row.get('Total Top-10 Appearances (V2.5)', 0)} appearances")

    # ── Player of the Week Note ──────────────────────────────────────────
    print("\n" + "-" * 65)
    print("  POTW bonus (+10 per-game avg) included for regular seasons.")
    print("  Data: 2024-25 (22 weeks) and 2025-26 (20 weeks).")
    print("  Source: basketball-reference.com / NBA.com.")
    print("-" * 65)

    print("\n✓ Done. Output files in analytics/output/")


def _print_season_summary(meta: dict, dtype: str):
    """Quick console summary for a season analysis."""
    season = meta["season"]
    v2_players = meta["top_v2"]["PLAYER_NAME"].nunique() if not meta["top_v2"].empty else 0
    v25_players = meta["top_v25"]["PLAYER_NAME"].nunique() if not meta["top_v25"].empty else 0

    if dtype == "regular":
        print(f"\n  {season} Summary:")
        print(f"    Cycles: {meta['num_cycles']}")
        print(f"    Unique players in V2 top 10: {v2_players}")
        print(f"    Unique players in V2.5 top 10: {v25_players}")
    else:
        print(f"\n  {season} Playoffs Summary:")
        print(f"    Rounds: {meta['rounds']}")
        print(f"    Unique players in V2 top N: {v2_players}")
        print(f"    Unique players in V2.5 top N: {v25_players}")


if __name__ == "__main__":
    main()
