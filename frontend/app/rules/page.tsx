export default function RulesPage() {
  return (
    <div className="pb-16">
      <header className="mb-12 space-y-2">
        <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-muted-foreground/70">How it works</p>
        <h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">Rules &amp; mechanics</h1>
        <p className="max-w-xl text-sm text-muted-foreground">
          Everything you need to know about trading, scoring, and earning dividends.
        </p>
      </header>

      <div className="space-y-12">

        <Section title="Overview">
          <p>
            Statix is a simulated NBA player stock market for the 2026 playoffs. Buy and sell shares in 80 players
            using play money. Each playoff round, the trading fees collected are distributed back to shareholders as
            dividends, with a bigger bonus pool reserved for holders of the top fantasy scorers.
          </p>
          <p>
            The contest runs through the NBA Finals. Your final portfolio value — cash + share value + unclaimed
            dividends — determines your standing on the leaderboard.
          </p>
        </Section>

        <Section title="Starting balance">
          <p>
            Every approved user receives <Strong>$300 in play money</Strong> for free via the faucet.
            Play money is the in-game currency used to buy and sell shares — it&apos;s not real money, but the prizes are.
          </p>
          <p>
            A <Strong>$100 play-money top-up</Strong> will be periodically airdropped to all users throughout the
            contest — simulating the ability to deposit more funds over time.
          </p>
        </Section>

        <Section title="Trading">
          <p>
            Prices move with supply and demand. Buying shares drives the price up, selling drives it down — early
            buyers get the best prices. There are no order books and no waiting for a counterparty; trades execute
            instantly against the player&apos;s market price.
          </p>
          <p>
            A <Strong>2% fee</Strong> is charged on every trade. <Strong>67%</Strong> of all fees accumulate in the
            dividend pool and are paid out at the end of each round. Trading is paused briefly during dividend
            distribution between rounds — a banner will appear when this happens.
          </p>
        </Section>

        <Section title="Weekly competitions">
          <p className="mb-5">
            Every week is a fresh competition no matter where you&apos;re ranked.
          </p>

          <div className="grid gap-4 sm:grid-cols-2">
            <PrizeCard
              kicker="Weekly Raffle"
              prize="$25"
              prizeNote="actual cash"
              lines={[
                'Every trade = 1 entry to win',
                'Max 5 entries per week',
              ]}
            />
            <PrizeCard
              kicker="Top Weekly Trader"
              prize="$25"
              prizeNote="play money"
              lines={[
                'Highest % portfolio gain wins',
                'Requires at least 3 trades',
              ]}
            />
          </div>

          <p className="mt-5 text-xs text-muted-foreground/80">
            New week. New chance to win.
          </p>
        </Section>

        <Section title="Fantasy point scoring">
          <p className="mb-4">Players are scored using the following per-game formula:</p>
          <StatTable
            head={['Stat', 'Points']}
            rows={[
              ['Points (PTS)', '×1.0'],
              ['Rebounds (REB)', '×1.2'],
              ['Assists (AST)', '×1.5'],
              ['Steals (STL)', '×2.0'],
              ['Blocks (BLK)', '×2.0'],
              ['3-Pointers Made (3PM)', '×0.5'],
              ['Turnovers (TOV)', '×−1.5'],
              ['Double-double bonus', '+2'],
              ['Triple-double bonus', '+5'],
            ]}
          />
          <p className="mt-3 text-xs text-muted-foreground/80">
            A double-double requires 10+ in two stat categories (PTS, REB, AST, STL, or BLK). A triple-double requires
            10+ in three categories.
          </p>
        </Section>

        <Section title="Dividends">
          <p className="mb-4">
            At the end of each playoff round, the accumulated fee pool is distributed to shareholders:
          </p>
          <div className="space-y-2">
            <p>
              <Strong>20% base pool</Strong> — shared among ALL shareholders proportional to how many shares you hold
              across all players.
            </p>
            <p>
              <Strong>80% top performer pool</Strong> — shared among holders of the top-N fantasy point scorers,
              weighted by their average FPts and your share count.
            </p>
          </div>

          <div className="mt-5">
            <StatTable
              head={['Playoff round', 'Top-N eligible']}
              rows={[
                ['Round 1 (16 teams)', 'Top 10'],
                ['Round 2 (8 teams)', 'Top 5'],
                ['Conference Finals (4 teams)', 'Top 3'],
                ['NBA Finals (2 teams)', 'Top 1'],
              ]}
            />
          </div>

          <p className="mt-3 text-xs text-muted-foreground/80">
            Rankings are based on per-game average fantasy points (minimum 1 game played in the round).
            Your holdings are snapshotted at the time of distribution — buying after a round ends does not
            qualify you for that round&apos;s dividends.
          </p>
        </Section>

        <Section title="Prizes">
          <p className="mb-4">Final standings are determined by total portfolio value at the end of the NBA Finals:</p>
          <div className="grid grid-cols-3 gap-3">
            {[
              { place: '1st', prize: '$250', color: 'text-amber-400' },
              { place: '2nd', prize: '$100', color: 'text-slate-300' },
              { place: '3rd', prize: '$50', color: 'text-amber-600' },
            ].map(({ place, prize, color }) => (
              <div key={place} className="py-4 text-center">
                <p className={`text-2xl font-bold ${color}`}>{prize}</p>
                <p className="mt-1 text-xs uppercase tracking-wider text-muted-foreground">{place} Place</p>
              </div>
            ))}
          </div>
          <p className="mt-3 text-xs text-muted-foreground/80">
            Portfolio value = play-money cash balance + (shares held × current price) + unclaimed dividends.
          </p>
        </Section>

        <Section title="Eligibility &amp; rules" last>
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

function Section({
  title,
  children,
  last = false,
}: {
  title: string;
  children: React.ReactNode;
  last?: boolean;
}) {
  return (
    <section className={last ? '' : 'border-b border-white/[0.06] pb-12'}>
      <div className="mb-5 flex items-center gap-2.5">
        <span className="h-1.5 w-1.5 rounded-full bg-primary" />
        <h2 className="text-xs font-semibold uppercase tracking-[0.18em] text-foreground">{title}</h2>
      </div>
      <div className="space-y-3 text-sm leading-relaxed text-muted-foreground">{children}</div>
    </section>
  );
}

function StatTable({ head, rows }: { head: [string, string]; rows: [string, string][] }) {
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-white/[0.08] text-left text-[11px] font-medium uppercase tracking-wider text-muted-foreground/80">
          <th className="py-2.5 pr-4 font-medium">{head[0]}</th>
          <th className="py-2.5 pl-4 text-right font-medium">{head[1]}</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-white/[0.04]">
        {rows.map(([a, b]) => (
          <tr key={a}>
            <td className="py-2.5 pr-4 text-muted-foreground">{a}</td>
            <td className="py-2.5 pl-4 text-right font-semibold tabular-nums text-foreground">{b}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function PrizeCard({
  kicker,
  prize,
  prizeNote,
  lines,
}: {
  kicker: string;
  prize: string;
  prizeNote: string;
  lines: string[];
}) {
  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-5">
      <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground/80">{kicker}</p>
      <p className="mt-2 text-2xl font-bold text-foreground">
        {prize} <span className="text-sm font-medium text-muted-foreground">{prizeNote}</span>
      </p>
      <ul className="mt-3 space-y-1.5 text-xs text-muted-foreground">
        {lines.map((line) => (
          <li key={line} className="flex items-start gap-2">
            <span className="mt-[5px] h-1 w-1 shrink-0 rounded-full bg-primary/70" />
            <span>{line}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Strong({ children }: { children: React.ReactNode }) {
  return <span className="font-semibold text-foreground">{children}</span>;
}

function Bullet() {
  return <span className="mr-2 inline-block h-1.5 w-1.5 translate-y-[-1px] rounded-full bg-primary align-middle" />;
}
