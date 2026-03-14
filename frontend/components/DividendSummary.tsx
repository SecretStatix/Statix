'use client';

import { useAccount } from 'wagmi';
import { formatUnits } from 'viem';
import { useUnclaimedDividends, useClaimMultipleWeeks, useCurrentWeek } from '@/hooks/useContracts';
import { PREVIEW, PREVIEW_UNCLAIMED, PREVIEW_UNCLAIMED_WEEKS, PREVIEW_CURRENT_WEEK, PREVIEW_HOLDINGS } from '@/lib/preview';

export function DividendSummary() {
  const { address, isConnected } = useAccount();
  const { data: unclaimedData } = useUnclaimedDividends(PREVIEW ? undefined : address);
  const { data: currentWeekData } = useCurrentWeek();
  const { claimAll, isPending: claiming, isSuccess: claimed } = useClaimMultipleWeeks();

  if (!isConnected && !PREVIEW) {
    return (
      <div className="bg-card rounded-xl border border-border p-6 text-center">
        <p className="text-sm text-muted-foreground">Connect your wallet to view dividends</p>
      </div>
    );
  }

  // Use preview data or real data
  const unclaimed = PREVIEW
    ? PREVIEW_UNCLAIMED
    : unclaimedData
      ? parseFloat(formatUnits((unclaimedData as [bigint, bigint])[0], 6))
      : 0;
  const weekCount = PREVIEW
    ? PREVIEW_UNCLAIMED_WEEKS
    : unclaimedData ? Number((unclaimedData as [bigint, bigint])[1]) : 0;
  const currentWeek = PREVIEW
    ? PREVIEW_CURRENT_WEEK
    : currentWeekData ? Number(currentWeekData) : 1;

  const handleClaimAll = () => {
    if (PREVIEW) return; // no-op in preview
    const weeks = Array.from({ length: currentWeek }, (_, i) => i + 1);
    claimAll(weeks);
  };

  // Per-week breakdown for preview
  const weekBreakdown = PREVIEW
    ? [
        { week: 1, earned: 523.40, status: 'unclaimed' as const },
        { week: 2, earned: 412.88, status: 'unclaimed' as const },
        { week: 3, earned: 298.28, status: 'unclaimed' as const },
      ]
    : [];

  return (
    <div className="space-y-6">
      {/* Summary card */}
      <div className="bg-card rounded-2xl border border-white/[0.06] p-6 card-hover">
        <div className="flex items-center justify-between mb-5">
          <h3 className="font-semibold text-foreground">Dividend Summary</h3>
          {PREVIEW && (
            <span className="text-xs text-primary bg-primary/10 px-3 py-1.5 rounded-lg font-medium">Preview Mode</span>
          )}
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
            <p className="text-2xl font-bold text-foreground mt-1">{PREVIEW ? PREVIEW_HOLDINGS.length : '—'}</p>
          </div>
        </div>

        {unclaimed > 0 ? (
          <button
            onClick={handleClaimAll}
            disabled={claiming || PREVIEW}
            className="w-full h-12 rounded-xl text-base font-semibold bg-primary text-primary-foreground hover:bg-primary-600 transition-all duration-200 disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-card"
          >
            {PREVIEW ? `Claim All $${unclaimed.toFixed(2)}` : claiming ? 'Claiming...' : claimed ? 'Claimed!' : `Claim All (${weekCount} week${weekCount !== 1 ? 's' : ''})`}
          </button>
        ) : (
          <p className="text-xs text-muted-foreground text-center">No dividends to claim yet</p>
        )}
      </div>

      {/* Week breakdown (preview only for now) */}
      {weekBreakdown.length > 0 && (
        <div className="bg-card rounded-2xl border border-white/[0.06] overflow-hidden card-hover">
          <div className="px-6 py-4 border-b border-white/[0.06]">
            <h3 className="font-semibold text-foreground">Weekly Breakdown</h3>
          </div>
          <div className="divide-y divide-white/[0.04]">
            <div className="grid grid-cols-12 gap-4 px-6 py-3 text-xs text-muted-foreground uppercase tracking-wider">
              <div className="col-span-3">Week</div>
              <div className="col-span-4 text-right">Earned</div>
              <div className="col-span-5 text-right">Status</div>
            </div>
            {weekBreakdown.map((w) => (
              <div key={w.week} className="grid grid-cols-12 gap-4 px-6 py-3.5 items-center hover:bg-white/[0.02] transition-colors">
                <div className="col-span-3">
                  <span className="text-sm font-medium text-foreground">Week {w.week}</span>
                </div>
                <div className="col-span-4 text-right">
                  <span className="text-sm font-semibold text-success">${w.earned.toFixed(2)}</span>
                </div>
                <div className="col-span-5 text-right">
                  <span className="text-xs bg-success/10 text-success px-2.5 py-1 rounded-full font-medium">
                    Ready to claim
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

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
