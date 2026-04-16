'use client';

// LP metrics dashboard — protocol is sole LP in beta.
// Tracks fee revenue, impermanent loss, pool skew, and LP returns per market
// so we know what to watch for when we eventually open LPing up to users.

export default function H2HAdminLPPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">H2H LP Metrics</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Protocol LP P&L per market. For internal monitoring before opening LPing.
        </p>
      </div>
      <div className="rounded-xl border border-border bg-card py-16 text-center text-sm text-muted-foreground">
        Metrics dashboard coming in P4.
      </div>
    </div>
  );
}
