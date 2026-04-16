'use client';

// Trade modal for buying/selling A or B outcome tokens via FPMM.
// Populated in P3 — wiring wagmi writes against FixedProductMarketMaker.

import type { MarketDetail } from '@/lib/h2h-api';

interface H2HTradeModalProps {
  market: MarketDetail;
  side: 'A' | 'B';
  isOpen: boolean;
  onClose: () => void;
}

export function H2HTradeModal({ market, side, isOpen, onClose }: H2HTradeModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-xl border border-border bg-card p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">
            Buy {side === 'A' ? market.player_a.name : market.player_b.name}
          </h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            ×
          </button>
        </div>
        <p className="text-sm text-muted-foreground">Trading UI coming in P3.</p>
      </div>
    </div>
  );
}
