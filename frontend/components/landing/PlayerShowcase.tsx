'use client';

import Image from 'next/image';
import { motion, useReducedMotion } from 'motion/react';
import { FEATURED_STARS, headshotUrl } from './featuredStars';

// 8-up grid of NBA stars used as a section background. Each tile fades in on
// scroll, then breathes with a subtle staggered float to keep the page alive.
export function PlayerShowcase() {
  const reduce = useReducedMotion();
  // Take 8 unique stars from the featured list.
  const stars = FEATURED_STARS.slice(0, 8);

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
      {stars.map((s, i) => (
        <motion.div
          key={s.id}
          initial={{ opacity: 0, y: 24, scale: 0.92 }}
          whileInView={{ opacity: 1, y: 0, scale: 1 }}
          viewport={{ once: true, amount: 0.3 }}
          transition={{
            duration: 0.7,
            ease: [0.22, 1, 0.36, 1],
            delay: i * 0.06,
          }}
          whileHover={reduce ? undefined : { y: -6, scale: 1.02 }}
          className="group relative aspect-[3/4] overflow-hidden rounded-2xl border border-white/[0.06] bg-card/40"
        >
          {/* Team radial */}
          <div
            aria-hidden
            className="absolute inset-0 transition-opacity duration-500 group-hover:opacity-90"
            style={{
              background: `radial-gradient(ellipse at 50% 25%, ${s.accent}40, transparent 70%)`,
              opacity: 0.6,
            }}
          />
          {/* Headshot — float gently */}
          <motion.div
            className="absolute inset-x-0 bottom-0 h-[80%]"
            animate={
              reduce
                ? undefined
                : {
                    y: [0, -8, 0],
                  }
            }
            transition={{
              duration: 4 + (i % 3),
              repeat: Infinity,
              ease: 'easeInOut',
              delay: (i % 4) * 0.3,
            }}
          >
            <Image
              src={headshotUrl(s.nbaId, '1040x760')}
              alt={s.name}
              fill
              sizes="(min-width: 640px) 25vw, 50vw"
              className="object-cover object-top transition-transform duration-700 group-hover:scale-105"
            />
          </motion.div>
          {/* Name plate */}
          <div className="absolute inset-x-0 bottom-0 z-10 bg-gradient-to-t from-black/85 via-black/40 to-transparent px-3 py-2.5">
            <p className="truncate text-[9px] font-semibold uppercase tracking-wider text-white/70">
              {s.team}
            </p>
            <p className="truncate text-xs font-bold text-white sm:text-sm">{s.name}</p>
          </div>
        </motion.div>
      ))}
    </div>
  );
}
