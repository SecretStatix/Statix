"""
Statix Dividend Model Analysis — 2024-25 NBA Season

Compares old (projection-beating) vs new (per-game avg FPts) dividend models
across fixed 14-day calendar cycles.

Usage:
    python analytics/run_analysis.py
    # First run fetches from NBA API and caches as CSV (~25s for 50 players).
    # Subsequent runs use cache and finish in seconds.
"""

import json
import time
from pathlib import Path
from datetime import timedelta
from collections import Counter, defaultdict

import pandas as pd

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

ROOT = Path(__file__).resolve().parent
REPO = ROOT.parent
CACHE_DIR = ROOT / "cache"
PLAYERS_JSON = REPO / "blockchain" / "scripts" / "players.json"
OUTPUT_XLSX = ROOT / "dividend_model_comparison.xlsx"

SEASON = "2024-25"
SEASON_START = pd.Timestamp("2024-10-22")  # opening night
SEASON_END = pd.Timestamp("2025-04-13")    # regular season final day
CYCLE_DAYS = 14
MIN_GAMES = 3   # minimum games in a cycle to be eligible for top 10
TOP_N = 10

# Fantasy scoring weights
SCORING = {"PTS": 1.0, "REB": 1.2, "AST": 1.5, "STL": 3.0, "BLK": 3.0, "TOV": -1.0}


def calc_fpts(row: pd.Series) -> float:
    return sum(row.get(k, 0) * v for k, v in SCORING.items())


# ---------------------------------------------------------------------------
# Step 1 — Pull data (with CSV cache)
# ---------------------------------------------------------------------------

def load_players() -> list[dict]:
    with open(PLAYERS_JSON) as f:
        return json.load(f)


def fetch_all_game_logs(players: list[dict]) -> pd.DataFrame:
    """Fetch game logs for all players. Uses CSV cache per player."""
    from nba_api.stats.endpoints import playergamelog

    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    all_frames = []

    for i, p in enumerate(players):
        nba_id = p["nba_id"]
        cache_file = CACHE_DIR / f"gamelog_{nba_id}.csv"

        if cache_file.exists():
            df = pd.read_csv(cache_file)
            if len(df) > 0:
                df["_player_id"] = p["id"]
                df["_player_name"] = p["name"]
                df["_player_team"] = p["team"]
                all_frames.append(df)
                print(f"  [{i+1}/{len(players)}] {p['name']:30s} — cached ({len(df)} games)")
                continue

        print(f"  [{i+1}/{len(players)}] {p['name']:30s} — fetching...", end="", flush=True)
        try:
            log = playergamelog.PlayerGameLog(
                player_id=nba_id,
                season=SEASON,
                season_type_all_star="Regular Season",
            )
            df = log.get_data_frames()[0]
            df.to_csv(cache_file, index=False)
            df["_player_id"] = p["id"]
            df["_player_name"] = p["name"]
            df["_player_team"] = p["team"]
            all_frames.append(df)
            print(f" {len(df)} games")
        except Exception as e:
            print(f" ERROR: {e}")
            pd.DataFrame().to_csv(cache_file, index=False)

        time.sleep(0.5)

    if not all_frames:
        raise RuntimeError("No game data fetched at all")

    combined = pd.concat(all_frames, ignore_index=True)
    combined["GAME_DATE"] = pd.to_datetime(combined["GAME_DATE"])
    combined["Game_ID"] = pd.to_numeric(combined["Game_ID"], errors="coerce").astype("Int64")
    for col in ["PTS", "REB", "AST", "STL", "BLK", "TOV", "MIN"]:
        if col in combined.columns:
            combined[col] = pd.to_numeric(combined[col], errors="coerce").fillna(0)
    combined["FPTS"] = combined.apply(calc_fpts, axis=1)
    return combined


# ---------------------------------------------------------------------------
# Step 2 — Build fixed 14-day calendar cycles
# ---------------------------------------------------------------------------

def build_cycles(game_logs: pd.DataFrame) -> list[dict]:
    """Fixed 14-day windows from season start to season end."""
    cycles = []
    cycle_num = 0
    start = SEASON_START

    while start + timedelta(days=CYCLE_DAYS - 1) <= SEASON_END:
        end = start + timedelta(days=CYCLE_DAYS - 1)  # inclusive
        cycle_num += 1

        # Games in this window (inclusive of both start and end dates)
        mask = (game_logs["GAME_DATE"] >= start) & (game_logs["GAME_DATE"] <= end)
        cycle_game_ids = set(game_logs.loc[mask, "Game_ID"].dropna().unique())

        cycles.append({
            "cycle": cycle_num,
            "start_date": start,
            "end_date": end,
            "duration_days": CYCLE_DAYS,
            "game_ids": cycle_game_ids,
            "num_games": len(cycle_game_ids),
        })

        print(f"  Cycle {cycle_num:2d}: {start.strftime('%Y-%m-%d')} to "
              f"{end.strftime('%Y-%m-%d')} ({len(cycle_game_ids)} unique games)")

        start = end + timedelta(days=1)

    return cycles


# ---------------------------------------------------------------------------
# Step 3 — Run both models per cycle
# ---------------------------------------------------------------------------

def run_models(
    game_logs: pd.DataFrame,
    cycles: list[dict],
    players: list[dict],
) -> tuple[list[dict], list[dict], list[dict]]:
    """
    For each cycle, run old (projection-beating) and new (per-game avg FPts) models.
    Returns (old_results, new_results, comparison_rows).
    """
    player_ids = {p["id"] for p in players}
    player_names = {p["id"]: p["name"] for p in players}
    player_teams = {p["id"]: p["team"] for p in players}

    old_results = []
    new_results = []
    comparison_rows = []

    for cyc in cycles:
        cycle_num = cyc["cycle"]

        # Filter game logs by date window (not game IDs — simpler, avoids type issues)
        mask = (
            (game_logs["GAME_DATE"] >= cyc["start_date"]) &
            (game_logs["GAME_DATE"] <= cyc["end_date"]) &
            (game_logs["_player_id"].isin(player_ids))
        )
        cycle_logs = game_logs[mask]

        # Pre-cycle game logs (everything before this cycle)
        pre_mask = (
            (game_logs["GAME_DATE"] < cyc["start_date"]) &
            (game_logs["_player_id"].isin(player_ids))
        )
        pre_cycle = game_logs[pre_mask]

        # --- Old model: projection-beating ---
        old_top = _run_old_model(cycle_logs, pre_cycle, player_names, player_teams, cycle_num)
        old_results.extend(old_top)

        # --- New model: per-game avg FPts, 3-game minimum ---
        new_top = _run_new_model(cycle_logs, player_names, player_teams, cycle_num)
        new_results.extend(new_top)

        # --- Comparison ---
        old_set = {r["player_name"] for r in old_top}
        new_set = {r["player_name"] for r in new_top}
        only_old = old_set - new_set
        only_new = new_set - old_set
        overlap = old_set & new_set

        comparison_rows.append({
            "cycle": cycle_num,
            "start_date": cyc["start_date"],
            "end_date": cyc["end_date"],
            "old_top10_count": len(old_top),
            "new_top10_count": len(new_top),
            "overlap_count": len(overlap),
            "only_old_model": ", ".join(sorted(only_old)) if only_old else "",
            "only_new_model": ", ".join(sorted(only_new)) if only_new else "",
            "overlap_players": ", ".join(sorted(overlap)),
        })

    return old_results, new_results, comparison_rows


def _run_old_model(
    cycle_logs: pd.DataFrame,
    pre_cycle: pd.DataFrame,
    player_names: dict,
    player_teams: dict,
    cycle_num: int,
) -> list[dict]:
    """
    Old model: projection = season avg FPts/game × games_played_this_cycle.
    Outperformance = (actual_total - projected_total) / projected_total.
    """
    # Season per-game averages entering this cycle
    season_avgs = {}
    for pid, grp in pre_cycle.groupby("_player_id"):
        season_avgs[pid] = grp["FPTS"].mean()

    # Actual points and games this cycle
    cycle_stats = {}
    for pid, grp in cycle_logs.groupby("_player_id"):
        cycle_stats[pid] = {"total": grp["FPTS"].sum(), "games": len(grp)}

    # Calculate outperformance
    performances = []
    for pid in cycle_stats:
        actual = cycle_stats[pid]["total"]
        games = cycle_stats[pid]["games"]
        avg = season_avgs.get(pid, 0)
        # Project based on how many games they actually played
        projected = avg * games

        if projected > 0 and games > 0:
            outperf = (actual - projected) / projected
        else:
            continue

        performances.append({
            "player_id": pid,
            "player_name": player_names.get(pid, pid),
            "team": player_teams.get(pid, "???"),
            "actual_fpts": round(actual, 1),
            "projected_fpts": round(projected, 1),
            "games_played": games,
            "outperformance_pct": round(outperf * 100, 1),
        })

    # Top 10 positive outperformers
    positive = [p for p in performances if p["outperformance_pct"] > 0]
    positive.sort(key=lambda x: x["outperformance_pct"], reverse=True)
    top = positive[:TOP_N]

    total_outperf = sum(p["outperformance_pct"] for p in top)
    results = []
    for rank, p in enumerate(top, 1):
        pool_share = (p["outperformance_pct"] / total_outperf * 100) if total_outperf > 0 else 0
        results.append({
            "cycle": cycle_num,
            "rank": rank,
            "player_name": p["player_name"],
            "team": p["team"],
            "games_played": p["games_played"],
            "actual_fpts": p["actual_fpts"],
            "projected_fpts": p["projected_fpts"],
            "outperformance_pct": p["outperformance_pct"],
            "pool_share_pct": round(pool_share, 1),
        })

    return results


def _run_new_model(
    cycle_logs: pd.DataFrame,
    player_names: dict,
    player_teams: dict,
    cycle_num: int,
) -> list[dict]:
    """
    New model: per-game average FPts, minimum 3 games played.
    Rank by avg FPts descending, top 10 get the pool weighted by avg FPts.
    """
    player_stats = []
    for pid, grp in cycle_logs.groupby("_player_id"):
        games = len(grp)
        total = grp["FPTS"].sum()
        avg = total / games
        player_stats.append({
            "player_id": pid,
            "player_name": player_names.get(pid, pid),
            "team": player_teams.get(pid, "???"),
            "games_played": games,
            "total_fpts": round(total, 1),
            "avg_fpts": round(avg, 1),
            "eligible": games >= MIN_GAMES,
        })

    # Only eligible players (>= 3 games) compete for top 10
    eligible = [p for p in player_stats if p["eligible"]]
    eligible.sort(key=lambda x: x["avg_fpts"], reverse=True)
    top = eligible[:TOP_N]

    total_avg = sum(p["avg_fpts"] for p in top)
    results = []
    for rank, p in enumerate(top, 1):
        pool_share = (p["avg_fpts"] / total_avg * 100) if total_avg > 0 else 0
        results.append({
            "cycle": cycle_num,
            "rank": rank,
            "player_name": p["player_name"],
            "team": p["team"],
            "games_played": p["games_played"],
            "total_fpts": p["total_fpts"],
            "avg_fpts": p["avg_fpts"],
            "pool_share_pct": round(pool_share, 1),
        })

    return results


# ---------------------------------------------------------------------------
# Step 4 — Generate Excel
# ---------------------------------------------------------------------------

def generate_excel(
    cycles: list[dict],
    old_results: list[dict],
    new_results: list[dict],
    comparison_rows: list[dict],
    players: list[dict],
    num_cycles: int,
):
    print(f"\nWriting {OUTPUT_XLSX.name}...")

    with pd.ExcelWriter(OUTPUT_XLSX, engine="openpyxl") as writer:
        # Sheet 1: Cycle Summary
        cycle_summary = pd.DataFrame([{
            "Cycle": c["cycle"],
            "Start": c["start_date"].strftime("%Y-%m-%d"),
            "End": c["end_date"].strftime("%Y-%m-%d"),
            "Duration (days)": c["duration_days"],
            "Total Games": c["num_games"],
        } for c in cycles])
        cycle_summary.to_excel(writer, sheet_name="Cycle Summary", index=False)

        # Sheet 2: Old Model Top 10
        df_old = pd.DataFrame(old_results)
        if not df_old.empty:
            df_old = df_old.rename(columns={
                "cycle": "Cycle", "rank": "Rank", "player_name": "Player",
                "team": "Team", "games_played": "Games",
                "actual_fpts": "Actual FPts", "projected_fpts": "Projected FPts",
                "outperformance_pct": "Outperformance %", "pool_share_pct": "Pool Share %",
            })
            df_old.to_excel(writer, sheet_name="Old Model (Projections)", index=False)

        # Sheet 3: New Model Top 10
        df_new = pd.DataFrame(new_results)
        if not df_new.empty:
            df_new = df_new.rename(columns={
                "cycle": "Cycle", "rank": "Rank", "player_name": "Player",
                "team": "Team", "games_played": "Games",
                "total_fpts": "Total FPts", "avg_fpts": "Avg FPts/Game",
                "pool_share_pct": "Pool Share %",
            })
            df_new.to_excel(writer, sheet_name="New Model (Avg FPts)", index=False)

        # Sheet 4: Side-by-Side Comparison
        df_compare = pd.DataFrame(comparison_rows)
        if not df_compare.empty:
            df_compare = df_compare.rename(columns={
                "cycle": "Cycle",
                "start_date": "Start", "end_date": "End",
                "old_top10_count": "Old Top 10", "new_top10_count": "New Top 10",
                "overlap_count": "Overlap",
                "only_old_model": "Only in Old Model",
                "only_new_model": "Only in New Model",
                "overlap_players": "In Both Models",
            })
            df_compare["Start"] = df_compare["Start"].dt.strftime("%Y-%m-%d")
            df_compare["End"] = df_compare["End"].dt.strftime("%Y-%m-%d")
            df_compare.to_excel(writer, sheet_name="Comparison", index=False)

        # Sheet 5: Player Frequency
        player_freq = _build_frequency_table(old_results, new_results, num_cycles)
        player_freq.to_excel(writer, sheet_name="Player Frequency", index=False)

    print(f"Done! Output: {OUTPUT_XLSX}")


def _build_frequency_table(
    old_results: list[dict],
    new_results: list[dict],
    num_cycles: int,
) -> pd.DataFrame:
    """How often each player appeared in top 10 under each model."""
    old_counts: dict[str, int] = defaultdict(int)
    new_counts: dict[str, int] = defaultdict(int)
    old_ranks: dict[str, list] = defaultdict(list)
    new_ranks: dict[str, list] = defaultdict(list)

    for r in old_results:
        old_counts[r["player_name"]] += 1
        old_ranks[r["player_name"]].append(r["rank"])

    for r in new_results:
        new_counts[r["player_name"]] += 1
        new_ranks[r["player_name"]].append(r["rank"])

    all_names = sorted(set(list(old_counts.keys()) + list(new_counts.keys())))

    rows = []
    for name in all_names:
        oc = old_counts.get(name, 0)
        nc = new_counts.get(name, 0)
        rows.append({
            "Player": name,
            "Old Model (Count)": oc,
            "Old Model (Rate)": f"{oc}/{num_cycles}",
            "Old Model (Avg Rank)": round(sum(old_ranks.get(name, [])) / oc, 1) if oc else "",
            "New Model (Count)": nc,
            "New Model (Rate)": f"{nc}/{num_cycles}",
            "New Model (Avg Rank)": round(sum(new_ranks.get(name, [])) / nc, 1) if nc else "",
            "Diff (New - Old)": nc - oc,
        })

    rows.sort(key=lambda x: x["New Model (Count)"], reverse=True)
    return pd.DataFrame(rows)


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    print("=" * 65)
    print("Statix Dividend Model Analysis — 2024-25 Season")
    print("Fixed 14-day cycles | Per-game avg FPts | 3-game minimum")
    print("=" * 65)

    # Step 1
    print("\nStep 1: Loading players and game logs...")
    players = load_players()
    print(f"  {len(players)} curated players loaded")
    game_logs = fetch_all_game_logs(players)
    print(f"  {len(game_logs)} total game log entries")

    # Step 2
    print(f"\nStep 2: Building fixed {CYCLE_DAYS}-day cycles "
          f"({SEASON_START.strftime('%Y-%m-%d')} to {SEASON_END.strftime('%Y-%m-%d')})...")
    cycles = build_cycles(game_logs)
    print(f"  {len(cycles)} cycles built")

    # Step 3
    print("\nStep 3: Running both models...")
    old_results, new_results, comparison_rows = run_models(game_logs, cycles, players)

    # Cycle 1 has no pre-cycle data for the old model, so it may produce fewer results
    old_cycles_with_data = len(set(r["cycle"] for r in old_results))
    new_cycles_with_data = len(set(r["cycle"] for r in new_results))
    print(f"  Old model: {len(old_results)} top-10 entries across {old_cycles_with_data} cycles")
    print(f"  New model: {len(new_results)} top-10 entries across {new_cycles_with_data} cycles")

    avg_overlap = (
        sum(r["overlap_count"] for r in comparison_rows) / len(comparison_rows)
        if comparison_rows else 0
    )
    print(f"  Average overlap: {avg_overlap:.1f} / {TOP_N} players per cycle")

    # Step 4
    print("\nStep 4: Generating Excel...")
    generate_excel(cycles, old_results, new_results, comparison_rows, players, len(cycles))

    # Summary
    print("\n" + "=" * 65)
    print("SUMMARY")
    print("=" * 65)
    print(f"Cycles: {len(cycles)}  |  Window: {CYCLE_DAYS} days  |  Min games: {MIN_GAMES}")
    print(f"Season: {cycles[0]['start_date'].strftime('%Y-%m-%d')} to "
          f"{cycles[-1]['end_date'].strftime('%Y-%m-%d')}")
    print(f"Average overlap: {avg_overlap:.1f} / {TOP_N}")

    old_freq = Counter(r["player_name"] for r in old_results)
    new_freq = Counter(r["player_name"] for r in new_results)

    print(f"\nOLD model top 5 (projection-beating):")
    for name, count in old_freq.most_common(5):
        print(f"  {name:30s} — {count}/{len(cycles)} cycles")

    print(f"\nNEW model top 5 (avg FPts/game, {MIN_GAMES}+ games):")
    for name, count in new_freq.most_common(5):
        print(f"  {name:30s} — {count}/{len(cycles)} cycles")

    # Show a quick per-cycle snapshot
    print(f"\nPer-cycle #1 rank comparison (first few cycles):")
    for cyc_num in range(1, min(4, len(cycles)) + 1):
        old_r1 = [r for r in old_results if r["cycle"] == cyc_num and r["rank"] == 1]
        new_r1 = [r for r in new_results if r["cycle"] == cyc_num and r["rank"] == 1]
        old_name = old_r1[0]["player_name"] if old_r1 else "(no data)"
        new_name = new_r1[0]["player_name"] if new_r1 else "(no data)"
        new_avg = f" ({new_r1[0]['avg_fpts']} avg)" if new_r1 else ""
        print(f"  Cycle {cyc_num}: OLD #{1} = {old_name:25s}  |  NEW #{1} = {new_name}{new_avg}")


if __name__ == "__main__":
    main()
