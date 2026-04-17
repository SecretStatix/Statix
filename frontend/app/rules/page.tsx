export default function RulesPage() {
  return (
    <div className="space-y-10 pb-12">
      <header className="space-y-1">
        <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-muted-foreground/70">How it works</p>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">Rules &amp; mechanics</h1>
        <p className="max-w-lg text-sm text-muted-foreground">
          Everything you need to know about trading, scoring, and earning dividends.
        </p>
      </header>

      <div className="space-y-4">

        {/* Section: Overview */}
        <Section title="Overview">
          <p>
            Statix is a simulated NBA player stock market for the 2025 playoffs. Buy and sell shares in 80 players
            using V-Bucks. Each playoff round, the fees collected from trading are distributed back to
            shareholders as dividends — with a bonus pool for holders of the top fantasy scorers.
          </p>
          <p className="mt-2">
            The contest ends when the NBA Champion is crowned. Final portfolio value determines the winners.
          </p>
        </Section>

        {/* Section: Starting balance */}
        <Section title="Starting balance">
          <p>
            Every approved user receives <span className="font-semibold text-foreground">300 V-Bucks</span> to start.
            V-Bucks are the in-game currency — they&apos;re not real money, but prizes are.
          </p>
        </Section>

        {/* Section: Trading */}
        <Section title="Trading">
          <ul className="space-y-2">
            <li><Bullet />Each player has their own AMM pool using a constant-product formula (<code className="text-xs bg-white/[0.06] px-1 py-0.5 rounded">x × y = k</code>).</li>
            <li><Bullet />Prices rise as more shares are bought and fall as shares are sold — just like a real market.</li>
            <li><Bullet />A <span className="font-semibold text-foreground">2% fee</span> is charged on every trade.</li>
            <li><Bullet />67% of fees go to the dividend pool. 33% goes to the protocol.</li>
            <li><Bullet />Trading may be paused between playoff rounds. A banner will appear when trading is frozen.</li>
          </ul>
        </Section>

        {/* Section: Fantasy scoring */}
        <Section title="Fantasy point scoring">
          <p className="mb-3">Players are scored using the following per-game formula:</p>
          <div className="overflow-x-auto rounded-xl border border-white/[0.06] bg-white/[0.02]">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/[0.06] text-left text-[11px] font-medium uppercase tracking-wider text-muted-foreground/80">
                  <th className="px-4 py-2.5">Stat</th>
                  <th className="px-4 py-2.5 text-right">Points</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.04]">
                {[
                  ['Points (PTS)', '×1.0'],
                  ['Rebounds (REB)', '×1.2'],
                  ['Assists (AST)', '×1.5'],
                  ['Steals (STL)', '×2.0'],
                  ['Blocks (BLK)', '×2.0'],
                  ['3-Pointers Made (3PM)', '×0.5'],
                  ['Turnovers (TOV)', '×−1.5'],
                  ['Double-double bonus', '+2'],
                  ['Triple-double bonus', '+5'],
                ].map(([stat, pts]) => (
                  <tr key={stat}>
                    <td className="px-4 py-2.5 text-muted-foreground">{stat}</td>
                    <td className="px-4 py-2.5 text-right font-semibold tabular-nums text-foreground">{pts}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-xs text-muted-foreground/80">
            A double-double requires 10+ in two stat categories (PTS, REB, AST, STL, or BLK). A triple-double requires
            10+ in three categories.
          </p>
        </Section>

        {/* Section: Dividends */}
        <Section title="Dividends">
          <p className="mb-3">
            At the end of each playoff round, the accumulated fee pool is distributed to shareholders:
          </p>
          <ul className="space-y-2">
            <li>
              <Bullet />
              <span className="font-semibold text-foreground">20% base pool</span> — shared among ALL shareholders
              proportional to how many shares you hold across all players.
            </li>
            <li>
              <Bullet />
              <span className="font-semibold text-foreground">80% top performer pool</span> — shared among holders of
              the top-N fantasy point scorers, weighted by their average FPts and your share count.
            </li>
          </ul>

          <div className="mt-4 overflow-x-auto rounded-xl border border-white/[0.06] bg-white/[0.02]">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/[0.06] text-left text-[11px] font-medium uppercase tracking-wider text-muted-foreground/80">
                  <th className="px-4 py-2.5">Playoff round</th>
                  <th className="px-4 py-2.5 text-right">Top-N eligible</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.04]">
                {[
                  ['Round 1 (16 teams)', 'Top 10'],
                  ['Round 2 (8 teams)', 'Top 5'],
                  ['Conference Finals (4 teams)', 'Top 3'],
                  ['NBA Finals (2 teams)', 'Top 1'],
                ].map(([round, topN]) => (
                  <tr key={round}>
                    <td className="px-4 py-2.5 text-muted-foreground">{round}</td>
                    <td className="px-4 py-2.5 text-right font-semibold text-foreground">{topN}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="mt-3 text-xs text-muted-foreground/80">
            Rankings are based on per-game average fantasy points (minimum 1 game played in the round).
            Your holdings are snapshotted at the time of distribution — buying after a round ends does not
            qualify you for that round&apos;s dividends.
          </p>
        </Section>

        {/* Section: Prizes */}
        <Section title="Prizes">
          <p className="mb-3">Final standings are determined by total portfolio value at the end of the NBA Finals:</p>
          <div className="grid grid-cols-3 gap-3">
            {[
              { place: '1st', prize: '$250', color: 'text-amber-400' },
              { place: '2nd', prize: '$100', color: 'text-slate-300' },
              { place: '3rd', prize: '$50', color: 'text-amber-600' },
            ].map(({ place, prize, color }) => (
              <div
                key={place}
                className="rounded-2xl border border-white/[0.06] bg-gradient-to-b from-white/[0.03] to-transparent px-4 py-5 text-center"
              >
                <p className={`text-2xl font-bold ${color}`}>{prize}</p>
                <p className="mt-1 text-xs text-muted-foreground">{place} Place</p>
              </div>
            ))}
          </div>
          <p className="mt-3 text-xs text-muted-foreground/80">
            Portfolio value = V-Bucks cash balance + (shares held × current price) + unclaimed dividends.
          </p>
        </Section>

        {/* Section: Eligibility */}
        <Section title="Eligibility &amp; rules">
          <ul className="space-y-2">
            <li><Bullet />Must be an approved user to participate. Apply via the signup page.</li>
            <li><Bullet />One account per person. Attempts to create multiple accounts will result in disqualification.</li>
            <li><Bullet />All trading is simulated — no real money is used to buy or sell shares.</li>
            <li><Bullet />Prizes are paid out after the NBA champion is crowned and final standings are verified.</li>
          </ul>
        </Section>

      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-white/[0.06] bg-gradient-to-b from-white/[0.015] to-transparent px-5 py-6 sm:px-8 sm:py-7">
      <h2 className="mb-4 text-base font-semibold text-foreground">{title}</h2>
      <div className="text-sm leading-relaxed text-muted-foreground">{children}</div>
    </div>
  );
}

function Bullet() {
  return <span className="mr-2 inline-block h-1.5 w-1.5 translate-y-[-1px] rounded-full bg-primary align-middle" />;
}
