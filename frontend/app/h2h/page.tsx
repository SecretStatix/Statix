'use client';

import { useState } from 'react';
import { useH2HMarkets } from '@/hooks/h2h/useH2HMarkets';
import { MarketCard } from '@/components/h2h/MarketCard';
import type { MarketStatus } from '@/lib/h2h-api';

const TABS: { key: MarketStatus | 'all'; label: string }[] = [
  { key: 'open', label: 'Live & Upcoming' },
  { key: 'resolved', label: 'Resolved' },
  { key: 'all', label: 'All' },
];

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
        <div className="rounded-xl border border-border bg-card py-16 text-center text-sm text-muted-foreground">
          No {tab === 'all' ? '' : tab} markets right now. Check back closer to tip-off.
        </div>
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
