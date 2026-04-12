"""
Part 3 — Combined Summary (formula_comparison_master.xlsx).

Aggregates results from all regular-season and playoff analyses.
"""

from collections import defaultdict

import pandas as pd

from .config import OUTPUT_DIR


def build_master(all_meta: list[dict]) -> dict:
    """
    Build the master summary from metadata dicts returned by
    analyse_regular_season() and analyse_playoffs().

    Returns dict of sheet-name → DataFrame.
    """

    # ── Collect per-dataset overlap stats ────────────────────────────────
    dataset_rows = []
    v2_global: dict[str, int] = defaultdict(int)
    v25_global: dict[str, int] = defaultdict(int)
    teams: dict[str, str] = {}

    for m in all_meta:
        season = m["season"]
        dtype = m["type"]
        label = f"{season} {'Regular Season' if dtype == 'regular' else 'Playoffs'}"

        # Count top-10 appearances per player across all cycles/rounds
        for _, r in m["top_v2"].iterrows():
            v2_global[r["PLAYER_NAME"]] += 1
            teams[r["PLAYER_NAME"]] = r.get("TEAM_ABBREVIATION", "")

        for _, r in m["top_v25"].iterrows():
            v25_global[r["PLAYER_NAME"]] += 1
            teams[r["PLAYER_NAME"]] = r.get("TEAM_ABBREVIATION", "")

        # Overlap from comparison sheet
        comp = m["comparison"]
        if comp.empty:
            dataset_rows.append({
                "Dataset": label,
                "Cycles/Rounds": 0,
                "Avg Overlap": 0,
                "Avg Overlap %": 0,
            })
            continue

        if "Overlap Count" in comp.columns:
            overlaps = comp["Overlap Count"]
        elif "Overlap" in comp.columns:
            overlaps = comp["Overlap"]
        else:
            overlaps = pd.Series([0])

        avg_overlap = overlaps.mean()

        # For regular season, top_n is always 10; for playoffs it varies
        if dtype == "regular":
            avg_pct = round(avg_overlap / 10 * 100, 1)
        else:
            avg_pct = round(avg_overlap / comp["Top N"].mean() * 100, 1) if "Top N" in comp.columns else 0

        num = m.get("num_cycles", len(comp))
        dataset_rows.append({
            "Dataset": label,
            "Cycles/Rounds": num,
            "Avg Overlap": round(avg_overlap, 1),
            "Avg Overlap %": avg_pct,
        })

    # ── Sheet 1: Summary ─────────────────────────────────────────────────
    summary = pd.DataFrame(dataset_rows)
    overall_pct = summary["Avg Overlap %"].mean() if not summary.empty else 0
    # Add a totals row
    totals = pd.DataFrame([{
        "Dataset": "OVERALL AVERAGE",
        "Cycles/Rounds": "",
        "Avg Overlap": "",
        "Avg Overlap %": round(overall_pct, 1),
    }])
    summary = pd.concat([summary, totals], ignore_index=True)

    # ── Sheet 2: Top 10 who BENEFIT most from V2.5 ──────────────────────
    benefit_rows = []
    for name in set(list(v2_global) + list(v25_global)):
        vc = v2_global.get(name, 0)
        ec = v25_global.get(name, 0)
        benefit_rows.append({
            "Player": name,
            "Team": teams.get(name, ""),
            "V2 Total Appearances": vc,
            "V2.5 Total Appearances": ec,
            "Change (V2.5 - V2)": ec - vc,
        })

    benefit_rows.sort(key=lambda x: x["Change (V2.5 - V2)"], reverse=True)
    benefited = pd.DataFrame(benefit_rows[:10])
    benefited.insert(0, "Rank", range(1, len(benefited) + 1))

    # ── Sheet 3: Top 10 HURT most by V2.5 ───────────────────────────────
    hurt_rows = sorted(benefit_rows, key=lambda x: x["Change (V2.5 - V2)"])
    hurt = pd.DataFrame(hurt_rows[:10])
    hurt.insert(0, "Rank", range(1, len(hurt) + 1))

    # ── Sheet 4: Ideal Statix Roster (Top 20 by V2.5 appearances) ───────
    roster_rows = sorted(benefit_rows, key=lambda x: x["V2.5 Total Appearances"], reverse=True)
    roster = pd.DataFrame(roster_rows[:20])
    roster.insert(0, "Rank", range(1, len(roster) + 1))
    roster = roster.rename(columns={
        "V2.5 Total Appearances": "Total Top-10 Appearances (V2.5)",
        "V2 Total Appearances": "Total Top-10 Appearances (V2)",
    })

    sheets = {
        "Summary": summary,
        "Benefited by V2.5": benefited,
        "Hurt by V2.5": hurt,
        "Ideal Statix Roster": roster,
    }
    return sheets


def write_master_excel(sheets: dict):
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    path = OUTPUT_DIR / "formula_comparison_master.xlsx"
    print(f"  Writing {path.name} …")

    with pd.ExcelWriter(path, engine="openpyxl") as w:
        for name, df in sheets.items():
            df.to_excel(w, sheet_name=name[:31], index=False)

    print(f"  ✓ {path.name}")
    return path
