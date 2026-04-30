'use client';

import { useState, useEffect } from 'react';
import { getLeaderboard } from '@/lib/api';
import { AnimatedDividendPool } from '@/components/AnimatedDividendPool';
import { AuthGate } from '@/components/AuthGate';

const PRIZES = [
  { rank: 1, label: '1st Place', amount: '$250', color: 'text-amber-400' },
  { rank: 2, label: '2nd Place', amount: '$100', color: 'text-slate-300' },
  { rank: 3, label: '3rd Place', amount: '$50', color: 'text-amber-600' },
];

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
    <AuthGate>
    <div className="space-y-8 pb-12">
      <header className="space-y-1">
        <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-muted-foreground/70">Leaderboard</p>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">Portfolio rankings</h1>
        <p className="max-w-lg text-sm text-muted-foreground">
          Users ranked by total portfolio value — play-money balance + share value + unclaimed dividends.
        </p>
      </header>

      <AnimatedDividendPool />

      {/* Prize banner */}
      <div className="grid grid-cols-3 gap-3 sm:gap-4">
        {PRIZES.map((prize) => (
          <div
            key={prize.rank}
            className="relative overflow-hidden rounded-2xl border border-white/[0.06] bg-gradient-to-b from-white/[0.03] to-transparent px-4 py-5 text-center"
          >
            <p className={`text-xl sm:text-2xl font-bold tabular-nums ${prize.color}`}>{prize.amount}</p>
            <p className="mt-1 text-xs font-medium text-muted-foreground">{prize.label}</p>
          </div>
        ))}
      </div>

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
              No portfolio data yet. The leaderboard will populate after trading begins.
            </p>
          </div>
        ) : (
          <div className="relative">
            <div className="border-b border-white/[0.06] px-5 py-4 sm:px-8">
              <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-muted-foreground/80">Season standings</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-0 sm:min-w-[520px] text-sm">
                <thead>
                  <tr className="border-b border-white/[0.06] text-left text-[11px] font-medium uppercase tracking-wider text-muted-foreground/80">
                    <th className="px-3 py-3 sm:px-8">Rank</th>
                    <th className="py-3 pr-4">User</th>
                    <th className="py-3 pr-3 text-right sm:pr-8">Portfolio value</th>
                    <th className="py-3 pr-3 text-right sm:pr-8">Dividends earned</th>
                  </tr>
                </thead>
                <tbody>
                  {leaders.map((leader: any, i: number) => {
                    const rank = i + 1;
                    const prize = PRIZES.find(p => p.rank === rank);
                    return (
                      <tr
                        key={leader.wallet_address}
                        className="border-b border-white/[0.04] last:border-0 transition-colors hover:bg-white/[0.02]"
                      >
                        <td className="px-3 py-3.5 sm:px-8">
                          <span className={`font-bold tabular-nums ${prize ? prize.color : 'text-foreground'}`}>
                            {rank}
                          </span>
                        </td>
                        <td className="py-3.5 text-sm font-medium text-foreground">
                          {leader.display_name || (leader.wallet_address
                            ? `${leader.wallet_address.slice(0, 6)}…${leader.wallet_address.slice(-4)}`
                            : '—')}
                        </td>
                        <td className="py-3.5 pr-3 text-right font-semibold tabular-nums text-foreground sm:pr-8">
                          ${parseFloat(leader.portfolio_value ?? leader.total_earned ?? 0).toFixed(2)}
                        </td>
                        <td className="py-3.5 pr-3 text-right tabular-nums text-success sm:pr-8">
                          ${parseFloat(leader.total_earned ?? 0).toFixed(2)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      <p className="text-center text-xs text-muted-foreground/60">
        Portfolio value = play-money balance + (shares × current price) + unclaimed dividends. Updated periodically.
      </p>
    </div>
    </AuthGate>
  );
}
