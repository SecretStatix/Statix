'use client';

import Link from 'next/link';
import type { MarketSummary } from '@/lib/h2h-api';
import { OddsBar } from './OddsBar';

interface MarketCardProps {
  market: MarketSummary;
}

export function MarketCard({ market }: MarketCardProps) {
  const tipOff = new Date(market.tip_off_at);
  const tipOffLabel = tipOff.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  });

  return (
    <Link
      href={`/h2h/${market.id}`}
      className="block rounded-xl border border-border bg-card p-4 shadow-sm transition-all duration-200 hover:-translate-y-1 hover:border-primary/40"
    >
      <div className="mb-3 flex items-center justify-between text-xs text-muted-foreground">
        <span>Tip-off · {tipOffLabel}</span>
        <span className="font-mono">${market.total_volume.toFixed(0)} vol</span>
      </div>

      <div className="mb-3 grid grid-cols-2 gap-2">
        <div>
          <div className="text-sm font-semibold text-foreground">{market.player_a.name}</div>
          <div className="text-xs text-muted-foreground">{market.player_a.team}</div>
        </div>
        <div className="text-right">
          <div className="text-sm font-semibold text-foreground">{market.player_b.name}</div>
          <div className="text-xs text-muted-foreground">{market.player_b.team}</div>
        </div>
      </div>

      <OddsBar probA={market.implied_prob_a} />
    </Link>
  );
}
