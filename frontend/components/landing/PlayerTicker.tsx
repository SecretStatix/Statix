'use client';

import { TrendingDown, TrendingUp } from 'lucide-react';
import { FEATURED_STARS } from './featuredStars';

// Deterministic pseudo-random so SSR and client agree.
function pseudo(n: number) {
  return Math.abs(Math.sin(n * 9301 + 49297)) % 1;
}

// Mirrors `frontend/components/PriceTicker.tsx` — the bar that runs across
// the top of the real market page. We can't share the component directly
// because that one requires live `PlayerData` + on-chain prices, but the
// markup, animation, and styling here are identical so the landing page
// looks exactly like the app.
export function PlayerTicker() {
  // Use the featured stars with deterministic mock prices/deltas. The same
  // tier model the market uses for `pct` would be overkill here — we just
  // want plausible-looking numbers.
  const top = FEATURED_STARS.map((s, i) => {
    const price = 8 + pseudo(i + 1) * 28;
    const pct = (pseudo(i + 7) - 0.5) * 24;
    return { ...s, price, pct };
  });

  // Triple the content so the -33.333% keyframe translation loops seamlessly.
  const loop = [...top, ...top, ...top];

  return (
    <div className="ticker-mask relative overflow-hidden h-10">
      <div className="ticker-track flex items-center h-full whitespace-nowrap will-change-transform">
        {loop.map((p, i) => {
          const up = p.pct >= 0;
          return (
            <span
              key={`${p.id}-${i}`}
              className="inline-flex items-center gap-2 px-5 text-sm h-full"
            >
              <span className="font-semibold text-foreground">{p.name.split(' ')[0]}</span>
              <span className="font-mono text-xs text-muted-foreground">${p.price.toFixed(2)}</span>
              <span
                className={`inline-flex items-center gap-0.5 text-xs font-semibold ${
                  up ? 'text-success' : 'text-destructive'
                }`}
              >
                {up ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                {up ? '+' : ''}
                {p.pct.toFixed(1)}%
              </span>
              <span className="text-white/10 pl-2">|</span>
            </span>
          );
        })}
      </div>
    </div>
  );
}
