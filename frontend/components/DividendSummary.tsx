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
    <div className="bg-card rounded-2xl border border-white/[0.06] p-8 card-hover">
      <h3 className="font-semibold text-foreground mb-4">Dividends</h3>

      <div className="grid grid-cols-2 gap-3">
        <div className="bg-success/10 rounded-lg p-3 border border-success/30">
          <p className="text-xs text-success">Unclaimed</p>
          <p className="text-lg font-semibold text-success mt-0.5">${unclaimed.toFixed(2)}</p>
          <p className="text-[10px] text-muted-foreground mt-0.5">{weekCount} week{weekCount !== 1 ? 's' : ''}</p>
        </div>
        <div className="bg-secondary/50 rounded-lg p-3 border border-border">
          <p className="text-xs text-muted-foreground">Current Week</p>
          <p className="text-lg font-semibold text-foreground mt-0.5">Week {currentWeek}</p>
        </div>
      </div>

      {unclaimed > 0 ? (
        <button
          onClick={handleClaimAll}
          disabled={claiming}
          className="w-full mt-4 h-12 rounded-xl text-base font-semibold bg-primary text-primary-foreground hover:bg-primary-600 transition-all duration-200 disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-card"
        >
          {claiming ? 'Claiming...' : claimed ? 'Claimed!' : `Claim All (${weekCount} week${weekCount !== 1 ? 's' : ''})`}
        </button>
      ) : (
        <p className="text-xs text-muted-foreground text-center mt-4">No dividends to claim yet</p>
      )}

      <p className="text-[11px] text-muted-foreground mt-3 leading-relaxed">
        Earn dividends when your players beat their fantasy projections. 20% base + 80% outperformer bonus.
      </p>
    </div>
  );
}
