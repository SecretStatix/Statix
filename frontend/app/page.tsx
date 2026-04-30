'use client';

import Link from 'next/link';
import Image from 'next/image';
import { motion, useScroll, useTransform } from 'motion/react';
import { useRef } from 'react';
import { useAuth } from '@/lib/AuthContext';
import {
  TrendingUp,
  Trophy,
  Coins,
  Zap,
  ArrowRight,
  BarChart3,
  Users,
  Sparkles,
  Target,
  ShieldCheck,
} from 'lucide-react';

import { HeroPlayerStack } from '@/components/landing/HeroPlayerStack';
import { PlayerTicker } from '@/components/landing/PlayerTicker';
import { TiltCard } from '@/components/landing/TiltCard';
import { MagneticButton } from '@/components/landing/MagneticButton';
import { AnimatedNumber } from '@/components/landing/AnimatedNumber';
import { SpinningBasketball } from '@/components/landing/SpinningBasketball';
import { BouncingBasketball } from '@/components/landing/BouncingBasketball';
import {
  RevealOnScroll,
  RevealStagger,
  RevealItem,
} from '@/components/landing/RevealOnScroll';

const HEADLINE_LINE_1 = ['Turn', 'Sports'];
const HEADLINE_LINE_2 = ['into', 'Strategy'];

export default function LandingPage() {
  const { session, loading } = useAuth();
  const signedIn = Boolean(session);
  // While auth is still loading show a neutral state — prevents the "Continue → /pending" flash.
  const ctaHref = loading ? '#' : signedIn ? '/market' : '/signup';
  const ctaLabel = loading ? 'Loading…' : signedIn ? 'Open Market' : 'Get Started';

  // Parallax: hero glow drifts up as you scroll the hero section.
  const heroRef = useRef<HTMLElement>(null);
  const { scrollYProgress: heroScroll } = useScroll({
    target: heroRef,
    offset: ['start start', 'end start'],
  });
  const heroGlowY = useTransform(heroScroll, [0, 1], ['0%', '-30%']);
  const heroOpacity = useTransform(heroScroll, [0, 1], [1, 0.2]);

  return (
    <div className="relative min-h-screen overflow-hidden bg-background text-foreground">
      {/* Ambient glows that move with scroll */}
      <motion.div
        aria-hidden
        style={{ y: heroGlowY, opacity: heroOpacity }}
        className="pointer-events-none absolute inset-0 -z-10"
      >
        <div className="absolute -top-40 left-1/2 h-[44rem] w-[44rem] -translate-x-1/2 rounded-full bg-primary/[0.09] blur-[160px]" />
        <div className="absolute top-[40%] -left-40 h-[32rem] w-[32rem] rounded-full bg-accent/[0.05] blur-[140px]" />
        <div className="absolute top-[55%] -right-40 h-[34rem] w-[34rem] rounded-full bg-success/[0.04] blur-[160px]" />
      </motion.div>

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-50 border-b border-white/[0.06] bg-background/70 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6 lg:px-8">
          <Link href="/" className="flex items-center gap-2 group">
            <motion.div whileHover={{ rotate: -8, scale: 1.05 }} transition={{ type: 'spring', stiffness: 300 }}>
              <Image src="/logo.png" alt="Statix" width={32} height={32} className="rounded-lg" priority />
            </motion.div>
            <span className="text-lg font-bold tracking-tight">Statix</span>
          </Link>

          <nav className="hidden md:flex items-center gap-1 text-sm">
            {[
              ['#how', 'How it works'],
              ['#scoring', 'Scoring'],
              ['#dividends', 'Dividends'],
              ['#prizes', 'Prizes'],
            ].map(([href, label]) => (
              <a
                key={href}
                href={href}
                className="px-3 py-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
              >
                {label}
              </a>
            ))}
          </nav>

          <div className="flex items-center gap-2">
            {signedIn ? (
              <Link
                href={ctaHref}
                className="inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-primary to-accent px-4 py-2 text-sm font-semibold text-primary-foreground transition hover:scale-[1.02] hover:glow-primary active:scale-[0.98]"
              >
                {ctaLabel}
                <ArrowRight className="h-4 w-4" />
              </Link>
            ) : (
              <>
                <Link
                  href="/login"
                  className="hidden sm:inline-flex items-center px-4 py-2 rounded-lg text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                >
                  Sign in
                </Link>
                <Link
                  href="/signup"
                  className="inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-primary to-accent px-4 py-2 text-sm font-semibold text-primary-foreground transition hover:scale-[1.02] hover:glow-primary active:scale-[0.98]"
                >
                  Sign up
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </>
            )}
          </div>
        </div>
      </header>

      {/* ── Hero ──────────────────────────────────────────────────────────── */}
      <section ref={heroRef} className="relative">
        <div className="mx-auto max-w-7xl px-4 pt-12 pb-6 sm:px-6 sm:pt-20 lg:px-8">
          <div className="grid gap-8 lg:grid-cols-12 lg:items-center">
            {/* Copy column */}
            <div className="lg:col-span-6">
              <motion.div
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
                className="inline-flex items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.03] px-3 py-1 text-xs font-medium text-muted-foreground backdrop-blur"
              >
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-60" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-success" />
                </span>
                Live for the 2026 Playoffs
              </motion.div>

              <h1 className="mt-6 text-4xl font-bold leading-[1.05] tracking-tight sm:text-6xl lg:text-7xl">
                <StaggerWords words={HEADLINE_LINE_1} />
                <br />
                <StaggerWords words={HEADLINE_LINE_2} delayBase={0.4} wordClassName="bg-gradient-to-r from-primary via-accent to-success bg-clip-text text-transparent" noWillChange />
              </h1>

              <motion.p
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.7, delay: 1.0 }}
                className="mt-6 max-w-lg text-base text-muted-foreground sm:text-lg"
              >
                Build a portfolio of basketball stars. Buy and sell shares through an open market, earn dividends every playoff round, and compete for real cash prizes.
              </motion.p>

              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 1.2 }}
                className="mt-9 flex flex-col items-start gap-3 sm:flex-row sm:items-center"
              >
                <MagneticButton
                  href={ctaHref}
                  className="group inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-primary to-accent px-7 py-3.5 text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/30 transition hover:glow-primary"
                >
                  {ctaLabel}
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                </MagneticButton>
                <a
                  href="#how"
                  className="inline-flex items-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.02] px-6 py-3.5 text-sm font-semibold text-foreground transition hover:bg-white/[0.04]"
                >
                  How it works
                </a>
              </motion.div>

              {/* Trust strip */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 1, delay: 1.4 }}
                className="mt-10 flex items-center gap-5 text-xs text-muted-foreground"
              >
    
                <div className="hidden sm:block h-3 w-px bg-white/10" />
                <div className="hidden sm:flex items-center gap-1.5">
                  <ShieldCheck className="h-3.5 w-3.5" />
                  Closed beta — invitation only
                </div>
              </motion.div>
            </div>

            {/* Hero player stack */}
            <div className="relative lg:col-span-6">
              <HeroPlayerStack />
            </div>
          </div>
        </div>

        {/* Live price marquee — no top/bottom divider lines, just the
            scrolling row of player chips fading into the page edges. */}
        <div className="mt-6 sm:mt-10">
          <PlayerTicker />
        </div>
      </section>

      {/* ── How it works ──────────────────────────────────────────────────── */}
      <section id="how" className="relative py-24 sm:py-32">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <RevealOnScroll className="flex flex-col items-start gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div className="max-w-xl">
              <h2 className="text-3xl font-semibold tracking-tight sm:text-5xl">
                How Statix works.
              </h2>
            </div>
            <p className="max-w-md text-base leading-relaxed text-muted-foreground sm:text-right">
              Sign up, trade shares of 80 players, and collect dividends after every playoff round — all the way through the Finals.
            </p>
          </RevealOnScroll>

          <div className="relative mt-20 sm:mt-24">
            {/* Connecting hairline that runs through the icon nodes on desktop */}
            <div
              aria-hidden
              className="pointer-events-none absolute left-0 right-0 top-[2.625rem] hidden lg:block"
            >
              <div className="mx-auto h-px w-full max-w-5xl bg-gradient-to-r from-transparent via-white/10 to-transparent" />
            </div>

            <RevealStagger
              className="grid gap-16 lg:grid-cols-3 lg:gap-12"
              stagger={0.12}
            >
              {[
                {
                  step: '01',
                  icon: Coins,
                  title: 'Sign up, get funded.',
                  desc: 'Every approved tester is funded with play money for free. Periodic top-ups keep your buying power fresh as the playoffs unfold.',
                },
                {
                  step: '02',
                  icon: TrendingUp,
                  title: 'Trade shares of 80 players.',
                  desc: 'Every player has their own market — prices move with supply and demand. Buy low, sell high, or hold for dividends.',
                },
                {
                  step: '03',
                  icon: Trophy,
                  title: 'Collect dividends each round.',
                  desc: 'Every playoff round, accumulated trading fees are distributed back to shareholders. Holders of top fantasy scorers earn a bigger slice.',
                },
              ].map(({ step, icon: Icon, title, desc }) => (
                <RevealItem key={step}>
                  <div className="group relative flex flex-col">
                    {/* Icon node — sits on the connecting line on desktop */}
                    <div className="relative inline-flex">
                      <span
                        aria-hidden
                        className="pointer-events-none absolute -left-2 -top-10 select-none text-[5.5rem] font-bold leading-none tracking-tighter text-white/[0.04]"
                      >
                        {step}
                      </span>
                      <div className="relative z-10 flex h-[5.25rem] w-[5.25rem] items-center justify-center rounded-full bg-background">
                        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary ring-1 ring-primary/20 transition-all duration-300 group-hover:scale-110 group-hover:bg-primary/15 group-hover:ring-primary/40">
                          <Icon className="h-6 w-6" />
                        </div>
                      </div>
                    </div>

                    <div className="mt-8">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-primary/80">
                        Step {step}
                      </p>
                      <h3 className="mt-3 text-xl font-semibold tracking-tight sm:text-[1.35rem]">
                        {title}
                      </h3>
                      <p className="mt-3 max-w-sm text-[15px] leading-relaxed text-muted-foreground">
                        {desc}
                      </p>
                    </div>
                  </div>
                </RevealItem>
              ))}
            </RevealStagger>
          </div>
        </div>
      </section>

      {/* ── Features ──────────────────────────────────────────────────────── */}
      <section className="relative py-12 sm:py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <RevealStagger className="grid gap-4 sm:gap-6 md:grid-cols-2 lg:grid-cols-4">
            {[
              { icon: Zap, label: 'Real-time trading', desc: 'Instant buys and sells. No order books, no waiting.' },
              { icon: BarChart3, label: 'Live performance', desc: 'Stats pulled directly from real games.' },
              { icon: Users, label: 'Compete with friends', desc: 'Climb the leaderboard against every other tester.' },
              { icon: ShieldCheck, label: 'Closed beta', desc: 'Approved testers only. Spots are limited.' },
            ].map(({ icon: Icon, label, desc }) => (
              <RevealItem key={label}>
                <motion.div
                  whileHover={{ y: -4 }}
                  className="rounded-2xl border border-white/[0.06] bg-white/[0.015] p-5 transition-colors hover:bg-white/[0.04]"
                >
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <Icon className="h-4 w-4" />
                  </div>
                  <h4 className="mt-4 text-sm font-semibold">{label}</h4>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{desc}</p>
                </motion.div>
              </RevealItem>
            ))}
          </RevealStagger>
        </div>
      </section>

      {/* ── Fantasy scoring ───────────────────────────────────────────────── */}
      <section id="scoring" className="relative py-20 sm:py-28">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid gap-12 lg:grid-cols-2 lg:items-center">
            <RevealOnScroll>
              <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-muted-foreground/70">
                Fantasy scoring
              </p>
              <h2 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">
                Real stats. Real points.
              </h2>
              <p className="mt-4 text-base leading-relaxed text-muted-foreground">
                Every player&apos;s value reflects how they actually play. Fantasy points are calculated per game using a transparent formula — no opaque algorithms, no arbitrary scoring.
              </p>

              <ul className="mt-6 space-y-3 text-sm text-muted-foreground">
                <li className="flex items-start gap-3">
                  <Target className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  <span>
                    <span className="font-semibold text-foreground">Bonuses</span> for double-doubles (+2) and triple-doubles (+5) reward all-around performance.
                  </span>
                </li>
                <li className="flex items-start gap-3">
                  <Target className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  <span>
                    <span className="font-semibold text-foreground">Last-10 average</span> drives projections, so a hot streak shows up fast.
                  </span>
                </li>
                <li className="flex items-start gap-3">
                  <Target className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  <span>
                    <span className="font-semibold text-foreground">Live data</span> straight from the source — your dividends update with every game.
                  </span>
                </li>
              </ul>
            </RevealOnScroll>

            <RevealOnScroll delay={0.15}>
              <TiltCard
                max={5}
                className="overflow-hidden rounded-2xl border border-white/[0.06] bg-gradient-to-b from-white/[0.04] to-transparent backdrop-blur"
              >
                <div className="border-b border-white/[0.06] px-5 py-4">
                  <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground/70">
                    Per-game scoring formula
                  </p>
                </div>
                <table className="w-full text-sm">
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
                    ].map(([stat, pts], i) => (
                      <motion.tr
                        key={stat}
                        initial={{ opacity: 0, x: -8 }}
                        whileInView={{ opacity: 1, x: 0 }}
                        viewport={{ once: true, amount: 0.5 }}
                        transition={{ duration: 0.4, delay: 0.04 * i }}
                      >
                        <td className="px-5 py-3 text-muted-foreground">{stat}</td>
                        <td className="px-5 py-3 text-right font-semibold tabular-nums text-foreground">
                          {pts}
                        </td>
                      </motion.tr>
                    ))}
                  </tbody>
                </table>
              </TiltCard>
            </RevealOnScroll>
          </div>
        </div>
      </section>

      {/* ── Dividends ────────────────────────────────────────────────────── */}
      <section id="dividends" className="relative py-20 sm:py-28">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <RevealOnScroll className="mx-auto max-w-2xl text-center">
            <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-muted-foreground/70">
              Dividends
            </p>
            <h2 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">
              Get paid for holding the right players
            </h2>
            <p className="mt-4 text-base text-muted-foreground">
              At the end of each round, accumulated trading fees are distributed back to shareholders. Holding hot performers earns you a bigger slice of the pie.
            </p>
          </RevealOnScroll>

          <RevealStagger className="mx-auto mt-12 grid max-w-4xl gap-6 md:grid-cols-2" stagger={0.15}>
            <RevealItem>
              <div className="relative overflow-hidden rounded-2xl border border-white/[0.06] bg-gradient-to-b from-primary/[0.06] to-transparent p-7">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary ring-1 ring-primary/20">
                    <Sparkles className="h-5 w-5" />
                  </div>
                  <p className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                    Base pool
                  </p>
                </div>
                <p className="mt-5 bg-gradient-to-r from-primary to-accent bg-clip-text text-6xl font-bold tracking-tight text-transparent">
                  <AnimatedNumber value={20} suffix="%" />
                </p>
                <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                  Split among <span className="font-semibold text-foreground">all shareholders</span>, proportional to total shares held across all players. Hold anything, earn something.
                </p>
              </div>
            </RevealItem>

            <RevealItem>
              <div className="relative overflow-hidden rounded-2xl border border-white/[0.06] bg-gradient-to-b from-accent/[0.06] to-transparent p-7">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent/10 text-accent ring-1 ring-accent/20">
                    <Trophy className="h-5 w-5" />
                  </div>
                  <p className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                    Top performer pool
                  </p>
                </div>
                <p className="mt-5 bg-gradient-to-r from-accent via-primary to-success bg-clip-text text-6xl font-bold tracking-tight text-transparent">
                  <AnimatedNumber value={80} suffix="%" />
                </p>
                <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                  Reserved for holders of the <span className="font-semibold text-foreground">top fantasy scorers</span>, weighted by both their points and your share count.
                </p>
              </div>
            </RevealItem>
          </RevealStagger>

          <RevealOnScroll className="mx-auto mt-10 max-w-4xl overflow-hidden rounded-2xl border border-white/[0.06] bg-white/[0.02]">
            <div className="grid grid-cols-4 divide-x divide-white/[0.06] text-center">
              {[
                { round: 'Round 1', topN: 'Top 10' },
                { round: 'Round 2', topN: 'Top 5' },
                { round: 'Conf Finals', topN: 'Top 3' },
                { round: 'Finals', topN: 'Top 1' },
              ].map(({ round, topN }, i) => (
                <motion.div
                  key={round}
                  initial={{ opacity: 0, y: 12 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, amount: 0.5 }}
                  transition={{ duration: 0.5, delay: i * 0.08 }}
                  className="px-3 py-5 sm:px-5"
                >
                  <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground/70">
                    {round}
                  </p>
                  <p className="mt-1.5 text-base font-semibold text-foreground sm:text-lg">{topN}</p>
                </motion.div>
              ))}
            </div>
          </RevealOnScroll>
        </div>
      </section>

      {/* ── Prizes ───────────────────────────────────────────────────────── */}
      <section id="prizes" className="relative py-20 sm:py-28">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <RevealOnScroll className="mx-auto max-w-2xl text-center">
            <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-muted-foreground/70">
              Prizes
            </p>
            <h2 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">
              Real cash for the top three
            </h2>
            <p className="mt-4 text-base text-muted-foreground">
              Final standings are determined by total portfolio value at the end of the Finals — cash + share value + unclaimed dividends.
            </p>
          </RevealOnScroll>

          <RevealStagger className="mx-auto mt-12 grid max-w-4xl gap-4 sm:grid-cols-3" stagger={0.15}>
            {[
              { place: '1st Place', prize: 250, accent: 'from-amber-400/25 to-amber-400/0', text: 'text-amber-400', ring: 'ring-amber-400/30' },
              { place: '2nd Place', prize: 100, accent: 'from-slate-300/20 to-slate-300/0', text: 'text-slate-200', ring: 'ring-slate-300/25' },
              { place: '3rd Place', prize: 50, accent: 'from-amber-600/20 to-amber-600/0', text: 'text-amber-500', ring: 'ring-amber-600/25' },
            ].map(({ place, prize, accent, text, ring }) => (
              <RevealItem key={place}>
                <TiltCard
                  max={6}
                  className={`relative h-full overflow-hidden rounded-2xl border border-white/[0.06] bg-gradient-to-b ${accent} p-8 text-center ring-1 ${ring}`}
                >
                  <motion.div
                    animate={{ y: [0, -3, 0], rotate: [-2, 2, -2] }}
                    transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut' }}
                    className="mx-auto"
                  >
                    <Trophy className={`mx-auto h-8 w-8 ${text}`} />
                  </motion.div>
                  <p className={`mt-5 text-5xl font-bold tracking-tight ${text}`}>
                    <AnimatedNumber value={prize} prefix="$" />
                  </p>
                  <p className="mt-2 text-sm font-medium text-muted-foreground">{place}</p>
                </TiltCard>
              </RevealItem>
            ))}
          </RevealStagger>
        </div>
      </section>

      {/* ── Final CTA ────────────────────────────────────────────────────── */}
      <section className="relative py-20 sm:py-28">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <RevealOnScroll>
            <div className="relative overflow-hidden rounded-3xl border border-white/[0.06] bg-gradient-to-br from-primary/[0.10] via-card to-accent/[0.06] px-6 py-14 text-center sm:px-12 sm:py-20">
              {/* Animated radial */}
              <motion.div
                aria-hidden
                className="pointer-events-none absolute -top-32 left-1/2 -translate-x-1/2 h-96 w-96 rounded-full bg-primary/15 blur-3xl"
                animate={{ scale: [1, 1.1, 1], opacity: [0.6, 0.9, 0.6] }}
                transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut' }}
              />

              {/* Pool-ball-style basketball bouncing in the background.
                  Constant momentum, spins as it travels, never escapes the
                  panel because of its parent's `overflow-hidden`. Sits
                  underneath the headline/CTA via z-index. */}
              <BouncingBasketball size={104} speed={4.2} opacity={0.85} />

              {/* Foreground content — elevated above the bouncing ball. */}
              <div className="relative z-10">
                <h2 className="text-3xl font-bold tracking-tight sm:text-5xl">
                  Ready to draft your portfolio?
                </h2>
                <p className="mx-auto mt-4 max-w-xl text-base text-muted-foreground">
                  Sign up and start trading the 2026 Playoffs. The closed beta is open now.
                </p>
                <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
                  <MagneticButton
                    href={ctaHref}
                    className="group inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-primary to-accent px-8 py-4 text-sm font-semibold text-primary-foreground shadow-xl shadow-primary/40 transition hover:glow-primary"
                  >
                    {ctaLabel}
                    <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                  </MagneticButton>
                  {!signedIn && (
                    <Link
                      href="/login"
                      className="inline-flex items-center px-6 py-4 rounded-xl text-sm font-semibold text-muted-foreground hover:text-foreground transition-colors"
                    >
                      Already have an account? Sign in
                    </Link>
                  )}
                </div>
              </div>
            </div>
          </RevealOnScroll>
        </div>
      </section>

      {/* ── Footer ───────────────────────────────────────────────────────── */}
      <footer className="border-t border-white/[0.06]">
        <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
          <div className="flex flex-col items-center justify-between gap-4 text-xs text-muted-foreground sm:flex-row">
            <div className="flex items-center gap-2">
              <Image src="/logo.png" alt="Statix" width={20} height={20} className="rounded" />
              <span className="font-medium text-foreground/80">Statix</span>
              <span className="text-muted-foreground/60">— closed beta. Simulated currency, real prizes.</span>
            </div>
            <div className="flex items-center gap-4">
              <Link href="/login" className="hover:text-foreground transition-colors">
                Sign in
              </Link>
              <Link href="/signup" className="hover:text-foreground transition-colors">
                Sign up
              </Link>
            </div>
          </div>
          <p className="mt-6 border-t border-white/[0.06] pt-6 text-center text-[11px] leading-relaxed text-muted-foreground/70">
            Statix is not affiliated with, endorsed by, or sponsored by the NBA, NBPA, any NBA team, or any player.
          </p>
        </div>
      </footer>
    </div>
  );
}

// Word-by-word stagger for the hero headline. Lives below the page so the
// page component above stays focused on layout.
function StaggerWords({ words, delayBase = 0, wordClassName = '', noWillChange = false }: { words: string[]; delayBase?: number; wordClassName?: string; noWillChange?: boolean }) {
  return (
    <span className="inline-flex flex-wrap gap-x-[0.25em]">
      {words.map((w, i) => (
        <motion.span
          key={`${w}-${i}`}
          initial={{ y: '110%', opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{
            duration: 0.85,
            ease: [0.22, 1, 0.36, 1],
            delay: delayBase + i * 0.08,
          }}
          className={`inline-block ${noWillChange ? '' : 'will-change-transform'} ${wordClassName}`}
        >
          {w}
        </motion.span>
      ))}
    </span>
  );
}
