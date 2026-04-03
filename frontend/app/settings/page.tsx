'use client';

import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { useAuth } from '@/lib/AuthContext';

export default function SettingsPage() {
  const { user } = useAuth();
  const username = user?.user_metadata?.username as string | undefined;

  return (
    <div className="space-y-10 pb-12">
      <Link
        href="/"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Market
      </Link>

      <header className="space-y-1">
        <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-muted-foreground/70">Account</p>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">Profile settings</h1>
        <p className="max-w-lg text-sm text-muted-foreground">
          Manage how you sign in and how your account appears.
        </p>
      </header>

      <div className="relative overflow-hidden rounded-3xl border border-white/[0.06] bg-gradient-to-b from-white/[0.02] to-transparent">
        <div className="pointer-events-none absolute -right-28 -top-28 h-[22rem] w-[22rem] rounded-full bg-primary/[0.04] blur-[120px]" />
        <div className="relative space-y-0 divide-y divide-white/[0.06]">
          <section className="px-5 py-6 sm:px-8">
            <h2 className="text-[11px] font-medium uppercase tracking-[0.2em] text-muted-foreground/80">Email</h2>
            <p className="mt-2 text-sm text-foreground">{user?.email ?? '—'}</p>
            <p className="mt-2 text-xs text-muted-foreground">
              Contact support to change the email on your account.
            </p>
          </section>
          <section className="px-5 py-6 sm:px-8">
            <h2 className="text-[11px] font-medium uppercase tracking-[0.2em] text-muted-foreground/80">Display name</h2>
            <p className="mt-2 text-sm text-foreground">{username || '—'}</p>
          </section>
          <section className="px-5 py-6 sm:px-8">
            <h2 className="text-[11px] font-medium uppercase tracking-[0.2em] text-muted-foreground/80">Password</h2>
            <p className="mt-2 text-xs text-muted-foreground">
              Sign out, then use <span className="text-foreground/90">Forgot password</span> on the login page to receive a reset link.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
