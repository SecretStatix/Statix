'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, TrendingUp, TrendingDown, Newspaper, ExternalLink } from 'lucide-react';
import { getPlayer, getPlayerGames, getPlayerTransactions, getPlayerPriceHistory } from '@/lib/api';
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

interface NewsItem {
  title: string;
  source: string;
  time: string;
  url: string;
  sentiment: 'positive' | 'negative' | 'neutral';
  category: 'player' | 'team';
}

type TimeRange = '1W' | '1M' | '3M';
type StatsPeriod = 'season' | 'last1' | 'last5';

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function formatDateLabel(dateStr: string): string {
  const trimmed = dateStr.length > 8 ? dateStr.slice(0, 8).trim() : dateStr.trim();
  const parts = trimmed.split('/');
  if (parts.length >= 2) {
    const monthIdx = parseInt(parts[0], 10) - 1;
    const day = parseInt(parts[1], 10);
    if (monthIdx >= 0 && monthIdx < 12 && !isNaN(day)) {
      return `${MONTH_NAMES[monthIdx]} ${day}`;
    }
  }
  return trimmed;
}

function AnimatedValue({ value, decimals = 1 }: { value: number; decimals?: number }) {
  const [display, setDisplay] = useState(value);
  const [color, setColor] = useState<'text-foreground' | 'text-success' | 'text-destructive'>('text-foreground');
  const prevRef = useRef(value);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const from = prevRef.current;
    const to = value;
    prevRef.current = value;

    if (from === to) return;

    const direction = to > from ? 1 : -1;
    const step = Math.pow(10, -decimals); // 0.1 for 1 decimal
    const totalSteps = Math.round(Math.abs(to - from) / step);
    const maxSteps = 30; // cap at 30 ticks
    const actualSteps = Math.min(totalSteps, maxSteps);
    const stepSize = (to - from) / actualSteps;

    setColor(direction > 0 ? 'text-success' : 'text-destructive');

    let current = 0;
    const tick = () => {
      current++;
      if (current >= actualSteps) {
        setDisplay(to);
        return;
      }
      setDisplay(Math.round((from + stepSize * current) * Math.pow(10, decimals)) / Math.pow(10, decimals));
      rafRef.current = requestAnimationFrame(() => setTimeout(tick, 30));
    };
    tick();

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [value, decimals]);

  return (
    <span className={`transition-colors duration-300 ${color}`}>
      {display.toFixed(decimals)}
    </span>
  );
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
  const [priceHistoryLoading, setPriceHistoryLoading] = useState(true);
  const [priceHistory, setPriceHistory] = useState<{
    points: { timestamp: string; price: number }[];
    range_change_pct: number | null;
    vs_listing_pct: number;
  } | null>(null);
  const [error, setError] = useState('');
  const [chartMode, setChartMode] = useState<'fpts' | 'price'>('price');
  const [timeRange, setTimeRange] = useState<TimeRange>('3M');
  const [statsPeriod, setStatsPeriod] = useState<StatsPeriod>('season');
  const [news, setNews] = useState<NewsItem[]>([]);
  const [newsLoading, setNewsLoading] = useState(true);

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

  useEffect(() => {
    async function loadNews() {
      if (!player) return;
      try {
        const res = await fetch(`/api/player-news?player=${encodeURIComponent(player.name)}&team=${encodeURIComponent(player.team)}`);
        const data = await res.json();
        if (Array.isArray(data.news) && data.news.length > 0) {
          setNews(data.news);
        }
      } catch {
        console.error('Failed to load news');
      } finally {
        setNewsLoading(false);
      }
    }
    loadNews();
  }, [player]);

  const priceRangeDays = useMemo(
    () => (timeRange === '1W' ? 7 : timeRange === '1M' ? 30 : 90),
    [timeRange]
  );

  const currentPrice =
    onChainPrice != null
      ? parseFloat(formatUnits(onChainPrice as bigint, 6))
      : null;

  useEffect(() => {
    async function loadPriceHistory() {
      if (!player) return;
      setPriceHistoryLoading(true);
      try {
        const data = await getPlayerPriceHistory(playerId, priceRangeDays);
        setPriceHistory({
          points: data.points ?? [],
          range_change_pct: data.range_change_pct ?? null,
          vs_listing_pct: data.vs_listing_pct ?? 0,
        });
      } catch {
        console.error('Failed to load price history');
        setPriceHistory(null);
      } finally {
        setPriceHistoryLoading(false);
      }
    }
    loadPriceHistory();
  }, [player, playerId, priceRangeDays]);

  const chartDataPrice = useMemo(() => {
    if (!priceHistory?.points?.length) return [];
    return priceHistory.points.map((pt) => {
      const d = new Date(pt.timestamp);
      const label = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      return { label, price: Math.round(pt.price * 100) / 100 };
    });
  }, [priceHistory]);

  const chartDataFptsAll = games
    .slice()
    .map((g) => ({
      label: formatDateLabel(g.date),
      fpts: g.fantasy_points,
      matchup: g.matchup,
      result: g.result,
    }));

  const timeRangeLimit = timeRange === '1W' ? 7 : timeRange === '1M' ? 14 : Infinity;

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
  const priceChangeVsListing =
    currentPrice != null ? ((currentPrice - 10) / 10) * 100 : 0;
  const displayChange =
    chartMode === 'price'
      ? priceHistory?.range_change_pct ?? priceHistory?.vs_listing_pct ?? priceChangeVsListing
      : percentChange;
  const isPositive = displayChange >= 0;

  // Compute display stats BEFORE early returns (React hooks rule)
  const seasonStats = player?.avg_stats || {};
  const displayStats = useMemo(() => {
    if (statsPeriod === 'last1' && games.length > 0) {
      return games[0].stats;
    } else if (statsPeriod === 'last5' && games.length > 0) {
      const slice = games.slice(0, Math.min(5, games.length));
      const avg: Record<string, number> = {};
      for (const key of ['PTS', 'REB', 'AST', 'STL', 'BLK', 'TOV']) {
        avg[key] = slice.reduce((sum, g) => sum + (g.stats[key] || 0), 0) / slice.length;
      }
      return avg;
    }
    return seasonStats;
  }, [statsPeriod, games, seasonStats]);

  const statEntries: { label: string; value: string; key: string }[] = [
    { label: 'PTS', value: (displayStats.PTS ?? 0).toFixed(1), key: 'pts' },
    { label: 'REB', value: (displayStats.REB ?? 0).toFixed(1), key: 'reb' },
    { label: 'AST', value: (displayStats.AST ?? 0).toFixed(1), key: 'ast' },
    { label: 'STL', value: (displayStats.STL ?? 0).toFixed(1), key: 'stl' },
    { label: 'BLK', value: (displayStats.BLK ?? 0).toFixed(1), key: 'blk' },
    { label: 'TOV', value: (displayStats.TOV ?? 0).toFixed(1), key: 'tov' },
  ];

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

  if (currentPrice === null) {
    return (
      <div className="flex items-center justify-center py-32">
        <div className="flex flex-col items-center gap-4">
          <div className="w-8 h-8 rounded-full border-2 border-primary/30 border-t-primary animate-spin" />
          <span className="text-sm text-muted-foreground">Loading on-chain price…</span>
        </div>
      </div>
    );
  }

  const avgFpts = Number(player.avg_fantasy_points) || (Number(player.weekly_projection) || 0) / 3.5 || 0;
  const weeklyProj = Number(player.weekly_projection) || avgFpts * 3.5;
  const seasonProj = Number(player.season_projection) || avgFpts * 82;
  const price = currentPrice;

  const chartColor = chartMode === 'price'
    ? (isPositive ? '#3EE88A' : '#FF6B6B')
    : '#5B9AFF';
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
            {chartMode === 'fpts'
              ? `${chartData.length} games`
              : priceHistoryLoading
                ? 'Loading…'
                : process.env.NEXT_PUBLIC_DEMO_MODE === 'true'
                  ? 'Demo'
                  : 'Pool snapshots'}
          </span>
        </div>

        {/* Chart body — no border wrapper, clean and open */}
        {((chartMode === 'fpts' && gamesLoading) || (chartMode === 'price' && priceHistoryLoading)) ? (
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
                    <stop offset="0%" stopColor={chartColor} stopOpacity={0.18} />
                    <stop offset="70%" stopColor={chartColor} stopOpacity={0.03} />
                    <stop offset="100%" stopColor={chartColor} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid
                  horizontal={true}
                  vertical={false}
                  stroke="rgba(255,255,255,0.04)"
                  strokeDasharray="3 3"
                />
                <XAxis
                  dataKey="label"
                  tick={{ fill: 'rgba(139, 141, 149, 0.5)', fontSize: 10 }}
                  tickLine={false}
                  axisLine={false}
                  dy={8}
                />
                <YAxis
                  domain={['dataMin - 0.5', 'dataMax + 0.5']}
                  tick={{ fill: 'rgba(139, 141, 149, 0.4)', fontSize: 10 }}
                  tickLine={false}
                  axisLine={false}
                  width={40}
                  tickFormatter={chartMode === 'price' ? (v: number) => `$${v}` : undefined}
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
                  type="linear"
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
        {/* Trading panel + News — left */}
        <div className="lg:col-span-1 order-first lg:order-none space-y-6">
          <PlayerTradingPanel playerIndex={player.index} price={price} />

          {/* News Section */}
          <div className="rounded-xl border border-white/[0.06] bg-card overflow-hidden">
            <div className="px-4 py-3 border-b border-white/[0.06] flex items-center gap-2">
              <Newspaper className="w-3.5 h-3.5 text-primary" />
              <h3 className="text-sm font-semibold text-foreground">News</h3>
              <span className="ml-auto text-[9px] text-muted-foreground/40 uppercase tracking-wider">Live</span>
            </div>

            {newsLoading ? (
              <div className="px-4 py-8 flex flex-col items-center gap-2">
                <div className="w-5 h-5 rounded-full border-2 border-primary/30 border-t-primary animate-spin" />
                <span className="text-[10px] text-muted-foreground/40">Loading news...</span>
              </div>
            ) : news.length === 0 ? (
              <div className="px-4 py-6 text-center">
                <p className="text-xs text-muted-foreground/50">No news available</p>
              </div>
            ) : (
              <div className="divide-y divide-white/[0.04]">
                {/* Player news */}
                {news.some(n => n.category === 'player') && (
                  <div className="px-4 pt-3 pb-1">
                    <span className="text-xs text-muted-foreground/50 uppercase tracking-wider font-semibold">Player</span>
                  </div>
                )}
                {news.filter(n => n.category === 'player').map((item, i) => (
                  <a key={`p-${i}`} href={item.url} target="_blank" rel="noopener noreferrer" className="block px-4 py-3 hover:bg-white/[0.02] transition-colors cursor-pointer group">
                    <div className="flex items-start gap-2.5">
                      <div className={`w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 ${
                        item.sentiment === 'positive' ? 'bg-success' : item.sentiment === 'negative' ? 'bg-destructive' : 'bg-muted-foreground/40'
                      }`} />
                      <div className="min-w-0 flex-1">
                        <p className="text-xs text-foreground/80 leading-relaxed group-hover:text-foreground transition-colors">
                          {item.title}
                        </p>
                        <div className="flex items-center gap-2 mt-1.5">
                          <span className="text-[10px] text-muted-foreground/40">{item.source}</span>
                          <span className="text-[10px] text-muted-foreground/30">{item.time}</span>
                        </div>
                      </div>
                      <ExternalLink className="w-3 h-3 text-muted-foreground/20 group-hover:text-muted-foreground/50 transition-colors mt-0.5 shrink-0" />
                    </div>
                  </a>
                ))}

                {/* Team news */}
                {news.some(n => n.category === 'team') && (
                  <div className="px-4 pt-3 pb-1">
                    <span className="text-xs text-muted-foreground/50 uppercase tracking-wider font-semibold">Team</span>
                  </div>
                )}
                {news.filter(n => n.category === 'team').map((item, i) => (
                  <a key={`t-${i}`} href={item.url} target="_blank" rel="noopener noreferrer" className="block px-4 py-3 hover:bg-white/[0.02] transition-colors cursor-pointer group">
                    <div className="flex items-start gap-2.5">
                      <div className={`w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 ${
                        item.sentiment === 'positive' ? 'bg-success' : item.sentiment === 'negative' ? 'bg-destructive' : 'bg-muted-foreground/40'
                      }`} />
                      <div className="min-w-0 flex-1">
                        <p className="text-xs text-foreground/80 leading-relaxed group-hover:text-foreground transition-colors">
                          {item.title}
                        </p>
                        <div className="flex items-center gap-2 mt-1.5">
                          <span className="text-[10px] text-muted-foreground/40">{item.source}</span>
                          <span className="text-[10px] text-muted-foreground/30">{item.time}</span>
                        </div>
                      </div>
                      <ExternalLink className="w-3 h-3 text-muted-foreground/20 group-hover:text-muted-foreground/50 transition-colors mt-0.5 shrink-0" />
                    </div>
                  </a>
                ))}
              </div>
            )}

            <div className="px-4 py-2.5 border-t border-white/[0.04] bg-white/[0.01]">
              <p className="text-[9px] text-muted-foreground/30 text-center">
                News sourced from Google News — not financial advice
              </p>
            </div>
          </div>
        </div>

        {/* Stats + tables — right */}
        <div className="space-y-8 lg:col-span-2">
          {/* Player Averages — with period toggle */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-[11px] font-medium text-muted-foreground/60 uppercase tracking-widest">
                Player Averages
              </h3>
              <div className="flex items-center gap-0.5">
                {([
                  { key: 'season' as StatsPeriod, label: 'Season' },
                  { key: 'last5' as StatsPeriod, label: 'Last 5' },
                  { key: 'last1' as StatsPeriod, label: 'Last Game' },
                ]).map(({ key, label }) => (
                  <button
                    key={key}
                    onClick={() => setStatsPeriod(key)}
                    className={`px-2.5 py-1 text-[10px] font-medium rounded-md transition-all duration-200 ${
                      statsPeriod === key
                        ? 'bg-white/[0.08] text-foreground'
                        : 'text-muted-foreground/50 hover:text-foreground'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex items-center">
              {statEntries.map((s, i) => (
                <div
                  key={s.key}
                  className={`flex-1 text-center py-3 overflow-hidden ${
                    i > 0 ? 'border-l border-white/[0.05]' : ''
                  }`}
                >
                  <p className="text-lg md:text-xl font-bold tabular-nums">
                    <AnimatedValue value={parseFloat(s.value)} />
                  </p>
                  <p className="text-[10px] text-muted-foreground/50 mt-1 uppercase tracking-wider font-medium">
                    {s.label}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* Fantasy Projections — stat cards with accent bars */}
          <div>
            <h3 className="text-[11px] font-medium text-muted-foreground/60 uppercase tracking-widest mb-4">
              Fantasy Projections
            </h3>
            <div className="grid grid-cols-3 gap-4">
              <div className="relative overflow-hidden rounded-xl bg-card border border-white/[0.06] p-4">
                <div className="absolute top-0 left-0 w-1 h-full bg-primary" />
                <p className="text-[10px] text-muted-foreground/50 uppercase tracking-wider font-medium ml-2">FPts/Game</p>
                <p className="text-2xl font-bold text-primary mt-2 ml-2 tabular-nums">{avgFpts.toFixed(1)}</p>
                <p className="text-[10px] text-muted-foreground/30 mt-1 ml-2">per game avg</p>
                <div className="absolute -bottom-3 -right-3 w-20 h-20 bg-primary/[0.06] rounded-full blur-2xl" />
              </div>
              <div className="relative overflow-hidden rounded-xl bg-card border border-white/[0.06] p-4">
                <div className="absolute top-0 left-0 w-1 h-full bg-success" />
                <p className="text-[10px] text-muted-foreground/50 uppercase tracking-wider font-medium ml-2">Weekly</p>
                <p className="text-2xl font-bold text-foreground mt-2 ml-2 tabular-nums">{weeklyProj.toFixed(1)}</p>
                <p className="text-[10px] text-muted-foreground/30 mt-1 ml-2">~3.5 games</p>
                <div className="absolute -bottom-3 -right-3 w-20 h-20 bg-success/[0.06] rounded-full blur-2xl" />
              </div>
              <div className="relative overflow-hidden rounded-xl bg-card border border-white/[0.06] p-4">
                <div className="absolute top-0 left-0 w-1 h-full bg-amber-400" />
                <p className="text-[10px] text-muted-foreground/50 uppercase tracking-wider font-medium ml-2">Season</p>
                <p className="text-2xl font-bold text-foreground mt-2 ml-2 tabular-nums">{seasonProj.toFixed(0)}</p>
                <p className="text-[10px] text-muted-foreground/30 mt-1 ml-2">82 games</p>
                <div className="absolute -bottom-3 -right-3 w-20 h-20 bg-amber-400/[0.06] rounded-full blur-2xl" />
              </div>
            </div>
            <p className="text-[10px] text-muted-foreground/30 mt-3">
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
