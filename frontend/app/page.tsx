'use client';

import { useAccount } from 'wagmi';
import { usePrivy } from '@privy-io/react-auth';
import { PlayerGrid } from '@/components/PlayerGrid';
import { Portfolio } from '@/components/Portfolio';
import { DividendSummary } from '@/components/DividendSummary';

export default function Home() {
  const { isConnected } = useAccount();
  const { login } = usePrivy();

  return (
    <div className="space-y-16">
      {/* Centered page header */}
      <section className="relative text-center pt-6 pb-10">
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[200px] bg-primary/[0.08] rounded-full blur-3xl" />
        </div>
        <div className="relative z-10 max-w-3xl mx-auto space-y-5">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 bg-success/10 rounded-full text-xs font-medium text-success border border-success/20">
            ATHLETE MARKET
          </div>
          <h1 className="text-6xl md:text-7xl font-bold tracking-tight text-foreground drop-shadow-sm">
            Statix
          </h1>
          <p className="text-lg md:text-xl text-gray-400">
            Trade NBA players like stocks. Earn weekly dividends based on performance.
          </p>
        </div>
      </section>

      {/* Connect your wallet panel (when not connected) */}
      {!isConnected && (
        <section className="max-w-xl mx-auto">
          <div className="bg-card border border-white/[0.06] rounded-2xl p-8 text-center">
            <h2 className="text-xl font-bold text-foreground mb-2">Connect Your Wallet</h2>
            <p className="text-gray-400 text-sm mb-6">
              Connect your wallet to start trading player shares and earning dividends.
            </p>
            <div className="flex justify-center">
              <button
                onClick={login}
                className="bg-primary hover:bg-primary-600 text-primary-foreground font-semibold px-6 py-3 rounded-xl transition-colors"
              >
                Connect Wallet
              </button>
            </div>
          </div>
        </section>
      )}

      {/* Portfolio + Dividends (when connected) */}
      {isConnected && (
        <section className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <Portfolio />
          <DividendSummary />
        </section>
      )}

      {/* Player Marketplace */}
      <section id="players" className="space-y-6 pt-4">
        <h2 className="text-2xl md:text-3xl font-bold text-foreground flex items-center gap-2">
          <span className="inline-block w-1 h-8 bg-success rounded-full" />
          Player Marketplace
        </h2>
        <PlayerGrid />
      </section>
    </div>
  );
}
