'use client';

import { useAccount } from 'wagmi';
import { useState, useEffect } from 'react';
import { formatUnits } from 'viem';
import { useUnclaimedDividends, useClaimMultipleWeeks, useCurrentWeek, usePortfolio } from '@/hooks/useContracts';

type ClaimRow = { round: number; amount: string; tx_hash: string | null; claimed_at: string };
type ClaimHistory = { total_earned: number; rounds_claimed: number; claims: ClaimRow[] };

export function DividendSummary() {
  const { address, isConnected } = useAccount();
  const { data: unclaimedData } = useUnclaimedDividends(address);
  const { data: currentWeekData } = useCurrentWeek();
  const { claimAll, isPending: claiming, isSuccess: claimed } = useClaimMultipleWeeks();
  const { data: portfolioData } = usePortfolio(address);

  const [history, setHistory] = useState<ClaimHistory | null>(null);

  useEffect(() => {
    if (!address) return;
    const apiBase = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
    fetch(`${apiBase}/api/dividends/user/${address.toLowerCase()}`)
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data) setHistory(data); })
      .catch(() => {});
  }, [address, claimed]);

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
  const roundCount = unclaimedData ? Number((unclaimedData as [bigint, bigint])[1]) : 0;
  const currentRound = currentWeekData ? Number(currentWeekData) : 1;

  const handleClaimAll = () => {
    const rounds = Array.from({ length: currentRound }, (_, i) => i + 1);
    claimAll(rounds);
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
              {roundCount} round{roundCount !== 1 ? 's' : ''} pending
            </p>
          </div>
          <div className="flex-1 sm:px-10">
            <p className="text-xs font-medium text-muted-foreground">Current round</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums text-foreground">Round {currentRound}</p>
          </div>
          <div className="flex-1 sm:pl-10">
            <p className="text-xs font-medium text-muted-foreground">Active positions</p>
            <p className="mt-1 text-2xl font-semibold text-foreground">
              {(() => {
                if (!portfolioData) return '—';
                const [, sharesArr] = portfolioData as [bigint[], bigint[], bigint[]];
                let n = 0;
                for (let i = 0; i < sharesArr.length; i++) {
                  if (sharesArr[i] > BigInt(0)) n++;
                }
                return n;
              })()}
            </p>
            <p className="mt-1 text-[11px] text-muted-foreground/80">Players with shares</p>
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
            {claiming ? 'Claiming...' : claimed ? 'Claimed!' : `Claim all (${roundCount} round${roundCount !== 1 ? 's' : ''})`}
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
            <span className="font-medium text-foreground">80% top performer pool</span> — extra for holdings in the top 10
            fantasy point scorers each period.
          </p>
          <p className="text-xs text-muted-foreground/90 pt-1">
            Trading fees (2% on each trade; 67% to the dividend pool) fund distributions. Claims settle on-chain via
            DividendHub.
          </p>
        </div>
      </div>

      {/* Claim history */}
      <div className="relative border-t border-white/[0.06] px-5 py-6 sm:px-8 sm:py-7">
        <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-muted-foreground/80">Claim history</p>
        {!history || history.claims.length === 0 ? (
          <p className="mt-4 text-sm text-muted-foreground">No claims yet — distributions appear here after each round.</p>
        ) : (
          <>
            <div className="mt-1 mb-4 flex gap-6 text-xs text-muted-foreground">
              <span>Total earned: <span className="font-semibold text-success">${history.total_earned.toFixed(2)}</span></span>
              <span>Rounds claimed: <span className="font-semibold text-foreground">{history.rounds_claimed}</span></span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/[0.06] text-left text-[11px] font-medium uppercase tracking-wider text-muted-foreground/70">
                    <th className="pb-2 pr-6">Round</th>
                    <th className="pb-2 pr-6 text-right">Amount</th>
                    <th className="pb-2 text-right">Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.04]">
                  {history.claims.map((c) => (
                    <tr key={c.round} className="hover:bg-white/[0.02] transition-colors">
                      <td className="py-3 pr-6 font-medium text-foreground">Round {c.round}</td>
                      <td className="py-3 pr-6 text-right font-semibold tabular-nums text-success">
                        +${parseFloat(c.amount).toFixed(2)}
                      </td>
                      <td className="py-3 text-right tabular-nums text-muted-foreground text-xs">
                        {new Date(c.claimed_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
