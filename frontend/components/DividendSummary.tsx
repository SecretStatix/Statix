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
      <div className="bg-gray-800 rounded-xl p-8 text-center">
        <p className="text-gray-400">Connect your wallet to view your dividends</p>
      </div>
    );
  }

  const unclaimed = unclaimedData
    ? parseFloat(formatUnits((unclaimedData as [bigint, bigint])[0], 6))
    : 0;
  const weekCount = unclaimedData ? Number((unclaimedData as [bigint, bigint])[1]) : 0;
  const currentWeek = currentWeekData ? Number(currentWeekData) : 1;

  const handleClaimAll = () => {
    // Build array of all weeks up to currentWeek — the contract skips
    // weeks that are already claimed or have no dividend
    const weeks = Array.from({ length: currentWeek }, (_, i) => i + 1);
    claimAll(weeks);
  };

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-gray-800 rounded-xl p-4">
          <p className="text-gray-400 text-sm">Unclaimed Dividends</p>
          <p className="text-2xl font-bold text-orange-400">${unclaimed.toFixed(2)}</p>
          <p className="text-xs text-gray-500 mt-1">{weekCount} week{weekCount !== 1 ? 's' : ''} unclaimed (current: week {currentWeek})</p>
        </div>
        <div className="bg-gray-800 rounded-xl p-4 flex items-center justify-center">
          {unclaimed > 0 ? (
            <button
              onClick={handleClaimAll}
              disabled={claiming}
              className="bg-orange-500 hover:bg-orange-600 disabled:bg-gray-600 px-6 py-3 rounded-lg font-semibold transition"
            >
              {claiming ? 'Claiming...' : claimed ? 'Claimed!' : `Claim All (${weekCount} week${weekCount !== 1 ? 's' : ''})`}
            </button>
          ) : (
            <p className="text-gray-400">No dividends to claim yet</p>
          )}
        </div>
      </div>

      {/* Info Box */}
      <div className="bg-gray-800 rounded-xl p-4">
        <h4 className="font-semibold mb-2">How Dividends Work</h4>
        <ul className="text-sm text-gray-400 space-y-1">
          <li>- <span className="text-white">1.5% fee</span> on every trade goes to the dividend pool</li>
          <li>- <span className="text-white">20% Base Dividend:</span> Distributed to ALL shareholders proportionally</li>
          <li>- <span className="text-white">80% Outperformer Dividend:</span> Distributed to holders of players who beat their projections</li>
          <li>- Dividends are calculated weekly based on real NBA fantasy performance</li>
          <li>- Claim your dividends on-chain after each week is finalized</li>
        </ul>
      </div>
    </div>
  );
}
