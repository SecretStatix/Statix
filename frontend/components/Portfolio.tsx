'use client';

import { useAccount } from 'wagmi';
import { formatUnits } from 'viem';
import { usePortfolio, useDBucksBalance, useFaucetDBucks } from '@/hooks/useContracts';
import { PREVIEW, PREVIEW_ADDRESS, PREVIEW_HOLDINGS, PREVIEW_BALANCE, PREVIEW_HOLDINGS_VALUE, PREVIEW_TOTAL_VALUE } from '@/lib/preview';
import { PlayerAvatar } from './PlayerAvatar';

// Map player index → demo info for display
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

export function Portfolio() {
  const { address, isConnected } = useAccount();
  const effectiveAddress = PREVIEW ? PREVIEW_ADDRESS : address;
  const { data: portfolioData, isLoading } = usePortfolio(PREVIEW ? undefined : address);
  const { data: dbucksBalance } = useDBucksBalance(PREVIEW ? undefined : address);
  const { faucet, isPending: minting, isSuccess: minted } = useFaucetDBucks();

  if (!isConnected && !PREVIEW) {
    return (
      <div className="bg-card rounded-xl border border-border p-6 text-center">
        <p className="text-sm text-muted-foreground">Connect your wallet to view your portfolio</p>
      </div>
    );
  }

  // Use preview data or real data
  let balance: number;
  let holdings: { index: number; shares: number; value: number; name: string; team: string; nbaId: number }[];
  let holdingsValue: number;
  let totalValue: number;
  let loading: boolean;

  if (PREVIEW) {
    balance = PREVIEW_BALANCE;
    holdings = PREVIEW_HOLDINGS.map(h => {
      const info = PLAYER_INFO[h.index] || { name: `Player #${h.index}`, team: '???', nbaId: 0 };
      return { ...h, name: info.name, team: info.team, nbaId: info.nbaId };
    });
    holdingsValue = PREVIEW_HOLDINGS_VALUE;
    totalValue = PREVIEW_TOTAL_VALUE;
    loading = false;
  } else {
    balance = dbucksBalance ? parseFloat(formatUnits(dbucksBalance as bigint, 6)) : 0;
    holdings = [];
    holdingsValue = 0;

    if (portfolioData) {
      const [idxs, sharesArr, valuesArr] = portfolioData as [bigint[], bigint[], bigint[]];
      holdings = idxs.map((idx, i) => {
        const shares = parseFloat(formatUnits(sharesArr[i], 6));
        const value = parseFloat(formatUnits(valuesArr[i], 6));
        holdingsValue += value;
        const info = PLAYER_INFO[Number(idx)] || { name: `Player #${Number(idx)}`, team: '???', nbaId: 0 };
        return { index: Number(idx), shares, value, name: info.name, team: info.team, nbaId: info.nbaId };
      });
    }

    totalValue = balance + holdingsValue;
    loading = isLoading;
  }

  return (
    <div className="space-y-6">
      {/* Summary cards */}
      <div className="bg-card rounded-2xl border border-white/[0.06] p-6 card-hover">
        <div className="flex items-center justify-between mb-5">
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wider">Total Portfolio Value</p>
            <p className="text-3xl font-bold text-foreground mt-1">${totalValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
          </div>
          {!PREVIEW && (
            <button
              onClick={() => faucet(10000)}
              disabled={minting}
              className="h-10 px-5 rounded-xl bg-primary text-primary-foreground font-semibold text-sm hover:bg-primary-600 transition-all duration-200 disabled:opacity-50"
            >
              {minting ? 'Minting...' : minted ? 'Got it!' : 'Get 10k D-Bucks'}
            </button>
          )}
          {PREVIEW && (
            <span className="text-xs text-primary bg-primary/10 px-3 py-1.5 rounded-lg font-medium">Preview Mode</span>
          )}
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-xl p-4 bg-white/[0.03] border border-white/[0.04]">
            <p className="text-xs text-muted-foreground">D-Bucks Balance</p>
            <p className="text-lg font-semibold text-foreground mt-1">${balance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
          </div>
          <div className="rounded-xl p-4 bg-white/[0.03] border border-white/[0.04]">
            <p className="text-xs text-muted-foreground">Holdings Value</p>
            <p className="text-lg font-semibold text-foreground mt-1">${holdingsValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
          </div>
          <div className="rounded-xl p-4 bg-white/[0.03] border border-white/[0.04]">
            <p className="text-xs text-muted-foreground">Positions</p>
            <p className="text-lg font-semibold text-foreground mt-1">{holdings.length}</p>
          </div>
        </div>
      </div>

      {/* Holdings table */}
      <div className="bg-card rounded-2xl border border-white/[0.06] overflow-hidden card-hover">
        <div className="px-6 py-4 border-b border-white/[0.06]">
          <h3 className="font-semibold text-foreground">Your Holdings</h3>
        </div>

        {loading ? (
          <div className="p-6 text-center text-sm text-muted-foreground">Loading...</div>
        ) : holdings.length === 0 ? (
          <div className="p-8 text-center">
            <p className="text-sm text-muted-foreground">No holdings yet — buy some player shares!</p>
          </div>
        ) : (
          <div className="divide-y divide-white/[0.04]">
            {/* Header */}
            <div className="grid grid-cols-12 gap-4 px-6 py-3 text-xs text-muted-foreground uppercase tracking-wider">
              <div className="col-span-5">Player</div>
              <div className="col-span-2 text-right">Shares</div>
              <div className="col-span-2 text-right">Avg Price</div>
              <div className="col-span-3 text-right">Value</div>
            </div>
            {holdings.map((h) => (
              <div key={h.index} className="grid grid-cols-12 gap-4 px-6 py-3.5 items-center hover:bg-white/[0.02] transition-colors">
                <div className="col-span-5 flex items-center gap-3">
                  <PlayerAvatar name={h.name} nbaId={h.nbaId} size="sm" />
                  <div>
                    <p className="text-sm font-medium text-foreground">{h.name}</p>
                    <p className="text-xs text-muted-foreground">{h.team}</p>
                  </div>
                </div>
                <div className="col-span-2 text-right">
                  <span className="text-sm font-medium text-foreground">{h.shares.toFixed(2)}</span>
                </div>
                <div className="col-span-2 text-right">
                  <span className="text-sm text-muted-foreground">${(h.value / h.shares).toFixed(2)}</span>
                </div>
                <div className="col-span-3 text-right">
                  <span className="text-sm font-semibold text-foreground">${h.value.toFixed(2)}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Wallet info */}
      <div className="bg-card rounded-2xl border border-white/[0.06] p-6 card-hover">
        <h3 className="font-semibold text-foreground mb-3">Wallet</h3>
        <p className="text-sm text-muted-foreground font-mono break-all">{effectiveAddress}</p>
      </div>
    </div>
  );
}
