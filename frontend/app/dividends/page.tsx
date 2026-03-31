'use client';

import { useAccount } from 'wagmi';
import { DividendSummary } from '@/components/DividendSummary';

export default function DividendsPage() {
  const { isConnected } = useAccount();

  return (
    <div className="space-y-8">
      <h1 className="text-3xl font-bold">Dividends</h1>
      {isConnected ? (
        <DividendSummary />
      ) : (
        <div className="bg-card rounded-xl p-8 text-center">
          <p className="text-muted-foreground">Connect your wallet to view your dividends.</p>
        </div>
      )}
    </div>
  );
}
