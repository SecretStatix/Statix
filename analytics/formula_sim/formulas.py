"""
Fantasy scoring formulas: V2 (original simple) and V2.5 (efficiency + defense).
"""

import pandas as pd


# ---------------------------------------------------------------------------
# Helper: count double/triple-double categories >= 10
# ---------------------------------------------------------------------------
def _dd_categories(row: pd.Series) -> int:
    """Count how many of PTS/REB/AST/STL/BLK are >= 10."""
    return sum(1 for c in ("PTS", "REB", "AST", "STL", "BLK") if row.get(c, 0) >= 10)


# ---------------------------------------------------------------------------
# V2 — Original Simple Formula
# ---------------------------------------------------------------------------
def calc_v2(row: pd.Series) -> float:
    """
    PTS×1 + REB×1.2 + AST×1.5 + STL×2 + BLK×2 + 3PM×0.5
    - TOV×1.5 + DD bonus(2) + TD bonus(5)
    """
    fpts = (
        row.get("PTS", 0) * 1.0
        + row.get("REB", 0) * 1.2
        + row.get("AST", 0) * 1.5
        + row.get("STL", 0) * 2.0
        + row.get("BLK", 0) * 2.0
        + row.get("FG3M", 0) * 0.5
        - row.get("TOV", 0) * 1.5
    )
    cats = _dd_categories(row)
    if cats >= 3:
        fpts += 5.0   # triple-double
    elif cats >= 2:
        fpts += 2.0   # double-double
    return round(fpts, 2)


# ---------------------------------------------------------------------------
# V2.5 — Efficiency + Defense Formula
# ---------------------------------------------------------------------------
def calc_v25(row: pd.Series) -> float:
    """
    PTS×1 + REB×1.2 + OREB×0.5 (extra) + AST×1.5 + STL×2 + BLK×2
    + 3PM×0.5 - TOV×1.5 - MISSED_FG×0.5 - MISSED_FT×0.3
    + DD bonus(2) + TD bonus(5)
    """
    missed_fg = row.get("FGA", 0) - row.get("FGM", 0)
    missed_ft = row.get("FTA", 0) - row.get("FTM", 0)

    fpts = (
        row.get("PTS", 0) * 1.0
        + row.get("REB", 0) * 1.2
        + row.get("OREB", 0) * 0.5      # extra on top of REB
        + row.get("AST", 0) * 1.5
        + row.get("STL", 0) * 2.0
        + row.get("BLK", 0) * 2.0
        + row.get("FG3M", 0) * 0.5
        - row.get("TOV", 0) * 1.5
        - missed_fg * 0.5
        - missed_ft * 0.3
    )
    cats = _dd_categories(row)
    if cats >= 3:
        fpts += 5.0
    elif cats >= 2:
        fpts += 2.0
    return round(fpts, 2)


# ---------------------------------------------------------------------------
# Vectorised helpers (apply to entire DataFrame)
# ---------------------------------------------------------------------------
def add_formula_columns(df: pd.DataFrame) -> pd.DataFrame:
    """Add FPTS_V2, FPTS_V25, MISSED_FG, MISSED_FT columns in-place."""
    df = df.copy()
    df["MISSED_FG"] = df["FGA"] - df["FGM"]
    df["MISSED_FT"] = df["FTA"] - df["FTM"]
    df["FPTS_V2"] = df.apply(calc_v2, axis=1)
    df["FPTS_V25"] = df.apply(calc_v25, axis=1)
    return df
