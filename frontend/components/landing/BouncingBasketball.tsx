'use client';

import { useEffect, useRef } from 'react';
import { motion, useMotionValue, useReducedMotion } from 'motion/react';

interface BouncingBasketballProps {
  size?: number;
  // Linear speed in px/frame at 60fps (so ~60× this is px/sec).
  speed?: number;
  className?: string;
  // CSS opacity for the ball — keep below 1 so it reads as a background
  // accent rather than a foreground element.
  opacity?: number;
}

// Pool-ball-style bouncing basketball. Lives absolutely-positioned inside the
// nearest positioned ancestor and bounces off its inner edges with constant
// momentum (no friction). Spin is derived from velocity using the
// rolling-without-slipping relationship ω = v / r, so the ball starts with
// zero rotation and only spins when (and as fast as) it actually moves —
// matching what you'd see watching a real billiard ball.
export function BouncingBasketball({
  size = 96,
  speed = 3.6,
  className,
  opacity = 0.85,
}: BouncingBasketballProps) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const x = useMotionValue(120);
  const y = useMotionValue(60);
  const rotate = useMotionValue(0);
  const reduce = useReducedMotion();

  useEffect(() => {
    if (reduce) return;
    const wrapper = wrapperRef.current;
    const container = wrapper?.parentElement;
    if (!wrapper || !container) return;

    // Mutable position + velocity. Using refs/locals avoids React re-renders
    // on every animation frame.
    const pos = { x: x.get(), y: y.get() };
    // Random-ish initial velocity direction so each page load looks different.
    // Speed magnitude stays constant so the ball never slows down.
    const angle = Math.PI * (0.18 + Math.random() * 0.4); // 32°–72°
    const sign = Math.random() < 0.5 ? -1 : 1;
    const vel = {
      x: speed * Math.cos(angle) * (Math.random() < 0.5 ? -1 : 1),
      y: speed * Math.sin(angle) * sign,
    };

    // Rolling-without-slipping: a ball traveling `v` linear units rotates
    // `v / r` radians. We render rotation in degrees, so precompute the
    // conversion factor once. `vel.x` is the dominant rolling driver because
    // we view the ball from the side — its visual spin direction tracks its
    // horizontal direction of travel like a pool ball rolling on a table.
    const radius = size / 2;
    const radToDeg = 180 / Math.PI;

    let rot = 0;
    let raf = 0;
    let lastT = performance.now();

    const tick = (t: number) => {
      const dt = Math.min(48, t - lastT); // clamp to avoid huge jumps on tab refocus
      lastT = t;
      const frames = dt / (1000 / 60); // scale to "frames at 60fps"

      const rect = container.getBoundingClientRect();
      const maxX = Math.max(0, rect.width - size);
      const maxY = Math.max(0, rect.height - size);

      pos.x += vel.x * frames;
      pos.y += vel.y * frames;

      // Wall collisions — clamp + reverse velocity. Constant speed, no
      // damping (this is the "pool ball" feel).
      if (pos.x <= 0) {
        pos.x = 0;
        vel.x = Math.abs(vel.x);
      } else if (pos.x >= maxX) {
        pos.x = maxX;
        vel.x = -Math.abs(vel.x);
      }
      if (pos.y <= 0) {
        pos.y = 0;
        vel.y = Math.abs(vel.y);
      } else if (pos.y >= maxY) {
        pos.y = maxY;
        vel.y = -Math.abs(vel.y);
      }

      // Accurate rolling: rotation rate is derived from the *actual* velocity
      // this frame (ω = v / r). When the ball ricochets off a side wall, vx
      // flips sign, so the spin reverses too — like a ball grabbing the rail
      // and rolling back. No baseline "constant spin" hides under this, so a
      // stationary ball wouldn't spin at all (and at t=0 we start from rest).
      rot += (vel.x / radius) * radToDeg * frames;

      x.set(pos.x);
      y.set(pos.y);
      rotate.set(rot);

      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [size, speed, x, y, rotate, reduce]);

  return (
    <motion.div
      ref={wrapperRef}
      aria-hidden
      style={{ x, y, rotate, width: size, height: size, opacity }}
      className={`pointer-events-none absolute left-0 top-0 ${className ?? ''}`}
    >
      <RealisticBasketballSvg size={size} />
    </motion.div>
  );
}

// Themed basketball — blue body + black seams to match the Statix palette
// (--primary #5B9AFF, --background near-black). Keeps the realistic surfacing
// (leather gradient, dimple texture, specular highlight, rim shadow) but
// swapped to the site's blues so the ball reads as part of the brand instead
// of a Spalding sticker.
function RealisticBasketballSvg({ size }: { size: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      style={{
        // Blue-tinted shadow keeps the ball anchored on dark backgrounds
        // without the usual warm-orange spill.
        filter: 'drop-shadow(0 10px 18px rgba(15, 30, 60, 0.55))',
      }}
    >
      <defs>
        {/* Body — bright primary at the lit top-left, deep navy at the falloff */}
        <radialGradient id="bb-body" cx="36%" cy="30%" r="78%">
          <stop offset="0%"  stopColor="#A8C9FF" />
          <stop offset="28%" stopColor="#5B9AFF" />
          <stop offset="62%" stopColor="#1F3A78" />
          <stop offset="100%" stopColor="#070C1A" />
        </radialGradient>

        {/* Specular highlight — cool white/blue glint in the upper-left */}
        <radialGradient id="bb-spec" cx="32%" cy="26%" r="22%">
          <stop offset="0%" stopColor="rgba(220, 235, 255, 0.55)" />
          <stop offset="100%" stopColor="rgba(220, 235, 255, 0)" />
        </radialGradient>

        {/* Inner-rim shadow — darkens the edge to give the ball volume */}
        <radialGradient id="bb-rim" cx="50%" cy="50%" r="50%">
          <stop offset="76%" stopColor="rgba(0,0,0,0)" />
          <stop offset="100%" stopColor="rgba(0,0,0,0.55)" />
        </radialGradient>

        {/* Dimple texture — tiny darker dots tile across the surface. Tinted
            navy so they read as panel pebbling on the blue body. */}
        <pattern id="bb-dimples" width="3.2" height="3.2" patternUnits="userSpaceOnUse">
          <circle cx="1.6" cy="1.6" r="0.55" fill="rgba(4, 10, 28, 0.32)" />
        </pattern>

        {/* Clip the dimples + shadow to the ball circle */}
        <clipPath id="bb-clip">
          <circle cx="50" cy="50" r="48" />
        </clipPath>
      </defs>

      {/* Base body */}
      <circle cx="50" cy="50" r="48" fill="url(#bb-body)" />

      {/* Surface texture (clipped to the ball) */}
      <g clipPath="url(#bb-clip)">
        <rect x="0" y="0" width="100" height="100" fill="url(#bb-dimples)" />
      </g>

      {/* Seams — the four classic basketball lines, jet black */}
      <g
        stroke="#04060f"
        strokeWidth="1.7"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M50 2 V98" />
        <path d="M2 50 H98" />
        <path d="M14 14 Q50 50 14 86" />
        <path d="M86 14 Q50 50 86 86" />
      </g>

      {/* Subtle blue gloss along the lit edge of each seam keeps them from
          looking like flat ink lines on top of the gradient. */}
      <g
        stroke="rgba(168, 201, 255, 0.18)"
        strokeWidth="0.6"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M49 4 V96" />
        <path d="M15 14 Q50 50 15 86" />
      </g>

      {/* Specular highlight + rim-shadow for depth */}
      <circle cx="50" cy="50" r="48" fill="url(#bb-spec)" />
      <circle cx="50" cy="50" r="48" fill="url(#bb-rim)" />

      {/* Crisp black outline so the ball reads cleanly against the blue
          gradient panel behind it. */}
      <circle cx="50" cy="50" r="48" fill="none" stroke="#04060f" strokeWidth="1.4" />
    </svg>
  );
}
