'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/lib/AuthContext';
import { supabase } from '@/lib/supabase';
import { usePrivy, useWallets } from '@privy-io/react-auth';
import { useBalance } from 'wagmi';
import { formatUnits } from 'viem';
import { TrendingUp, BarChart3, User as UserIcon, Info, BookOpen, Search, X, Home } from 'lucide-react';
import { useDBucksBalance } from '@/hooks/useContracts';
import { cn } from '@/lib/utils';
import { ProfileMenu } from '@/components/ProfileMenu';
import { getPlayers } from '@/lib/api';

const NAV_LINKS = [
  { href: '/', label: 'Home', icon: Home },
  { href: '/market', label: 'Market', icon: TrendingUp },
  { href: '/portfolio', label: 'Portfolio', icon: UserIcon },
  { href: '/dividends', label: 'Dividends', icon: BarChart3 },
  { href: '/leaderboard', label: 'Leaderboard', icon: Info },
  { href: '/rules', label: 'Rules', icon: BookOpen },
];

export function Navbar() {
  const { user, signOut } = useAuth();
  const { ready, authenticated, login, logout: privyLogout } = usePrivy();
  const { wallets } = useWallets();
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [profileUsername, setProfileUsername] = useState<string>('');

  useEffect(() => {
    if (!user) return;
    supabase.from('profiles').select('username').eq('id', user.id).single().then(({ data }) => {
      if (data?.username) setProfileUsername(data.username);
    });
  }, [user?.id]);

  const profileLabel = profileUsername || user?.user_metadata?.username || user?.email?.split('@')[0] || 'Account';
  const fundedRef = useRef(false);

  const [searchValue, setSearchValue] = useState(searchParams.get('q') || '');
  const debounceRef = useRef<NodeJS.Timeout | null>(null);
  const [allPlayers, setAllPlayers] = useState<{ id: string; name: string; team: string; position: string }[]>([]);
  const [mobileSearchFocused, setMobileSearchFocused] = useState(false);
  const mobileSearchRef = useRef<HTMLDivElement>(null);

  const embeddedWallet = wallets.find((w) => w.walletClientType === 'privy');
  const activeWallet = embeddedWallet || wallets[0];

  const { data: ethBalance } = useBalance({
    address: activeWallet?.address as `0x${string}`,
    query: { enabled: !!activeWallet },
  });

  const { data: dbucksRaw } = useDBucksBalance(activeWallet?.address);

  // Persist wallet address to Supabase profiles so leaderboard can show usernames
  useEffect(() => {
    if (!user || !activeWallet) return;
    supabase
      .from('profiles')
      .update({ wallet_address: activeWallet.address })
      .eq('id', user.id)
      .is('wallet_address', null) // only write once (don't overwrite if already set)
      .then(() => {});
  }, [user?.id, activeWallet?.address]);

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

  const formatDBucks = (raw: bigint | undefined) => {
    if (!raw) return '$0.00';
    const num = parseFloat(formatUnits(raw, 6));
    if (num >= 1000) return `$${(num / 1000).toFixed(1)}k`;
    return `$${num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const formatDBucksFull = (raw: bigint | undefined) => {
    if (!raw) return '$0.00';
    const num = parseFloat(formatUnits(raw, 6));
    return `$${num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const handleSignOut = async () => {
    if (authenticated) {
      await privyLogout();
    }
    await signOut();
  };

  // Fetch players once for the mobile search dropdown
  useEffect(() => {
    getPlayers().then((data: any[]) =>
      setAllPlayers(data.map((p) => ({ id: p.id, name: p.name, team: p.team, position: p.position || '' })))
    ).catch(() => {});
  }, []);

  // Close mobile dropdown when clicking outside
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (mobileSearchRef.current && !mobileSearchRef.current.contains(e.target as Node)) {
        setMobileSearchFocused(false);
      }
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const mobileDropdownResults = searchValue.trim().length > 0
    ? allPlayers.filter(p =>
        p.name.toLowerCase().includes(searchValue.toLowerCase()) ||
        p.team.toLowerCase().includes(searchValue.toLowerCase())
      ).slice(0, 6)
    : [];

  const pushSearch = useCallback((value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (value) {
      params.set('q', value);
    } else {
      params.delete('q');
    }
    router.push(`/market?${params.toString()}`);
  }, [router, searchParams]);

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setSearchValue(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => pushSearch(val), 300);
  };

  return (
    <nav className="sticky top-0 z-50 border-b border-white/[0.06] bg-card/90 backdrop-blur-sm">
      <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-10">
        <div className="flex h-14 items-center justify-between gap-4">
          <div className="flex items-center gap-4 lg:gap-6">
            <Link href="/market" className="flex items-center gap-2 group shrink-0">
              <Image src="/logo.png" alt="Statix" width={32} height={32} className="rounded-lg" />
              <span className="text-lg font-bold text-foreground hidden sm:inline tracking-tight">
                Statix
              </span>
            </Link>

            {/* Search bar — desktop inline (hidden on mobile; mobile version lives in its own row below) */}
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
            {ready && authenticated && activeWallet ? (
              <div className="flex items-center gap-2 bg-secondary rounded-lg px-3 py-1.5 border border-white/[0.06]">
                <span className="text-sm font-semibold text-success tabular-nums hidden sm:inline">
                  {formatDBucksFull(dbucksRaw as bigint | undefined)}
                </span>
                <span className="text-sm font-semibold text-success tabular-nums sm:hidden">
                  {formatDBucks(dbucksRaw as bigint | undefined)}
                </span>
                <span className="text-white/20 hidden sm:inline">|</span>
                <div className="w-2 h-2 rounded-full bg-success" />
                <span className="text-sm text-muted-foreground font-mono">
                  {truncateAddress(activeWallet.address)}
                </span>
              </div>
            ) : ready && !authenticated && user ? (
              <div className="flex items-center gap-2 bg-secondary rounded-lg px-3 py-1.5 border border-white/[0.06]">
                <div className="w-2 h-2 rounded-full bg-muted-foreground animate-pulse" />
                <span className="text-sm text-muted-foreground">Connecting wallet…</span>
              </div>
            ) : ready && !authenticated ? (
              <button
                onClick={login}
                className="bg-primary hover:bg-primary-600 text-primary-foreground text-sm px-4 py-2 rounded-lg transition font-medium"
              >
                Connect Wallet
              </button>
            ) : null}

            {user && (
              <div className="flex items-center pl-3 border-l border-white/[0.08]">
                <ProfileMenu email={user.email} label={profileLabel} onSignOut={handleSignOut} />
              </div>
            )}
          </div>
        </div>

        {/* Mobile search bar — dropdown overlay so results appear above keyboard */}
        <div className="md:hidden pb-2" ref={mobileSearchRef}>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
            <input
              type="text"
              placeholder="Search players..."
              value={searchValue}
              onChange={handleSearchChange}
              onFocus={() => setMobileSearchFocused(true)}
              className="w-full h-9 bg-secondary border border-white/[0.06] rounded-lg pl-9 pr-8 text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/30 focus:border-primary/30 transition-all duration-200"
            />
            {searchValue && (
              <button
                onMouseDown={(e) => { e.preventDefault(); setSearchValue(''); pushSearch(''); }}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}

            {/* Dropdown results — shown above keyboard */}
            {mobileSearchFocused && mobileDropdownResults.length > 0 && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-card border border-white/[0.10] rounded-xl shadow-2xl overflow-hidden z-50">
                {mobileDropdownResults.map((p) => (
                  <Link
                    key={p.id}
                    href={`/player/${p.id}`}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => { setSearchValue(''); pushSearch(''); setMobileSearchFocused(false); }}
                    className="flex items-center gap-3 px-4 py-3 hover:bg-secondary/60 transition-colors border-b border-white/[0.04] last:border-0"
                  >
                    <div className="w-8 h-8 rounded-lg bg-secondary/70 flex items-center justify-center shrink-0">
                      <span className="text-[10px] font-bold text-muted-foreground">{p.position}</span>
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-foreground truncate">{p.name}</p>
                      <p className="text-xs text-muted-foreground">{p.team}</p>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
}
