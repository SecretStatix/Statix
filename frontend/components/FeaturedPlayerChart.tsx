'use client';

import { ResponsiveContainer, AreaChart, Area, YAxis } from 'recharts';

interface FeaturedPlayerChartProps {
  data: { value: number }[];
  isPositive: boolean;
}

export default function FeaturedPlayerChart({ data, isPositive }: FeaturedPlayerChartProps) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={data} margin={{ top: 2, right: 0, bottom: 2, left: 0 }}>
        <defs>
          <linearGradient id="featuredGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={isPositive ? '#3EE88A' : '#FF6B6B'} stopOpacity={0.3} />
            <stop offset="95%" stopColor={isPositive ? '#3EE88A' : '#FF6B6B'} stopOpacity={0} />
          </linearGradient>
        </defs>
        <YAxis domain={['dataMin', 'dataMax']} hide />
        <Area
          type="monotone"
          dataKey="value"
          stroke={isPositive ? '#3EE88A' : '#FF6B6B'}
          strokeWidth={2}
          fill="url(#featuredGrad)"
          dot={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
