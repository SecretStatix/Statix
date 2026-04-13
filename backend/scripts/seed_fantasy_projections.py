#!/usr/bin/env python3
"""
Insert fabricated fantasy_weekly_projections for a Mon–Sun week (for local / test runs).

  cd backend && source venv/bin/activate
  WEEK_START=2025-02-10 WEEK_END=2025-02-16 python scripts/seed_fantasy_projections.py

Requires: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, and the fantasy_weekly_projections table applied.
Player indices come from ../blockchain/deployments.json when present, else 0..49.
"""
from __future__ import annotations
import argparse
import json
import os
import sys
from pathlib import Path

from dotenv import load_dotenv

BACKEND_ROOT = Path(__file__).resolve().parent.parent
REPO_ROOT = BACKEND_ROOT.parent

load_dotenv(BACKEND_ROOT / ".env")


def _player_indices() -> list[int]:
    dep_path = REPO_ROOT / "blockchain" / "deployments.json"
    if dep_path.exists():
        try:
            dep = json.loads(dep_path.read_text())
        except json.JSONDecodeError as e:
            print(f"WARNING: invalid JSON in {dep_path} ({e}); using indices 0..49", file=sys.stderr)
            return list(range(50))
        players = dep.get("players") or []
        out = [int(p["index"]) for p in players if p.get("index") is not None]
        if out:
            return sorted(out)
    return list(range(50))


def main() -> None:
    parser = argparse.ArgumentParser(description="Seed fantasy_weekly_projections with fake projections")
    parser.add_argument("--week-start", default=os.getenv("WEEK_START", "2025-02-10"))
    parser.add_argument("--week-end", default=os.getenv("WEEK_END", "2025-02-16"))
    args = parser.parse_args()

    week_start = args.week_start.strip()
    week_end = args.week_end.strip()

    url = os.getenv("SUPABASE_URL")
    key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        print("ERROR: Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in backend/.env", file=sys.stderr)
        sys.exit(1)

    try:
        from supabase import create_client
    except ImportError:
        print("ERROR: pip install supabase", file=sys.stderr)
        sys.exit(1)

    sb = create_client(url, key)
    indices = _player_indices()

    rows = []
    for i in indices:
        # Deterministic fake projection (roughly weekly fantasy scale)
        projection = 140.0 + (i % 23) * 2.8 + (i * 0.15)
        rows.append(
            {
                "player_index": i,
                "projection": round(projection, 2),
                "actual": None,
                "period_start": week_start,
                "period_end": week_end,
            }
        )

    sb.table("fantasy_weekly_projections").upsert(
        rows,
        on_conflict="player_index,period_start,period_end",
    ).execute()
    print(f"Upserted {len(rows)} rows into fantasy_weekly_projections ({week_start} .. {week_end})")

if __name__ == "__main__":
    main()
