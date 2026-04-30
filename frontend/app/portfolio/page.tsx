'use client';

import { useAccount } from 'wagmi';
import { Portfolio } from '@/components/Portfolio';
import { AuthGate } from '@/components/AuthGate';

export default function PortfolioPage() {
  const { isConnected } = useAccount();

  return (
    <AuthGate>
    <div className="space-y-10 pb-12">
      <header className="space-y-1">
        <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-muted-foreground/70">Portfolio</p>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">Overview</h1>
        <p className="max-w-lg text-sm text-muted-foreground">
          Track allocation, positions, and cash in one place.
        </p>
      </header>

      {isConnected ? (
        <Portfolio />
      ) : (
        <div className="rounded-2xl border border-white/[0.06] bg-gradient-to-b from-white/[0.012] to-transparent px-6 py-16 text-center">
          <p className="text-sm text-muted-foreground">Connect your wallet to view your portfolio.</p>
        </div>
      )}
    </div>
    </AuthGate>
  );
}
