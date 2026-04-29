'use client';

import { usePathname } from 'next/navigation';

// Paths that opt out of the constrained app shell (max-width + padding) so they
// can render full-bleed hero sections, edge-to-edge gradients, etc.
const FULL_BLEED_PATHS = ['/'];

export function MainContainer({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isFullBleed = FULL_BLEED_PATHS.includes(pathname);

  if (isFullBleed) {
    return <main>{children}</main>;
  }

  return (
    <main className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-10 py-8 sm:py-10 pb-20 md:pb-10">
      {children}
    </main>
  );
}
