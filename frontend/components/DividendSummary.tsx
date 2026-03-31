'use client';

import { useAccount } from 'wagmi';
import { formatUnits } from 'viem';
import { useUnclaimedDividends, useClaimMultipleWeeks, useCurrentWeek } from '@/hooks/useContracts';

export function DividendSummary() {
  const { address, isConnected } = useAccount();
  const { data: unclaimedData } = useUnclaimedDividends(address);
  const { data: currentWeekData } = useCurrentWeek();
  const { claimAll, isPending: claiming, isSuccess: claimed } = useClaimMultipleWeeks();

  if (!isConnected) {
    return (
      <div className="bg-card rounded-xl border border-border p-6 text-center">
        <p className="text-sm text-muted-foreground">Connect your wallet to view dividends</p>
      </div>
    );
  }

  const unclaimed = unclaimedData
    ? parseFloat(formatUnits((unclaimedData as [bigint, bigint])[0], 6))
    : 0;
  const weekCount = unclaimedData ? Number((unclaimedData as [bigint, bigint])[1]) : 0;
  const currentWeek = currentWeekData ? Number(currentWeekData) : 1;

  const handleClaimAll = () => {
    const weeks = Array.from({ length: currentWeek }, (_, i) => i + 1);
    claimAll(weeks);
  };

  return (
    <div className="space-y-6">
      {/* Summary card */}
      <div className="bg-card rounded-2xl border border-white/[0.06] p-6 card-hover">
        <div className="flex items-center justify-between mb-5">
          <h3 className="font-semibold text-foreground">Dividend Summary</h3>
        </div>

        <div className="grid grid-cols-3 gap-3 mb-5">
          <div className="bg-success/10 rounded-xl p-4 border border-success/20">
            <p className="text-xs text-success">Unclaimed Dividends</p>
            <p className="text-2xl font-bold text-success mt-1">${unclaimed.toFixed(2)}</p>
            <p className="text-xs text-muted-foreground mt-1">{weekCount} week{weekCount !== 1 ? 's' : ''}</p>
          </div>
          <div className="rounded-xl p-4 bg-white/[0.03] border border-white/[0.04]">
            <p className="text-xs text-muted-foreground">Current Week</p>
            <p className="text-2xl font-bold text-foreground mt-1">Week {currentWeek}</p>
          </div>
          <div className="rounded-xl p-4 bg-white/[0.03] border border-white/[0.04]">
            <p className="text-xs text-muted-foreground">Active Positions</p>
            <p className="text-2xl font-bold text-foreground mt-1">—</p>
          </div>
        </div>

        {unclaimed > 0 ? (
          <button
            onClick={handleClaimAll}
            disabled={claiming}
            className="w-full h-12 rounded-xl text-base font-semibold bg-primary text-primary-foreground hover:bg-primary-600 transition-all duration-200 disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-card"
          >
            {claiming ? 'Claiming...' : claimed ? 'Claimed!' : `Claim All (${weekCount} week${weekCount !== 1 ? 's' : ''})`}
          </button>
        ) : (
          <p className="text-xs text-muted-foreground text-center">No dividends to claim yet</p>
        )}
      </div>

      {/* How it works */}
      <div className="bg-card rounded-2xl border border-white/[0.06] p-6 card-hover">
        <h3 className="font-semibold text-foreground mb-3">How Dividends Work</h3>
        <div className="space-y-2 text-sm text-muted-foreground leading-relaxed">
          <p><span className="text-foreground font-medium">20% Base Pool</span> — distributed to all shareholders proportionally.</p>
          <p><span className="text-foreground font-medium">80% Outperformer Pool</span> — bonus for holding players who beat their fantasy projections.</p>
          <p className="text-xs mt-3">Dividends are funded by 1.5% trading fees (67% goes to dividend pool). Claims are processed on-chain via DividendHub.</p>
        </div>
      </div>
    </div>
  );
}
