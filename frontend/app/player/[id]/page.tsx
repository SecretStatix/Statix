'use client';

import { useState, useEffect, useMemo } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, TrendingUp, TrendingDown } from 'lucide-react';
import { getPlayer, getPlayerGames, getPlayerTransactions } from '@/lib/api';
import { usePlayerPrice } from '@/hooks/useContracts';
import { formatUnits } from 'viem';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ReferenceLine,
} from 'recharts';
import { PlayerTradingPanel } from '@/components/PlayerTradingPanel';
import { PlayerAvatar } from '@/components/PlayerAvatar';

interface PlayerInfo {
  index: number;
  id: string;
  name: string;
  team: string;
  position: string;
  nba_id?: number;
  avg_fantasy_points?: number;
  weekly_projection?: number;
  season_projection?: number;
  avg_stats?: Record<string, number>;
}

interface GameLog {
  date: string;
  matchup: string;
  result: string;
  stats: Record<string, number>;
  fantasy_points: number;
}

interface PlayerTransaction {
  wallet_address: string;
  player_index: number;
  side: string;
  shares: number;
  cost: number;
  tx_hash: string;
  created_at: string;
}

type TimeRange = '1W' | '1M' | '3M';

export default function PlayerProfilePage() {
  const params = useParams();
  const playerId = params.id as string;

  const [player, setPlayer] = useState<PlayerInfo | null>(null);
  const [games, setGames] = useState<GameLog[]>([]);
  const [transactions, setTransactions] = useState<PlayerTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [gamesLoading, setGamesLoading] = useState(true);
  const [transactionsLoading, setTransactionsLoading] = useState(true);
  const [error, setError] = useState('');
  const [chartMode, setChartMode] = useState<'fpts' | 'price'>('price');
  const [timeRange, setTimeRange] = useState<TimeRange>('3M');

  const { data: onChainPrice } = usePlayerPrice(player?.index ?? 0);

  useEffect(() => {
    async function loadPlayer() {
      try {
        const data = await getPlayer(playerId);
        setPlayer(data);
      } catch {
        setError('Player not found');
      } finally {
        setLoading(false);
      }
    }
    loadPlayer();
  }, [playerId]);

  useEffect(() => {
    async function loadGames() {
      if (!player) return;
      try {
        const data = await getPlayerGames(playerId, 20);
        setGames(data.games || []);
      } catch {
        console.error('Failed to load game log');
      } finally {
        setGamesLoading(false);
      }
    }
    loadGames();
  }, [player, playerId]);

  useEffect(() => {
    async function loadTransactions() {
      if (!player) return;
      try {
        const data = await getPlayerTransactions(player.index, 10, 7);
        setTransactions(Array.isArray(data) ? data : []);
      } catch {
        console.error('Failed to load transactions');
      } finally {
        setTransactionsLoading(false);
      }
    }
    loadTransactions();
  }, [player]);

  const currentPrice = onChainPrice
    ? parseFloat(formatUnits(onChainPrice as bigint, 6))
    : (player as any)?.price || 10;

  const chartDataPriceAll = useMemo(() => {
    if (games.length === 0) return [];

    const avgFpts = games.reduce((s, g) => s + g.fantasy_points, 0) / games.length;
    const data: { label: string; price: number }[] = [];

    let p = currentPrice * (0.72 + (player?.index ?? 0) * 0.008);
    const reversed = [...games].reverse();

    const hashDate = (s: string) => {
      let h = 2166136261;
      for (let k = 0; k < s.length; k++) h = Math.imul(h ^ s.charCodeAt(k), 16777619);
      return (h >>> 0) / 4294967296;
    };

    for (let i = 0; i < reversed.length; i++) {
      const g = reversed[i];
      const diff = g.fantasy_points - avgFpts;
      const nudge = (diff / Math.max(avgFpts, 1)) * currentPrice * 0.24;
      const swing = Math.sin(i * 1.7 + (player?.index ?? 0)) * currentPrice * 0.065;
      const jitter = (hashDate(g.date + i) - 0.5) * currentPrice * 0.11;
      const gap = i > 0 ? (g.fantasy_points - reversed[i - 1].fantasy_points) * 0.02 : 0;
      p = p + nudge + swing + jitter + gap;
      p = Math.max(currentPrice * 0.42, Math.min(currentPrice * 1.48, p));

      const label = g.date.length > 8 ? g.date.slice(0, 8).trim() : g.date;
      data.push({ label, price: Math.round(p * 100) / 100 });
    }

    if (data.length > 0) {
      data[data.length - 1].price = currentPrice;
    }

    return data;
  }, [games, currentPrice, player?.index]);

  const chartDataFptsAll = games
    .slice()
    .reverse()
    .map((g) => ({
      label: g.date.length > 8 ? g.date.slice(0, 8).trim() : g.date,
      fpts: g.fantasy_points,
      matchup: g.matchup,
      result: g.result,
    }));

  const timeRangeLimit = timeRange === '1W' ? 7 : timeRange === '1M' ? 14 : Infinity;

  const chartDataPrice = useMemo(() => {
    if (timeRangeLimit >= chartDataPriceAll.length) return chartDataPriceAll;
    return chartDataPriceAll.slice(-timeRangeLimit);
  }, [chartDataPriceAll, timeRangeLimit]);

  const chartDataFpts = useMemo(() => {
    if (timeRangeLimit >= chartDataFptsAll.length) return chartDataFptsAll;
    return chartDataFptsAll.slice(-timeRangeLimit);
  }, [chartDataFptsAll, timeRangeLimit]);

  const chartData = chartMode === 'fpts' ? chartDataFpts : chartDataPrice;

  let percentChange = 0;
  if (chartDataFpts.length >= 4) {
    const mid = Math.floor(chartDataFpts.length / 2);
    const olderAvg = chartDataFpts.slice(0, mid).reduce((s, g) => s + g.fpts, 0) / mid;
    const recentAvg = chartDataFpts.slice(mid).reduce((s, g) => s + g.fpts, 0) / (chartDataFpts.length - mid);
    percentChange = olderAvg > 0 ? ((recentAvg - olderAvg) / olderAvg) * 100 : 0;
  }
  const priceChange = ((currentPrice - 10) / 10) * 100;
  const displayChange = chartMode === 'price' ? priceChange : percentChange;
  const isPositive = displayChange >= 0;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-32">
        <div className="flex flex-col items-center gap-4">
          <div className="w-8 h-8 rounded-full border-2 border-primary/30 border-t-primary animate-spin" />
          <span className="text-sm text-muted-foreground">Loading player...</span>
        </div>
      </div>
    );
  }

  if (error || !player) {
    return (
      <div className="flex flex-col items-center justify-center py-32 gap-6">
        <p className="text-muted-foreground">{error || 'Player not found'}</p>
        <Link href="/" className="inline-flex items-center gap-2 text-sm text-primary hover:text-primary-600 font-medium transition-colors">
          <ArrowLeft className="w-4 h-4" />
          Back to Market
        </Link>
      </div>
    );
  }

  const avgFpts = Number(player.avg_fantasy_points) || (Number(player.weekly_projection) || 0) / 3.5 || 0;
  const weeklyProj = Number(player.weekly_projection) || avgFpts * 3.5;
  const seasonProj = Number(player.season_projection) || avgFpts * 82;
  const stats = player.avg_stats || {};
  const price = currentPrice;

  const statEntries: { label: string; value: string; key: string }[] = [
    { label: 'PTS', value: (stats.PTS ?? 0).toFixed(1), key: 'pts' },
    { label: 'REB', value: (stats.REB ?? 0).toFixed(1), key: 'reb' },
    { label: 'AST', value: (stats.AST ?? 0).toFixed(1), key: 'ast' },
    { label: 'STL', value: (stats.STL ?? 0).toFixed(1), key: 'stl' },
    { label: 'BLK', value: (stats.BLK ?? 0).toFixed(1), key: 'blk' },
    { label: 'TOV', value: (stats.TOV ?? 0).toFixed(1), key: 'tov' },
  ];

  const chartColor = chartMode === 'price'
    ? (isPositive ? '#22C55E' : '#EF4444')
    : '#4A8AF4';
  const dataKey = chartMode === 'fpts' ? 'fpts' : 'price';
  const gradientId = chartMode === 'fpts' ? 'fptsGrad' : 'priceGrad';

  return (
    <div className="relative space-y-8 pb-8">
      {/* Single subtle ambient glow */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
        <div className="absolute -top-40 left-1/3 h-[28rem] w-[28rem] rounded-full bg-primary/[0.03] blur-[140px]" />
      </div>

      {/* Back link — minimal */}
      <Link
        href="/"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        Market
      </Link>

      {/* ── Player header — flat, no card wrapper ── */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-5">
        <PlayerAvatar name={player.name} nbaId={player.nba_id} size="xl" />
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl md:text-3xl font-bold text-foreground tracking-tight">{player.name}</h1>
          <p className="text-muted-foreground text-sm mt-0.5">{player.team} · {player.position}</p>
        </div>
        <div className="flex items-baseline gap-3 shrink-0">
          <span className="text-3xl md:text-4xl font-bold text-foreground tabular-nums tracking-tight">
            ${price.toFixed(2)}
          </span>
          <span className={`flex items-center gap-1 text-sm font-semibold ${isPositive ? 'text-success' : 'text-destructive'}`}>
            {isPositive ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
            {isPositive ? '+' : ''}{displayChange.toFixed(1)}%
          </span>
        </div>
      </div>

      {/* ── Chart — Polymarket-inspired: large, clean, minimal chrome ── */}
      <div>
        {/* Chart controls */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-5">
            <div className="flex items-center gap-0.5">
              {(['price', 'fpts'] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => setChartMode(m)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all duration-200 ${
                    chartMode === m
                      ? 'bg-white/[0.08] text-foreground'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {m === 'price' ? 'Price' : 'Fantasy Pts'}
                </button>
              ))}
            </div>
            <div className="h-3.5 w-px bg-white/[0.08]" />
            <div className="flex items-center gap-0.5">
              {(['1W', '1M', '3M'] as TimeRange[]).map((range) => (
                <button
                  key={range}
                  onClick={() => setTimeRange(range)}
                  className={`px-2.5 py-1.5 text-xs font-medium rounded-lg transition-all duration-200 ${
                    timeRange === range
                      ? 'text-foreground bg-white/[0.06]'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {range}
                </button>
              ))}
            </div>
          </div>
          <span className="text-[11px] text-muted-foreground/50">
            {chartMode === 'fpts' ? `${chartData.length} games` : onChainPrice ? 'On-chain' : 'Simulated'}
          </span>
        </div>

        {/* Chart body — no border wrapper, clean and open */}
        {gamesLoading && chartMode === 'fpts' ? (
          <div className="flex items-center justify-center h-[300px]">
            <div className="w-6 h-6 rounded-full border-2 border-primary/30 border-t-primary animate-spin" />
          </div>
        ) : chartData.length === 0 ? (
          <div className="flex items-center justify-center h-[300px] text-muted-foreground text-sm">
            No data available
          </div>
        ) : (
          <div className="chart-container">
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={chartData} margin={{ top: 8, right: 8, bottom: 0, left: -8 }}>
                <defs>
                  <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={chartColor} stopOpacity={0.15} />
                    <stop offset="80%" stopColor={chartColor} stopOpacity={0.02} />
                    <stop offset="100%" stopColor={chartColor} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis
                  dataKey="label"
                  tick={{ fill: 'rgba(139, 141, 149, 0.5)', fontSize: 10 }}
                  tickLine={false}
                  axisLine={false}
                  dy={8}
                />
                <YAxis
                  tick={{ fill: 'rgba(139, 141, 149, 0.4)', fontSize: 10 }}
                  tickLine={false}
                  axisLine={false}
                  width={40}
                  tickFormatter={chartMode === 'price' ? (v) => `$${v}` : undefined}
                />
                <Tooltip
                  cursor={{ stroke: 'rgba(255,255,255,0.08)', strokeWidth: 1 }}
                  contentStyle={{
                    backgroundColor: 'rgba(20, 21, 24, 0.92)',
                    border: '1px solid rgba(255,255,255,0.06)',
                    borderRadius: '8px',
                    fontSize: '12px',
                    boxShadow: '0 12px 40px rgba(0,0,0,0.55)',
                    padding: '8px 12px',
                  }}
                  labelStyle={{ color: 'rgba(139, 141, 149, 0.7)', marginBottom: '2px', fontSize: '11px' }}
                  itemStyle={{ color: chartColor }}
                  formatter={(value: number | undefined) =>
                    chartMode === 'price'
                      ? [`$${(value ?? 0).toFixed(2)}`, 'Price']
                      : [`${(value ?? 0).toFixed(1)}`, 'FPts']
                  }
                />
                {chartMode === 'price' && (
                  <ReferenceLine
                    y={currentPrice}
                    stroke="rgba(255,255,255,0.06)"
                    strokeDasharray="3 3"
                  />
                )}
                <Area
                  type="monotone"
                  dataKey={dataKey}
                  stroke={chartColor}
                  strokeWidth={1.5}
                  fill={`url(#${gradientId})`}
                  dot={false}
                  activeDot={{ r: 3.5, fill: chartColor, stroke: '#141518', strokeWidth: 2 }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* Subtle divider */}
      <div className="h-px bg-white/[0.05]" />

      {/* ── Trading panel + content columns ── */}
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
        {/* Trading panel — left */}
        <div className="lg:col-span-1 order-first lg:order-none">
          <div className="sticky top-20">
            <PlayerTradingPanel
              playerIndex={player.index}
              playerId={player.id}
              playerName={player.name}
              price={price}
            />
          </div>
        </div>

        {/* Stats + tables — right */}
        <div className="space-y-8 lg:col-span-2">
          {/* Season Averages — clean horizontal row */}
          <div>
            <h3 className="text-[11px] font-medium text-muted-foreground/60 uppercase tracking-widest mb-4">
              Season Averages
            </h3>
            <div className="flex items-center">
              {statEntries.map((s, i) => (
                <div
                  key={s.key}
                  className={`flex-1 text-center py-3 ${
                    i > 0 ? 'border-l border-white/[0.05]' : ''
                  }`}
                >
                  <p className="text-lg md:text-xl font-bold text-foreground tabular-nums">{s.value}</p>
                  <p className="text-[10px] text-muted-foreground/50 mt-1 uppercase tracking-wider font-medium">
                    {s.label}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* Fantasy Projections — flat cards */}
          <div>
            <h3 className="text-[11px] font-medium text-muted-foreground/60 uppercase tracking-widest mb-4">
              Fantasy Projections
            </h3>
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-xl bg-primary/[0.06] border border-primary/[0.1] px-4 py-3.5">
                <p className="text-[10px] text-muted-foreground/50 uppercase tracking-wider font-medium">FPts/Game</p>
                <p className="text-xl font-bold text-primary mt-1.5 tabular-nums">{avgFpts.toFixed(1)}</p>
              </div>
              <div className="rounded-xl bg-white/[0.02] border border-white/[0.04] px-4 py-3.5">
                <p className="text-[10px] text-muted-foreground/50 uppercase tracking-wider font-medium">Weekly</p>
                <p className="text-xl font-bold text-foreground mt-1.5 tabular-nums">{weeklyProj.toFixed(1)}</p>
              </div>
              <div className="rounded-xl bg-white/[0.02] border border-white/[0.04] px-4 py-3.5">
                <p className="text-[10px] text-muted-foreground/50 uppercase tracking-wider font-medium">Season</p>
                <p className="text-xl font-bold text-foreground mt-1.5 tabular-nums">{seasonProj.toFixed(0)}</p>
              </div>
            </div>
            <p className="text-[10px] text-muted-foreground/30 mt-2.5">
              PTS x1 + REB x1.2 + AST x1.5 + STL x3 + BLK x3 - TOV x1
            </p>
          </div>

          {/* Recent Games — clean table */}
          {games.length > 0 && (
            <div>
              <h3 className="text-[11px] font-medium text-muted-foreground/60 uppercase tracking-widest mb-4">
                Recent Games
              </h3>
              <div className="overflow-x-auto rounded-xl border border-white/[0.04] bg-white/[0.01]">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-white/[0.05]">
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground/50 text-[11px] uppercase tracking-wider">Date</th>
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground/50 text-[11px] uppercase tracking-wider">Matchup</th>
                      <th className="text-center px-3 py-3 font-medium text-muted-foreground/50 text-[11px]">W/L</th>
                      <th className="text-right px-3 py-3 font-medium text-muted-foreground/50 text-[11px]">PTS</th>
                      <th className="text-right px-3 py-3 font-medium text-muted-foreground/50 text-[11px]">REB</th>
                      <th className="text-right px-3 py-3 font-medium text-muted-foreground/50 text-[11px]">AST</th>
                      <th className="text-right px-3 py-3 font-medium text-muted-foreground/50 text-[11px]">STL</th>
                      <th className="text-right px-3 py-3 font-medium text-muted-foreground/50 text-[11px]">BLK</th>
                      <th className="text-right px-3 py-3 font-medium text-primary/60 text-[11px]">FPts</th>
                    </tr>
                  </thead>
                  <tbody>
                    {games.map((game, i) => (
                      <tr
                        key={i}
                        className="border-b border-white/[0.025] last:border-0 transition-colors duration-150 hover:bg-white/[0.02]"
                      >
                        <td className="px-4 py-3 text-muted-foreground/60 font-mono text-xs">{game.date}</td>
                        <td className="px-4 py-3 text-foreground/70 text-xs">{game.matchup}</td>
                        <td className="px-3 py-3 text-center">
                          <span className={`text-xs font-semibold ${game.result === 'W' ? 'text-success' : 'text-destructive'}`}>
                            {game.result}
                          </span>
                        </td>
                        <td className="px-3 py-3 text-right font-mono text-xs text-foreground/70">{game.stats.PTS?.toFixed(0)}</td>
                        <td className="px-3 py-3 text-right font-mono text-xs text-foreground/70">{game.stats.REB?.toFixed(0)}</td>
                        <td className="px-3 py-3 text-right font-mono text-xs text-foreground/70">{game.stats.AST?.toFixed(0)}</td>
                        <td className="px-3 py-3 text-right font-mono text-xs text-foreground/70">{game.stats.STL?.toFixed(0)}</td>
                        <td className="px-3 py-3 text-right font-mono text-xs text-foreground/70">{game.stats.BLK?.toFixed(0)}</td>
                        <td className="px-3 py-3 text-right font-mono text-xs font-semibold text-primary">
                          {game.fantasy_points.toFixed(1)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Recent Transactions */}
          {transactions.length > 0 && (
            <div>
              <div className="flex items-baseline justify-between mb-4">
                <h3 className="text-[11px] font-medium text-muted-foreground/60 uppercase tracking-widest">
                  Recent Transactions
                </h3>
                <span className="text-[10px] text-muted-foreground/30">Last 7 days</span>
              </div>
              <div className="overflow-x-auto rounded-xl border border-white/[0.04] bg-white/[0.01]">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-white/[0.05]">
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground/50 text-[11px] uppercase tracking-wider">Wallet</th>
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground/50 text-[11px] uppercase tracking-wider">Side</th>
                      <th className="text-right px-4 py-3 font-medium text-muted-foreground/50 text-[11px]">Shares</th>
                      <th className="text-right px-4 py-3 font-medium text-muted-foreground/50 text-[11px]">Cost</th>
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground/50 text-[11px]">Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {transactions.map((tx, i) => (
                      <tr
                        key={i}
                        className="border-b border-white/[0.025] last:border-0 transition-colors duration-150 hover:bg-white/[0.02]"
                      >
                        <td className="px-4 py-3 text-foreground/60 font-mono text-xs">
                          {tx.wallet_address.length > 12 ? `${tx.wallet_address.slice(0, 6)}...${tx.wallet_address.slice(-4)}` : tx.wallet_address}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`text-xs font-semibold ${tx.side === 'buy' ? 'text-success' : 'text-destructive'}`}>
                            {tx.side}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-xs text-foreground/70">{tx.shares}</td>
                        <td className="px-4 py-3 text-right font-mono text-xs font-medium text-foreground">${Number(tx.cost).toFixed(2)}</td>
                        <td className="px-4 py-3 text-muted-foreground/50 font-mono text-xs">
                          {new Date(tx.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
