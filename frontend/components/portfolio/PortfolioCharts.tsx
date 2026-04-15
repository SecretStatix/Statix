'use client';

import { useMemo, useState, useEffect } from 'react';
import { getPortfolioSnapshots, type PortfolioSnapshotPoint } from '@/lib/api';
import {
  ResponsiveContainer,
  ComposedChart,
  Line,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  PieChart,
  Pie,
  Cell,
  CartesianGrid,
} from 'recharts';

const CHART_BLUE = '#4A8AF4';
const CHART_BLUE_DIM = 'rgba(74, 138, 244, 0.28)';

const CHART_COLORS = [
  CHART_BLUE,
  '#22C55E',
  '#A78BFA',
  '#F472B6',
  '#FBBF24',
  '#22D3EE',
  '#FB923C',
  '#94A3B8',
];

type Range = '1W' | '1M';

function snapshotSeries(points: PortfolioSnapshotPoint[], range: Range) {
  const n = points.length;
  const pts: { idx: number; tick: string; v: number; vol: number }[] = [];
  for (let i = 0; i < n; i++) {
    const p = points[i]!;
    const prev = i > 0 ? points[i - 1]! : null;
    const vol = prev ? Math.abs(p.net_worth - prev.net_worth) : 0;
    pts.push({
      idx: i,
      tick: snapshotTickLabel(p.snapshot_at, i, n, range),
      v: p.net_worth,
      vol,
    });
  }
  return pts;
}

function snapshotTickLabel(iso: string, i: number, n: number, range: Range): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const step = Math.max(1, Math.floor((n - 1) / 7));
  if (i % step !== 0 && i !== n - 1) return '';
  if (range === '1W') {
    return d.toLocaleString(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' });
  }
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function formatYAxis(v: number): string {
  if (!Number.isFinite(v)) return '';
  const abs = Math.abs(v);
  if (abs >= 1e12) return `$${(v / 1e12).toFixed(2)}T`;
  if (abs >= 1e9) return `$${(v / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `$${(v / 1e6).toFixed(2)}M`;
  if (abs >= 1e3) return `$${(v / 1e3).toFixed(2)}k`;
  return `$${v.toFixed(0)}`;
}

function formatPillUsd(v: number): string {
  if (v >= 1e9) return `$${(v / 1e9).toFixed(2)}B`;
  if (v >= 1e6) return `$${(v / 1e6).toFixed(2)}M`;
  if (v >= 1e3) return `$${(v / 1e3).toFixed(2)}k`;
  return `$${v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export type AllocationSlice = { name: string; value: number; pct: number };

interface PortfolioChartsProps {
  walletAddress?: string;
  allocation: AllocationSlice[];
}

export function PortfolioCharts({ walletAddress, allocation }: PortfolioChartsProps) {
  const [range, setRange] = useState<Range>('1W');
  const [snapshots, setSnapshots] = useState<PortfolioSnapshotPoint[]>([]);
  const [fetchStatus, setFetchStatus] = useState<'idle' | 'loading' | 'done'>(() =>
    walletAddress ? 'loading' : 'idle'
  );

  const daysForRange = range === '1W' ? 7 : 30;

  useEffect(() => {
    if (!walletAddress) {
      setSnapshots([]);
      setFetchStatus('idle');
      return;
    }
    let cancelled = false;
    setFetchStatus('loading');
    setSnapshots([]);
    (async () => {
      try {
        const res = await getPortfolioSnapshots(walletAddress, daysForRange);
        if (cancelled) return;
        setSnapshots(res.points ?? []);
      } catch {
        if (!cancelled) setSnapshots([]);
      } finally {
        if (!cancelled) setFetchStatus('done');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [walletAddress, daysForRange]);

  const showChart = fetchStatus === 'done' && snapshots.length > 0;

  const lineData = useMemo(() => {
    if (!showChart) return [];
    return snapshotSeries(snapshots, range);
  }, [showChart, snapshots, range]);

  const pieData = useMemo(
    () =>
      allocation
        .filter((a) => a.value > 0)
        .map((a) => ({ name: a.name, value: a.value, pct: a.pct })),
    [allocation]
  );

  const lastIdx = lineData.length > 0 ? lineData.length - 1 : 0;
  const displayValue =
    showChart && snapshots.length ? snapshots[snapshots.length - 1]!.net_worth : 0;
  const pillText = formatPillUsd(displayValue);

  const xTickIndices = useMemo(
    () =>
      lineData.reduce<number[]>((acc, d) => {
        if (d.tick) acc.push(d.idx);
        return acc;
      }, []),
    [lineData]
  );

  return (
    <div className="grid grid-cols-1 lg:grid-cols-5 lg:divide-x lg:divide-white/[0.06]">
      {/* Chart: single dark canvas, no outer card chrome */}
      <div className="border-b border-white/[0.06] lg:col-span-3 lg:border-b-0">
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 pt-5 sm:px-8 sm:pt-6">
          <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-muted-foreground/70">
            Net worth
          </p>
          <div className="flex rounded-lg bg-white/[0.04] p-0.5">
            {(['1W', '1M'] as Range[]).map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setRange(r)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                  range === r
                    ? 'bg-white/[0.1] text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {r}
              </button>
            ))}
          </div>
        </div>

  

        <div className="relative mx-5 mb-5 mt-3 h-[260px] overflow-hidden rounded-xl bg-[#0c0d11] sm:mx-8 sm:mb-6">
          {fetchStatus === 'loading' ? (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              Loading chart…
            </div>
          ) : !showChart ? (
            <div className="flex h-full items-center justify-center px-6 text-center text-sm text-muted-foreground">
              Chart not available
            </div>
          ) : (
            <>
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart
                  data={lineData}
                  margin={{ top: 16, right: Math.min(140, pillText.length * 7 + 36), left: 4, bottom: 4 }}
                >
                  <CartesianGrid
                    stroke="rgba(255,255,255,0.06)"
                    vertical={false}
                    horizontal
                    strokeDasharray="0"
                  />
                  <XAxis
                    dataKey="idx"
                    type="number"
                    domain={[0, Math.max(0, lastIdx)]}
                    ticks={xTickIndices.length ? xTickIndices : [0]}
                    tick={{ fill: 'rgba(139, 141, 149, 0.55)', fontSize: 10 }}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(idx: number) => lineData[idx]?.tick ?? ''}
                    dy={8}
                  />
                  <YAxis
                    yAxisId="vol"
                    orientation="left"
                    hide
                    domain={[0, 'dataMax']}
                  />
                  <YAxis
                    yAxisId="price"
                    orientation="right"
                    tick={{ fill: 'rgba(139, 141, 149, 0.55)', fontSize: 10 }}
                    tickLine={false}
                    axisLine={false}
                    width={56}
                    domain={['auto', 'auto']}
                    tickFormatter={formatYAxis}
                  />
                  <Tooltip
                    cursor={{ stroke: 'rgba(255,255,255,0.07)', strokeWidth: 1 }}
                    contentStyle={{
                      backgroundColor: 'rgba(12, 13, 17, 0.96)',
                      border: '1px solid rgba(255,255,255,0.08)',
                      borderRadius: '8px',
                      fontSize: '12px',
                      boxShadow: '0 12px 40px rgba(0,0,0,0.55)',
                      padding: '8px 12px',
                    }}
                    labelStyle={{ color: 'rgba(139, 141, 149, 0.75)', fontSize: '11px' }}
                    formatter={(value: number | undefined) => [
                      `$${(value ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
                      'Value',
                    ]}
                  />
                  <Bar
                    yAxisId="vol"
                    dataKey="vol"
                    fill={CHART_BLUE_DIM}
                    barSize={3}
                    radius={[1, 1, 0, 0]}
                  />
                  <Line
                    yAxisId="price"
                    type="linear"
                    dataKey="v"
                    stroke={CHART_BLUE}
                    strokeWidth={2}
                    dot={(props) => {
                      const { cx, cy, index } = props;
                      if (cx == null || cy == null || index !== lastIdx) return null;
                      const w = Math.min(120, Math.max(52, pillText.length * 7 + 16));
                      return (
                        <g>
                          <rect
                            x={cx + 6}
                            y={cy - 11}
                            width={w}
                            height={22}
                            rx={5}
                            fill={CHART_BLUE}
                          />
                          <text
                            x={cx + 6 + w / 2}
                            y={cy + 4}
                            textAnchor="middle"
                            fill="#fff"
                            fontSize={11}
                            fontWeight={600}
                            className="tabular-nums"
                          >
                            {pillText}
                          </text>
                        </g>
                      );
                    }}
                    activeDot={false}
                    isAnimationActive={false}
                  />
                </ComposedChart>
              </ResponsiveContainer>
              <span className="pointer-events-none absolute bottom-2 right-4 text-[10px] text-muted-foreground/50">
                USD
              </span>
            </>
          )}
        </div>
      </div>

      <div className="flex flex-col px-5 py-5 sm:px-8 sm:py-6 lg:col-span-2">
        <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-muted-foreground/70">Allocation</p>
        <p className="mt-1 text-xs text-muted-foreground/60">By position value</p>
        <div className="mt-4 flex min-h-[220px] flex-1 flex-col items-center gap-5 sm:flex-row">
          {pieData.length === 0 ? (
            <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground py-8">
              No holdings to chart
            </div>
          ) : (
            <>
              <div className="h-[180px] w-[180px] shrink-0">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={pieData}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      innerRadius={52}
                      outerRadius={72}
                      paddingAngle={2}
                      stroke="none"
                    >
                      {pieData.map((_, i) => (
                        <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        backgroundColor: 'rgba(20, 21, 24, 0.94)',
                        border: '1px solid rgba(255,255,255,0.06)',
                        borderRadius: '10px',
                        fontSize: '12px',
                        padding: '8px 12px',
                      }}
                      formatter={(value: number | undefined, _n, item) => {
                        const payload = item?.payload as { pct?: number } | undefined;
                        const pct = payload?.pct;
                        return [
                          `$${(value ?? 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}${
                            pct != null ? ` (${pct.toFixed(1)}%)` : ''
                          }`,
                          'Value',
                        ];
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <ul className="flex-1 space-y-2 min-w-0 w-full">
                {pieData.slice(0, 6).map((d, i) => (
                  <li key={d.name} className="flex items-center gap-2 text-xs">
                    <span
                      className="h-2 w-2 shrink-0 rounded-full"
                      style={{ backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }}
                    />
                    <span className="truncate text-muted-foreground flex-1">{d.name}</span>
                    <span className="tabular-nums text-foreground font-medium">{d.pct.toFixed(1)}%</span>
                  </li>
                ))}
                {pieData.length > 6 && (
                  <li className="text-[10px] text-muted-foreground/70 pl-4">+{pieData.length - 6} more</li>
                )}
              </ul>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
