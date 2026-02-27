'use client';

import { useAuth } from '@/lib/AuthContext';

export default function PendingApprovalPage() {
  const { user, signOut } = useAuth();
  const username = user?.user_metadata?.username || user?.email?.split('@')[0] || 'there';

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="bg-card border border-border rounded-2xl shadow-xl max-w-md w-full p-8 text-center">
        <div className="w-12 h-12 rounded-xl bg-accent/20 flex items-center justify-center mx-auto mb-4">
          <svg className="w-6 h-6 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          </svg>
        </div>
        <h1 className="text-xl font-semibold text-foreground mb-3">Account Pending Review</h1>
        <p className="text-muted-foreground text-sm mb-6 leading-relaxed">
          Hey {username}, thanks for signing up! Your account is currently being reviewed.
          You&apos;ll get access once an admin approves your account.
        </p>
        <div className="bg-secondary/50 border border-border rounded-xl p-4 mb-6">
          <p className="text-xs text-muted-foreground uppercase tracking-wider">Signed up as</p>
          <p className="text-sm text-foreground font-medium mt-1">{user?.email}</p>
        </div>
        <button
          onClick={signOut}
          className="text-sm text-muted-foreground hover:text-foreground transition"
        >
          Sign out
        </button>
      </div>
    </div>
  );
}
