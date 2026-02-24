'use client';

import { usePathname } from 'next/navigation';
import { Navbar } from './Navbar';

const HIDE_NAVBAR_PATHS = ['/login', '/signup'];

export function NavbarWrapper() {
  const pathname = usePathname();

  if (HIDE_NAVBAR_PATHS.includes(pathname)) {
    return null;
  }

  return <Navbar />;
}
