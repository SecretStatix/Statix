'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ArrowLeft, ShieldAlert, ShieldCheck } from 'lucide-react';
import { useAuth } from '@/lib/AuthContext';
import { supabase } from '@/lib/supabase';
import { BackendHealthPanel } from '@/components/admin/BackendHealthPanel';
import { ActivityPanel } from '@/components/admin/ActivityPanel';

type GateState = 'checking' | 'allowed' | 'denied';

export default function AdminPage() {
  const { user, isAdmin, loading: authLoading } = useAuth();
  // Trust but verify: AuthContext caches `is_admin` from a previous read, so
  // we re-query on mount. RLS would already block writes/reads on protected
  // resources, but this prevents flashing the page UI to a non-admin if the
  // cached flag is stale or wrong.
  const [gate, setGate] = useState<GateState>(isAdmin ? 'allowed' : 'checking');

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      setGate('denied');
      return;
    }
    let cancelled = false;
    supabase
      .from('profiles')
      .select('is_admin')
      .eq('id', user.id)
      .maybeSingle()
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          console.warn('[admin] gate check failed:', error.message);
          setGate('denied');
          return;
        }
        setGate(data?.is_admin ? 'allowed' : 'denied');
      });
    return () => {
      cancelled = true;
    };
  }, [user?.id, authLoading]);

  if (gate === 'checking') {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/10 border-t-primary" />
      </div>
    );
  }

  if (gate === 'denied') {
    return (
      <div className="flex min-h-[60vh] items-center justify-center px-4">
        <div className="max-w-md w-full rounded-2xl border border-white/[0.06] bg-card/60 p-8 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-destructive/10">
            <ShieldAlert className="h-6 w-6 text-destructive" />
          </div>
          <h1 className="text-xl font-semibold text-foreground">Access denied</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            This page is restricted to administrators.
          </p>
          <Link
            href="/market"
            className="mt-6 inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to market
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-10 pb-12">
      <Link
        href="/market"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Market
      </Link>

      <header className="space-y-1">
        <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-muted-foreground/70">
          Internal
        </p>
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
          <ShieldCheck className="h-6 w-6 text-primary" />
          Admin & Analytics
        </h1>
        <p className="max-w-lg text-sm text-muted-foreground">
          Health checks, trading activity, and user approvals. Set{' '}
          <code className="rounded bg-white/[0.06] px-1.5 py-0.5 font-mono text-[11px]">ADMIN_KEY</code> in{' '}
          <code className="rounded bg-white/[0.06] px-1.5 py-0.5 font-mono text-[11px]">frontend/.env.local</code>{' '}
          (same as the FastAPI backend) so Approve can run server-side.
        </p>
      </header>

      <div className="relative overflow-hidden rounded-3xl border border-white/[0.06] bg-gradient-to-b from-white/[0.02] to-transparent">
        <div className="pointer-events-none absolute -right-28 -top-28 h-[22rem] w-[22rem] rounded-full bg-primary/[0.04] blur-[120px]" />
        <div className="relative space-y-0 divide-y divide-white/[0.06]">
          <BackendHealthPanel />
          <ActivityPanel />
          <section className="px-5 py-6 sm:px-8">
            <h2 className="text-[11px] font-medium uppercase tracking-[0.2em] text-muted-foreground/80">
              Signed in as
            </h2>
            <p className="mt-2 text-sm text-foreground">{user?.email ?? '—'}</p>
          </section>
        </div>
      </div>
    </div>
  );
}
