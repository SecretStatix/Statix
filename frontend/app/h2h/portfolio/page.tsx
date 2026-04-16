'use client';

// H2H positions — separate from the main Statix portfolio page.
// Populated in P3: reads ConditionalTokens.balanceOf for each position_id
// plus derives avg entry price from h2h_trades history.

export default function H2HPortfolioPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Your H2H Positions</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Open bets, redeemable winnings, and settled history.
        </p>
      </div>
      <div className="rounded-xl border border-border bg-card py-16 text-center text-sm text-muted-foreground">
        Positions view coming in P3.
      </div>
    </div>
  );
}
