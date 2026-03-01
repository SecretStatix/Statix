'use client';

import { useState, useEffect } from 'react';
import { getLeaderboard } from '@/lib/api';

export default function LeaderboardPage() {
  const [leaders, setLeaders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const data = await getLeaderboard();
        setLeaders(data);
      } catch {
        setLeaders([]);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  return (
    <div className="space-y-8">
      <h1 className="text-3xl font-bold">Dividend Leaderboard</h1>
      {loading ? (
        <div className="text-muted-foreground text-center py-12">Loading...</div>
      ) : leaders.length === 0 ? (
        <div className="bg-card rounded-xl p-8 text-center">
          <p className="text-muted-foreground">No dividend claims yet. The leaderboard will populate after the first weekly distribution.</p>
        </div>
      ) : (
        <div className="bg-card rounded-xl overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border text-muted-foreground text-sm">
                <th className="py-3 px-4 text-left">Rank</th>
                <th className="py-3 px-4 text-left">Wallet</th>
                <th className="py-3 px-4 text-right">Total Earned</th>
                <th className="py-3 px-4 text-right">Weeks Claimed</th>
              </tr>
            </thead>
            <tbody>
              {leaders.map((leader: any, i: number) => (
                <tr key={leader.wallet_address} className="border-b border-border/50 hover:bg-white/[0.03]">
                  <td className="py-3 px-4 font-bold">{i + 1}</td>
                  <td className="py-3 px-4 font-mono text-sm">
                    {leader.wallet_address.slice(0, 6)}...{leader.wallet_address.slice(-4)}
                  </td>
                  <td className="py-3 px-4 text-right text-green-400">
                    ${parseFloat(leader.total_earned).toFixed(2)}
                  </td>
                  <td className="py-3 px-4 text-right">{leader.weeks_claimed}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
