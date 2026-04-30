'use client';

import Link from 'next/link';
import { useAuth } from '@/lib/AuthContext';

interface AuthGateProps {
  children: React.ReactNode;
}

export function AuthGate({ children }: AuthGateProps) {
  const { loading, session, isApproved } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="h-7 w-7 rounded-full border-2 border-white/10 border-t-primary animate-spin" />
      </div>
    );
  }

  if (!session) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-5 px-4 text-center">
        <div className="text-4xl">🔒</div>
        <div>
          <h2 className="text-xl font-semibold text-foreground">Sign up to access this page</h2>
          <p className="mt-1.5 text-sm text-muted-foreground">
            Create a free account to trade player shares and earn dividends.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href="/signup"
            className="rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition"
          >
            Get Started
          </Link>
          <Link
            href="/login"
            className="rounded-lg border border-white/10 px-5 py-2.5 text-sm font-medium text-muted-foreground hover:text-foreground hover:border-white/20 transition"
          >
            Log In
          </Link>
        </div>
      </div>
    );
  }

  if (!isApproved) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-4 text-center">
        <div className="text-4xl">⏳</div>
        <div>
          <h2 className="text-xl font-semibold text-foreground">Your account is pending approval</h2>
          <p className="mt-1.5 text-sm text-muted-foreground">
            We review every account manually. You&apos;ll get access as soon as you&apos;re approved.
          </p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
