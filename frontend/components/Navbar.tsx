'use client';

import { ConnectButton } from '@rainbow-me/rainbowkit';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/lib/AuthContext';
import { TrendingUp, BarChart3, User, Info } from 'lucide-react';
import { cn } from '@/lib/utils';

const NAV_LINKS = [
  { href: '/', label: 'Market', icon: TrendingUp },
  { href: '/portfolio', label: 'Portfolio', icon: User },
  { href: '/dividends', label: 'Dividends', icon: BarChart3 },
  { href: '/leaderboard', label: 'Leaderboard', icon: Info },
];

export function Navbar() {
  const { user, signOut } = useAuth();
  const pathname = usePathname();
  const username = user?.user_metadata?.username || user?.email?.split('@')[0] || '';

  return (
    <nav className="sticky top-0 z-50 border-b border-white/[0.06] bg-card/90 backdrop-blur-sm">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between">
          <div className="flex items-center gap-8">
            <Link href="/" className="flex items-center gap-2 group">
              <div className="w-9 h-9 rounded-lg bg-primary flex items-center justify-center text-primary-foreground font-bold text-sm group-hover:bg-primary-600 transition-colors shadow-lg shadow-primary/20">
                SX
              </div>
              <span className="text-xl font-bold text-foreground hidden sm:inline tracking-tight">
                Statix
              </span>
            </Link>

            <div className="hidden md:flex items-center gap-1">
              {NAV_LINKS.map(({ href, label, icon: Icon }) => {
                const isActive = pathname === href;
                return (
                  <Link key={href} href={href}>
                    <button
                      className={cn(
                        "flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors",
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
            <ConnectButton />
            {username && (
              <div className="hidden sm:flex items-center gap-3 pl-3 border-l border-white/[0.08]">
                <span className="text-sm text-muted-foreground">{username}</span>
                <button
                  onClick={signOut}
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
