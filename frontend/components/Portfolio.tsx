'use client';

import { useAccount } from 'wagmi';
import { formatUnits } from 'viem';
import { usePortfolio, useDBucksBalance, useFaucetDBucks } from '@/hooks/useContracts';

export function Portfolio() {
  const { address, isConnected } = useAccount();
  const { data: portfolioData, isLoading } = usePortfolio(address);
  const { data: dbucksBalance } = useDBucksBalance(address);
  const { faucet, isPending: minting, isSuccess: minted } = useFaucetDBucks();

  if (!isConnected) {
    return (
      <div className="bg-card rounded-xl border border-border p-6 text-center">
        <p className="text-sm text-muted-foreground">Connect your wallet to view your portfolio</p>
      </div>
    );
  }

  const balance = dbucksBalance ? parseFloat(formatUnits(dbucksBalance as bigint, 6)) : 0;

  let holdings: { index: number; shares: number; value: number }[] = [];
  let holdingsValue = 0;

  if (portfolioData) {
    const [idxs, sharesArr, valuesArr] = portfolioData as [bigint[], bigint[], bigint[]];
    holdings = idxs.map((idx, i) => {
      const shares = parseFloat(formatUnits(sharesArr[i], 6));
      const value = parseFloat(formatUnits(valuesArr[i], 6));
      holdingsValue += value;
      return { index: Number(idx), shares, value };
    });
  }

  const totalValue = balance + holdingsValue;

  return (
    <div className="bg-card rounded-2xl border border-white/[0.06] p-8 card-hover">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-foreground">Portfolio</h3>
        <button
          onClick={() => faucet(10000)}
          disabled={minting}
          className="h-11 px-5 rounded-xl bg-primary text-primary-foreground font-semibold hover:bg-primary-600 transition-all duration-200 disabled:opacity-50"
        >
          {minting ? 'Minting...' : minted ? 'Got it!' : 'Get 10k D-Bucks'}
        </button>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-xl p-4 bg-white/[0.03]">
          <p className="text-xs text-gray-400">Total Value</p>
          <p className="text-lg font-semibold text-foreground mt-0.5">${totalValue.toFixed(2)}</p>
        </div>
        <div className="rounded-xl p-4 bg-white/[0.03]">
          <p className="text-xs text-gray-400">Holdings</p>
          <p className="text-lg font-semibold text-foreground mt-0.5">${holdingsValue.toFixed(2)}</p>
        </div>
        <div className="rounded-xl p-4 bg-white/[0.03]">
          <p className="text-xs text-gray-400">Balance</p>
          <p className="text-lg font-semibold text-foreground mt-0.5">${balance.toFixed(2)}</p>
        </div>
      </div>

      {isLoading ? (
        <p className="text-xs text-muted-foreground text-center py-3">Loading...</p>
      ) : holdings.length === 0 ? (
        <p className="text-xs text-muted-foreground text-center py-3">No holdings yet — buy some player shares!</p>
      ) : (
        <div className="mt-3 space-y-1">
          {holdings.map((h) => (
            <div key={h.index} className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-secondary/30 transition">
              <span className="text-sm text-foreground">Player #{h.index}</span>
              <div className="flex items-center gap-3">
                <span className="text-xs text-muted-foreground">{h.shares.toFixed(2)} shares</span>
                <span className="text-sm font-semibold text-foreground">${h.value.toFixed(2)}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
