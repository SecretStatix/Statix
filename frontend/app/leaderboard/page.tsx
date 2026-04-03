'use client';

import { useState, useEffect } from 'react';
import { getLeaderboard } from '@/lib/api';

export default function LeaderboardPage() {
  const [leaders, setLeaders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const data = await getLeaderboard();
        setLeaders(data);
        setError(null);
      } catch {
        setLeaders([]);
        setError('Failed to load leaderboard. Please try again later.');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  return (
    <div className="space-y-10 pb-12">
      <header className="space-y-1">
        <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-muted-foreground/70">Leaderboard</p>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">Top earners</h1>
        <p className="max-w-lg text-sm text-muted-foreground">
          Wallets ranked by total dividend claims after weekly distributions.
        </p>
      </header>

      <div className="relative overflow-hidden rounded-3xl border border-white/[0.06] bg-gradient-to-b from-white/[0.02] to-transparent">
        <div className="pointer-events-none absolute -right-28 -top-28 h-[22rem] w-[22rem] rounded-full bg-primary/[0.04] blur-[120px]" />

        {loading ? (
          <div className="relative py-16 text-center text-sm text-muted-foreground">Loading…</div>
        ) : error ? (
          <div className="relative px-6 py-16 text-center">
            <p className="text-sm text-destructive max-w-md mx-auto">{error}</p>
          </div>
        ) : leaders.length === 0 ? (
          <div className="relative px-6 py-16 text-center">
            <p className="text-sm text-muted-foreground max-w-md mx-auto">
              No dividend claims yet. The leaderboard will populate after the first weekly distribution.
            </p>
          </div>
        ) : (
          <div className="relative">
            <div className="border-b border-white/[0.06] px-5 py-4 sm:px-8">
              <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-muted-foreground/80">All time</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[520px] text-sm">
                <thead>
                  <tr className="border-b border-white/[0.06] text-left text-[11px] font-medium uppercase tracking-wider text-muted-foreground/80">
                    <th className="px-5 py-3 sm:px-8">Rank</th>
                    <th className="py-3 pr-4">Wallet</th>
                    <th className="py-3 pr-5 text-right sm:pr-8">Total earned</th>
                    <th className="py-3 pr-5 text-right sm:pr-8">Weeks claimed</th>
                  </tr>
                </thead>
                <tbody>
                  {leaders.map((leader: any, i: number) => (
                    <tr
                      key={leader.wallet_address}
                      className="border-b border-white/[0.04] last:border-0 transition-colors hover:bg-white/[0.02]"
                    >
                      <td className="px-5 py-3.5 font-semibold tabular-nums text-foreground sm:px-8">{i + 1}</td>
                      <td className="py-3.5 font-mono text-xs text-muted-foreground">
                        {leader.wallet_address.slice(0, 6)}…{leader.wallet_address.slice(-4)}
                      </td>
                      <td className="py-3.5 text-right font-medium tabular-nums text-success">
                        ${parseFloat(leader.total_earned).toFixed(2)}
                      </td>
                      <td className="py-3.5 pr-5 text-right tabular-nums text-foreground sm:pr-8">
                        {leader.weeks_claimed}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
