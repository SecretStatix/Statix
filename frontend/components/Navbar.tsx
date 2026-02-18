'use client';

import { ConnectButton } from '@rainbow-me/rainbowkit';
import Link from 'next/link';

export function Navbar() {
  return (
    <nav className="border-b border-gray-800 bg-gray-900/50 backdrop-blur-sm sticky top-0 z-50">
      <div className="container mx-auto px-4">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link href="/" className="flex items-center space-x-2">
            <span className="text-2xl">🏀</span>
            <span className="font-bold text-xl">Dividend Fantasy</span>
          </Link>

          {/* Navigation */}
          <div className="hidden md:flex items-center space-x-8">
            <Link href="/" className="text-gray-300 hover:text-white transition">
              Market
            </Link>
            <Link href="/portfolio" className="text-gray-300 hover:text-white transition">
              Portfolio
            </Link>
            <Link href="/dividends" className="text-gray-300 hover:text-white transition">
              Dividends
            </Link>
            <Link href="/leaderboard" className="text-gray-300 hover:text-white transition">
              Leaderboard
            </Link>
          </div>

          {/* Connect Button */}
          <ConnectButton />
        </div>
      </div>
    </nav>
  );
}
