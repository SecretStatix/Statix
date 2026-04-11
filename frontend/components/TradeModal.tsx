'use client';

import { useState, useEffect, useRef } from 'react';
import { useAccount } from 'wagmi';
import { formatUnits } from 'viem';
import { X } from 'lucide-react';
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
} from '@/hooks/useContracts';
import { logTransaction } from '@/lib/api';

interface TradeModalProps {
  isOpen: boolean;
  onClose: () => void;
  player: PlayerData;
  initialMode?: 'buy' | 'sell';
}

export function TradeModal({ isOpen, onClose, player, initialMode = 'buy' }: TradeModalProps) {
  const { address, isConnected } = useAccount();
  const [mode, setMode] = useState<'buy' | 'sell'>(initialMode);
  const [amount, setAmount] = useState('');
  const shares = parseFloat(amount) || 0;

  const { data: buyQuoteData } = useBuyQuote(player.index, mode === 'buy' ? shares : 0);
  const { data: sellQuoteData } = useSellQuote(player.index, mode === 'sell' ? shares : 0);
  const { data: dbucksBalance } = useDBucksBalance(address);
  const { data: allowance } = useDBucksAllowance(address);
  const { data: myHoldings } = useHoldings(player.index, address);

  const { approve, isPending: approving, isConfirming: approvingConfirming, isSuccess: approved } = useApproveDBucks();
  const { buy, hash: buyHash, isPending: buying, isConfirming: buyingConfirming, isSuccess: bought } = useBuyShares();
  const { sell, hash: sellHash, isPending: selling, isConfirming: sellingConfirming, isSuccess: sold } = useSellShares();

  const tradeInfoRef = useRef<{ side: 'buy' | 'sell'; shares: number; total: number } | null>(null);

  useEffect(() => {
    if (!isOpen) {
      setAmount('');
      tradeInfoRef.current = null;
    } else {
      setMode(initialMode);
    }
  }, [isOpen, initialMode]);

  useEffect(() => {
    if (bought || sold) {
      const txHash = bought ? buyHash : sellHash;
      const info = tradeInfoRef.current;
      if (txHash && address && info) {
        logTransaction(address, player.index, info.side, info.shares, info.total, txHash).catch(console.error);
      }
      setTimeout(() => onClose(), 2000);
    }
  }, [bought, sold, buyHash, sellHash, address, player.index, onClose]);

  if (!isOpen) return null;

  // FIXME: under no scenario should there be a fallback towards frontend data, when blockchain doesn't respond.
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
    tradeInfoRef.current = { side: mode, shares, total: quote.total };

    if (mode === 'buy') {
      if (needsApproval) {
        approve(quote.total * 1.1);
      } else {
        buy(player.index, shares, quote.total * 1.05);
      }
    } else {
      sell(player.index, shares, quote.total * 0.95);
    }
  };

  const isPending = approving || approvingConfirming || buying || buyingConfirming || selling || sellingConfirming;
  const isSuccess = bought || sold;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-card border border-border rounded-2xl shadow-2xl shadow-black/40 max-w-md w-full" onClick={e => e.stopPropagation()}>
        <div className="p-5 border-b border-border flex items-center justify-between">
          <h2 className="font-semibold text-foreground">Trade {player.name}</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-secondary text-muted-foreground hover:text-foreground transition">
            <X className="w-5 h-5" />
          </button>
        </div>

        {isSuccess && (
          <div className="mx-5 mt-4 p-3 bg-success/10 border border-success/30 rounded-xl text-success text-sm font-medium text-center">
            Done! Your trade is complete.
          </div>
        )}

        <div className="p-5">
          <div className="flex bg-white/[0.04] rounded-xl p-1 gap-1">
            <button
              onClick={() => setMode('buy')}
              className={`flex-1 py-2.5 rounded-lg text-sm font-semibold transition ${
                mode === 'buy' ? 'bg-success/20 text-success shadow-sm border border-success/40' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Buy
            </button>
            <button
              onClick={() => setMode('sell')}
              className={`flex-1 py-2.5 rounded-lg text-sm font-semibold transition ${
                mode === 'sell' ? 'bg-destructive/20 text-destructive shadow-sm border border-destructive/40' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Sell
            </button>
          </div>
        </div>

        {isConnected && (
          <div className="px-5 pb-2 flex justify-between text-xs text-muted-foreground">
            <span>Balance: <span className="font-medium text-foreground">${balance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span></span>
            <span>You own: <span className="font-medium text-foreground">{holdingAmount.toFixed(2)} shares</span></span>
          </div>
        )}

        <div className="px-5 pb-4">
          <label className="block text-xs text-muted-foreground mb-1.5">Number of shares</label>
          <input
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0"
            className="w-full bg-secondary border border-border rounded-xl px-4 py-3 text-lg font-semibold text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-success/40 focus:border-success/50 transition [color-scheme:dark]"
          />
          <p className="text-xs text-muted-foreground mt-1.5">
            ${player.price.toFixed(2)} per share
          </p>
        </div>

        {quote && (
          <div className="px-5 pb-4">
            <div className="bg-secondary/50 rounded-xl p-4 space-y-2 border border-border">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">{mode === 'buy' ? 'Cost' : 'You receive'}</span>
                <span className="font-semibold text-foreground">${quote.total.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Fee (2%)</span>
                <span>${quote.fee.toFixed(2)}</span>
              </div>
              {slippage > 1 && (
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Price impact</span>
                  <span className={slippage > 5 ? 'text-destructive font-medium' : 'text-amber-500'}>{slippage.toFixed(2)}%</span>
                </div>
              )}
            </div>
          </div>
        )}

        <div className="p-5 pt-0">
          {isConnected ? (
            <button
              onClick={handleTrade}
              disabled={!quote || isPending || isSuccess}
              className={`w-full h-12 rounded-xl text-base font-semibold transition disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-card ${
                mode === 'buy'
                  ? 'bg-success text-white hover:bg-success/90 focus:ring-success'
                  : 'bg-destructive text-white hover:bg-destructive/90 focus:ring-destructive'
              }`}
            >
              {isPending
                ? 'Confirming...'
                : isSuccess
                ? 'Done!'
                : needsApproval
                ? 'Approve V-Bucks'
                : `${mode === 'buy' ? 'Buy' : 'Sell'} ${amount || '0'} shares`}
            </button>
          ) : (
            <p className="text-center text-sm text-muted-foreground py-2">Connect your wallet to trade</p>
          )}
        </div>
      </div>
    </div>
  );
}
