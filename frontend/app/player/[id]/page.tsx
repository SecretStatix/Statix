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
  CartesianGrid,
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

  // Performance-based price chart: derives price from game fantasy points
  const chartDataPriceAll = useMemo(() => {
    if (games.length === 0) return [];

    const avgFpts = games.reduce((s, g) => s + g.fantasy_points, 0) / games.length;
    const data: { label: string; price: number }[] = [];

    // Start at 85% of current price, nudge up/down based on performance
    let p = currentPrice * 0.85;
    const reversed = [...games].reverse(); // oldest first

    for (let i = 0; i < reversed.length; i++) {
      const g = reversed[i];
      const diff = g.fantasy_points - avgFpts;
      // Nudge proportional to how far above/below average
      const nudge = (diff / Math.max(avgFpts, 1)) * currentPrice * 0.06;
      p = p + nudge;
      // Clamp to reasonable range
      p = Math.max(currentPrice * 0.6, Math.min(currentPrice * 1.3, p));

      const label = g.date.length > 8 ? g.date.slice(0, 8).trim() : g.date;
      data.push({ label, price: Math.round(p * 100) / 100 });
    }

    // Ensure last point lands on currentPrice
    if (data.length > 0) {
      data[data.length - 1].price = currentPrice;
    }

    return data;
  }, [games, currentPrice]);

  const chartDataFptsAll = games
    .slice()
    .reverse() // oldest first for left-to-right
    .map((g) => ({
      label: g.date.length > 8 ? g.date.slice(0, 8).trim() : g.date,
      fpts: g.fantasy_points,
      matchup: g.matchup,
      result: g.result,
    }));

  // Time range filtering: 1W = last 7 points, 1M = last 14, 3M = all
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

  // % change from performance trend
  let percentChange = 0;
  if (chartDataFpts.length >= 4) {
    const mid = Math.floor(chartDataFpts.length / 2);
    const olderAvg = chartDataFpts.slice(0, mid).reduce((s, g) => s + g.fpts, 0) / mid;
    const recentAvg = chartDataFpts.slice(mid).reduce((s, g) => s + g.fpts, 0) / (chartDataFpts.length - mid);
    percentChange = olderAvg > 0 ? ((recentAvg - olderAvg) / olderAvg) * 100 : 0;
  }
  // For price mode, use price deviation from $10
  const priceChange = ((currentPrice - 10) / 10) * 100;
  const displayChange = chartMode === 'price' ? priceChange : percentChange;
  const isPositive = displayChange >= 0;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-32">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 rounded-full border-2 border-primary border-t-transparent animate-spin" />
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
    <div className="relative space-y-6 pb-4">
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
        <div className="absolute -top-28 -left-20 h-72 w-72 rounded-full bg-primary/10 blur-3xl" />
        <div className="absolute top-48 -right-24 h-80 w-80 rounded-full bg-cyan-400/10 blur-3xl" />
      </div>

      <Link
        href="/"
        className="inline-flex items-center gap-2 rounded-full border border-white/[0.1] bg-white/[0.03] px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Market
      </Link>

      {/* Top section: player info + chart + trading panel — single card */}
      <div className="relative overflow-hidden rounded-3xl border border-white/[0.09] bg-[radial-gradient(circle_at_top_right,rgba(74,138,244,0.16),transparent_45%),linear-gradient(180deg,rgba(255,255,255,0.06),rgba(255,255,255,0.015))] shadow-[0_20px_80px_rgba(0,0,0,0.35)] backdrop-blur-sm">
        {/* Player header row */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-5 p-6 pb-0">
          <PlayerAvatar name={player.name} nbaId={player.nba_id} size="xl" />
          <div className="flex-1 min-w-0">
            <h1 className="text-2xl md:text-4xl font-bold text-foreground">{player.name}</h1>
            <p className="text-muted-foreground text-sm mt-1">{player.team} · {player.position}</p>
            {/* Inline stats pills */}
            <div className="mt-4 flex flex-wrap gap-2">
              {statEntries.slice(0, 3).map(s => (
                <span key={s.key} className="rounded-full border border-white/[0.12] bg-white/[0.03] px-3 py-1 text-xs text-muted-foreground">
                  <span className="font-semibold text-foreground">{s.value}</span> {s.label}
                </span>
              ))}
              <span className="rounded-full border border-primary/30 bg-primary/12 px-3 py-1 text-xs text-primary">
                <span className="font-semibold">{avgFpts.toFixed(1)}</span> FPts
              </span>
            </div>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <div className="rounded-2xl border border-white/[0.12] bg-black/15 px-4 py-3 text-right backdrop-blur">
              <p className="text-3xl md:text-4xl font-bold text-foreground">${price.toFixed(2)}</p>
              <div className={`flex items-center justify-end gap-1 mt-1 ${isPositive ? 'text-success' : 'text-destructive'}`}>
                {isPositive ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
                <span className="text-sm font-semibold">{isPositive ? '+' : ''}{displayChange.toFixed(1)}%</span>
              </div>
            </div>
          </div>
        </div>

        {/* Chart */}
        <div className="mt-5 border-t border-white/[0.08] px-6 pb-4 pt-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="flex rounded-full border border-white/[0.1] bg-black/20 p-0.5 backdrop-blur">
                <button
                  onClick={() => setChartMode('price')}
                  className={`rounded-full px-3 py-1.5 text-xs font-medium transition-all ${chartMode === 'price' ? 'bg-primary text-primary-foreground shadow-[0_4px_12px_rgba(74,138,244,0.35)]' : 'text-muted-foreground hover:text-foreground'}`}
                >
                  Price
                </button>
                <button
                  onClick={() => setChartMode('fpts')}
                  className={`rounded-full px-3 py-1.5 text-xs font-medium transition-all ${chartMode === 'fpts' ? 'bg-primary text-primary-foreground shadow-[0_4px_12px_rgba(74,138,244,0.35)]' : 'text-muted-foreground hover:text-foreground'}`}
                >
                  Fantasy Points
                </button>
              </div>
              {/* Time range tabs */}
              <div className="flex rounded-full border border-white/[0.1] bg-black/20 p-0.5 backdrop-blur">
                {(['1W', '1M', '3M'] as TimeRange[]).map((range) => (
                  <button
                    key={range}
                    onClick={() => setTimeRange(range)}
                    className={`rounded-full px-2.5 py-1.5 text-xs font-medium transition-all ${timeRange === range ? 'bg-white/[0.12] text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                  >
                    {range}
                  </button>
                ))}
              </div>
            </div>
            <span className="text-xs text-muted-foreground">
              {chartMode === 'fpts' ? `${chartData.length} games` : onChainPrice ? 'On-chain' : 'Simulated'}
            </span>
          </div>

          {gamesLoading && chartMode === 'fpts' ? (
            <div className="flex items-center justify-center h-56">
              <div className="w-8 h-8 rounded-full border-2 border-primary/30 border-t-primary animate-spin" />
            </div>
          ) : chartData.length === 0 ? (
            <div className="flex items-center justify-center h-56 text-muted-foreground text-sm">
              No data available
            </div>
          ) : (
            <div className="rounded-2xl border border-white/[0.1] bg-black/20 px-2 py-2 backdrop-blur-sm">
              <ResponsiveContainer width="100%" height={220}>
                <AreaChart data={chartData} margin={{ top: 5, right: 5, bottom: 5, left: 0 }}>
                  <defs>
                    <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={chartColor} stopOpacity={0.24} />
                      <stop offset="95%" stopColor={chartColor} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
                  <XAxis
                    dataKey="label"
                    stroke="rgba(255,255,255,0.12)"
                    tick={{ fill: 'rgb(139, 141, 149)', fontSize: 10 }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis
                    stroke="rgba(255,255,255,0.12)"
                    tick={{ fill: 'rgb(139, 141, 149)', fontSize: 10 }}
                    tickLine={false}
                    axisLine={false}
                    width={38}
                    tickFormatter={chartMode === 'price' ? (v) => `$${v}` : undefined}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#17181c',
                      border: '1px solid rgba(255,255,255,0.1)',
                      borderRadius: '10px',
                      fontSize: '12px',
                      boxShadow: '0 8px 20px rgba(0,0,0,0.45)',
                      padding: '8px 12px',
                    }}
                    labelStyle={{ color: 'rgb(139, 141, 149)', marginBottom: '4px' }}
                    itemStyle={{ color: chartColor }}
                    formatter={(value: number | undefined) =>
                      chartMode === 'price'
                        ? [`$${(value ?? 0).toFixed(2)}`, 'Price']
                        : [`${(value ?? 0).toFixed(1)} FPts`, 'Fantasy Points']
                    }
                  />
                  {chartMode === 'price' && (
                    <ReferenceLine
                      y={currentPrice}
                      stroke="rgba(255,255,255,0.2)"
                      strokeDasharray="4 4"
                      label={{
                        value: `$${currentPrice.toFixed(2)}`,
                        position: 'right',
                        fill: 'rgb(139, 141, 149)',
                        fontSize: 10,
                      }}
                    />
                  )}
                  <Area
                    type="natural"
                    dataKey={dataKey}
                    stroke={chartColor}
                    strokeWidth={2.4}
                    fill={`url(#${gradientId})`}
                    dot={false}
                    activeDot={{ r: 4, fill: chartColor, stroke: '#17181c', strokeWidth: 2 }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </div>

      {/* Trading panel + stats — side by side */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <div className="lg:col-span-1">
          <div className="sticky top-20 rounded-3xl border border-white/[0.08] bg-white/[0.015] p-1 backdrop-blur-sm">
            <PlayerTradingPanel
              playerIndex={player.index}
              playerId={player.id}
              playerName={player.name}
              price={price}
            />
          </div>
        </div>

        <div className="space-y-5 lg:col-span-2">
          {/* Stats + projections in one card */}
          <div className="rounded-3xl border border-white/[0.08] bg-white/[0.015] p-5 backdrop-blur-sm">
            <div className="grid grid-cols-2 gap-5">
              <div>
                <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">Season Averages</h3>
                <div className="grid grid-cols-3 gap-2">
                  {statEntries.map(s => (
                    <div key={s.key} className="rounded-2xl border border-white/[0.09] bg-white/[0.02] p-3 text-center">
                      <p className="text-lg font-bold text-foreground">{s.value}</p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">{s.label}</p>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">Fantasy Projections</h3>
                <div className="space-y-2">
                  <div className="flex items-center justify-between rounded-2xl border border-primary/25 bg-primary/10 p-3">
                    <span className="text-xs text-muted-foreground">FPts/Game</span>
                    <span className="text-lg font-bold text-primary">{avgFpts.toFixed(1)}</span>
                  </div>
                  <div className="flex items-center justify-between rounded-2xl border border-white/[0.09] bg-white/[0.02] p-3">
                    <span className="text-xs text-muted-foreground">Weekly</span>
                    <span className="text-lg font-bold text-foreground">{weeklyProj.toFixed(1)}</span>
                  </div>
                  <div className="flex items-center justify-between rounded-2xl border border-white/[0.09] bg-white/[0.02] p-3">
                    <span className="text-xs text-muted-foreground">Season</span>
                    <span className="text-lg font-bold text-foreground">{seasonProj.toFixed(0)}</span>
                  </div>
                </div>
                <p className="text-[10px] text-muted-foreground mt-2">
                  PTS×1 + REB×1.2 + AST×1.5 + STL×3 + BLK×3 − TOV×1
                </p>
              </div>
            </div>
          </div>

          {/* Recent games */}
          {games.length > 0 && (
            <div className="overflow-hidden rounded-3xl border border-white/[0.08] bg-white/[0.015] backdrop-blur-sm">
              <div className="px-5 py-4">
                <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Recent Games</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-y border-white/[0.08] bg-black/10">
                      <th className="text-left px-4 py-2.5 font-medium text-muted-foreground text-xs">Date</th>
                      <th className="text-left px-4 py-2.5 font-medium text-muted-foreground text-xs">Matchup</th>
                      <th className="text-center px-4 py-2.5 font-medium text-muted-foreground text-xs">W/L</th>
                      <th className="text-right px-4 py-2.5 font-medium text-muted-foreground text-xs">PTS</th>
                      <th className="text-right px-4 py-2.5 font-medium text-muted-foreground text-xs">REB</th>
                      <th className="text-right px-4 py-2.5 font-medium text-muted-foreground text-xs">AST</th>
                      <th className="text-right px-4 py-2.5 font-medium text-muted-foreground text-xs">STL</th>
                      <th className="text-right px-4 py-2.5 font-medium text-muted-foreground text-xs">BLK</th>
                      <th className="text-right px-4 py-2.5 font-medium text-primary text-xs">FPts</th>
                    </tr>
                  </thead>
                  <tbody>
                    {games.map((game, i) => (
                      <tr key={i} className="border-b border-white/[0.05] last:border-0 transition-colors hover:bg-white/[0.03]">
                        <td className="px-4 py-2.5 text-muted-foreground font-mono text-xs">{game.date}</td>
                        <td className="px-4 py-2.5 text-foreground/90 text-xs">{game.matchup}</td>
                        <td className="px-4 py-2.5 text-center">
                          <span className={`text-xs font-semibold ${game.result === 'W' ? 'text-success' : 'text-destructive'}`}>
                            {game.result}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-right font-mono text-xs text-foreground">{game.stats.PTS?.toFixed(0)}</td>
                        <td className="px-4 py-2.5 text-right font-mono text-xs text-foreground">{game.stats.REB?.toFixed(0)}</td>
                        <td className="px-4 py-2.5 text-right font-mono text-xs text-foreground">{game.stats.AST?.toFixed(0)}</td>
                        <td className="px-4 py-2.5 text-right font-mono text-xs text-foreground">{game.stats.STL?.toFixed(0)}</td>
                        <td className="px-4 py-2.5 text-right font-mono text-xs text-foreground">{game.stats.BLK?.toFixed(0)}</td>
                        <td className="px-4 py-2.5 text-right font-mono text-xs font-semibold text-primary">
                          {game.fantasy_points.toFixed(1)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Transactions */}
          {transactions.length > 0 && (
            <div className="overflow-hidden rounded-3xl border border-white/[0.08] bg-white/[0.015] backdrop-blur-sm">
              <div className="px-5 py-4">
                <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Recent Transactions</h3>
                <p className="text-[10px] text-muted-foreground mt-0.5">Top 10 by volume · Last 7 days</p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-y border-white/[0.08] bg-black/10">
                      <th className="text-left px-4 py-2.5 font-medium text-muted-foreground text-xs">Wallet</th>
                      <th className="text-left px-4 py-2.5 font-medium text-muted-foreground text-xs">Side</th>
                      <th className="text-right px-4 py-2.5 font-medium text-muted-foreground text-xs">Shares</th>
                      <th className="text-right px-4 py-2.5 font-medium text-muted-foreground text-xs">Cost</th>
                      <th className="text-left px-4 py-2.5 font-medium text-muted-foreground text-xs">Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {transactions.map((tx, i) => (
                      <tr key={i} className="border-b border-white/[0.05] last:border-0 transition-colors hover:bg-white/[0.03]">
                        <td className="px-4 py-2.5 text-foreground/90 font-mono text-xs">
                          {tx.wallet_address.length > 12 ? `${tx.wallet_address.slice(0, 6)}...${tx.wallet_address.slice(-4)}` : tx.wallet_address}
                        </td>
                        <td className="px-4 py-2.5">
                          <span className={`text-xs font-semibold ${tx.side === 'buy' ? 'text-success' : 'text-destructive'}`}>
                            {tx.side}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-right font-mono text-xs text-foreground">{tx.shares}</td>
                        <td className="px-4 py-2.5 text-right font-mono text-xs font-medium text-primary">${Number(tx.cost).toFixed(2)}</td>
                        <td className="px-4 py-2.5 text-muted-foreground font-mono text-xs">
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
