'use client';

import { useState, useEffect, useRef } from 'react';
import { getRecentTransactions } from '@/lib/api';

interface RecentTrade {
  wallet_address: string;
  player_index: number;
  player_name: string;
  side: string;
  shares: number;
  cost: number;
  tx_hash: string;
  created_at: string;
}

export function ActivityFeed() {
  const [trades, setTrades] = useState<RecentTrade[]>([]);
  const [loading, setLoading] = useState(true);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  const loadTrades = async () => {
    try {
      const data = await getRecentTransactions(15);
      setTrades(data);
    } catch {
      // Keep existing data on error
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTrades();
    intervalRef.current = setInterval(loadTrades, 30_000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  if (loading) {
    return (
      <div className="bg-card border border-white/[0.06] rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-white/[0.06]">
          <div className="h-4 w-28 bg-secondary/70 rounded animate-pulse" />
        </div>
        <div className="divide-y divide-white/[0.04]">
          {[1, 2, 3, 4, 5, 6, 7, 8].map(i => (
            <div key={i} className="px-4 py-3 animate-pulse">
              <div className="flex items-center justify-between">
                <div className="space-y-1.5">
                  <div className="h-3.5 w-24 bg-secondary/70 rounded" />
                  <div className="h-3 w-16 bg-secondary/70 rounded" />
                </div>
                <div className="h-4 w-12 bg-secondary/70 rounded" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-card border border-white/[0.06] rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b border-white/[0.06] flex items-center gap-2">
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-success opacity-75" />
          <span className="relative inline-flex rounded-full h-2 w-2 bg-success" />
        </span>
        <h3 className="text-sm font-semibold text-foreground">Recent Activity</h3>
      </div>
      <div className="divide-y divide-white/[0.04] max-h-[600px] overflow-y-auto">
        {trades.map((trade, i) => {
          const isBuy = trade.side === 'buy';
          const timeAgo = getTimeAgo(trade.created_at);

          return (
            <div key={i} className="px-4 py-2.5 hover:bg-white/[0.02] transition-colors">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className={`text-xs font-bold uppercase ${isBuy ? 'text-success' : 'text-destructive'}`}>
                      {trade.side}
                    </span>
                    <span className="text-sm text-foreground font-medium truncate">
                      {trade.player_name || `Player #${trade.player_index}`}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {trade.shares} shares · {timeAgo}
                  </p>
                </div>
                <span className="text-sm font-semibold text-foreground whitespace-nowrap">
                  ${trade.cost.toFixed(2)}
                </span>
              </div>
            </div>
          );
        })}
        {trades.length === 0 && (
          <div className="px-4 py-8 text-center text-sm text-muted-foreground">
            No recent trades
          </div>
        )}
      </div>
    </div>
  );
}

function getTimeAgo(isoDate: string): string {
  const diff = Date.now() - new Date(isoDate).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}
