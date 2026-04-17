'use client';

import { useState, useEffect } from 'react';
import { useH2HMarkets } from '@/hooks/h2h/useH2HMarkets';
import { MarketCard } from '@/components/h2h/MarketCard';
import type { MarketStatus } from '@/lib/h2h-api';

const TABS: { key: MarketStatus | 'all'; label: string }[] = [
  { key: 'open', label: 'Live & Upcoming' },
  { key: 'resolved', label: 'Resolved' },
  { key: 'all', label: 'All' },
];

type NextGame = { game_date: string; player_a_name: string; player_b_name: string; notes: string | null };

function NoMarketsCard({ tab }: { tab: string }) {
  const [nextGame, setNextGame] = useState<NextGame | null>(null);

  useEffect(() => {
    if (tab !== 'open') return;
    const apiBase = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
    fetch(`${apiBase}/api/h2h/next-game`)
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data) setNextGame(data); })
      .catch(() => {});
  }, [tab]);

  if (tab !== 'open') {
    return (
      <div className="rounded-xl border border-border bg-card py-16 text-center text-sm text-muted-foreground">
        No {tab} markets yet.
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-card py-16 text-center space-y-2">
      <p className="text-sm font-medium text-foreground">No game today</p>
      {nextGame ? (
        <p className="text-sm text-muted-foreground">
          Next matchup:{' '}
          <span className="font-medium text-foreground">
            {nextGame.player_a_name} vs {nextGame.player_b_name}
          </span>
          {' '}on{' '}
          <span className="font-medium text-foreground">
            {new Date(nextGame.game_date + 'T12:00:00').toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}
          </span>
        </p>
      ) : (
        <p className="text-sm text-muted-foreground">Check back on the next game day.</p>
      )}
    </div>
  );
}

export default function H2HLobbyPage() {
  const [tab, setTab] = useState<MarketStatus | 'all'>('open');
  const { markets, loading } = useH2HMarkets(tab === 'all' ? undefined : tab);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Head-to-Head</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Top player vs top player. Pick a side — highest fantasy points wins.
        </p>
      </div>

      <div className="flex items-center gap-2 overflow-x-auto">
        {TABS.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all whitespace-nowrap ${
              tab === key
                ? 'bg-primary/10 text-primary ring-1 ring-primary/25'
                : 'text-muted-foreground hover:text-foreground hover:bg-secondary'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="h-40 rounded-xl border border-border bg-card animate-pulse" />
          ))}
        </div>
      ) : markets.length === 0 ? (
        <NoMarketsCard tab={tab} />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {markets.map((m) => (
            <MarketCard key={m.id} market={m} />
          ))}
        </div>
      )}
    </div>
  );
}
