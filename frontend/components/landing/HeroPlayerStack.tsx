'use client';

import Image from 'next/image';
import { motion, useReducedMotion } from 'motion/react';
import { useState } from 'react';
import { ArrowDown, ArrowUp } from 'lucide-react';
import { getTeamColor, hexToRgb } from '@/lib/teamColors';
import { FEATURED_STARS, headshotUrl, type FeaturedStar } from './featuredStars';

// Deterministic pseudo-random in [0, 1) so SSR and client agree.
function pseudo(n: number) {
  return Math.abs(Math.sin(n * 12.9898 + 78.233) * 43758.5453) % 1;
}

type DemoCard = FeaturedStar & {
  price: number;
  pctChange: number;
  position: 'G' | 'F' | 'C';
};

const POSITIONS: Array<DemoCard['position']> = ['G', 'F', 'C'];

function buildDemo(star: FeaturedStar, i: number): DemoCard {
  const price = 12 + pseudo(i + 1) * 24; // $12–$36
  const pct = (pseudo(i + 7) - 0.45) * 24; // mostly positive, range ~ -11 to +13
  return {
    ...star,
    price,
    pctChange: pct,
    position: POSITIONS[i % POSITIONS.length],
  };
}

// Hero stack — five poster-style cards fanned out, breathing gently. Each
// card features a big transparent NBA headshot as the focal point with a
// small live price chip up top and Buy/Sell action buttons at the bottom —
// communicating "this is a trading interface" without feeling like collectible
// trading cards.
export function HeroPlayerStack() {
  const reduce = useReducedMotion();

  // Five stars, in stack order (back-left → front-center → back-right).
  const cards: DemoCard[] = [
    FEATURED_STARS[5], // SGA
    FEATURED_STARS[2], // Jokic
    FEATURED_STARS[1], // Curry — center, frontmost
    FEATURED_STARS[0], // LeBron
    FEATURED_STARS[4], // Tatum
  ].map(buildDemo);

  // Hand-tuned fan layout. Tighter spread because the poster-style cards are
  // taller; wider spread would push the outer cards too far apart vertically.
  const layouts = [
    { x: -170, y: 60,  rot: -10, z: 1, scale: 0.84, opacity: 0.7,  blur: 1.2 },
    { x: -88,  y: 14,  rot: -5,  z: 2, scale: 0.92, opacity: 0.95, blur: 0   },
    { x: 0,    y: -10, rot: 0,   z: 4, scale: 1.0,  opacity: 1,    blur: 0   },
    { x: 88,   y: 14,  rot: 5,   z: 3, scale: 0.92, opacity: 0.95, blur: 0   },
    { x: 170,  y: 60,  rot: 10,  z: 2, scale: 0.84, opacity: 0.7,  blur: 1.2 },
  ];

  return (
    <div className="relative h-[440px] w-full sm:h-[500px]">
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
        {cards.map((card, i) => {
          const l = layouts[i];
          return (
            <motion.div
              key={card.id}
              className="absolute"
              style={{ zIndex: l.z + 1 }}
              initial={{ opacity: 0, y: 80, scale: 0.6, rotate: 0 }}
              animate={{
                opacity: l.opacity,
                y: l.y,
                x: l.x,
                rotate: l.rot,
                scale: l.scale,
              }}
              transition={{
                duration: 1.0,
                ease: [0.22, 1, 0.36, 1],
                delay: 0.18 + i * 0.08,
              }}
            >
              <motion.div
                animate={
                  reduce
                    ? undefined
                    : {
                        y: [0, -8, 0],
                      }
                }
                transition={{
                  duration: 5 + i * 0.4,
                  repeat: Infinity,
                  ease: 'easeInOut',
                  delay: i * 0.2,
                }}
                style={{ filter: l.blur ? `blur(${l.blur}px)` : undefined }}
              >
                <HeroCard card={card} />
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

// Poster-style hero card. The transparent NBA headshot is the focal point; a
// small live price chip floats top-left, the team-colored radial sits behind
// the image, and Buy/Sell action buttons live at the bottom to signal that
// this IS a trading interface — not a static collectible card.
function HeroCard({ card }: { card: DemoCard }) {
  const isPositive = card.pctChange >= 0;
  const teamColor = getTeamColor(card.team);
  const [r, g, b] = hexToRgb(teamColor);
  const [hovered, setHovered] = useState(false);

  return (
    <div
      className="relative h-[340px] w-[230px] overflow-hidden rounded-[24px] border border-white/[0.08] bg-card/80 backdrop-blur transition-all duration-200"
      style={{
        boxShadow: hovered
          ? `0 16px 48px rgba(${r}, ${g}, ${b}, 0.45), 0 6px 20px rgba(${r}, ${g}, ${b}, 0.25), 0 8px 28px rgba(0,0,0,0.5)`
          : '0 22px 44px -14px rgba(0,0,0,0.65)',
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Team-color radial — fills the upper portion behind the headshot */}
      <div
        aria-hidden
        className="absolute inset-0"
        style={{
          background: `radial-gradient(ellipse 90% 70% at 50% 28%, ${teamColor}55, transparent 65%)`,
        }}
      />

      {/* Player image — fills more of the card so the player's shoulders sit
          right above the team label, making the headshot feel connected to
          the rest of the card. A mask gradient fades the bottom of the
          headshot into the card so there's no hard edge between the image
          and the action panel — the pixels themselves dissolve, which reads
          way more fluid than overlaying a solid-color gradient on top. */}
      <div
        className="absolute inset-x-0 top-4 h-[238px]"
        style={{
          maskImage:
            'linear-gradient(to bottom, black 0%, black 35%, transparent 95%)',
          WebkitMaskImage:
            'linear-gradient(to bottom, black 0%, black 35%, transparent 95%)',
        }}
      >
        <Image
          src={headshotUrl(card.nbaId, '1040x760')}
          alt={card.name}
          fill
          sizes="240px"
          className="object-cover object-top"
          priority
        />
      </div>

      {/* Top-left price chip — small but readable, sits over the image */}
      <div className="absolute left-3 top-3 z-10 flex items-center gap-1.5 rounded-md bg-black/55 px-2 py-1 backdrop-blur-md ring-1 ring-white/10">
        <span className="text-xs font-bold tabular-nums text-white">
          ${card.price.toFixed(2)}
        </span>
        <span
          className={`flex items-center gap-0.5 text-[10px] font-bold tabular-nums ${
            isPositive ? 'text-success' : 'text-destructive'
          }`}
        >
          {isPositive ? <ArrowUp className="h-2.5 w-2.5" /> : <ArrowDown className="h-2.5 w-2.5" />}
          {Math.abs(card.pctChange).toFixed(1)}%
        </span>
      </div>

      {/* Bottom action panel — name plate + Buy/Sell. No background, no
          divider, no symbol pill — sits on the same transparent surface as
          the rest of the card. */}
      <div className="absolute inset-x-0 bottom-0 z-10 px-3 pb-3">
        <div className="mb-2 min-w-0">
          <p className="truncate text-[10px] font-semibold uppercase tracking-wider text-white/55">
            {card.team} · {card.position}
          </p>
          <p className="truncate text-sm font-bold text-white">{card.name}</p>
        </div>
        <div className="grid grid-cols-2 gap-1.5">
          <button
            type="button"
            tabIndex={-1}
            aria-hidden
            className="h-8 cursor-default rounded-md bg-[#0a7a52] text-xs font-semibold text-white transition-colors duration-200 hover:bg-[#0e9966]"
          >
            Buy
          </button>
          <button
            type="button"
            tabIndex={-1}
            aria-hidden
            className="h-8 cursor-default rounded-md bg-[#cc3333] text-xs font-semibold text-white transition-colors duration-200 hover:bg-[#e04040]"
          >
            Sell
          </button>
        </div>
      </div>
    </div>
  );
}
