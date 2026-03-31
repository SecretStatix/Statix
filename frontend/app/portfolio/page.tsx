'use client';

import { useAccount } from 'wagmi';
import { Portfolio } from '@/components/Portfolio';

export default function PortfolioPage() {
  const { isConnected } = useAccount();

  return (
    <div className="space-y-8">
      <h1 className="text-3xl font-bold">Your Portfolio</h1>
      {isConnected ? (
        <Portfolio />
      ) : (
        <div className="bg-card rounded-xl p-8 text-center">
          <p className="text-muted-foreground">Connect your wallet to view your portfolio.</p>
        </div>
      )}
    </div>
  );
}
