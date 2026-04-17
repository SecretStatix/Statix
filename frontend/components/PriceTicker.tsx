'use client';

import Link from 'next/link';
import { TrendingUp, TrendingDown } from 'lucide-react';
import { PlayerData } from './PlayerGrid';

interface PriceTickerProps {
  players: PlayerData[];
  loading: boolean;
}

export function PriceTicker({ players, loading }: PriceTickerProps) {
  if (loading || players.length === 0) return null;

  const top = [...players]
    .map((p) => ({ ...p, pct: ((p.price - 10) / 10) * 100 }))
    .sort((a, b) => Math.abs(b.pct) - Math.abs(a.pct))
    .slice(0, 20);

  // Triple the content so the -33.333% keyframe translation loops seamlessly.
  const loop = [...top, ...top, ...top];

  return (
    <div className="ticker-mask relative overflow-hidden h-10">
      <div className="ticker-track flex items-center h-full whitespace-nowrap will-change-transform">
        {loop.map((p, i) => {
          const up = p.pct >= 0;
          return (
            <Link
              key={`${p.id}-${i}`}
              href={`/player/${p.id}`}
              className="inline-flex items-center gap-2 px-5 text-sm h-full hover:bg-white/[0.03] transition-colors"
            >
              <span className="font-semibold text-foreground">{p.name}</span>
              <span className="font-mono text-xs text-muted-foreground">${p.price.toFixed(2)}</span>
              <span
                className={`inline-flex items-center gap-0.5 text-xs font-semibold ${
                  up ? 'text-success' : 'text-destructive'
                }`}
              >
                {up ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                {up ? '+' : ''}
                {p.pct.toFixed(1)}%
              </span>
              <span className="text-white/10 pl-2">|</span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
