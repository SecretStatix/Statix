'use client';

import { useAccount } from 'wagmi';
import { PlayerGrid } from '@/components/PlayerGrid';
import { Portfolio } from '@/components/Portfolio';
import { DividendSummary } from '@/components/DividendSummary';

export default function Home() {
  const { isConnected } = useAccount();

  return (
    <div className="space-y-8">
      {/* Hero Section */}
      <section className="text-center py-12">
        <h1 className="text-5xl font-bold mb-4 bg-gradient-to-r from-orange-400 to-pink-500 text-transparent bg-clip-text">
          Dividend Fantasy
        </h1>
        <p className="text-xl text-gray-400 max-w-2xl mx-auto">
          Trade NBA players like stocks. Earn weekly dividends based on performance.
        </p>
      </section>

      {isConnected ? (
        <>
          {/* Portfolio Summary */}
          <section>
            <h2 className="text-2xl font-bold mb-4">Your Portfolio</h2>
            <Portfolio />
          </section>

          {/* Dividend Summary */}
          <section>
            <h2 className="text-2xl font-bold mb-4">Dividends</h2>
            <DividendSummary />
          </section>
        </>
      ) : (
        <section className="text-center py-8">
          <div className="bg-gray-800 rounded-xl p-8 max-w-md mx-auto">
            <h2 className="text-xl font-semibold mb-4">Connect Your Wallet</h2>
            <p className="text-gray-400 mb-4">
              Connect your wallet to start trading player shares and earning dividends.
            </p>
          </div>
        </section>
      )}

      {/* Player Marketplace */}
      <section>
        <h2 className="text-2xl font-bold mb-4">Player Marketplace</h2>
        <PlayerGrid />
      </section>

      {/* How It Works */}
      <section className="py-12">
        <h2 className="text-2xl font-bold mb-8 text-center">How It Works</h2>
        <div className="grid md:grid-cols-3 gap-8">
          <div className="bg-gray-800 rounded-xl p-6">
            <div className="text-4xl mb-4">🏀</div>
            <h3 className="text-lg font-semibold mb-2">1. Buy Player Shares</h3>
            <p className="text-gray-400">
              Trade NBA player tokens using our AMM. Prices move based on supply and demand.
            </p>
          </div>
          <div className="bg-gray-800 rounded-xl p-6">
            <div className="text-4xl mb-4">📈</div>
            <h3 className="text-lg font-semibold mb-2">2. Players Perform</h3>
            <p className="text-gray-400">
              When players beat their fantasy projections, shareholders earn dividends.
            </p>
          </div>
          <div className="bg-gray-800 rounded-xl p-6">
            <div className="text-4xl mb-4">💰</div>
            <h3 className="text-lg font-semibold mb-2">3. Claim Dividends</h3>
            <p className="text-gray-400">
              Claim your weekly dividends. The better your picks, the more you earn.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
