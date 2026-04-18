'use client';

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

interface PlayerPriceChartProps {
  data: any[];
  chartMode: 'fpts' | 'price';
  chartColor: string;
  gradientId: string;
  dataKey: string;
  currentPrice: number;
}

export default function PlayerPriceChart({
  data,
  chartMode,
  chartColor,
  gradientId,
  dataKey,
  currentPrice,
}: PlayerPriceChartProps) {
  const chartData = chartMode === 'fpts' ? [...data].reverse() : data;

  return (
    <ResponsiveContainer width="100%" height={300}>
      <AreaChart data={chartData} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={chartColor} stopOpacity={0.18} />
            <stop offset="70%" stopColor={chartColor} stopOpacity={0.03} />
            <stop offset="100%" stopColor={chartColor} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid horizontal vertical={false} stroke="rgba(255,255,255,0.04)" strokeDasharray="3 3" />
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
          width={52}
          tickFormatter={chartMode === 'price' ? (v: number) => `$${v}` : undefined}
        />
        <Tooltip
          cursor={{ stroke: 'rgba(255,255,255,0.08)', strokeWidth: 1 }}
          content={({ active, payload, label }) => {
            if (!active || !payload?.length) return null;
            const row = payload[0].payload as { price?: number; fpts?: number };
            const isPrice = chartMode === 'price';
            const raw = isPrice ? row.price : row.fpts;
            if (raw === undefined) return null;
            const main = isPrice ? `$${Number(raw).toFixed(2)}` : `${Number(raw).toFixed(1)}`;
            const unit = isPrice ? 'Price' : 'FPts';
            return (
              <div
                style={{
                  backgroundColor: 'rgba(20, 21, 24, 0.92)',
                  border: '1px solid rgba(255,255,255,0.06)',
                  borderRadius: '8px',
                  fontSize: '12px',
                  boxShadow: '0 12px 40px rgba(0,0,0,0.55)',
                  padding: '8px 12px',
                }}
              >
                <p style={{ color: 'rgba(139, 141, 149, 0.7)', marginBottom: '2px', fontSize: '11px' }}>
                  {label}
                </p>
                <p style={{ color: chartColor, margin: 0 }}>
                  {unit}: {main}
                </p>
              </div>
            );
          }}
        />
        {chartMode === 'price' && (
          <ReferenceLine y={currentPrice} stroke="rgba(255,255,255,0.06)" strokeDasharray="3 3" />
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
  );
}
