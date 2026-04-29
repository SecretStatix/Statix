'use client';

import { useState, useEffect, useMemo } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useAccount } from 'wagmi';
import { formatUnits } from 'viem';
import {
  usePortfolio,
  useDBucksBalance,
  useFaucetDBucks,
  useFaucetEligibility,
} from '@/hooks/useContracts';
import { getPlayers, getWalletTransactionHistory, type WalletTransactionRow } from '@/lib/api';
import { PlayerAvatar } from './PlayerAvatar';
import type { AllocationSlice } from './portfolio/PortfolioCharts';

// Lazy-load the recharts-heavy portfolio charts — keeps recharts out of the
// portfolio page's initial JS bundle until the client has mounted.
const PortfolioCharts = dynamic(
  () => import('./portfolio/PortfolioCharts').then((m) => m.PortfolioCharts),
  {
    ssr: false,
    loading: () => (
      <div className="h-72 bg-card border border-white/[0.06] rounded-xl animate-pulse" />
    ),
  }
);

type PlayerMeta = { id: string; name: string; team: string; nbaId: number };

type HoldingRow = {
  index: number;
  playerPageId: string;
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
  const { faucetMode, limit, minted: alreadyMinted } = useFaucetEligibility(address);

  // How much is actually left to claim (limit - already minted)
  const claimableRaw = (limit && alreadyMinted !== undefined)
    ? (limit as bigint) - (alreadyMinted as bigint)
    : 0n;
  const claimableHuman = parseFloat(formatUnits(claimableRaw > 0n ? claimableRaw : 0n, 6));
  const canMint = faucetMode === true && claimableHuman > 0;
  const capReached = faucetMode === true && claimableHuman <= 0;

  const [playerMap, setPlayerMap] = useState<Map<number, PlayerMeta>>(new Map());
  const [txRows, setTxRows] = useState<WalletTransactionRow[]>([]);
  const [txLoading, setTxLoading] = useState(true);
  const [txError, setTxError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const list = await getPlayers();
        if (cancelled) return;
        const m = new Map<number, PlayerMeta>();
        for (const p of list as {
          index: number;
          id: string;
          name: string;
          team: string;
          nba_id?: number;
        }[]) {
          m.set(p.index, {
            id: p.id,
            name: p.name,
            team: p.team || '',
            nbaId: p.nba_id ?? 0,
          });
        }
        setPlayerMap(m);
      } catch {
        if (!cancelled) setPlayerMap(new Map());
      }
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!address) return;
    let cancelled = false;
    setTxLoading(true);
    setTxError(null);
    (async () => {
      try {
        const rows = await getWalletTransactionHistory(address, 100);
        if (!cancelled) {
          setTxRows(Array.isArray(rows) ? rows : []);
        }
      } catch (e) {
        if (!cancelled) {
          setTxRows([]);
          setTxError(e instanceof Error ? e.message : 'Could not load trades');
        }
      } finally {
        if (!cancelled) setTxLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [address]);

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
        const n = Number(idx);
        const meta = playerMap.get(n) || {
          id: String(n),
          name: `Player #${n}`,
          team: '???',
          nbaId: 0,
        };
        rows.push({
          index: n,
          playerPageId: meta.id,
          shares,
          value,
          name: meta.name,
          team: meta.team,
          nbaId: meta.nbaId,
        });
      });
    }
    return { balance: bal, holdings: rows, holdingsValue: hv };
  }, [portfolioData, dbucksBalance, playerMap]);

  const totalValue = balance + holdingsValue;
  const loading = isLoading;

  const allocation: AllocationSlice[] = useMemo(() => {
    if (totalValue <= 0) return [];
    const rows: AllocationSlice[] = [];
    if (balance > 0) {
      rows.push({ name: 'Cash (Play Money)', value: balance, pct: (balance / totalValue) * 100 });
    }
    holdings.forEach((h) => {
      rows.push({
        name: h.name,
        value: h.value,
        pct: (h.value / totalValue) * 100,
        href: `/player/${encodeURIComponent(h.playerPageId)}`,
      });
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
          <div className="flex shrink-0 flex-col items-end gap-1">
            <button
              type="button"
              onClick={() => faucet(claimableHuman)}
              disabled={minting || !canMint}
              title={
                faucetMode === false
                  ? 'Faucet is disabled on-chain'
                  : !canMint
                    ? 'Per-wallet testnet faucet cap reached'
                    : undefined
              }
              className="inline-flex h-11 items-center justify-center rounded-full bg-primary px-6 text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/20 transition hover:bg-primary-600 disabled:opacity-50"
            >
              {minting
                ? 'Minting...'
                : minted
                  ? 'Got it!'
                  : `Get $${claimableHuman.toLocaleString()} play money`}
            </button>
            {capReached && (
              <p className="max-w-[14rem] text-right text-[11px] text-muted-foreground">
                Faucet cap reached for this wallet (on-chain limit).
              </p>
            )}
            {faucetMode === false && (
              <p className="max-w-[14rem] text-right text-[11px] text-muted-foreground">
                Faucet is disabled on-chain.
              </p>
            )}
          </div>
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
        <PortfolioCharts walletAddress={address} allocation={allocation} />
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
                  <Link
                    href={`/player/${encodeURIComponent(h.playerPageId)}`}
                    className="grid grid-cols-12 gap-3 py-4 transition-colors hover:bg-white/[0.02] -mx-2 px-2 rounded-lg cursor-pointer"
                  >
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
                        ${(h.shares > 0 ? h.value / h.shares : 0).toFixed(2)}
                      </span>
                    </div>
                    <div className="col-span-4 text-right sm:col-span-3">
                      <span className="text-sm font-semibold tabular-nums text-foreground">${h.value.toFixed(2)}</span>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      <section className="relative border-t border-white/[0.06] px-5 py-6 sm:px-8 sm:py-7">
        <h2 className="text-[11px] font-medium uppercase tracking-[0.2em] text-muted-foreground/80">
          Trade history
        </h2>
        <p className="mt-1 text-xs text-muted-foreground/80">
          Indexed buys and sells from the network (play money = USD).
        </p>
        {txLoading ? (
          <p className="mt-6 text-sm text-muted-foreground">Loading trades…</p>
        ) : txError ? (
          <p className="mt-6 text-sm text-destructive/90">{txError}</p>
        ) : txRows.length === 0 ? (
          <p className="mt-6 text-sm text-muted-foreground">No trades recorded for this wallet yet.</p>
        ) : (
          <div className="mt-5 overflow-x-auto -mx-2 sm:mx-0">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead>
                <tr className="border-b border-white/[0.06] text-[11px] font-medium uppercase tracking-wider text-muted-foreground/70">
                  <th className="pb-2 pr-3 font-medium">Player</th>
                  <th className="pb-2 pr-3 font-medium">Side</th>
                  <th className="pb-2 pr-3 text-right font-medium tabular-nums">USD</th>
                  <th className="pb-2 pr-3 text-right font-medium tabular-nums">Tokens</th>
                  <th className="pb-2 pr-8 text-right font-medium tabular-nums">Avg / token</th>
                  <th className="pb-2 pl-2 pr-3 font-medium">Date</th>
                  <th className="pb-2 font-medium">Time</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.05]">
                {txRows.map((tx) => {
                  const dt = new Date(tx.created_at);
                  const dateStr = Number.isNaN(dt.getTime())
                    ? '—'
                    : dt.toLocaleDateString(undefined, {
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric',
                      });
                  const timeStr = Number.isNaN(dt.getTime())
                    ? '—'
                    : dt.toLocaleTimeString(undefined, {
                        hour: '2-digit',
                        minute: '2-digit',
                        second: '2-digit',
                      });
                  const side = (tx.side || '').toLowerCase();
                  const avg =
                    tx.price_per_share != null && Number.isFinite(tx.price_per_share)
                      ? tx.price_per_share
                      : tx.shares > 0
                        ? tx.cost / tx.shares
                        : 0;
                  const label =
                    tx.player_name?.trim() ||
                    playerMap.get(tx.player_index)?.name ||
                    `Player #${tx.player_index}`;
                  return (
                    <tr key={`${tx.tx_hash}-${tx.created_at}`} className="text-foreground">
                      <td className="py-3 pr-3 align-middle text-muted-foreground">{label}</td>
                      <td className="py-3 pr-3 align-middle">
                        <span
                          className={
                            side === 'buy'
                              ? 'rounded-md bg-emerald-500/15 px-2 py-0.5 text-xs font-semibold text-emerald-400'
                              : 'rounded-md bg-rose-500/15 px-2 py-0.5 text-xs font-semibold text-rose-400'
                          }
                        >
                          {side === 'buy' ? 'Buy' : side === 'sell' ? 'Sell' : tx.side}
                        </span>
                      </td>
                      <td className="py-3 pr-3 text-right align-middle tabular-nums">
                        ${tx.cost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                      <td className="py-3 pr-3 text-right align-middle tabular-nums">
                        {tx.shares.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })}
                      </td>
                      <td className="py-3 pr-8 text-right align-middle tabular-nums text-muted-foreground">
                        ${avg.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                      <td className="py-3 pl-2 pr-3 align-middle text-muted-foreground">{dateStr}</td>
                      <td className="py-3 align-middle tabular-nums text-muted-foreground">{timeStr}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <div className="relative flex flex-col gap-1 border-t border-white/[0.06] px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-8">
        <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground/70">Wallet</span>
        <p className="font-mono text-xs text-muted-foreground break-all text-right sm:max-w-[72%]">{address}</p>
      </div>
    </div>
  );
}
