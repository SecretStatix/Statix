'use client';

import { Suspense } from 'react';
import { usePathname } from 'next/navigation';
import { Navbar } from './Navbar';
import { TradingFreezeBanner } from './TradingFreezeBanner';

const HIDE_NAVBAR_PATHS = ['/login', '/signup', '/pending', '/forgot-password', '/reset-password'];

export function NavbarWrapper() {
  const pathname = usePathname();

  if (HIDE_NAVBAR_PATHS.includes(pathname)) {
    return null;
  }

  return (
    <>
      <Suspense fallback={<nav className="sticky top-0 z-50 h-14 border-b border-white/[0.06] bg-card/90 backdrop-blur-sm" />}>
        <Navbar />
      </Suspense>
      <TradingFreezeBanner />
    </>
  );
}
