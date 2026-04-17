'use client';

import { useState, useEffect } from 'react';

type TopPerformer = {
  rank: number;
  player_index: number;
  player_name: string;
  player_team: string;
  avg_fpts: number;
  games_played: number;
  round: number;
};

export function TopPerformers() {
  const [performers, setPerformers] = useState<TopPerformer[]>([]);
  const [round, setRound] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const apiBase = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
    fetch(`${apiBase}/api/dividends/top-performers`)
      .then(r => r.ok ? r.json() : [])
      .then((data: TopPerformer[]) => {
        if (data.length > 0) {
          setPerformers(data);
          setRound(data[0].round);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="rounded-2xl border border-white/[0.06] bg-gradient-to-b from-white/[0.012] to-transparent px-5 py-6 sm:px-8 sm:py-7">
        <div className="h-4 w-40 rounded bg-white/[0.06] animate-pulse mb-4" />
        <div className="space-y-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-10 rounded-lg bg-white/[0.04] animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (performers.length === 0) return null;

  return (
    <div className="rounded-2xl border border-white/[0.06] bg-gradient-to-b from-white/[0.012] to-transparent px-5 py-6 sm:px-8 sm:py-7">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-muted-foreground/70">Top Performers</p>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Round {round} — players eligible for the 80% bonus pool
          </p>
        </div>
        <span className="rounded-full border border-primary/20 bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
          Top {performers.length}
        </span>
      </div>

      <div className="space-y-2">
        {performers.map((p) => (
          <div
            key={p.player_index}
            className="flex items-center gap-3 rounded-xl border border-white/[0.04] bg-white/[0.02] px-4 py-3"
          >
            <span className="w-5 text-center text-xs font-bold tabular-nums text-muted-foreground/60">
              {p.rank}
            </span>
            <div className="flex-1 min-w-0">
              <p className="truncate text-sm font-medium text-foreground">{p.player_name}</p>
              <p className="text-xs text-muted-foreground">{p.player_team}</p>
            </div>
            <div className="text-right">
              <p className="text-sm font-semibold tabular-nums text-success">{p.avg_fpts.toFixed(1)}</p>
              <p className="text-[10px] text-muted-foreground/70">avg FPts</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
