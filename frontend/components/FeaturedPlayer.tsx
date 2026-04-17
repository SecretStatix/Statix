'use client';

import { useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { TrendingUp } from 'lucide-react';
import { PlayerData } from './PlayerGrid';
import { PlayerAvatar } from './PlayerAvatar';
import { TradeModal } from './TradeModal';

const FeaturedPlayerChart = dynamic(() => import('./FeaturedPlayerChart'), {
  ssr: false,
  loading: () => <div className="w-full h-full bg-secondary/30 rounded animate-pulse" />,
});

interface FeaturedPlayerProps {
  players: PlayerData[];
  loading: boolean;
}

export function FeaturedPlayer({ players, loading }: FeaturedPlayerProps) {
  const [tradeModalOpen, setTradeModalOpen] = useState(false);
  const [tradeMode, setTradeMode] = useState<'buy' | 'sell'>('buy');

  const featured = useMemo(() => {
    if (players.length === 0) return null;
    return [...players].sort((a, b) => b.price - a.price)[0];
  }, [players]);

  const chartData = useMemo(() => {
    if (!featured) return [];
    // Generate synthetic recent price movement
    const points = 20;
    const data: { value: number }[] = [];
    let price = featured.price * 0.92;
    let seed = 42;
    const rnd = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
    for (let i = 0; i < points; i++) {
      const drift = (featured.price - price) * 0.08 + (rnd() - 0.48) * 0.15;
      price = Math.max(featured.price * 0.85, Math.min(featured.price * 1.05, price + drift));
      data.push({ value: Math.round(price * 100) / 100 });
    }
    data.push({ value: featured.price });
    return data;
  }, [featured]);

  if (loading) {
    return (
      <div className="bg-card border border-white/[0.06] rounded-xl p-6 animate-pulse">
        <div className="flex flex-col md:flex-row items-start md:items-center gap-6">
          <div className="flex items-center gap-4 flex-1">
            <div className="w-14 h-14 rounded-xl bg-secondary/70" />
            <div className="space-y-2">
              <div className="h-5 w-40 bg-secondary/70 rounded" />
              <div className="h-4 w-24 bg-secondary/70 rounded" />
            </div>
          </div>
          <div className="w-full md:w-64 h-16 bg-secondary/70 rounded" />
          <div className="flex gap-2">
            <div className="h-9 w-20 bg-secondary/70 rounded-lg" />
            <div className="h-9 w-20 bg-secondary/70 rounded-lg" />
          </div>
        </div>
      </div>
    );
  }

  if (!featured) return null;

  const pctChange = ((featured.price - 10) / 10) * 100;
  const isPositive = pctChange >= 0;
  return (
    <>
      <div className="bg-gradient-to-r from-primary/[0.08] via-card to-success/[0.06] border border-white/[0.10] rounded-xl p-5 hover:border-primary/25 transition-all duration-200">
        <div className="flex flex-col md:flex-row items-start md:items-center gap-5">
          {/* Player info */}
          <Link href={`/player/${featured.id}`} className="flex items-center gap-4 flex-1 min-w-0 group">
            <PlayerAvatar name={featured.name} nbaId={featured.nbaId} size="lg" />
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-primary" />
                <span className="text-xs text-primary font-medium uppercase tracking-wider">Featured</span>
              </div>
              <h3 className="text-lg font-bold text-foreground truncate group-hover:text-primary transition-colors">
                {featured.name}
              </h3>
              <p className="text-sm text-muted-foreground">{featured.team} · {featured.position}</p>
            </div>
          </Link>

          {/* Mini chart — recharts is lazy-loaded so it stays out of the main landing bundle */}
          <div className="w-full md:w-52 h-14 shrink-0">
            <FeaturedPlayerChart data={chartData} isPositive={isPositive} />
          </div>

          {/* Price + actions */}
          <div className="flex items-center gap-4 shrink-0">
            <div className="text-right">
              <p className="text-2xl font-bold text-foreground">${featured.price.toFixed(2)}</p>
              <span className={`text-xs font-semibold ${isPositive ? 'text-success' : 'text-destructive'}`}>
                {isPositive ? '+' : ''}{pctChange.toFixed(1)}%
              </span>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => { setTradeMode('buy'); setTradeModalOpen(true); }}
                className="h-9 px-4 rounded-lg text-sm font-semibold bg-success text-black hover:bg-success/90 transition-colors"
              >
                Buy
              </button>
              <button
                onClick={() => { setTradeMode('sell'); setTradeModalOpen(true); }}
                className="h-9 px-4 rounded-lg text-sm font-semibold bg-secondary text-muted-foreground hover:text-foreground border border-white/[0.06] transition-colors"
              >
                Sell
              </button>
            </div>
          </div>
        </div>
      </div>

      {featured && (
        <TradeModal
          isOpen={tradeModalOpen}
          onClose={() => setTradeModalOpen(false)}
          player={featured}
          initialMode={tradeMode}
        />
      )}
    </>
  );
}
