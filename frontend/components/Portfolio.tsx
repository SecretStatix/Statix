'use client';

import { useMemo } from 'react';
import { useAccount } from 'wagmi';
import { formatUnits } from 'viem';
import { usePortfolio, useDBucksBalance, useFaucetDBucks } from '@/hooks/useContracts';
import { PlayerAvatar } from './PlayerAvatar';
import { PortfolioCharts, type AllocationSlice } from './portfolio/PortfolioCharts';

const PLAYER_INFO: Record<number, { name: string; team: string; nbaId: number }> = {
  0:  { name: 'Shai Gilgeous-Alexander', team: 'OKC', nbaId: 1628983 },
  1:  { name: 'Giannis Antetokounmpo',   team: 'MIL', nbaId: 203507 },
  2:  { name: 'Nikola Jokic',             team: 'DEN', nbaId: 203999 },
  3:  { name: 'Luka Doncic',              team: 'LAL', nbaId: 1629029 },
  4:  { name: 'Jayson Tatum',             team: 'BOS', nbaId: 1628369 },
  5:  { name: 'Anthony Davis',            team: 'LAL', nbaId: 203076 },
  6:  { name: 'Kevin Durant',             team: 'PHX', nbaId: 201142 },
  7:  { name: 'Anthony Edwards',          team: 'MIN', nbaId: 1630162 },
  8:  { name: 'Tyrese Haliburton',        team: 'IND', nbaId: 1630169 },
  9:  { name: 'Victor Wembanyama',        team: 'SAS', nbaId: 1641705 },
  10: { name: 'Devin Booker',             team: 'PHX', nbaId: 1626164 },
  11: { name: 'LaMelo Ball',              team: 'CHA', nbaId: 1630163 },
  12: { name: 'Ja Morant',                team: 'MEM', nbaId: 1629630 },
  13: { name: 'Joel Embiid',              team: 'PHI', nbaId: 203954 },
  14: { name: 'Donovan Mitchell',         team: 'CLE', nbaId: 1628378 },
};

type HoldingRow = {
  index: number;
  shares: number;
  value: number;
  name: string;
  team: string;
  nbaId: number;
};

export function Portfolio() {
  const { address, isConnected } = useAccount();
  const { data: portfolioData, isLoading } = usePortfolio(address);
  const { data: dbucksBalance } = useDBucksBalance(address);
  const { faucet, isPending: minting, isSuccess: minted } = useFaucetDBucks();

  const { balance, holdings, holdingsValue } = useMemo(() => {
    const bal = dbucksBalance ? parseFloat(formatUnits(dbucksBalance as bigint, 6)) : 0;
    const rows: HoldingRow[] = [];
    let hv = 0;
    if (portfolioData) {
      const [idxs, sharesArr, valuesArr] = portfolioData as [bigint[], bigint[], bigint[]];
      idxs.forEach((idx, i) => {
        const shares = parseFloat(formatUnits(sharesArr[i], 6));
        const value = parseFloat(formatUnits(valuesArr[i], 6));
        hv += value;
        const info = PLAYER_INFO[Number(idx)] || { name: `Player #${Number(idx)}`, team: '???', nbaId: 0 };
        rows.push({ index: Number(idx), shares, value, name: info.name, team: info.team, nbaId: info.nbaId });
      });
    }
    return { balance: bal, holdings: rows, holdingsValue: hv };
  }, [portfolioData, dbucksBalance]);

  const totalValue = balance + holdingsValue;
  const loading = isLoading;

  const allocation: AllocationSlice[] = useMemo(() => {
    if (totalValue <= 0) return [];
    const rows: AllocationSlice[] = [];
    if (balance > 0) {
      rows.push({ name: 'Cash (D-Bucks)', value: balance, pct: (balance / totalValue) * 100 });
    }
    holdings.forEach((h) => {
      rows.push({ name: h.name, value: h.value, pct: (h.value / totalValue) * 100 });
    });
    return rows.sort((a, b) => b.value - a.value);
  }, [balance, holdings, totalValue]);

  if (!isConnected) {
    return (
      <div className="rounded-2xl border border-white/[0.06] bg-gradient-to-b from-white/[0.012] to-transparent px-6 py-12 text-center">
        <p className="text-sm text-muted-foreground">Connect your wallet to view your portfolio</p>
      </div>
    );
  }

  return (
    <div className="relative overflow-hidden rounded-3xl border border-white/[0.06] bg-gradient-to-b from-white/[0.02] to-transparent">
      <div className="pointer-events-none absolute -right-28 -top-28 h-[22rem] w-[22rem] rounded-full bg-primary/[0.045] blur-[120px]" />

      <div className="relative px-5 py-6 sm:px-8 sm:py-8">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-muted-foreground/80">
              Net portfolio value
            </p>
            <p className="mt-2 text-4xl font-semibold tracking-tight tabular-nums text-foreground sm:text-5xl">
              ${totalValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </p>
          </div>
          <button
            type="button"
            onClick={() => faucet(10000)}
            disabled={minting}
            className="inline-flex h-11 shrink-0 items-center justify-center rounded-full bg-primary px-6 text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/20 transition hover:bg-primary-600 disabled:opacity-50"
          >
            {minting ? 'Minting...' : minted ? 'Got it!' : 'Get 10k D-Bucks'}
          </button>
        </div>

        <div className="mt-8 flex flex-col gap-6 border-t border-white/[0.06] pt-8 sm:flex-row sm:divide-x sm:divide-white/[0.06] sm:gap-0">
          <div className="flex-1 sm:pr-8">
            <p className="text-xs font-medium text-muted-foreground">Cash</p>
            <p className="mt-1 text-xl font-semibold tabular-nums text-foreground">
              ${balance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </p>
          </div>
          <div className="flex-1 sm:px-8">
            <p className="text-xs font-medium text-muted-foreground">In positions</p>
            <p className="mt-1 text-xl font-semibold tabular-nums text-foreground">
              ${holdingsValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </p>
          </div>
          <div className="flex-1 sm:pl-8">
            <p className="text-xs font-medium text-muted-foreground">Open positions</p>
            <p className="mt-1 text-xl font-semibold tabular-nums text-foreground">{holdings.length}</p>
          </div>
        </div>
      </div>

      <div className="relative border-t border-white/[0.06]">
        <PortfolioCharts totalValue={totalValue} seedKey={address ?? '0x'} allocation={allocation} />
      </div>

      <section className="relative border-t border-white/[0.06] px-5 py-6 sm:px-8 sm:py-7">
        <h2 className="text-[11px] font-medium uppercase tracking-[0.2em] text-muted-foreground/80">Holdings</h2>
        {loading ? (
          <p className="mt-6 text-sm text-muted-foreground">Loading positions…</p>
        ) : holdings.length === 0 ? (
          <p className="mt-6 text-sm text-muted-foreground">No holdings yet — buy some player shares.</p>
        ) : (
          <>
            <div className="mt-5 grid grid-cols-12 gap-3 border-b border-white/[0.06] pb-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground/70">
              <div className="col-span-6 sm:col-span-5">Player</div>
              <div className="col-span-2 text-right tabular-nums">Shares</div>
              <div className="col-span-2 hidden text-right tabular-nums sm:block">Avg</div>
              <div className="col-span-4 text-right tabular-nums sm:col-span-3">Value</div>
            </div>
            <ul className="divide-y divide-white/[0.05]">
              {holdings.map((h) => (
                <li key={h.index}>
                  <div className="grid grid-cols-12 gap-3 py-4 transition-colors hover:bg-white/[0.02] -mx-2 px-2 rounded-lg">
                    <div className="col-span-6 flex min-w-0 items-center gap-3 sm:col-span-5">
                      <PlayerAvatar name={h.name} nbaId={h.nbaId} size="sm" />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-foreground">{h.name}</p>
                        <p className="text-xs text-muted-foreground">{h.team}</p>
                      </div>
                    </div>
                    <div className="col-span-2 text-right">
                      <span className="text-sm tabular-nums text-foreground">{h.shares.toFixed(2)}</span>
                    </div>
                    <div className="col-span-2 hidden text-right sm:block">
                      <span className="text-sm tabular-nums text-muted-foreground">
                        ${(h.value / h.shares).toFixed(2)}
                      </span>
                    </div>
                    <div className="col-span-4 text-right sm:col-span-3">
                      <span className="text-sm font-semibold tabular-nums text-foreground">${h.value.toFixed(2)}</span>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      <div className="relative flex flex-col gap-1 border-t border-white/[0.06] px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-8">
        <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground/70">Wallet</span>
        <p className="font-mono text-xs text-muted-foreground break-all text-right sm:max-w-[72%]">{address}</p>
      </div>
    </div>
  );
}
