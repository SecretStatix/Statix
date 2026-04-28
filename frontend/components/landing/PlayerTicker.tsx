'use client';

import Image from 'next/image';
import { motion } from 'motion/react';
import { ArrowDown, ArrowUp } from 'lucide-react';
import { FEATURED_STARS, headshotUrl } from './featuredStars';

// Deterministic pseudo-random so SSR and client agree (no hydration mismatch).
function pseudo(n: number) {
  return Math.abs(Math.sin(n * 9301 + 49297)) * 1.0;
}

export function PlayerTicker() {
  // Pre-bake fake price + delta per player so the bar feels alive without
  // hitting the chain.
  const items = FEATURED_STARS.map((s, i) => {
    const price = 8 + pseudo(i + 1) * 28;
    const change = (pseudo(i + 7) - 0.5) * 14;
    return { ...s, price, change };
  });

  // Duplicate the items twice so the marquee can scroll seamlessly.
  const loop = [...items, ...items];

  return (
    <div className="relative w-full overflow-hidden border-y border-white/[0.06] bg-white/[0.015] py-4 ticker-mask">
      <motion.div
        className="flex gap-3 sm:gap-4 whitespace-nowrap pr-3"
        animate={{ x: ['0%', '-50%'] }}
        transition={{
          duration: 60,
          ease: 'linear',
          repeat: Infinity,
        }}
      >
        {loop.map((p, idx) => (
          <TickerItem key={`${p.id}-${idx}`} player={p} />
        ))}
      </motion.div>
    </div>
  );
}

function TickerItem({
  player,
}: {
  player: (typeof FEATURED_STARS)[number] & { price: number; change: number };
}) {
  const up = player.change >= 0;
  return (
    <div className="flex shrink-0 items-center gap-3 rounded-xl border border-white/[0.06] bg-card/40 px-3 py-1.5 backdrop-blur">
      <div className="relative h-8 w-8 overflow-hidden rounded-lg bg-secondary">
        <Image
          src={headshotUrl(player.nbaId, '260x190')}
          alt={player.name}
          width={64}
          height={48}
          className="h-full w-full object-cover object-top"
          sizes="32px"
        />
      </div>
      <div className="flex items-baseline gap-2">
        <span className="text-sm font-semibold text-foreground">${player.symbol.slice(0, 4)}</span>
        <span className="text-sm tabular-nums text-muted-foreground">
          ${player.price.toFixed(2)}
        </span>
        <span
          className={`flex items-center gap-0.5 text-xs font-semibold tabular-nums ${
            up ? 'text-success' : 'text-destructive'
          }`}
        >
          {up ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
          {Math.abs(player.change).toFixed(2)}%
        </span>
      </div>
    </div>
  );
}
