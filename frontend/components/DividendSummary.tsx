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
      <div className="rounded-2xl border border-white/[0.06] bg-gradient-to-b from-white/[0.012] to-transparent px-6 py-12 text-center">
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
    <div className="relative overflow-hidden rounded-3xl border border-white/[0.06] bg-gradient-to-b from-white/[0.02] to-transparent">
      <div className="pointer-events-none absolute -right-28 -top-28 h-[22rem] w-[22rem] rounded-full bg-primary/[0.04] blur-[120px]" />

      <div className="relative border-b border-white/[0.06] px-5 py-6 sm:px-8 sm:py-7">
        <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-muted-foreground/80">At a glance</p>
        <div className="mt-6 flex flex-col gap-8 sm:flex-row sm:items-start sm:justify-between sm:gap-0 sm:divide-x sm:divide-white/[0.06]">
          <div className="flex-1 sm:pr-10">
            <p className="text-xs font-medium text-muted-foreground">Unclaimed dividends</p>
            <p className="mt-1 text-3xl font-semibold tabular-nums tracking-tight text-success">${unclaimed.toFixed(2)}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {weekCount} week{weekCount !== 1 ? 's' : ''} pending
            </p>
          </div>
          <div className="flex-1 sm:px-10">
            <p className="text-xs font-medium text-muted-foreground">Current week</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums text-foreground">Week {currentWeek}</p>
          </div>
          <div className="flex-1 sm:pl-10">
            <p className="text-xs font-medium text-muted-foreground">Active positions</p>
            <p className="mt-1 text-2xl font-semibold text-foreground">—</p>
            <p className="mt-1 text-[11px] text-muted-foreground/80">From portfolio</p>
          </div>
        </div>
      </div>

      <div className="relative border-b border-white/[0.06] px-5 py-6 sm:px-8">
        {unclaimed > 0 ? (
          <button
            type="button"
            onClick={handleClaimAll}
            disabled={claiming}
            className="w-full rounded-full bg-primary py-3.5 text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/15 transition hover:bg-primary-600 disabled:opacity-50"
          >
            {claiming ? 'Claiming...' : claimed ? 'Claimed!' : `Claim all (${weekCount} week${weekCount !== 1 ? 's' : ''})`}
          </button>
        ) : (
          <p className="text-center text-sm text-muted-foreground">No dividends to claim yet.</p>
        )}
      </div>

      <div className="relative px-5 py-6 sm:px-8 sm:py-7">
        <h3 className="text-[11px] font-medium uppercase tracking-[0.2em] text-muted-foreground/80">How dividends work</h3>
        <div className="mt-4 space-y-3 text-sm leading-relaxed text-muted-foreground">
          <p>
            <span className="font-medium text-foreground">20% base pool</span> — shared across all shareholders by stake.
          </p>
          <p>
            <span className="font-medium text-foreground">80% outperformer pool</span> — extra for holdings in players
            who beat projections.
          </p>
          <p className="text-xs text-muted-foreground/90 pt-1">
            Trading fees (1.5% on each trade; 67% to the dividend pool) fund distributions. Claims settle on-chain via
            DividendHub.
          </p>
        </div>
      </div>
    </div>
  );
}
