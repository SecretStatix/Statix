"""
Data collection — fetch NBA game logs via nba_api, cache as CSV.

Uses LeagueGameLog for bulk fetching (all players in one call per season/type).
"""

import time
from pathlib import Path

import pandas as pd

from .config import CACHE_DIR, STAT_COLS


def _ensure_dirs():
    CACHE_DIR.mkdir(parents=True, exist_ok=True)


def _cache_path(season: str, season_type: str) -> Path:
    """e.g. cache/league_gamelog_2024-25_regular.csv"""
    tag = "regular" if "Regular" in season_type else "playoffs"
    return CACHE_DIR / f"league_gamelog_{season}_{tag}.csv"


def fetch_league_gamelog(season: str, season_type: str) -> pd.DataFrame:
    """
    Fetch all player game logs for a season/type.
    Uses CSV cache; only hits the API on cache miss.

    Parameters
    ----------
    season : str          e.g. "2024-25"
    season_type : str     "Regular Season" or "Playoffs"

    Returns
    -------
    pd.DataFrame with columns: PLAYER_ID, PLAYER_NAME, TEAM_ABBREVIATION,
        TEAM_NAME, GAME_ID, GAME_DATE, MATCHUP, WL, MIN, FGM, FGA, …,
        PLUS_MINUS, FPTS_V2, FPTS_V25, etc.
    """
    _ensure_dirs()
    cache = _cache_path(season, season_type)

    if cache.exists() and cache.stat().st_size > 100:
        print(f"  [cache] {cache.name}")
        df = pd.read_csv(cache)
        df["GAME_DATE"] = pd.to_datetime(df["GAME_DATE"])
        return df

    print(f"  [API]   LeagueGameLog  season={season}  type={season_type} …", end="", flush=True)
    from nba_api.stats.endpoints import leaguegamelog

    try:
        log = leaguegamelog.LeagueGameLog(
            season=season,
            season_type_all_star=season_type,
            player_or_team_abbreviation="P",
        )
        df = log.get_data_frames()[0]
        print(f"  {len(df)} rows")
    except Exception as e:
        print(f"  ERROR: {e}")
        return pd.DataFrame()

    if df.empty:
        print("  ⚠ Empty result")
        return df

    # Normalise types
    df["GAME_DATE"] = pd.to_datetime(df["GAME_DATE"])
    for col in STAT_COLS:
        if col in df.columns:
            df[col] = pd.to_numeric(df[col], errors="coerce").fillna(0)

    # Cache raw data
    df.to_csv(cache, index=False)
    time.sleep(0.5)  # respect rate limit
    return df


def fetch_regular_season(season: str) -> pd.DataFrame:
    return fetch_league_gamelog(season, "Regular Season")


def fetch_playoffs(season: str) -> pd.DataFrame:
    return fetch_league_gamelog(season, "Playoffs")


def load_all_data(regular_seasons: dict, playoff_seasons: list) -> dict:
    """
    Fetch/load all datasets.  Returns dict:
        {
            "regular": { "2024-25": df, "2025-26": df },
            "playoffs": { "2023-24": df, "2024-25": df },
        }
    """
    data = {"regular": {}, "playoffs": {}}

    print("\n=== Fetching Regular Season Data ===")
    for season in regular_seasons:
        df = fetch_regular_season(season)
        if not df.empty:
            data["regular"][season] = df
            print(f"    {season}: {len(df)} game-log rows, "
                  f"{df['PLAYER_ID'].nunique()} players")
        else:
            print(f"    {season}: NO DATA")

    print("\n=== Fetching Playoff Data ===")
    for season in playoff_seasons:
        df = fetch_playoffs(season)
        if not df.empty:
            data["playoffs"][season] = df
            print(f"    {season}: {len(df)} game-log rows, "
                  f"{df['PLAYER_ID'].nunique()} players")
        else:
            print(f"    {season}: NO DATA")

    return data
