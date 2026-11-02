'use client';

import { useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';

// Waitlist submissions go to Formspree (notifies the team by email, exportable as CSV).
// Account sign-up is closed while Statix pursues regulatory approval for real-money trading.
const FORMSPREE_ENDPOINT = 'https://formspree.io/f/xjykdnap';

export default function WaitlistPage() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await fetch(FORMSPREE_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim(),
          _gotcha: new FormData(e.currentTarget).get('_gotcha') ?? '',
          _subject: 'New Statix waitlist sign-up',
        }),
      });

      if (res.ok) {
        setSuccess(true);
      } else {
        const data = await res.json().catch(() => null);
        setError(data?.errors?.[0]?.message ?? 'Something went wrong. Please try again.');
      }
    } catch {
      setError('Something went wrong. Please check your connection and try again.');
    }

    setLoading(false);
  };

  const inputClass = "w-full bg-secondary border border-border rounded-xl px-4 py-3 text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/50 focus:border-primary transition";

  if (success) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="bg-card border border-border rounded-2xl shadow-xl max-w-md w-full p-8 text-center">
          <div className="w-12 h-12 rounded-xl bg-success/20 flex items-center justify-center mx-auto mb-4">
            <svg className="w-6 h-6 text-success" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-foreground mb-3">Thanks for signing up!</h2>
          <p className="text-muted-foreground text-sm mb-6">
            You&apos;re on the Statix waitlist. We&apos;ll update you soon at{' '}
            <span className="text-foreground font-medium">{email}</span>.
          </p>
          <Link href="/" className="text-sm text-primary hover:text-primary/80 font-medium">
            Back to home
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="bg-card border border-border rounded-2xl shadow-xl max-w-md w-full overflow-hidden">
        <div className="p-4 sm:p-8 border-b border-border text-center">
          <Link href="/" className="mx-auto mb-4 flex justify-center">
            <Image src="/logo.png" alt="Statix" width={32} height={32} className="rounded-lg" />
          </Link>
          <h1 className="text-xl font-bold text-foreground">Join the Statix waitlist</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Our MVP ran during the 2026 NBA Playoffs. We&apos;re now pursuing regulatory approval to launch
            real-money trading for the 2027–28 season. Sign up to hear when we launch.
          </p>
        </div>

        {error && (
          <div className="mx-4 sm:mx-8 mt-4 p-3 bg-destructive/10 border border-destructive/30 rounded-xl text-destructive text-sm">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="p-4 sm:p-8 space-y-3">
          <div>
            <label htmlFor="name" className="block text-xs text-muted-foreground mb-1.5">Name</label>
            <input id="name" type="text" value={name} onChange={(e) => setName(e.target.value)} required autoComplete="name" className={inputClass} placeholder="Jane Doe" />
          </div>
          <div>
            <label htmlFor="email" className="block text-xs text-muted-foreground mb-1.5">Email</label>
            <input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" className={inputClass} placeholder="you@example.com" />
          </div>

          {/* Honeypot: hidden from people, filled in by spam bots (Formspree drops those submissions). */}
          <input type="text" name="_gotcha" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden />

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3.5 rounded-xl text-sm font-semibold bg-gradient-to-r from-primary to-accent text-primary-foreground hover:from-primary-600 hover:to-accent hover:glow-primary hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:hover:scale-100 transition"
          >
            {loading ? 'Joining...' : 'Join the waitlist'}
          </button>

          <p className="text-center text-muted-foreground text-sm">
            <Link href="/" className="text-primary hover:text-primary/80 font-medium">Back to home</Link>
          </p>
        </form>
      </div>
    </div>
  );
}
