'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/lib/AuthContext';
import { usePrivy, useWallets } from '@privy-io/react-auth';
import { useBalance } from 'wagmi';
import { TrendingUp, BarChart3, User, Info, Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import { PREVIEW, PREVIEW_ADDRESS } from '@/lib/preview';

const NAV_LINKS = [
  { href: '/', label: 'Market', icon: TrendingUp },
  { href: '/portfolio', label: 'Portfolio', icon: User },
  { href: '/dividends', label: 'Dividends', icon: BarChart3 },
  { href: '/leaderboard', label: 'Leaderboard', icon: Info },
];

export function Navbar() {
  const { user, signOut } = useAuth();
  const { ready, authenticated, login, logout: privyLogout } = usePrivy();
  const { wallets } = useWallets();
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const username = user?.user_metadata?.username || user?.email?.split('@')[0] || '';
  const fundedRef = useRef(false);

  const [searchValue, setSearchValue] = useState(searchParams.get('q') || '');
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

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

  const pushSearch = useCallback((value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (value) {
      params.set('q', value);
    } else {
      params.delete('q');
    }
    const target = pathname === '/' ? `/?${params.toString()}` : `/?${params.toString()}`;
    router.push(target);
  }, [router, pathname, searchParams]);

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setSearchValue(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => pushSearch(val), 300);
  };

  return (
    <nav className="sticky top-0 z-50 border-b border-white/[0.06] bg-card/90 backdrop-blur-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex h-14 items-center justify-between gap-4">
          <div className="flex items-center gap-4 lg:gap-6">
            <Link href="/" className="flex items-center gap-2 group shrink-0">
              <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center text-primary-foreground font-bold text-xs group-hover:bg-primary-600 transition-colors shadow-lg shadow-primary/20">
                SX
              </div>
              <span className="text-lg font-bold text-foreground hidden sm:inline tracking-tight">
                Statix
              </span>
            </Link>

            {/* Search bar — hidden on mobile */}
            <div className="hidden md:flex relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search players..."
                value={searchValue}
                onChange={handleSearchChange}
                className="w-48 lg:w-64 h-8 bg-secondary border border-white/[0.06] rounded-lg pl-9 pr-3 text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/30 focus:border-primary/30 transition-all duration-200"
              />
            </div>

            <div className="hidden md:flex items-center gap-1">
              {NAV_LINKS.map(({ href, label, icon: Icon }) => {
                const isActive = pathname === href;
                return (
                  <Link key={href} href={href}>
                    <button
                      className={cn(
                        "flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
                        isActive
                          ? "bg-primary/10 text-primary"
                          : "text-muted-foreground hover:text-foreground hover:bg-secondary"
                      )}
                    >
                      <Icon className="h-4 w-4" />
                      {label}
                    </button>
                  </Link>
                );
              })}
            </div>
          </div>

          <div className="flex items-center gap-3">
            {PREVIEW ? (
              <div className="flex items-center gap-2 bg-secondary rounded-lg px-3 py-1.5 border border-white/[0.06]">
                <div className="w-2 h-2 rounded-full bg-success" />
                <span className="text-sm text-muted-foreground font-mono">
                  {truncateAddress(PREVIEW_ADDRESS)}
                </span>
              </div>
            ) : ready && authenticated && activeWallet ? (
              <div className="flex items-center gap-2 bg-secondary rounded-lg px-3 py-1.5 border border-white/[0.06]">
                <div className="w-2 h-2 rounded-full bg-success" />
                <span className="text-sm text-muted-foreground font-mono">
                  {truncateAddress(activeWallet.address)}
                </span>
              </div>
            ) : ready && !authenticated ? (
              <button
                onClick={login}
                className="bg-primary hover:bg-primary-600 text-primary-foreground text-sm px-4 py-2 rounded-lg transition font-medium"
              >
                Connect Wallet
              </button>
            ) : null}

            {username && (
              <div className="hidden sm:flex items-center gap-3 pl-3 border-l border-white/[0.08]">
                <span className="text-sm text-muted-foreground">{username}</span>
                <button
                  onClick={handleSignOut}
                  className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  Log out
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
}
