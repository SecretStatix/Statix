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
        const data = await getPlayerGames(playerId, 10);
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

  // Price chart: uses on-chain price as final point, synthetic history
  // Once deployed, this will reflect real blockchain price via usePlayerPrice
  const chartDataPrice = useMemo(() => {
    const points = Math.max(games.length, 10);
    const data: { label: string; price: number }[] = [];
    let p = currentPrice * 0.9;
    let seed = 54321;
    const rnd = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };

    for (let i = 0; i < points; i++) {
      const drift = (currentPrice - p) * 0.1 + (rnd() - 0.47) * 0.2;
      p = Math.max(currentPrice * 0.75, Math.min(currentPrice * 1.1, p + drift));

      let label: string;
      if (games[i]) {
        const g = games[i];
        label = g.date.length > 8 ? g.date.slice(0, 8).trim() : g.date;
      } else {
        const d = new Date();
        d.setDate(d.getDate() - (points - i) * 2);
        label = `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`;
      }

      if (i === points - 1) {
        data.push({ label, price: currentPrice });
      } else {
        data.push({ label, price: Math.round(p * 100) / 100 });
      }
    }
    return data;
  }, [games, currentPrice]);

  const chartDataFpts = games.map((g) => ({
    label: g.date.length > 8 ? g.date.slice(0, 8).trim() : g.date,
    fpts: g.fantasy_points,
    matchup: g.matchup,
    result: g.result,
  }));

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
    <div className="space-y-6">
      <Link href="/" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
        <ArrowLeft className="w-4 h-4" />
        Back to Market
      </Link>

      {/* Top section: player info + chart + trading panel — single card */}
      <div className="bg-card border border-white/[0.06] rounded-xl overflow-hidden">
        {/* Player header row */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-5 p-5 pb-0">
          <PlayerAvatar name={player.name} nbaId={player.nba_id} size="xl" />
          <div className="flex-1 min-w-0">
            <h1 className="text-2xl md:text-3xl font-bold text-foreground">{player.name}</h1>
            <p className="text-muted-foreground text-sm mt-0.5">{player.team} · {player.position}</p>
            {/* Inline stats pills */}
            <div className="flex flex-wrap gap-2 mt-3">
              {statEntries.slice(0, 3).map(s => (
                <span key={s.key} className="text-xs px-2.5 py-1 rounded-lg bg-white/[0.04] text-muted-foreground">
                  <span className="font-semibold text-foreground">{s.value}</span> {s.label}
                </span>
              ))}
              <span className="text-xs px-2.5 py-1 rounded-lg bg-primary/10 text-primary">
                <span className="font-semibold">{avgFpts.toFixed(1)}</span> FPts
              </span>
            </div>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <div className="text-right">
              <p className="text-3xl md:text-4xl font-bold text-foreground">${price.toFixed(2)}</p>
              <div className={`flex items-center justify-end gap-1 mt-1 ${isPositive ? 'text-success' : 'text-destructive'}`}>
                {isPositive ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
                <span className="text-sm font-semibold">{isPositive ? '+' : ''}{displayChange.toFixed(1)}%</span>
              </div>
            </div>
          </div>
        </div>

        {/* Chart */}
        <div className="px-5 pt-4 pb-2">
          <div className="flex items-center justify-between mb-4">
            <div className="flex rounded-lg p-0.5 bg-white/[0.04] border border-white/[0.06]">
              <button
                onClick={() => setChartMode('price')}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${chartMode === 'price' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}
              >
                Price
              </button>
              <button
                onClick={() => setChartMode('fpts')}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${chartMode === 'fpts' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}
              >
                Fantasy Points
              </button>
            </div>
            <span className="text-xs text-muted-foreground">
              {chartMode === 'fpts' ? `${games.length} games` : onChainPrice ? 'On-chain' : 'Simulated'}
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
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={chartData} margin={{ top: 5, right: 5, bottom: 5, left: 0 }}>
                <defs>
                  <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={chartColor} stopOpacity={0.2} />
                    <stop offset="95%" stopColor={chartColor} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
                <XAxis
                  dataKey="label"
                  stroke="rgba(255,255,255,0.15)"
                  tick={{ fill: 'rgb(139, 141, 149)', fontSize: 10 }}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  stroke="rgba(255,255,255,0.15)"
                  tick={{ fill: 'rgb(139, 141, 149)', fontSize: 10 }}
                  tickLine={false}
                  axisLine={false}
                  width={38}
                  tickFormatter={chartMode === 'price' ? (v) => `$${v}` : undefined}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#1C1D21',
                    border: '1px solid rgba(255,255,255,0.08)',
                    borderRadius: '8px',
                    fontSize: '12px',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
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
                <Area
                  type="monotone"
                  dataKey={dataKey}
                  stroke={chartColor}
                  strokeWidth={2}
                  fill={`url(#${gradientId})`}
                  dot={false}
                  activeDot={{ r: 4, fill: chartColor, stroke: '#1C1D21', strokeWidth: 2 }}
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Trading panel + stats — side by side */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-1">
          <div className="sticky top-20">
            <PlayerTradingPanel
              playerIndex={player.index}
              playerId={player.id}
              playerName={player.name}
              price={price}
            />
          </div>
        </div>

        <div className="lg:col-span-2 space-y-5">
          {/* Stats + projections in one card */}
          <div className="bg-card border border-white/[0.06] rounded-xl p-5">
            <div className="grid grid-cols-2 gap-5">
              <div>
                <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">Season Averages</h3>
                <div className="grid grid-cols-3 gap-2">
                  {statEntries.map(s => (
                    <div key={s.key} className="rounded-lg p-3 bg-white/[0.03] text-center">
                      <p className="text-lg font-bold text-foreground">{s.value}</p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">{s.label}</p>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">Fantasy Projections</h3>
                <div className="space-y-2">
                  <div className="flex items-center justify-between rounded-lg p-3 bg-primary/8">
                    <span className="text-xs text-muted-foreground">FPts/Game</span>
                    <span className="text-lg font-bold text-primary">{avgFpts.toFixed(1)}</span>
                  </div>
                  <div className="flex items-center justify-between rounded-lg p-3 bg-white/[0.03]">
                    <span className="text-xs text-muted-foreground">Weekly</span>
                    <span className="text-lg font-bold text-foreground">{weeklyProj.toFixed(1)}</span>
                  </div>
                  <div className="flex items-center justify-between rounded-lg p-3 bg-white/[0.03]">
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
            <div className="bg-card border border-white/[0.06] rounded-xl overflow-hidden">
              <div className="px-5 py-3 border-b border-white/[0.06]">
                <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Recent Games</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-white/[0.06] bg-white/[0.02]">
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
                      <tr key={i} className="border-b border-white/[0.04] last:border-0 hover:bg-white/[0.02] transition-colors">
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
            <div className="bg-card border border-white/[0.06] rounded-xl overflow-hidden">
              <div className="px-5 py-3 border-b border-white/[0.06]">
                <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Recent Transactions</h3>
                <p className="text-[10px] text-muted-foreground mt-0.5">Top 10 by volume · Last 7 days</p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-white/[0.06] bg-white/[0.02]">
                      <th className="text-left px-4 py-2.5 font-medium text-muted-foreground text-xs">Wallet</th>
                      <th className="text-left px-4 py-2.5 font-medium text-muted-foreground text-xs">Side</th>
                      <th className="text-right px-4 py-2.5 font-medium text-muted-foreground text-xs">Shares</th>
                      <th className="text-right px-4 py-2.5 font-medium text-muted-foreground text-xs">Cost</th>
                      <th className="text-left px-4 py-2.5 font-medium text-muted-foreground text-xs">Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {transactions.map((tx, i) => (
                      <tr key={i} className="border-b border-white/[0.04] last:border-0 hover:bg-white/[0.02] transition-colors">
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
