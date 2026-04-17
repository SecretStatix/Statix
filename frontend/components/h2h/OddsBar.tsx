'use client';

interface OddsBarProps {
  probA: number; // 0..1
}

export function OddsBar({ probA }: OddsBarProps) {
  const pctA = Math.max(0, Math.min(1, probA)) * 100;
  const pctB = 100 - pctA;

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs font-semibold">
        <span className="text-success">{pctA.toFixed(0)}%</span>
        <span className="text-destructive">{pctB.toFixed(0)}%</span>
      </div>
      <div className="flex h-2 overflow-hidden rounded-full bg-secondary">
        <div
          className="h-full bg-success transition-all duration-300"
          style={{ width: `${pctA}%` }}
        />
        <div
          className="h-full bg-destructive transition-all duration-300"
          style={{ width: `${pctB}%` }}
        />
      </div>
    </div>
  );
}
