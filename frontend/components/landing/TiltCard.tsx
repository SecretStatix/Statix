'use client';

import {
  motion,
  useMotionValue,
  useSpring,
  useTransform,
  useReducedMotion,
} from 'motion/react';
import { useRef, type ReactNode } from 'react';

interface TiltCardProps {
  children: ReactNode;
  className?: string;
  // Maximum rotation in degrees (default ~9° feels firm but not floppy).
  max?: number;
}

// Cursor-tracking 3D tilt card. Uses spring smoothing so the rotation eases
// after the cursor leaves. Scale + glare highlight are bonus effects.
export function TiltCard({ children, className, max = 9 }: TiltCardProps) {
  const ref = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();

  const x = useMotionValue(0);
  const y = useMotionValue(0);

  const springConfig = { stiffness: 220, damping: 18, mass: 0.6 };
  const rotateX = useSpring(useTransform(y, [-0.5, 0.5], [max, -max]), springConfig);
  const rotateY = useSpring(useTransform(x, [-0.5, 0.5], [-max, max]), springConfig);
  const glareX = useTransform(x, [-0.5, 0.5], ['0%', '100%']);
  const glareY = useTransform(y, [-0.5, 0.5], ['0%', '100%']);

  const onMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (reduce) return;
    const r = ref.current?.getBoundingClientRect();
    if (!r) return;
    x.set((e.clientX - r.left) / r.width - 0.5);
    y.set((e.clientY - r.top) / r.height - 0.5);
  };

  const reset = () => {
    x.set(0);
    y.set(0);
  };

  return (
    <motion.div
      ref={ref}
      onMouseMove={onMove}
      onMouseLeave={reset}
      style={{
        rotateX: reduce ? 0 : rotateX,
        rotateY: reduce ? 0 : rotateY,
        transformStyle: 'preserve-3d',
        transformPerspective: 1000,
      }}
      whileHover={reduce ? undefined : { scale: 1.015 }}
      transition={{ type: 'spring', stiffness: 300, damping: 22 }}
      className={`relative ${className ?? ''}`}
    >
      {/* Glare highlight follows the cursor. Pointer events disabled so it
          doesn't steal hover. */}
      {!reduce && (
        <motion.div
          aria-hidden
          className="pointer-events-none absolute inset-0 rounded-[inherit] opacity-0 transition-opacity duration-300 group-hover:opacity-100"
          style={{
            background: 'radial-gradient(circle at var(--gx) var(--gy), rgba(255,255,255,0.10), transparent 50%)',
            // motion values can't be inlined into custom props; we set them via style
            // @ts-ignore custom props
            '--gx': glareX,
            // @ts-ignore custom props
            '--gy': glareY,
          }}
        />
      )}
      <div style={{ transform: 'translateZ(40px)' }}>{children}</div>
    </motion.div>
  );
}
