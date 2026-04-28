'use client';

import {
  motion,
  useMotionValue,
  useSpring,
  useReducedMotion,
} from 'motion/react';
import { useRef, type ReactNode, type MouseEvent } from 'react';
import Link from 'next/link';

interface MagneticButtonProps {
  href: string;
  children: ReactNode;
  className?: string;
  // How far the button drifts toward the cursor (px).
  strength?: number;
}

// Cursor-magnet button — the element drifts toward the cursor when nearby and
// snaps back via a spring on leave. Wraps a Next.js <Link>.
export function MagneticButton({
  href,
  children,
  className,
  strength = 14,
}: MagneticButtonProps) {
  const ref = useRef<HTMLAnchorElement>(null);
  const reduce = useReducedMotion();

  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const sx = useSpring(x, { stiffness: 250, damping: 18, mass: 0.5 });
  const sy = useSpring(y, { stiffness: 250, damping: 18, mass: 0.5 });

  const onMove = (e: MouseEvent<HTMLAnchorElement>) => {
    if (reduce) return;
    const rect = ref.current?.getBoundingClientRect();
    if (!rect) return;
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    x.set(((e.clientX - cx) / rect.width) * strength * 2);
    y.set(((e.clientY - cy) / rect.height) * strength * 2);
  };

  const reset = () => {
    x.set(0);
    y.set(0);
  };

  return (
    <motion.span style={{ x: sx, y: sy, display: 'inline-flex' }}>
      <Link
        ref={ref}
        href={href}
        onMouseMove={onMove}
        onMouseLeave={reset}
        className={className}
      >
        {children}
      </Link>
    </motion.span>
  );
}
