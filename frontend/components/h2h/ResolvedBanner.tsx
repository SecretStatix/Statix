'use client';

import type { MarketDetail } from '@/lib/h2h-api';

interface ResolvedBannerProps {
  market: MarketDetail;
}

export function ResolvedBanner({ market }: ResolvedBannerProps) {
  if (market.status !== 'resolved' && market.status !== 'voided') return null;

  if (market.winner === 'void') {
    return (
      <div className="rounded-lg border border-yellow-500/30 bg-yellow-500/10 px-4 py-3 text-sm text-yellow-200">
        Voided — all positions refunded.
      </div>
    );
  }

  const winnerName =
    market.winner === 'A' ? market.player_a.name : market.winner === 'B' ? market.player_b.name : 'Tie';

  return (
    <div className="rounded-lg border border-success/30 bg-success/10 px-4 py-3 text-sm">
      <span className="font-semibold text-success">{winnerName}</span>
      <span className="ml-2 text-muted-foreground">
        — {market.player_a_final_fp?.toFixed(1)} FP vs {market.player_b_final_fp?.toFixed(1)} FP
      </span>
    </div>
  );
}
