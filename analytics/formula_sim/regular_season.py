"""
Part 1 — Regular Season Analysis (Weekly Cycles).

For each season, splits into fixed 7-day cycles from opening night.
Ranks all eligible players by per-game average FPts under V2 and V2.5.
POTW winners get +10 added to their per-game average before ranking.
Outputs a multi-sheet Excel file per season.
"""

from datetime import timedelta
from collections import defaultdict

import pandas as pd

from .config import (
    CYCLE_DAYS, RS_MIN_GAMES, RS_TOP_N, OUTPUT_DIR, TIERS, REGULAR_SEASONS,
    POTW_BONUS,
)
from .formulas import add_formula_columns
from .potw_data import is_potw


# ──────────────────────────────────────────────────────────────────────────────
# Build weekly cycles
# ──────────────────────────────────────────────────────────────────────────────

def _build_cycles(df: pd.DataFrame, season: str) -> list[dict]:
    """Create fixed 7-day cycles from the configured season start date."""
    cfg = REGULAR_SEASONS[season]
    start = pd.Timestamp(cfg["start"])
    end = pd.Timestamp(cfg["end"])

    # If no data before configured start, adjust to first game date
    first_game = df["GAME_DATE"].min()
    if first_game > start:
        start = first_game

    cycles = []
    c = 0
    while start <= end:
        c += 1
        cycle_end = start + timedelta(days=CYCLE_DAYS - 1)
        if cycle_end > end:
            cycle_end = end
        cycles.append({"cycle": c, "start": start, "end": cycle_end})
        start = cycle_end + timedelta(days=1)
    return cycles


# ──────────────────────────────────────────────────────────────────────────────
# Per-cycle top-N computation (with POTW bonus)
# ──────────────────────────────────────────────────────────────────────────────

def _cycle_top(
    df: pd.DataFrame,
    cycle: dict,
    fpts_col: str,
    season: str,
    top_n: int = RS_TOP_N,
    min_games: int = RS_MIN_GAMES,
) -> pd.DataFrame:
    """Return top N players for a single cycle ranked by per-game avg.
    POTW winners get +10 bonus on their per-game average before ranking."""
    mask = (df["GAME_DATE"] >= cycle["start"]) & (df["GAME_DATE"] <= cycle["end"])
    cdf = df[mask]

    agg = cdf.groupby(["PLAYER_ID", "PLAYER_NAME", "TEAM_ABBREVIATION"]).agg(
        GAMES=("GAME_DATE", "count"),
        TOTAL_FPTS=(fpts_col, "sum"),
        PTS=("PTS", "mean"),
        REB=("REB", "mean"),
        AST=("AST", "mean"),
        STL=("STL", "mean"),
        BLK=("BLK", "mean"),
        FG3M=("FG3M", "mean"),
        TOV=("TOV", "mean"),
        OREB=("OREB", "mean"),
        MISSED_FG=("MISSED_FG", "mean"),
        MISSED_FT=("MISSED_FT", "mean"),
    ).reset_index()

    agg["AVG_FPTS"] = (agg["TOTAL_FPTS"] / agg["GAMES"]).round(2)
    agg = agg[agg["GAMES"] >= min_games]

    # Apply POTW bonus (+10 to per-game average) before ranking
    cycle_num = cycle["cycle"]
    agg["POTW"] = agg["PLAYER_NAME"].apply(lambda n: is_potw(n, season, cycle_num))
    agg["AVG_FPTS"] = agg.apply(
        lambda r: round(r["AVG_FPTS"] + POTW_BONUS, 2) if r["POTW"] else r["AVG_FPTS"],
        axis=1,
    )

    agg = agg.sort_values("AVG_FPTS", ascending=False).head(top_n).reset_index(drop=True)
    agg.index += 1
    agg.index.name = "Rank"
    agg["CYCLE"] = cycle_num
    agg["CYCLE_START"] = cycle["start"].strftime("%Y-%m-%d")
    agg["CYCLE_END"] = cycle["end"].strftime("%Y-%m-%d")
    # Mark POTW as readable string for display
    agg["POTW"] = agg["POTW"].apply(lambda x: "POTW" if x else "")
    return agg


def _games_per_team_range(df: pd.DataFrame, cycle: dict) -> tuple[int, int]:
    """Min and max games played by any team in this cycle."""
    mask = (df["GAME_DATE"] >= cycle["start"]) & (df["GAME_DATE"] <= cycle["end"])
    cdf = df[mask]
    if cdf.empty:
        return 0, 0
    team_games = cdf.groupby("TEAM_ABBREVIATION")["GAME_ID"].nunique()
    return int(team_games.min()), int(team_games.max())


# ──────────────────────────────────────────────────────────────────────────────
# Run full regular-season analysis for one season
# ──────────────────────────────────────────────────────────────────────────────

def analyse_regular_season(
    df_raw: pd.DataFrame,
    season: str,
) -> dict:
    """
    Run V2 and V2.5 analysis. Returns a dict of DataFrames keyed by sheet name,
    plus metadata for the master comparison.
    """
    print(f"\n{'='*60}")
    print(f"  Regular Season {season}")
    print(f"{'='*60}")

    df = add_formula_columns(df_raw)
    cycles = _build_cycles(df, season)
    print(f"  {len(cycles)} weekly cycles")

    # ── Sheet 1: Cycle Summary ────────────────────────────────────────────
    cycle_rows = []
    for cyc in cycles:
        gmin, gmax = _games_per_team_range(df, cyc)
        cycle_rows.append({
            "Cycle": cyc["cycle"],
            "Start": cyc["start"].strftime("%Y-%m-%d"),
            "End": cyc["end"].strftime("%Y-%m-%d"),
            "Games/Team Min": gmin,
            "Games/Team Max": gmax,
        })
    sheet_cycle_summary = pd.DataFrame(cycle_rows)

    # ── Sheets 2 & 3: Top 10 per cycle (V2 and V2.5) ────────────────────
    v2_frames, v25_frames = [], []
    for cyc in cycles:
        v2_frames.append(_cycle_top(df, cyc, "FPTS_V2", season))
        v25_frames.append(_cycle_top(df, cyc, "FPTS_V25", season))

    top_v2 = pd.concat(v2_frames, ignore_index=True) if v2_frames else pd.DataFrame()
    top_v25 = pd.concat(v25_frames, ignore_index=True) if v25_frames else pd.DataFrame()

    cols_v2 = [
        "CYCLE", "CYCLE_START", "CYCLE_END",
        "PLAYER_NAME", "TEAM_ABBREVIATION", "GAMES", "AVG_FPTS", "POTW",
        "PTS", "REB", "AST", "STL", "BLK", "FG3M", "TOV",
    ]
    cols_v25 = cols_v2 + ["OREB", "MISSED_FG", "MISSED_FT"]

    sheet_v2 = _safe_cols(top_v2, cols_v2)
    sheet_v25 = _safe_cols(top_v25, cols_v25)

    # Round stat averages for readability
    for s in (sheet_v2, sheet_v25):
        for c in ["PTS", "REB", "AST", "STL", "BLK", "FG3M", "TOV",
                   "OREB", "MISSED_FG", "MISSED_FT"]:
            if c in s.columns:
                s[c] = s[c].round(1)

    # ── Sheet 4: Side-by-Side Comparison ─────────────────────────────────
    comparison_rows = []
    for cyc in cycles:
        cn = cyc["cycle"]
        v2_names = set(top_v2.loc[top_v2["CYCLE"] == cn, "PLAYER_NAME"])
        v25_names = set(top_v25.loc[top_v25["CYCLE"] == cn, "PLAYER_NAME"])
        overlap = v2_names & v25_names
        only_v2 = v2_names - v25_names
        only_v25 = v25_names - v2_names
        comparison_rows.append({
            "Cycle": cn,
            "Start": cyc["start"].strftime("%Y-%m-%d"),
            "End": cyc["end"].strftime("%Y-%m-%d"),
            "Overlap Count": len(overlap),
            "Overlap %": round(len(overlap) / RS_TOP_N * 100, 1) if RS_TOP_N else 0,
            "Only V2": ", ".join(sorted(only_v2)) or "—",
            "Only V2.5": ", ".join(sorted(only_v25)) or "—",
            "Both": ", ".join(sorted(overlap)) or "—",
        })
    sheet_comparison = pd.DataFrame(comparison_rows)

    # ── Sheet 5: Player Frequency Summary ────────────────────────────────
    freq = _player_frequency(top_v2, top_v25, len(cycles))

    # ── Sheet 6: Player Tier Analysis ────────────────────────────────────
    tiers = _tier_analysis(top_v25, len(cycles))

    sheets = {
        "Cycle Summary": sheet_cycle_summary,
        "Top 10 Per Cycle (V2)": sheet_v2,
        "Top 10 Per Cycle (V2.5)": sheet_v25,
        "Side-by-Side Comparison": sheet_comparison,
        "Player Frequency": freq,
        "Player Tier Analysis": tiers,
    }

    # Metadata for master comparison
    meta = {
        "season": season,
        "type": "regular",
        "num_cycles": len(cycles),
        "top_v2": top_v2,
        "top_v25": top_v25,
        "comparison": sheet_comparison,
    }

    return {"sheets": sheets, "meta": meta}


# ──────────────────────────────────────────────────────────────────────────────
# Helpers
# ──────────────────────────────────────────────────────────────────────────────

def _safe_cols(df: pd.DataFrame, cols: list[str]) -> pd.DataFrame:
    """Select columns that exist in the dataframe."""
    existing = [c for c in cols if c in df.columns]
    return df[existing].copy() if existing else pd.DataFrame()


def _player_frequency(
    top_v2: pd.DataFrame,
    top_v25: pd.DataFrame,
    num_cycles: int,
) -> pd.DataFrame:
    v2_counts: dict[str, int] = defaultdict(int)
    v25_counts: dict[str, int] = defaultdict(int)
    teams: dict[str, str] = {}

    for _, row in top_v2.iterrows():
        v2_counts[row["PLAYER_NAME"]] += 1
        teams[row["PLAYER_NAME"]] = row.get("TEAM_ABBREVIATION", "")

    for _, row in top_v25.iterrows():
        v25_counts[row["PLAYER_NAME"]] += 1
        teams[row["PLAYER_NAME"]] = row.get("TEAM_ABBREVIATION", "")

    all_names = sorted(set(list(v2_counts) + list(v25_counts)))
    rows = []
    for name in all_names:
        vc = v2_counts.get(name, 0)
        ec = v25_counts.get(name, 0)
        rows.append({
            "Player": name,
            "Team": teams.get(name, ""),
            "V2 Appearances": vc,
            "V2.5 Appearances": ec,
            "Difference (V2.5 - V2)": ec - vc,
        })

    rows.sort(key=lambda x: x["V2 Appearances"], reverse=True)
    return pd.DataFrame(rows)


def _tier_analysis(top_v25: pd.DataFrame, num_cycles: int) -> pd.DataFrame:
    """Group players into tiers by V2.5 top-10 hit rate."""
    counts: dict[str, int] = defaultdict(int)
    teams: dict[str, str] = {}

    for _, row in top_v25.iterrows():
        counts[row["PLAYER_NAME"]] += 1
        teams[row["PLAYER_NAME"]] = row.get("TEAM_ABBREVIATION", "")

    rows = []
    for name, cnt in counts.items():
        rate = cnt / num_cycles if num_cycles else 0
        if rate > TIERS["Elite"]:
            tier = "Elite (>40%)"
        elif rate > TIERS["Mid-Tier"]:
            tier = "Mid-Tier (15-40%)"
        elif rate > TIERS["Fringe"]:
            tier = "Fringe (5-15%)"
        else:
            tier = "Never (<5%)"
        rows.append({
            "Player": name,
            "Team": teams.get(name, ""),
            "V2.5 Appearances": cnt,
            "Hit Rate %": round(rate * 100, 1),
            "Tier": tier,
        })

    rows.sort(key=lambda x: x["V2.5 Appearances"], reverse=True)
    return pd.DataFrame(rows)


# ──────────────────────────────────────────────────────────────────────────────
# Write Excel
# ──────────────────────────────────────────────────────────────────────────────

def write_regular_season_excel(result: dict, season: str):
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    tag = season.replace("-", "_")
    path = OUTPUT_DIR / f"regular_season_{tag}.xlsx"
    print(f"  Writing {path.name} …")

    with pd.ExcelWriter(path, engine="openpyxl") as w:
        for name, df in result["sheets"].items():
            df.to_excel(w, sheet_name=name[:31], index=False)

    print(f"  ✓ {path.name}")
    return path
