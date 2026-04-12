'use client';

import { useTradingPaused } from '@/hooks/useContracts';

export function TradingFreezeBanner() {
  const { data: paused } = useTradingPaused();

  if (!paused) return null;

  return (
    <div className="w-full bg-amber-500/10 border-b border-amber-500/20 px-4 py-2.5 text-center">
      <p className="text-sm font-medium text-amber-400">
        Trading is currently paused between playoff rounds. Dividends from the last round are being distributed.
      </p>
    </div>
  );
}
