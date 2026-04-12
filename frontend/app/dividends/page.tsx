'use client';

import { useAccount } from 'wagmi';
import { DividendSummary } from '@/components/DividendSummary';

export default function DividendsPage() {
  const { isConnected } = useAccount();

  return (
    <div className="space-y-10 pb-12">
      <header className="space-y-1">
        <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-muted-foreground/70">Dividends</p>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">Playoff distributions</h1>
        <p className="max-w-lg text-sm text-muted-foreground">
          Claim your share of fee-funded pools each playoff round — base allocation plus top performer bonuses.
        </p>
      </header>

      {isConnected ? (
        <DividendSummary />
      ) : (
        <div className="rounded-2xl border border-white/[0.06] bg-gradient-to-b from-white/[0.012] to-transparent px-6 py-16 text-center">
          <p className="text-sm text-muted-foreground">Connect your wallet to view your dividends.</p>
        </div>
      )}
    </div>
  );
}
