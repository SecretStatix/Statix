"""
NBA Player of the Week winners mapped to weekly cycle numbers.

Each cycle maps to a list of winner names (East + West).
Names must match nba_api PLAYER_NAME exactly (including accents).

Sources:
  - 2024-25: basketball-reference.com Player of the Week table
  - 2025-26: NBA.com past winners list
"""

import unicodedata


POTW: dict[str, dict[int, list[str]]] = {
    # ──────────────────────────────────────────────────────────────────────
    # 2024-25  (season starts Oct 22 2024, 7-day cycles)
    # POTW date → cycle = floor((date - Oct 22).days / 7) + 1
    # ──────────────────────────────────────────────────────────────────────
    "2024-25": {
        1:  ["Anthony Davis", "Jayson Tatum"],              # Oct 28
        2:  ["Devin Booker", "Donovan Mitchell"],            # Nov 4
        3:  ["Nikola Jokić", "Darius Garland"],              # Nov 11
        4:  ["De'Aaron Fox", "Franz Wagner"],                # Nov 18
        5:  ["Harrison Barnes", "Giannis Antetokounmpo"],    # Nov 25
        6:  ["Alperen Sengun", "Jalen Brunson"],             # Dec 2
        7:  ["Luka Dončić", "Tyler Herro"],                  # Dec 9
        # 8: no award (holiday break)
        9:  ["Victor Wembanyama", "Cade Cunningham"],        # Dec 23
        10: ["Shai Gilgeous-Alexander", "Tyrese Maxey"],     # Dec 30
        11: ["Nikola Jokić", "Jayson Tatum"],                # Jan 6
        12: ["Domantas Sabonis", "Darius Garland"],          # Jan 13
        13: ["Jalen Green", "Giannis Antetokounmpo"],        # Jan 20
        14: ["Jaren Jackson Jr.", "Scottie Barnes"],          # Jan 27
        15: ["LeBron James", "Donovan Mitchell"],             # Feb 3
        16: ["Nikola Jokić", "Trae Young"],                  # Feb 10
        # 17-18: no award (All-Star break)
        19: ["Zach LaVine", "Jalen Brunson"],                # Mar 3
        20: ["Shai Gilgeous-Alexander", "Trae Young"],       # Mar 10
        21: ["Anthony Edwards", "Coby White"],               # Mar 17
        22: ["Kevin Durant", "Coby White"],                  # Mar 24
        23: ["Jalen Green", "Paolo Banchero"],               # Mar 31
        24: ["Kawhi Leonard", "Giannis Antetokounmpo"],      # Apr 7
        25: ["James Harden", "Giannis Antetokounmpo"],       # Apr 14
    },

    # ──────────────────────────────────────────────────────────────────────
    # 2025-26  (season starts Oct 28 2025, 7-day cycles)
    # Week numbers from NBA.com map directly to cycle numbers.
    # ──────────────────────────────────────────────────────────────────────
    "2025-26": {
        1:  ["Victor Wembanyama", "Giannis Antetokounmpo"],
        2:  ["Shai Gilgeous-Alexander", "Tyrese Maxey"],
        3:  ["Nikola Jokić", "Cade Cunningham"],
        4:  ["Nikola Jokić", "Jalen Johnson"],
        5:  ["Shai Gilgeous-Alexander", "Donovan Mitchell"],
        6:  ["Luka Dončić", "Jalen Brunson"],
        7:  ["Jamal Murray", "Jaylen Brown"],
        # 8: no award
        9:  ["Jaren Jackson Jr.", "Jalen Brunson"],
        10: ["Kawhi Leonard", "Jaylen Brown"],
        11: ["Deni Avdija", "Tyrese Maxey"],
        12: ["Peyton Watson", "Scottie Barnes"],
        13: ["Shai Gilgeous-Alexander", "Bam Adebayo"],
        14: ["Luka Dončić", "Immanuel Quickley"],
        15: ["Dillon Brooks", "Brandon Miller"],
        16: ["Stephon Castle", "Jalen Johnson"],
        # 17-18: no award (All-Star break)
        19: ["Anthony Edwards", "Jalen Duren"],
        20: ["Victor Wembanyama", "Tyler Herro"],
        21: ["Luka Dončić", "Bam Adebayo"],
        22: ["Luka Dončić", "LaMelo Ball"],
        23: ["Nikola Jokić", "Jayson Tatum"],
    },
}


def _normalize(name: str) -> str:
    """Strip accents and lowercase for fuzzy matching."""
    nfkd = unicodedata.normalize("NFKD", name)
    return "".join(c for c in nfkd if not unicodedata.combining(c)).lower().strip()


def get_potw_names(season: str, cycle: int) -> set[str]:
    """Return set of POTW winner names for a given season and cycle."""
    return set(POTW.get(season, {}).get(cycle, []))


def is_potw(player_name: str, season: str, cycle: int) -> bool:
    """Check if a player won POTW in a given cycle (accent-insensitive)."""
    winners = get_potw_names(season, cycle)
    if not winners:
        return False
    norm = _normalize(player_name)
    return any(_normalize(w) == norm for w in winners)
