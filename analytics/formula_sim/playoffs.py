"""
Part 2 — Playoff Analysis.

Cycles = playoff rounds. Round is parsed from the GAME_ID
(format 004SSRRSGM where RR = round 01-04).
Only players on teams still alive in each round are eligible.
"""

from collections import defaultdict

import pandas as pd

from .config import PLAYOFF_ROUNDS, OUTPUT_DIR
from .formulas import add_formula_columns


# ──────────────────────────────────────────────────────────────────────────────
# Determine playoff round from GAME_ID
# ──────────────────────────────────────────────────────────────────────────────

def _extract_round(game_id) -> int:
    """
    NBA playoff GAME_ID layout: 004SSRRSGM (10 chars)
      004  = playoff flag
      SS   = season-start year (2 digits)
      RR   = round  (01-04)
      S    = series number within round
      GM   = game number within series

    Falls back to 0 if format doesn't match.
    """
    s = str(int(game_id)).zfill(10)
    if s[:3] != "004":
        return 0
    try:
        return int(s[5:7])
    except ValueError:
        return 0


def _add_round_column(df: pd.DataFrame) -> pd.DataFrame:
    df = df.copy()
    df["ROUND"] = df["GAME_ID"].apply(_extract_round)
    # If extraction failed for most rows, try date-based fallback
    if (df["ROUND"] == 0).sum() > len(df) * 0.5:
        df = _round_from_dates(df)
    return df


def _round_from_dates(df: pd.DataFrame) -> pd.DataFrame:
    """
    Fallback: derive round from number of active teams in time windows.
    Sort games by date, split into groups where team-pair count matches
    expected round sizes (8/4/2/1 series).
    """
    df = df.sort_values("GAME_DATE").copy()

    # Extract opponent team from matchup (e.g. "BOS vs. MIA" or "BOS @ MIA")
    def _teams(matchup, team):
        opp = matchup.replace("vs.", "@").split("@")[-1].strip()
        pair = tuple(sorted([team, opp]))
        return pair

    df["_series"] = df.apply(
        lambda r: _teams(r["MATCHUP"], r["TEAM_ABBREVIATION"]), axis=1
    )

    # Group into series and sort by first game
    series_info = df.groupby("_series").agg(
        first_game=("GAME_DATE", "min"),
        last_game=("GAME_DATE", "max"),
        num_games=("GAME_ID", "nunique"),
    ).sort_values("first_game")

    # Assign rounds by sequential batches
    n = len(series_info)
    if n >= 15:  # Normal bracket: 8+4+2+1 = 15
        rnd_sizes = [8, 4, 2, 1]
    elif n >= 7:
        rnd_sizes = [4, 2, 1]  # partial (if only one conference)
    else:
        rnd_sizes = [n]

    round_map = {}
    idx = 0
    for rnd, size in enumerate(rnd_sizes, 1):
        for s in series_info.index[idx:idx + size]:
            round_map[s] = rnd
        idx += size

    df["ROUND"] = df["_series"].map(round_map).fillna(0).astype(int)
    df.drop(columns=["_series"], inplace=True)
    return df


# ──────────────────────────────────────────────────────────────────────────────
# Derive series results from game data
# ──────────────────────────────────────────────────────────────────────────────

def _series_results(df: pd.DataFrame) -> pd.DataFrame:
    """For each round, list the series and their outcomes."""
    rows = []
    for rnd in sorted(df["ROUND"].unique()):
        if rnd == 0:
            continue
        rdf = df[df["ROUND"] == rnd]
        # Build series from matchup pairs
        def _pair(row):
            m = row["MATCHUP"]
            t = row["TEAM_ABBREVIATION"]
            opp = m.replace("vs.", "@").split("@")[-1].strip()
            return tuple(sorted([t, opp]))

        rdf = rdf.copy()
        rdf["_pair"] = rdf.apply(_pair, axis=1)

        for pair in rdf["_pair"].unique():
            sdf = rdf[rdf["_pair"] == pair]
            t1, t2 = pair
            t1_wins = len(sdf[(sdf["TEAM_ABBREVIATION"] == t1) & (sdf["WL"] == "W")].drop_duplicates("GAME_ID"))
            t2_wins = len(sdf[(sdf["TEAM_ABBREVIATION"] == t2) & (sdf["WL"] == "W")].drop_duplicates("GAME_ID"))
            winner = t1 if t1_wins > t2_wins else t2
            total_games = sdf["GAME_ID"].nunique()
            rows.append({
                "Round": PLAYOFF_ROUNDS.get(rnd, {}).get("name", f"Round {rnd}"),
                "Round #": rnd,
                "Matchup": f"{t1} vs {t2}",
                "Result": f"{winner} {max(t1_wins, t2_wins)}-{min(t1_wins, t2_wins)}",
                "Games": total_games,
                "Winner": winner,
            })

    return pd.DataFrame(rows)


# ──────────────────────────────────────────────────────────────────────────────
# Top performers per round
# ──────────────────────────────────────────────────────────────────────────────

def _round_top(
    df: pd.DataFrame,
    rnd: int,
    fpts_col: str,
) -> pd.DataFrame:
    """Return top N performers for a playoff round."""
    cfg = PLAYOFF_ROUNDS.get(rnd)
    if cfg is None:
        return pd.DataFrame()

    rdf = df[df["ROUND"] == rnd]
    if rdf.empty:
        return pd.DataFrame()

    agg = rdf.groupby(["PLAYER_ID", "PLAYER_NAME", "TEAM_ABBREVIATION"]).agg(
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
        PLUS_MINUS=("PLUS_MINUS", "mean"),
        FGM=("FGM", "mean"),
        FGA=("FGA", "mean"),
    ).reset_index()

    agg["AVG_FPTS"] = (agg["TOTAL_FPTS"] / agg["GAMES"]).round(2)
    agg = agg[agg["GAMES"] >= cfg["min_games"]]
    agg = agg.sort_values("AVG_FPTS", ascending=False).head(cfg["top_n"]).reset_index(drop=True)
    agg.index += 1
    agg.index.name = "Rank"
    agg["ROUND"] = rnd
    agg["ROUND_NAME"] = cfg["name"]

    # Pool share weighted by avg FPts
    total = agg["AVG_FPTS"].sum()
    agg["POOL_SHARE_%"] = (agg["AVG_FPTS"] / total * 100).round(1) if total else 0

    # FG%
    total_fga = agg["FGA"]
    agg["FG%"] = (agg["FGM"] / agg["FGA"] * 100).round(1).fillna(0)

    return agg


# ──────────────────────────────────────────────────────────────────────────────
# Playoff MVP tracker
# ──────────────────────────────────────────────────────────────────────────────

def _mvp_tracker(
    top_by_round: dict[int, pd.DataFrame],
    fpts_label: str,
) -> pd.DataFrame:
    """
    Cumulative ranking across rounds.
    Weight: R1×1, R2×1.5, CF×2, Finals×3.
    """
    scores: dict[str, float] = defaultdict(float)
    appearances: dict[str, int] = defaultdict(int)
    teams: dict[str, str] = {}

    for rnd, df in top_by_round.items():
        w = PLAYOFF_ROUNDS.get(rnd, {}).get("weight", 1.0)
        for _, row in df.iterrows():
            name = row["PLAYER_NAME"]
            scores[name] += row["AVG_FPTS"] * w
            appearances[name] += 1
            teams[name] = row.get("TEAM_ABBREVIATION", "")

    rows = [
        {
            "Player": n,
            "Team": teams.get(n, ""),
            "Rounds Appeared": appearances[n],
            f"Weighted Score ({fpts_label})": round(scores[n], 1),
        }
        for n in scores
    ]
    rows.sort(key=lambda x: x[f"Weighted Score ({fpts_label})"], reverse=True)
    return pd.DataFrame(rows)


# ──────────────────────────────────────────────────────────────────────────────
# V2 vs V2.5 difference analysis
# ──────────────────────────────────────────────────────────────────────────────

def _difference_analysis(
    all_v2: pd.DataFrame,
    all_v25: pd.DataFrame,
) -> pd.DataFrame:
    """Which players benefited / were hurt most by V2.5?"""
    v2_counts: dict[str, int] = defaultdict(int)
    v25_counts: dict[str, int] = defaultdict(int)
    teams: dict[str, str] = {}
    # Collect avg efficiency stats for V2.5 appearances
    eff_stats: dict[str, list] = defaultdict(list)

    for _, r in all_v2.iterrows():
        v2_counts[r["PLAYER_NAME"]] += 1
        teams[r["PLAYER_NAME"]] = r.get("TEAM_ABBREVIATION", "")

    for _, r in all_v25.iterrows():
        v25_counts[r["PLAYER_NAME"]] += 1
        teams[r["PLAYER_NAME"]] = r.get("TEAM_ABBREVIATION", "")
        eff_stats[r["PLAYER_NAME"]].append({
            "FG%": r.get("FG%", 0),
            "MISSED_FG": r.get("MISSED_FG", 0),
            "MISSED_FT": r.get("MISSED_FT", 0),
        })

    all_names = set(list(v2_counts) + list(v25_counts))
    rows = []
    for name in all_names:
        vc = v2_counts.get(name, 0)
        ec = v25_counts.get(name, 0)
        diff = ec - vc

        # Average efficiency stats from V2.5 appearances
        stats = eff_stats.get(name, [])
        avg_fg = round(sum(s["FG%"] for s in stats) / len(stats), 1) if stats else 0
        avg_mfg = round(sum(s["MISSED_FG"] for s in stats) / len(stats), 1) if stats else 0
        avg_mft = round(sum(s["MISSED_FT"] for s in stats) / len(stats), 1) if stats else 0

        rows.append({
            "Player": name,
            "Team": teams.get(name, ""),
            "V2 Appearances": vc,
            "V2.5 Appearances": ec,
            "Change": diff,
            "Avg FG%": avg_fg,
            "Avg Missed FG": avg_mfg,
            "Avg Missed FT": avg_mft,
        })

    rows.sort(key=lambda x: x["Change"], reverse=True)
    return pd.DataFrame(rows)


# ──────────────────────────────────────────────────────────────────────────────
# Main entry point for a single playoff season
# ──────────────────────────────────────────────────────────────────────────────

def analyse_playoffs(df_raw: pd.DataFrame, season: str) -> dict:
    print(f"\n{'='*60}")
    print(f"  Playoffs {season}")
    print(f"{'='*60}")

    df = add_formula_columns(df_raw)
    df = _add_round_column(df)

    rounds_present = sorted(r for r in df["ROUND"].unique() if r > 0)
    print(f"  Rounds found: {rounds_present}")

    # ── Sheet 1: Round Summary ───────────────────────────────────────────
    series_df = _series_results(df)

    # ── Sheets 2 & 3: Top Performers (V2 / V2.5) ────────────────────────
    v2_by_round, v25_by_round = {}, {}
    for rnd in rounds_present:
        v2_by_round[rnd] = _round_top(df, rnd, "FPTS_V2")
        v25_by_round[rnd] = _round_top(df, rnd, "FPTS_V25")

    all_v2 = pd.concat(v2_by_round.values(), ignore_index=True) if v2_by_round else pd.DataFrame()
    all_v25 = pd.concat(v25_by_round.values(), ignore_index=True) if v25_by_round else pd.DataFrame()

    cols_v2 = [
        "ROUND_NAME", "PLAYER_NAME", "TEAM_ABBREVIATION", "GAMES",
        "AVG_FPTS", "POOL_SHARE_%",
        "PTS", "REB", "AST", "STL", "BLK", "FG3M", "TOV",
    ]
    cols_v25 = cols_v2 + ["OREB", "MISSED_FG", "MISSED_FT", "FG%"]

    sheet_v2 = _safe_cols(all_v2, cols_v2)
    sheet_v25 = _safe_cols(all_v25, cols_v25)

    for s in (sheet_v2, sheet_v25):
        for c in ["PTS", "REB", "AST", "STL", "BLK", "FG3M", "TOV",
                   "OREB", "MISSED_FG", "MISSED_FT"]:
            if c in s.columns:
                s[c] = s[c].round(1)

    # ── Sheet 4: Side-by-Side Comparison ─────────────────────────────────
    comp_rows = []
    for rnd in rounds_present:
        rname = PLAYOFF_ROUNDS.get(rnd, {}).get("name", f"Round {rnd}")
        v2_names = set(v2_by_round.get(rnd, pd.DataFrame()).get("PLAYER_NAME", []))
        v25_names = set(v25_by_round.get(rnd, pd.DataFrame()).get("PLAYER_NAME", []))
        overlap = v2_names & v25_names
        top_n = PLAYOFF_ROUNDS.get(rnd, {}).get("top_n", 10)
        comp_rows.append({
            "Round": rname,
            "Top N": top_n,
            "Overlap": len(overlap),
            "Only V2": ", ".join(sorted(v2_names - v25_names)) or "—",
            "Only V2.5": ", ".join(sorted(v25_names - v2_names)) or "—",
            "Both": ", ".join(sorted(overlap)) or "—",
        })
    sheet_comp = pd.DataFrame(comp_rows)

    # ── Sheet 5: Playoff MVP Tracker ─────────────────────────────────────
    mvp_v2 = _mvp_tracker(v2_by_round, "V2")
    mvp_v25 = _mvp_tracker(v25_by_round, "V2.5")
    # Merge into one sheet
    if not mvp_v2.empty and not mvp_v25.empty:
        mvp = mvp_v25.merge(
            mvp_v2[["Player", "Weighted Score (V2)"]],
            on="Player", how="outer",
        ).fillna(0)
        mvp = mvp.sort_values("Weighted Score (V2.5)", ascending=False)
    else:
        mvp = mvp_v25 if not mvp_v25.empty else mvp_v2

    # ── Sheet 6: V2 vs V2.5 Difference ──────────────────────────────────
    diff = _difference_analysis(all_v2, all_v25)

    sheets = {
        "Round Summary": series_df,
        "Top Per Round (V2)": sheet_v2,
        "Top Per Round (V2.5)": sheet_v25,
        "Side-by-Side Comparison": sheet_comp,
        "Playoff MVP Tracker": mvp,
        "V2 vs V2.5 Difference": diff,
    }

    meta = {
        "season": season,
        "type": "playoffs",
        "rounds": rounds_present,
        "top_v2": all_v2,
        "top_v25": all_v25,
        "comparison": sheet_comp,
    }

    return {"sheets": sheets, "meta": meta}


def _safe_cols(df, cols):
    existing = [c for c in cols if c in df.columns]
    return df[existing].copy() if existing else pd.DataFrame()


# ──────────────────────────────────────────────────────────────────────────────
# Write Excel
# ──────────────────────────────────────────────────────────────────────────────

def write_playoffs_excel(result: dict, season: str):
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    tag = season.replace("-", "_")
    path = OUTPUT_DIR / f"playoffs_{tag}.xlsx"
    print(f"  Writing {path.name} …")

    with pd.ExcelWriter(path, engine="openpyxl") as w:
        for name, df in result["sheets"].items():
            df.to_excel(w, sheet_name=name[:31], index=False)

    print(f"  ✓ {path.name}")
    return path
