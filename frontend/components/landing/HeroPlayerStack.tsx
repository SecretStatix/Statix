'use client';

import Image from 'next/image';
import { motion, useReducedMotion } from 'motion/react';
import { FEATURED_STARS, headshotUrl } from './featuredStars';

// Hero stack — six star headshots float into a fanned spread, then breathe
// gently up/down. Each card lives inside a tilted glass panel with a colored
// radial behind it. The whole stack is positioned absolute relative to its
// parent so it can sit over a section background.
export function HeroPlayerStack() {
  const reduce = useReducedMotion();

  // The stars we feature in the hero, in stack order (back → front).
  const stars = [
    FEATURED_STARS[5], // SGA
    FEATURED_STARS[2], // Jokic
    FEATURED_STARS[7], // Wemby
    FEATURED_STARS[1], // Curry
    FEATURED_STARS[0], // LeBron
    FEATURED_STARS[4], // Tatum
  ];

  // Pre-baked layout so the cards splay outward — translateX/rotate values are
  // hand-picked to feel like a fanned-out hand of cards.
  const layouts = [
    { x: -260, y: 30, rot: -14, z: 0,  scale: 0.85, blur: 1.5 },
    { x: -160, y: -10, rot: -8,  z: 1,  scale: 0.92, blur: 0.6 },
    { x: -50,  y: -30, rot: -2,  z: 2,  scale: 0.97, blur: 0 },
    { x: 60,   y: -28, rot: 3,   z: 3,  scale: 1.0,  blur: 0 },
    { x: 170,  y: -8,  rot: 9,   z: 2,  scale: 0.95, blur: 0.4 },
    { x: 270,  y: 32,  rot: 15,  z: 1,  scale: 0.86, blur: 1.5 },
  ];

  return (
    <div className="relative h-[420px] w-full sm:h-[520px]">
      {/* Court key arc behind the stack */}
      <svg
        aria-hidden
        viewBox="0 0 800 400"
        className="absolute inset-x-0 bottom-0 h-full w-full opacity-30"
        preserveAspectRatio="xMidYMax meet"
      >
        <defs>
          <linearGradient id="courtArcGrad" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#5B9AFF" stopOpacity="0.4" />
            <stop offset="100%" stopColor="#5B9AFF" stopOpacity="0" />
          </linearGradient>
        </defs>
        <motion.path
          d="M 100 380 A 300 300 0 0 1 700 380"
          fill="none"
          stroke="url(#courtArcGrad)"
          strokeWidth="2"
          initial={{ pathLength: 0, opacity: 0 }}
          animate={{ pathLength: 1, opacity: 1 }}
          transition={{ duration: 2, ease: [0.22, 1, 0.36, 1], delay: 0.3 }}
        />
        <motion.circle
          cx="400"
          cy="380"
          r="80"
          fill="none"
          stroke="url(#courtArcGrad)"
          strokeWidth="1.5"
          initial={{ pathLength: 0, opacity: 0 }}
          animate={{ pathLength: 1, opacity: 1 }}
          transition={{ duration: 1.8, ease: 'easeOut', delay: 0.5 }}
        />
      </svg>

      <div className="absolute inset-0 flex items-center justify-center">
        {stars.map((star, i) => {
          const l = layouts[i];
          return (
            <motion.div
              key={star.id}
              className="absolute"
              style={{ zIndex: l.z + 1 }}
              initial={{ opacity: 0, y: 60, scale: 0.6, rotate: 0 }}
              animate={{
                opacity: 1,
                y: l.y,
                x: l.x,
                rotate: l.rot,
                scale: l.scale,
              }}
              transition={{
                duration: 1.1,
                ease: [0.22, 1, 0.36, 1],
                delay: 0.15 + i * 0.08,
              }}
            >
              <motion.div
                animate={
                  reduce
                    ? undefined
                    : {
                        y: [0, -10, 0],
                      }
                }
                transition={{
                  duration: 5 + i * 0.4,
                  repeat: Infinity,
                  ease: 'easeInOut',
                  delay: i * 0.2,
                }}
              >
                <PlayerCard star={star} blur={l.blur} />
              </motion.div>
            </motion.div>
          );
        })}
      </div>

      {/* Soft floor reflection */}
      <div
        aria-hidden
        className="absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-background to-transparent"
      />
    </div>
  );
}

function PlayerCard({
  star,
  blur,
}: {
  star: (typeof FEATURED_STARS)[number];
  blur: number;
}) {
  return (
    <div
      className="relative h-[270px] w-[200px] sm:h-[320px] sm:w-[240px] overflow-hidden rounded-[28px] border border-white/[0.08] bg-card/60 shadow-2xl shadow-black/50 backdrop-blur"
      style={{ filter: blur ? `blur(${blur}px)` : undefined }}
    >
      {/* Team-color radial */}
      <div
        aria-hidden
        className="absolute inset-0"
        style={{
          background: `radial-gradient(ellipse at 50% 30%, ${star.accent}40, transparent 65%)`,
        }}
      />
      {/* Headshot */}
      <Image
        src={headshotUrl(star.nbaId, '1040x760')}
        alt={star.name}
        width={520}
        height={380}
        priority
        className="absolute inset-x-0 bottom-0 h-[78%] w-full object-cover object-top"
        sizes="240px"
      />
      {/* Bottom info bar */}
      <div className="absolute inset-x-0 bottom-0 z-10 bg-gradient-to-t from-black/85 via-black/45 to-transparent px-4 py-3">
        <div className="flex items-end justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-[10px] font-semibold uppercase tracking-wider text-white/70">
              {star.team}
            </p>
            <p className="truncate text-sm font-bold text-white">{star.name}</p>
          </div>
          <span className="rounded-md bg-white/10 px-1.5 py-0.5 text-[10px] font-mono font-bold text-white/90 backdrop-blur">
            ${star.symbol.slice(0, 4)}
          </span>
        </div>
      </div>
      {/* Top corner accent */}
      <div className="absolute right-3 top-3 z-10 flex items-center gap-1 rounded-full bg-success/20 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-success ring-1 ring-success/30 backdrop-blur">
        <span className="h-1 w-1 rounded-full bg-success" />
        Live
      </div>
    </div>
  );
}
