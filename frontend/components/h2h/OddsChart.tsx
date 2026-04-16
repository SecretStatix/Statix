'use client';

// Price history chart (implied_prob_a over time) for a single market.
// Populated in P3 using h2h_pool_snapshots + h2h_trades as data source.

interface OddsChartProps {
  marketId: number;
}

export function OddsChart({ marketId }: OddsChartProps) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="text-xs text-muted-foreground">Market #{marketId} — chart in P3</div>
    </div>
  );
}
