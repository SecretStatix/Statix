'use client';

import { useState, useEffect } from 'react';
import { useAccount } from 'wagmi';
import { formatUnits } from 'viem';
import { PlayerData } from './PlayerGrid';
import {
  useBuyQuote,
  useSellQuote,
  useApproveDBucks,
  useBuyShares,
  useSellShares,
  useDBucksBalance,
  useDBucksAllowance,
  useHoldings,
  formatUSDC,
} from '@/hooks/useContracts';

interface TradeModalProps {
  isOpen: boolean;
  onClose: () => void;
  player: PlayerData;
}

export function TradeModal({ isOpen, onClose, player }: TradeModalProps) {
  const { address, isConnected } = useAccount();
  const [mode, setMode] = useState<'buy' | 'sell'>('buy');
  const [amount, setAmount] = useState('');
  const shares = parseFloat(amount) || 0;

  // On-chain reads
  const { data: buyQuoteData } = useBuyQuote(player.index, mode === 'buy' ? shares : 0);
  const { data: sellQuoteData } = useSellQuote(player.index, mode === 'sell' ? shares : 0);
  const { data: dbucksBalance } = useDBucksBalance(address);
  const { data: allowance } = useDBucksAllowance(address);
  const { data: myHoldings } = useHoldings(player.index, address);

  // On-chain writes
  const { approve, isPending: approving, isSuccess: approved } = useApproveDBucks();
  const { buy, isPending: buying, isSuccess: bought } = useBuyShares();
  const { sell, isPending: selling, isSuccess: sold } = useSellShares();

  // Reset on close
  useEffect(() => {
    if (!isOpen) {
      setAmount('');
      setMode('buy');
    }
  }, [isOpen]);

  // Close on success
  useEffect(() => {
    if (bought || sold) {
      setTimeout(() => onClose(), 2000);
    }
  }, [bought, sold, onClose]);

  if (!isOpen) return null;

  // Parse quote
  let quote: { cost: number; fee: number; total: number; newPrice: number } | null = null;

  if (mode === 'buy' && buyQuoteData && shares > 0) {
    const [cost, fee, total, newPrice] = buyQuoteData as [bigint, bigint, bigint, bigint];
    quote = {
      cost: parseFloat(formatUnits(cost, 6)),
      fee: parseFloat(formatUnits(fee, 6)),
      total: parseFloat(formatUnits(total, 6)),
      newPrice: parseFloat(formatUnits(newPrice, 6)),
    };
  } else if (mode === 'sell' && sellQuoteData && shares > 0) {
    const [revenue, fee, net, newPrice] = sellQuoteData as [bigint, bigint, bigint, bigint];
    quote = {
      cost: parseFloat(formatUnits(revenue, 6)),
      fee: parseFloat(formatUnits(fee, 6)),
      total: parseFloat(formatUnits(net, 6)),
      newPrice: parseFloat(formatUnits(newPrice, 6)),
    };
  }

  // Fallback client-side quote when chain not connected
  if (!quote && shares > 0) {
    const virtualShares = 1000;
    const virtualCash = player.price * virtualShares;
    const k = virtualShares * virtualCash;

    if (mode === 'buy') {
      const newShares = virtualShares - shares;
      if (newShares > 0) {
        const newCash = k / newShares;
        const cost = newCash - virtualCash;
        const fee = cost * 0.015;
        quote = { cost, fee, total: cost + fee, newPrice: newCash / newShares };
      }
    } else {
      const newShares = virtualShares + shares;
      const newCash = k / newShares;
      const revenue = virtualCash - newCash;
      const fee = revenue * 0.015;
      quote = { cost: revenue, fee, total: revenue - fee, newPrice: newCash / newShares };
    }
  }

  const slippage = quote ? Math.abs((quote.newPrice - player.price) / player.price * 100) : 0;
  const balance = dbucksBalance ? parseFloat(formatUnits(dbucksBalance as bigint, 6)) : 0;
  const holdingAmount = myHoldings ? parseFloat(formatUnits(myHoldings as bigint, 6)) : 0;
  const needsApproval = mode === 'buy' && quote && allowance !== undefined &&
    (allowance as bigint) < BigInt(Math.ceil(quote.total * 1e6));

  const handleTrade = () => {
    if (!quote || !shares) return;

    if (mode === 'buy') {
      if (needsApproval) {
        approve(quote.total * 1.1); // 10% buffer
      } else {
        buy(player.index, shares, quote.total * 1.05); // 5% slippage tolerance
      }
    } else {
      sell(player.index, shares, quote.total * 0.95); // 5% slippage tolerance
    }
  };

  const isPending = approving || buying || selling;
  const isSuccess = bought || sold;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-800 rounded-xl max-w-md w-full">
        {/* Header */}
        <div className="p-4 border-b border-gray-700 flex items-center justify-between">
          <h2 className="text-xl font-bold">Trade {player.name}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Success message */}
        {isSuccess && (
          <div className="p-4 bg-green-900/30 text-green-400 text-center font-semibold">
            Transaction confirmed!
          </div>
        )}

        {/* Mode Toggle */}
        <div className="p-4">
          <div className="flex bg-gray-700 rounded-lg p-1">
            <button
              onClick={() => setMode('buy')}
              className={`flex-1 py-2 rounded-md font-medium transition ${
                mode === 'buy' ? 'bg-green-600 text-white' : 'text-gray-400'
              }`}
            >
              Buy
            </button>
            <button
              onClick={() => setMode('sell')}
              className={`flex-1 py-2 rounded-md font-medium transition ${
                mode === 'sell' ? 'bg-red-600 text-white' : 'text-gray-400'
              }`}
            >
              Sell
            </button>
          </div>
        </div>

        {/* Balances */}
        {isConnected && (
          <div className="px-4 pb-2 flex justify-between text-sm text-gray-400">
            <span>D-Bucks: ${balance.toFixed(2)}</span>
            <span>Holdings: {holdingAmount.toFixed(2)} shares</span>
          </div>
        )}

        {/* Amount Input */}
        <div className="px-4 pb-4">
          <label className="block text-sm text-gray-400 mb-2">Amount (Shares)</label>
          <input
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
            className="w-full bg-gray-700 rounded-lg px-4 py-3 text-xl font-mono focus:outline-none focus:ring-2 focus:ring-orange-500"
          />
          <p className="text-sm text-gray-400 mt-2">
            Current Price: ${player.price.toFixed(2)}/share
          </p>
        </div>

        {/* Quote */}
        {quote && (
          <div className="px-4 pb-4 space-y-2">
            <div className="bg-gray-700 rounded-lg p-4 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-gray-400">{mode === 'buy' ? 'Cost' : 'Revenue'}</span>
                <span>${quote.cost.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-400">Fee (1.5%)</span>
                <span>${quote.fee.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-400">Price Impact</span>
                <span className={slippage > 5 ? 'text-red-400' : ''}>{slippage.toFixed(2)}%</span>
              </div>
              <div className="border-t border-gray-600 pt-2 flex justify-between font-semibold">
                <span>{mode === 'buy' ? 'Total Cost' : 'You Receive'}</span>
                <span>${quote.total.toFixed(2)}</span>
              </div>
            </div>
          </div>
        )}

        {/* Action Button */}
        <div className="p-4 border-t border-gray-700">
          {isConnected ? (
            <button
              onClick={handleTrade}
              disabled={!quote || isPending || isSuccess}
              className={`w-full py-3 rounded-lg font-semibold transition ${
                mode === 'buy'
                  ? 'bg-green-600 hover:bg-green-700 disabled:bg-gray-600'
                  : 'bg-red-600 hover:bg-red-700 disabled:bg-gray-600'
              } disabled:cursor-not-allowed`}
            >
              {isPending
                ? 'Confirming...'
                : isSuccess
                ? 'Done!'
                : needsApproval
                ? 'Approve D-Bucks'
                : `${mode === 'buy' ? 'Buy' : 'Sell'} ${amount || '0'} Shares`}
            </button>
          ) : (
            <p className="text-center text-gray-400">Connect your wallet to trade</p>
          )}
        </div>
      </div>
    </div>
  );
}
