'use client';

import { useState, useEffect, useRef } from 'react';
import { useReadContract } from 'wagmi';
import { formatUnits } from 'viem';
import { DBucksABI, CONTRACTS } from '@/lib/abis';

// Reads the accumulated fee balance sitting in DividendHub — this is the real dividend pool.
function useDividendPoolTotal(): number {
  const { data } = useReadContract({
    address: CONTRACTS.DBucks as `0x${string}`,
    abi: DBucksABI,
    functionName: 'balanceOf',
    args: [CONTRACTS.DividendHub as `0x${string}`],
    query: { refetchInterval: 30_000 }, // refresh every 30s
  });

  return data ? parseFloat(formatUnits(data as bigint, 6)) : 0;
}

// ── Animated number display (same pattern as player page) ────────────
function AnimatedValue({ value, decimals = 2 }: { value: number; decimals?: number }) {
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
    const step = Math.pow(10, -decimals);
    const totalSteps = Math.round(Math.abs(to - from) / step);
    const maxSteps = 30;
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
      setDisplay(
        Math.round((from + stepSize * current) * Math.pow(10, decimals)) / Math.pow(10, decimals)
      );
      rafRef.current = requestAnimationFrame(() => setTimeout(tick, 30));
    };
    tick();

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [value, decimals]);

  return (
    <span className={`transition-colors duration-300 ${color}`}>
      ${display.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}
    </span>
  );
}

// ── Main component ───────────────────────────────────────────────────
export function AnimatedDividendPool() {
  const total = useDividendPoolTotal();

  return (
    <div className="relative flex flex-col items-center py-8">
      {/* Glow backdrop */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div
          className="dividend-glow w-64 h-32 rounded-full"
          style={{
            background: 'radial-gradient(ellipse at center, rgba(62, 232, 138, 0.15), transparent 70%)',
          }}
        />
      </div>

      {/* Label */}
      <p className="relative text-[11px] font-medium uppercase tracking-[0.2em] text-muted-foreground/70 mb-2">
        Dividend Pool This Week
      </p>

      {/* Animated value */}
      <p className="relative text-4xl sm:text-5xl font-bold tabular-nums tracking-tight">
        <AnimatedValue value={total} decimals={2} />
      </p>
    </div>
  );
}
