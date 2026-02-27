'use client';
/**
 * Player profile: header, chart (FPts or Price), stats, top transactions (past 7 days), recent games (last 5).
 * Data: getPlayer, getPlayerGames, getPlayerTransactions (lib/api — demo or backend).
 * Price: usePlayerPrice (on-chain) when available.
 */

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
  const [chartMode, setChartMode] = useState<'fpts' | 'price'>('fpts');

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
        const data = await getPlayerGames(playerId, 5);
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

  // Must be called unconditionally (before early returns) to satisfy Rules of Hooks
  const currentPrice = onChainPrice
    ? parseFloat(formatUnits(onChainPrice as bigint, 6))
    : (player as any)?.price || 10;
  const chartDataPrice = useMemo(() => {
    if (games.length === 0) return [];
    let p = currentPrice * 0.92;
    const out: { date: string; price: number }[] = [];
    let seed = 12345;
    const rnd = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
    for (let i = 0; i < games.length; i++) {
      const g = games[i];
      const date = g.date.length > 8 ? g.date.slice(0, 8).trim() : g.date;
      if (i === games.length - 1) {
        out.push({ date, price: currentPrice });
      } else {
        const drift = (currentPrice - p) * 0.12 + (rnd() - 0.5) * 0.25;
        p = Math.max(currentPrice * 0.7, Math.min(currentPrice * 1.15, p + drift));
        out.push({ date, price: Math.round(p * 100) / 100 });
      }
    }
    return out;
  }, [games, currentPrice]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-32">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 rounded-full border-2 border-primary border-t-transparent animate-spin" />
          <span className="text-sm text-gray-400">Loading player...</span>
        </div>
      </div>
    );
  }

  if (error || !player) {
    return (
      <div className="flex flex-col items-center justify-center py-32 gap-6">
        <p className="text-gray-400">{error || 'Player not found'}</p>
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
  const initials = player.name.split(' ').map(n => n[0]).join('');
  const price = currentPrice;

  // Chronological order: oldest first (left), newest last (right). Do not reverse.
  const chartDataFpts = games.map((g) => ({
    date: g.date.length > 8 ? g.date.slice(0, 8).trim() : g.date,
    fpts: g.fantasy_points,
    matchup: g.matchup,
    result: g.result,
  }));

  const chartData = chartMode === 'fpts' ? chartDataFpts : chartDataPrice;

  // Compute % change from performance trend (recent vs older games)
  let percentChange = 0;
  if (chartDataFpts.length >= 4) {
    const mid = Math.floor(chartDataFpts.length / 2);
    const olderAvg = chartDataFpts.slice(0, mid).reduce((s, g) => s + g.fpts, 0) / mid;
    const recentAvg = chartDataFpts.slice(mid).reduce((s, g) => s + g.fpts, 0) / (chartDataFpts.length - mid);
    percentChange = olderAvg > 0 ? ((recentAvg - olderAvg) / olderAvg) * 100 : 0;
  }

  const statEntries: { label: string; value: string; key: string }[] = [
    { label: 'PTS', value: (stats.PTS ?? 0).toFixed(1), key: 'pts' },
    { label: 'REB', value: (stats.REB ?? 0).toFixed(1), key: 'reb' },
    { label: 'AST', value: (stats.AST ?? 0).toFixed(1), key: 'ast' },
    { label: 'STL', value: (stats.STL ?? 0).toFixed(1), key: 'stl' },
    { label: 'BLK', value: (stats.BLK ?? 0).toFixed(1), key: 'blk' },
    { label: 'TOV', value: (stats.TOV ?? 0).toFixed(1), key: 'tov' },
  ];

  const isPositive = percentChange >= 0;

  return (
    <div className="space-y-8">
      <Link href="/" className="inline-flex items-center gap-2 text-sm text-gray-400 hover:text-foreground transition-colors duration-200">
        <ArrowLeft className="w-4 h-4" />
        Back to Market
      </Link>

      {/* Header: player name + price + % change */}
      <div className="bg-card border border-white/[0.06] rounded-2xl p-6 md:p-8 transition-all duration-200 hover:border-white/[0.08]">
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-6">
          <div className="w-16 h-16 rounded-xl bg-primary/15 flex items-center justify-center text-2xl font-bold text-primary shrink-0">
            {initials}
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-2xl md:text-3xl font-bold text-foreground">{player.name}</h1>
            <p className="text-gray-400 text-sm mt-0.5">{player.team} · {player.position}</p>
          </div>
          <div className="flex items-center gap-4 shrink-0">
            <div className="text-right">
              <p className="text-3xl md:text-4xl font-bold text-foreground">${price.toFixed(2)}</p>
              <p className="text-xs text-gray-400 mt-1">per share</p>
            </div>
            {chartData.length >= 4 && (
              <div className={`flex items-center gap-1 px-3 py-1.5 rounded-lg ${isPositive ? 'bg-success/10 text-success' : 'bg-destructive/10 text-destructive'}`}>
                {isPositive ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
                <span className="text-sm font-semibold">{isPositive ? '+' : ''}{percentChange.toFixed(1)}%</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Main area: chart (left) + trading panel (right) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 lg:gap-8">
        <div className="lg:col-span-2 bg-card border border-white/[0.06] rounded-2xl p-6 transition-all duration-200 hover:border-white/[0.08]">
          <div className="flex items-center justify-between mb-6">
            <div className="flex rounded-xl p-1 bg-white/[0.04] border border-white/[0.06]">
              <button
                onClick={() => setChartMode('fpts')}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${chartMode === 'fpts' ? 'bg-primary text-primary-foreground' : 'text-gray-400 hover:text-foreground'}`}
              >
                Fantasy Points
              </button>
              <button
                onClick={() => setChartMode('price')}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${chartMode === 'price' ? 'bg-primary text-primary-foreground' : 'text-gray-400 hover:text-foreground'}`}
              >
                Price
              </button>
            </div>
            <span className="text-xs text-gray-400">
              {chartMode === 'fpts' ? `${games.length} games` : 'Simulated'}
            </span>
          </div>

          {gamesLoading ? (
            <div className="flex items-center justify-center h-72">
              <div className="flex flex-col items-center gap-3">
                <div className="w-8 h-8 rounded-full border-2 border-primary/30 border-t-primary animate-spin" />
                <span className="text-sm text-gray-400">Loading chart...</span>
              </div>
            </div>
          ) : chartData.length === 0 ? (
            <div className="flex items-center justify-center h-72 text-gray-400 text-sm">
              {chartMode === 'fpts' ? 'No game data available' : 'No price data'}
            </div>
          ) : chartMode === 'fpts' ? (
            <ResponsiveContainer width="100%" height={280}>
              <AreaChart data={chartData} margin={{ top: 5, right: 5, bottom: 5, left: 0 }}>
                <defs>
                  <linearGradient id="fptsGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="#3B82F6" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                <XAxis
                  dataKey="date"
                  stroke="rgba(255,255,255,0.2)"
                  tick={{ fill: 'rgb(156, 163, 175)', fontSize: 11 }}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  stroke="rgba(255,255,255,0.2)"
                  tick={{ fill: 'rgb(156, 163, 175)', fontSize: 11 }}
                  tickLine={false}
                  axisLine={false}
                  width={40}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#111827',
                    border: '1px solid rgba(255,255,255,0.08)',
                    borderRadius: '12px',
                    fontSize: '12px',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
                  }}
                  labelStyle={{ color: 'rgb(156, 163, 175)' }}
                  itemStyle={{ color: '#3B82F6' }}
                  formatter={(value: number | undefined) => [`${(value ?? 0).toFixed(1)} FPts`, 'Fantasy Points']}
                />
                <Area
                  type="monotone"
                  dataKey="fpts"
                  stroke="#3B82F6"
                  strokeWidth={2}
                  fill="url(#fptsGradient)"
                  dot={false}
                  activeDot={{ r: 4, fill: '#3B82F6', stroke: '#111827', strokeWidth: 2 }}
                />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <AreaChart data={chartData} margin={{ top: 5, right: 5, bottom: 5, left: 0 }}>
                <defs>
                  <linearGradient id="priceGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#22C55E" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="#22C55E" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                <XAxis
                  dataKey="date"
                  stroke="rgba(255,255,255,0.2)"
                  tick={{ fill: 'rgb(156, 163, 175)', fontSize: 11 }}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  stroke="rgba(255,255,255,0.2)"
                  tick={{ fill: 'rgb(156, 163, 175)', fontSize: 11 }}
                  tickLine={false}
                  axisLine={false}
                  width={45}
                  tickFormatter={(v) => `$${v}`}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#111827',
                    border: '1px solid rgba(255,255,255,0.08)',
                    borderRadius: '12px',
                    fontSize: '12px',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
                  }}
                  labelStyle={{ color: 'rgb(156, 163, 175)' }}
                  itemStyle={{ color: '#22C55E' }}
                  formatter={(value: number | undefined) => [`$${(value ?? 0).toFixed(2)}`, 'Price']}
                />
                <Area
                  type="monotone"
                  dataKey="price"
                  stroke="#22C55E"
                  strokeWidth={2}
                  fill="url(#priceGradient)"
                  dot={false}
                  activeDot={{ r: 4, fill: '#22C55E', stroke: '#111827', strokeWidth: 2 }}
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="lg:min-h-[360px]">
          <div className="sticky top-24">
            <PlayerTradingPanel
              playerIndex={player.index}
              playerId={player.id}
              playerName={player.name}
              price={price}
            />
          </div>
        </div>
      </div>

      {/* Stats section below */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="bg-card border border-white/[0.06] rounded-2xl p-6 transition-all duration-200 hover:border-white/[0.08]">
          <h3 className="text-sm font-medium text-gray-400 uppercase tracking-wider mb-4">Season Averages</h3>
          <div className="grid grid-cols-3 gap-3">
            {statEntries.map(s => (
              <div key={s.key} className="rounded-xl p-4 bg-white/[0.03] text-center">
                <p className="text-xl font-bold text-foreground">{s.value}</p>
                <p className="text-xs text-gray-400 mt-1">{s.label}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="lg:col-span-2 bg-card border border-white/[0.06] rounded-2xl p-6 transition-all duration-200 hover:border-white/[0.08]">
          <h3 className="text-sm font-medium text-gray-400 uppercase tracking-wider mb-4">Fantasy Projections</h3>
          <div className="grid grid-cols-3 gap-4">
            <div className="rounded-xl p-5 bg-primary/10">
              <p className="text-2xl font-bold text-primary">{avgFpts.toFixed(1)}</p>
              <p className="text-xs text-gray-400 mt-1">FPts/game</p>
            </div>
            <div className="rounded-xl p-5 bg-white/[0.03]">
              <p className="text-2xl font-bold text-foreground">{weeklyProj.toFixed(1)}</p>
              <p className="text-xs text-gray-400 mt-1">Weekly</p>
            </div>
            <div className="rounded-xl p-5 bg-white/[0.03]">
              <p className="text-2xl font-bold text-foreground">{seasonProj.toFixed(0)}</p>
              <p className="text-xs text-gray-400 mt-1">Season</p>
            </div>
          </div>
          <p className="text-xs text-gray-400 mt-4 leading-relaxed">
            PTS×1 + REB×1.2 + AST×1.5 + STL×3 + BLK×3 − TOV×1
          </p>
        </div>
      </div>

      {/* Top Transactions + Recent Games */}
      {(transactions.length > 0 || games.length > 0) && (
        <div className="bg-card border border-white/[0.06] rounded-2xl overflow-hidden transition-all duration-200 hover:border-white/[0.08]">
          <div className="p-5 border-b border-white/[0.06]">
            <h3 className="text-sm font-medium text-gray-400 uppercase tracking-wider">
              Top Transactions & Recent Games
            </h3>
            <p className="text-xs text-gray-500 mt-1">
              Last 7 days (top 10 by volume) · Last 5 games
            </p>
          </div>
          <div className="overflow-x-auto">
            {transactionsLoading && transactions.length === 0 ? (
              <div className="flex items-center justify-center py-12">
                <div className="flex flex-col items-center gap-2">
                  <div className="w-6 h-6 rounded-full border-2 border-primary/30 border-t-primary animate-spin" />
                  <span className="text-xs text-gray-400">Loading transactions...</span>
                </div>
              </div>
            ) : transactions.length > 0 ? (
              <>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-white/[0.06] bg-white/[0.02]">
                      <th className="text-left px-5 py-3 font-medium text-gray-400 text-xs">Wallet</th>
                      <th className="text-left px-5 py-3 font-medium text-gray-400 text-xs">Side</th>
                      <th className="text-right px-5 py-3 font-medium text-gray-400 text-xs">Shares</th>
                      <th className="text-right px-5 py-3 font-medium text-gray-400 text-xs">Cost</th>
                      <th className="text-left px-5 py-3 font-medium text-gray-400 text-xs">Date</th>
                      <th className="text-left px-5 py-3 font-medium text-gray-400 text-xs">Tx</th>
                    </tr>
                  </thead>
                  <tbody>
                    {transactions.map((tx, i) => (
                      <tr key={i} className="border-b border-white/[0.04] hover:bg-white/[0.02] transition-colors duration-150">
                        <td className="px-5 py-3 text-foreground/90 font-mono text-xs">
                          {tx.wallet_address.length > 12 ? `${tx.wallet_address.slice(0, 6)}...${tx.wallet_address.slice(-4)}` : tx.wallet_address}
                        </td>
                        <td className="px-5 py-3">
                          <span className={`text-xs font-semibold ${tx.side === 'buy' ? 'text-success' : 'text-destructive'}`}>
                            {tx.side}
                          </span>
                        </td>
                        <td className="px-5 py-3 text-right font-mono text-xs text-foreground">{tx.shares}</td>
                        <td className="px-5 py-3 text-right font-mono text-xs font-medium text-primary">${Number(tx.cost).toFixed(2)}</td>
                        <td className="px-5 py-3 text-gray-400 font-mono text-xs">
                          {new Date(tx.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                        </td>
                        <td className="px-5 py-3 text-gray-500 font-mono text-xs truncate max-w-[100px]">
                          {tx.tx_hash}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {games.length > 0 && (
                  <div className="px-5 py-3 border-t border-white/[0.06] bg-white/[0.02]">
                    <h4 className="text-xs font-medium text-gray-400 uppercase tracking-wider">Recent Games (Last 5)</h4>
                  </div>
                )}
              </>
            ) : null}
            {games.length > 0 && (
              <>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-white/[0.06] bg-white/[0.02]">
                      <th className="text-left px-5 py-3 font-medium text-gray-400 text-xs">Recent Games</th>
                      <th className="text-left px-5 py-3 font-medium text-gray-400 text-xs">Matchup</th>
                      <th className="text-center px-5 py-3 font-medium text-gray-400 text-xs">W/L</th>
                      <th className="text-right px-5 py-3 font-medium text-gray-400 text-xs">PTS</th>
                      <th className="text-right px-5 py-3 font-medium text-gray-400 text-xs">REB</th>
                      <th className="text-right px-5 py-3 font-medium text-gray-400 text-xs">AST</th>
                      <th className="text-right px-5 py-3 font-medium text-gray-400 text-xs">STL</th>
                      <th className="text-right px-5 py-3 font-medium text-gray-400 text-xs">BLK</th>
                      <th className="text-right px-5 py-3 font-medium text-primary text-xs">FPts</th>
                    </tr>
                  </thead>
                  <tbody>
                    {games.map((game, i) => (
                      <tr key={i} className="border-b border-white/[0.04] last:border-0 hover:bg-white/[0.02] transition-colors duration-150">
                        <td className="px-5 py-3 text-gray-400 font-mono text-xs">{game.date}</td>
                        <td className="px-5 py-3 text-foreground/90 text-xs">{game.matchup}</td>
                        <td className="px-5 py-3 text-center">
                          <span className={`text-xs font-semibold ${game.result === 'W' ? 'text-success' : 'text-destructive'}`}>
                            {game.result}
                          </span>
                        </td>
                        <td className="px-5 py-3 text-right font-mono text-xs text-foreground">{game.stats.PTS?.toFixed(0)}</td>
                        <td className="px-5 py-3 text-right font-mono text-xs text-foreground">{game.stats.REB?.toFixed(0)}</td>
                        <td className="px-5 py-3 text-right font-mono text-xs text-foreground">{game.stats.AST?.toFixed(0)}</td>
                        <td className="px-5 py-3 text-right font-mono text-xs text-foreground">{game.stats.STL?.toFixed(0)}</td>
                        <td className="px-5 py-3 text-right font-mono text-xs text-foreground">{game.stats.BLK?.toFixed(0)}</td>
                        <td className="px-5 py-3 text-right font-mono text-xs font-semibold text-primary">
                          {game.fantasy_points.toFixed(1)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
