'use client';

import { motion, useReducedMotion } from 'motion/react';

interface SpinningBasketballProps {
  size?: number;
  duration?: number;
  className?: string;
}

// Inline SVG basketball that spins forever. CSS-only animation via motion's
// `animate` prop so it stays cheap.
export function SpinningBasketball({
  size = 56,
  duration = 12,
  className,
}: SpinningBasketballProps) {
  const reduce = useReducedMotion();
  return (
    <motion.svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      className={className}
      animate={reduce ? undefined : { rotate: 360 }}
      transition={{ duration, repeat: Infinity, ease: 'linear' }}
      style={{ filter: 'drop-shadow(0 8px 24px rgba(255, 122, 30, 0.35))' }}
    >
      <defs>
        <radialGradient id="ballGrad" cx="35%" cy="35%" r="65%">
          <stop offset="0%" stopColor="#FF9D4A" />
          <stop offset="55%" stopColor="#E8731F" />
          <stop offset="100%" stopColor="#A2440D" />
        </radialGradient>
      </defs>
      <circle cx="50" cy="50" r="48" fill="url(#ballGrad)" />
      {/* Seams */}
      <g stroke="#1a0a04" strokeWidth="1.6" fill="none" strokeLinecap="round">
        <path d="M50 2 V98" />
        <path d="M2 50 H98" />
        <path d="M14 14 Q50 50 14 86" />
        <path d="M86 14 Q50 50 86 86" />
      </g>
      {/* Highlight */}
      <ellipse cx="34" cy="30" rx="10" ry="6" fill="rgba(255,255,255,0.25)" />
    </motion.svg>
  );
}
