'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import { useH2HMarket } from '@/hooks/h2h/useH2HMarket';
import { OddsBar } from '@/components/h2h/OddsBar';
import { OddsChart } from '@/components/h2h/OddsChart';
import { H2HTradeModal } from '@/components/h2h/H2HTradeModal';
import { ResolvedBanner } from '@/components/h2h/ResolvedBanner';

export default function MarketDetailPage() {
  const params = useParams();
  const id = params?.marketId ? parseInt(params.marketId as string, 10) : null;
  const { market, live, loading } = useH2HMarket(id);
  const [modalSide, setModalSide] = useState<'A' | 'B' | null>(null);

  if (loading || !market) {
    return <div className="h-64 animate-pulse rounded-xl border border-border bg-card" />;
  }

  return (
    <div className="space-y-6">
      <ResolvedBanner market={market} />

      <div className="rounded-xl border border-border bg-card p-6">
        <div className="mb-6 grid grid-cols-2 gap-4">
          <div>
            <div className="text-xs uppercase tracking-wide text-muted-foreground">Player A</div>
            <div className="text-xl font-bold text-foreground">{market.player_a.name}</div>
            <div className="text-sm text-muted-foreground">{market.player_a.team}</div>
            {live?.player_a_fp != null && (
              <div className="mt-2 text-sm font-mono text-success">{live.player_a_fp.toFixed(1)} FP</div>
            )}
          </div>
          <div className="text-right">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">Player B</div>
            <div className="text-xl font-bold text-foreground">{market.player_b.name}</div>
            <div className="text-sm text-muted-foreground">{market.player_b.team}</div>
            {live?.player_b_fp != null && (
              <div className="mt-2 text-sm font-mono text-success">{live.player_b_fp.toFixed(1)} FP</div>
            )}
          </div>
        </div>

        <OddsBar probA={market.implied_prob_a} />

        {market.status === 'open' && (
          <div className="mt-6 grid grid-cols-2 gap-3">
            <button
              onClick={() => setModalSide('A')}
              className="h-11 rounded-md bg-[#0a7a52] text-sm font-semibold text-white hover:bg-[#0e9966]"
            >
              Buy {market.player_a.name}
            </button>
            <button
              onClick={() => setModalSide('B')}
              className="h-11 rounded-md bg-[#cc3333] text-sm font-semibold text-white hover:bg-[#e04040]"
            >
              Buy {market.player_b.name}
            </button>
          </div>
        )}
      </div>

      <OddsChart marketId={market.id} />

      {modalSide && (
        <H2HTradeModal
          market={market}
          side={modalSide}
          isOpen={modalSide !== null}
          onClose={() => setModalSide(null)}
        />
      )}
    </div>
  );
}
