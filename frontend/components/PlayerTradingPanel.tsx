'use client';

import { useState, useRef, useEffect } from 'react';
import { useAccount } from 'wagmi';
import { formatUnits } from 'viem';
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
import { PREVIEW, PREVIEW_BALANCE, getPreviewHolding } from '@/lib/preview';

interface PlayerTradingPanelProps {
  playerIndex: number;
  playerId: string;
  playerName: string;
  price: number;
}

export function PlayerTradingPanel({ playerIndex, playerId, playerName, price }: PlayerTradingPanelProps) {
  const { address, isConnected } = useAccount();
  const [mode, setMode] = useState<'buy' | 'sell'>('buy');
  const [amount, setAmount] = useState('');
  const shares = parseFloat(amount) || 0;

  const { data: buyQuoteData } = useBuyQuote(playerIndex, mode === 'buy' ? shares : 0);
  const { data: sellQuoteData } = useSellQuote(playerIndex, mode === 'sell' ? shares : 0);
  const { data: dbucksBalance } = useDBucksBalance(address);
  const { data: allowance } = useDBucksAllowance(address);
  const { data: myHoldings } = useHoldings(playerIndex, address);

  const { approve, isPending: approving, isConfirming: approvingConfirming, isSuccess: approved } = useApproveDBucks();
  const { buy, hash: buyHash, isPending: buying, isConfirming: buyingConfirming, isSuccess: bought } = useBuyShares();
  const { sell, hash: sellHash, isPending: selling, isConfirming: sellingConfirming, isSuccess: sold } = useSellShares();

  const tradeInfoRef = useRef<{ side: 'buy' | 'sell'; shares: number; total: number } | null>(null);

  useEffect(() => {
    if (bought || sold) {
      const txHash = bought ? buyHash : sellHash;
      const info = tradeInfoRef.current;
      if (txHash && address && info) {
        logTransaction(address, playerIndex, info.side, info.shares, info.total, txHash, playerName).catch(console.error);
      }
    }
  }, [bought, sold, buyHash, sellHash, address, playerIndex]);

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
    const virtualCash = price * virtualShares;
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

  const slippage = quote ? Math.abs((quote.newPrice - price) / price * 100) : 0;
  const balance = PREVIEW ? PREVIEW_BALANCE : (dbucksBalance ? parseFloat(formatUnits(dbucksBalance as bigint, 6)) : 0);
  const holdingAmount = PREVIEW ? getPreviewHolding(playerIndex) : (myHoldings ? parseFloat(formatUnits(myHoldings as bigint, 6)) : 0);
  const needsApproval = mode === 'buy' && quote && allowance !== undefined &&
    (allowance as bigint) < BigInt(Math.ceil(quote.total * 1e6));

  const handleTrade = () => {
    if (!quote || !shares) return;
    tradeInfoRef.current = { side: mode, shares, total: quote.total };

    if (mode === 'buy') {
      if (needsApproval) {
        approve(quote.total * 1.1);
      } else {
        buy(playerIndex, shares, quote.total * 1.05);
      }
    } else {
      sell(playerIndex, shares, quote.total * 0.95);
    }
  };

  const isPending = approving || approvingConfirming || buying || buyingConfirming || selling || sellingConfirming;
  const isSuccess = bought || sold;

  return (
    <div className="flex h-full flex-col rounded-[1.35rem] border border-white/[0.09] bg-[linear-gradient(180deg,rgba(255,255,255,0.04),rgba(255,255,255,0.015))] p-6 shadow-[0_14px_34px_rgba(0,0,0,0.3)] backdrop-blur-sm">
      <h3 className="text-lg font-semibold text-foreground mb-4">Trade</h3>

      {isSuccess && (
        <div className="mb-4 p-3 bg-success/10 rounded-xl text-success text-sm font-medium text-center">
          Trade complete
        </div>
      )}

      <div className="mb-4 flex gap-1 rounded-full border border-white/[0.1] bg-black/20 p-1">
        <button
          onClick={() => setMode('buy')}
          className={`flex-1 rounded-full py-2.5 text-sm font-semibold transition-all duration-200 ${
            mode === 'buy' ? 'border border-success/40 bg-success/20 text-success' : 'text-gray-400 hover:text-foreground'
          }`}
        >
          Buy
        </button>
        <button
          onClick={() => setMode('sell')}
          className={`flex-1 rounded-full py-2.5 text-sm font-semibold transition-all duration-200 ${
            mode === 'sell' ? 'border border-destructive/40 bg-destructive/20 text-destructive' : 'text-gray-400 hover:text-foreground'
          }`}
        >
          Sell
        </button>
      </div>

      {(isConnected || PREVIEW) && (
        <div className="flex justify-between text-xs text-gray-400 mb-3">
          <span>Balance: <span className="font-medium text-foreground">${balance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span></span>
          <span>Owned: <span className="font-medium text-foreground">{holdingAmount.toFixed(2)}</span></span>
        </div>
      )}

      <div className="mb-4">
        <input
          type="number"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="0"
          className="h-12 w-full rounded-2xl border border-white/[0.12] bg-black/20 px-4 text-base font-semibold text-foreground placeholder-muted-foreground transition-all duration-200 focus:border-success/50 focus:outline-none focus:ring-2 focus:ring-success/40 [color-scheme:dark]"
        />
        <p className="text-xs text-gray-400 mt-1.5">${price.toFixed(2)} per share</p>
      </div>

      {quote && (
        <div className="mb-4 space-y-2 rounded-2xl border border-white/[0.1] bg-white/[0.03] p-4">
          <div className="flex justify-between text-sm">
            <span className="text-gray-400">{mode === 'buy' ? 'Cost' : 'You receive'}</span>
            <span className="font-semibold text-foreground">${quote.total.toFixed(2)}</span>
          </div>
          {slippage > 1 && (
            <div className="flex justify-between text-xs text-gray-400">
              <span>Impact</span>
              <span className={slippage > 5 ? 'text-destructive' : ''}>{slippage.toFixed(2)}%</span>
            </div>
          )}
        </div>
      )}

      {(isConnected || PREVIEW) ? (
        <button
          onClick={PREVIEW ? undefined : handleTrade}
          disabled={!quote || isPending || isSuccess || PREVIEW}
          className={`w-full h-12 rounded-xl text-base font-semibold transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-card mt-auto ${
            mode === 'buy'
              ? 'bg-success text-white hover:bg-success/90 focus:ring-success'
              : 'bg-destructive text-white hover:bg-destructive/90 focus:ring-destructive'
          }`}
        >
          {PREVIEW ? `${mode === 'buy' ? 'Buy' : 'Sell'} ${amount || '0'}` : isPending ? 'Confirming...' : isSuccess ? 'Done' : needsApproval ? 'Approve' : `${mode === 'buy' ? 'Buy' : 'Sell'} ${amount || '0'}`}
        </button>
      ) : (
        <p className="text-center text-sm text-gray-400 py-4">Connect wallet to trade</p>
      )}
    </div>
  );
}
