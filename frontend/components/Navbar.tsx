'use client';

import { useEffect, useRef } from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/AuthContext';
import { usePrivy, useWallets } from '@privy-io/react-auth';
import { useBalance } from 'wagmi';

export function Navbar() {
  const { user, signOut } = useAuth();
  const { ready, authenticated, login, logout: privyLogout } = usePrivy();
  const { wallets } = useWallets();
  const username = user?.user_metadata?.username || user?.email?.split('@')[0] || 'User';
  const fundedRef = useRef(false);

  const embeddedWallet = wallets.find((w) => w.walletClientType === 'privy');
  const activeWallet = embeddedWallet || wallets[0];

  const { data: ethBalance } = useBalance({
    address: activeWallet?.address as `0x${string}`,
    query: { enabled: !!activeWallet },
  });

  // Auto-fund new wallets with gas
  useEffect(() => {
    if (!activeWallet || fundedRef.current) return;
    if (!ethBalance || ethBalance.value > BigInt(0)) return;

    fundedRef.current = true;
    fetch('/api/fund-gas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ address: activeWallet.address }),
    }).catch(() => {});
  }, [activeWallet, ethBalance]);

  const truncateAddress = (addr: string) =>
    `${addr.slice(0, 6)}...${addr.slice(-4)}`;

  const handleSignOut = async () => {
    if (authenticated) {
      await privyLogout();
    }
    await signOut();
  };

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

          {/* Right side: wallet + user info */}
          <div className="flex items-center gap-4">
            {ready && authenticated && activeWallet ? (
              <div className="flex items-center gap-2 bg-gray-800 rounded-lg px-3 py-1.5">
                <div className="w-2 h-2 rounded-full bg-green-400" />
                <span className="text-sm text-gray-300 font-mono">
                  {truncateAddress(activeWallet.address)}
                </span>
              </div>
            ) : ready && !authenticated ? (
              <button
                onClick={login}
                className="bg-orange-600 hover:bg-orange-700 text-white text-sm px-4 py-1.5 rounded-lg transition font-medium"
              >
                Connect Wallet
              </button>
            ) : null}

            <div className="flex items-center gap-3">
              <span className="text-sm text-gray-400">{username}</span>
              <button
                onClick={handleSignOut}
                className="text-sm text-gray-500 hover:text-white transition px-3 py-1 rounded-lg hover:bg-gray-800"
              >
                Log out
              </button>
            </div>
          </div>
        </div>
      </div>
    </nav>
  );
}
