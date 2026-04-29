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

  const buyQ = useBuyQuote(player.index, mode === 'buy' ? shares : 0);
  const sellQ = useSellQuote(player.index, mode === 'sell' ? shares : 0);
  const quoteRaw = mode === 'buy' ? buyQ.data : sellQ.data;
  const quoteQueryPending = mode === 'buy' ? buyQ.isPending : sellQ.isPending;
  const quoteQueryError = mode === 'buy' ? buyQ.isError : sellQ.isError;
  const { data: dbucksBalance } = useDBucksBalance(address);
  const { data: allowance } = useDBucksAllowance(address);
  const { data: myHoldings } = useHoldings(player.index, address);

  const { approve, isPending: approving, isConfirming: approvingConfirming, isSuccess: approved, reset: resetApprove } = useApproveDBucks();
  const { buy, hash: buyHash, isPending: buying, isConfirming: buyingConfirming, isSuccess: bought, reset: resetBuy } = useBuyShares();
  const { sell, hash: sellHash, isPending: selling, isConfirming: sellingConfirming, isSuccess: sold, reset: resetSell } = useSellShares();

  const tradeInfoRef = useRef<{ side: 'buy' | 'sell'; shares: number; total: number } | null>(null);

  // Reset all write state when modal closes so reopening immediately works cleanly
  useEffect(() => {
    if (!isOpen) {
      setAmount('');
      tradeInfoRef.current = null;
      resetApprove();
      resetBuy();
      resetSell();
    } else {
      setMode(initialMode);
    }
  }, [isOpen, initialMode]);

  // After approval succeeds, automatically proceed to the buy tx
  useEffect(() => {
    if (approved && tradeInfoRef.current?.side === 'buy') {
      const { shares, total } = tradeInfoRef.current;
      buy(player.index, shares, total * 1.05);
    }
  }, [approved]);

  useEffect(() => {
    // Close modal after success
    if (bought || sold) {
      setTimeout(() => onClose(), 2000);
    }
  }, [bought, sold, buyHash, sellHash, address, player.index, onClose]);
  if (!isOpen) return null;

  let quote: { cost: number; fee: number; total: number; newPrice: number } | null = null;

  if (mode === 'buy' && quoteRaw && shares > 0) {
    const [cost, fee, total, newPrice] = quoteRaw as [bigint, bigint, bigint, bigint];
    quote = {
      cost: parseFloat(formatUnits(cost, 6)),
      fee: parseFloat(formatUnits(fee, 6)),
      total: parseFloat(formatUnits(total, 6)),
      newPrice: parseFloat(formatUnits(newPrice, 6)),
    };
  } else if (mode === 'sell' && quoteRaw && shares > 0) {
    const [revenue, fee, net, newPrice] = quoteRaw as [bigint, bigint, bigint, bigint];
    quote = {
      cost: parseFloat(formatUnits(revenue, 6)),
      fee: parseFloat(formatUnits(fee, 6)),
      total: parseFloat(formatUnits(net, 6)),
      newPrice: parseFloat(formatUnits(newPrice, 6)),
    };
  }

  const wantsQuote = shares > 0;
  const blockchainUnavailable =
    wantsQuote && !quoteQueryPending && (quoteQueryError || quote === null);

  const slippage = quote ? Math.abs((quote.newPrice - player.price) / player.price * 100) : 0;
  const balance = dbucksBalance ? parseFloat(formatUnits(dbucksBalance as bigint, 6)) : 0;
  const holdingAmount = myHoldings ? parseFloat(formatUnits(myHoldings as bigint, 6)) : 0;
  const needsApproval = mode === 'buy' && quote && allowance !== undefined &&
    (allowance as bigint) < BigInt(Math.ceil(quote.total * 1e6));

  /** Matches `useBuyShares` maxCost (`quote.total * 1.05`). */
  const buyMaxSpend = mode === 'buy' && quote ? quote.total * 1.05 : 0;
  const insufficientBuyFunds =
    mode === 'buy' && quote !== null && shares > 0 && balance + 1e-6 < buyMaxSpend;
  const insufficientSellShares =
    mode === 'sell' && quote !== null && shares > 0 && holdingAmount + 1e-8 < shares;

  const handleTrade = () => {
    if (!quote || !shares) return;
    if (insufficientBuyFunds || insufficientSellShares) return;
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
  const tradeBlocked = insufficientBuyFunds || insufficientSellShares || blockchainUnavailable;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center z-50 p-0 sm:p-4" onClick={onClose}>
      <div className="bg-card border border-border rounded-t-2xl sm:rounded-2xl shadow-2xl shadow-black/40 max-w-md w-full max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
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

        {wantsQuote && quoteQueryPending && (
          <div className="px-5 pb-4">
            <p className="rounded-xl border border-border bg-secondary/50 px-4 py-3 text-center text-sm text-muted-foreground">
              Loading quote from the network…
            </p>
          </div>
        )}

        {blockchainUnavailable && (
          <div className="px-5 pb-4">
            <p className="rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-center text-sm text-destructive">
              Blockchain unavailable — could not load a live quote. Check your connection and that your wallet is on Base
              Sepolia, then try again.
            </p>
          </div>
        )}

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
            <>
              {needsApproval && !isPending && !insufficientBuyFunds && (
                <p className="text-center text-xs text-muted-foreground mb-2">
                  First-time buy requires 2 confirmations — one to unlock play money, one to complete the trade.
                </p>
              )}
              <button
                onClick={handleTrade}
                disabled={!quote || isPending || isSuccess || tradeBlocked}
                className={`w-full h-12 rounded-xl text-base font-semibold transition disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-card ${
                  mode === 'buy'
                    ? 'bg-success text-white hover:bg-success/90 focus:ring-success'
                    : 'bg-destructive text-white hover:bg-destructive/90 focus:ring-destructive'
                }`}
              >
                {approving || approvingConfirming
                  ? 'Unlocking play money... (1/2)'
                  : buying || buyingConfirming
                  ? 'Buying... (2/2)'
                  : selling || sellingConfirming
                  ? 'Confirming...'
                  : isSuccess
                  ? 'Done!'
                  : blockchainUnavailable
                  ? 'Blockchain unavailable'
                  : insufficientBuyFunds
                  ? 'Insufficient play money'
                  : insufficientSellShares
                  ? 'Insufficient shares'
                  : needsApproval
                  ? 'Approve & Buy'
                  : `${mode === 'buy' ? 'Buy' : 'Sell'} ${amount || '0'} shares`}
              </button>
            </>
          ) : (
            <p className="text-center text-sm text-muted-foreground py-2">Connect your wallet to trade</p>
          )}
        </div>
      </div>
    </div>
  );
}
