'use client';

import { useState } from 'react';
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

interface PlayerTradingPanelProps {
  playerIndex: number;
  price: number;
}

export function PlayerTradingPanel({ playerIndex, price }: PlayerTradingPanelProps) {
  const { address, isConnected } = useAccount();
  const [mode, setMode] = useState<'buy' | 'sell'>('buy');
  const [amount, setAmount] = useState('');
  const shares = parseFloat(amount) || 0;

  const buyQ = useBuyQuote(playerIndex, mode === 'buy' ? shares : 0);
  const sellQ = useSellQuote(playerIndex, mode === 'sell' ? shares : 0);
  const quoteRaw = mode === 'buy' ? buyQ.data : sellQ.data;
  const quoteQueryPending = mode === 'buy' ? buyQ.isPending : sellQ.isPending;
  const quoteQueryError = mode === 'buy' ? buyQ.isError : sellQ.isError;
  const { data: dbucksBalance } = useDBucksBalance(address);
  const { data: allowance } = useDBucksAllowance(address);
  const { data: myHoldings } = useHoldings(playerIndex, address);

  const { approve, isPending: approving, isConfirming: approvingConfirming, isSuccess: approved } = useApproveDBucks();
  const { buy, hash: buyHash, isPending: buying, isConfirming: buyingConfirming, isSuccess: bought } = useBuyShares();
  const { sell, hash: sellHash, isPending: selling, isConfirming: sellingConfirming, isSuccess: sold } = useSellShares();

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

  const slippage = quote ? Math.abs((quote.newPrice - price) / price * 100) : 0;
  const balance = dbucksBalance ? parseFloat(formatUnits(dbucksBalance as bigint, 6)) : 0;
  const holdingAmount = myHoldings ? parseFloat(formatUnits(myHoldings as bigint, 6)) : 0;
  const needsApproval = mode === 'buy' && quote && allowance !== undefined &&
    (allowance as bigint) < BigInt(Math.ceil(quote.total * 1e6));

  /** Matches `useBuyShares` maxCost (`quote.total * 1.05`) — need enough V-Bucks for worst-case debit. */
  const buyMaxSpend = mode === 'buy' && quote ? quote.total * 1.05 : 0;
  const insufficientBuyFunds =
    mode === 'buy' && quote !== null && shares > 0 && balance + 1e-6 < buyMaxSpend;
  const insufficientSellShares =
    mode === 'sell' && quote !== null && shares > 0 && holdingAmount + 1e-8 < shares;

  const handleTrade = () => {
    if (!quote || !shares) return;
    if (insufficientBuyFunds || insufficientSellShares) return;

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
  const tradeBlocked = insufficientBuyFunds || insufficientSellShares || blockchainUnavailable;

  return (
    <div className="flex flex-col rounded-2xl border border-white/[0.05] bg-white/[0.015] p-5 backdrop-blur-sm">
      <h3 className="text-sm font-semibold text-foreground mb-4 tracking-tight">Trade</h3>

      {isSuccess && (
        <div className="mb-4 p-3 bg-success/[0.08] rounded-xl text-success text-sm font-medium text-center">
          Trade complete
        </div>
      )}

      <div className="mb-4 flex gap-0.5 rounded-xl bg-white/[0.03] p-0.5">
        <button
          onClick={() => setMode('buy')}
          className={`flex-1 rounded-[10px] py-2.5 text-sm font-semibold transition-all duration-200 ${
            mode === 'buy' ? 'bg-success/15 text-success' : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          Buy
        </button>
        <button
          onClick={() => setMode('sell')}
          className={`flex-1 rounded-[10px] py-2.5 text-sm font-semibold transition-all duration-200 ${
            mode === 'sell' ? 'bg-destructive/15 text-destructive' : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          Sell
        </button>
      </div>

      {isConnected && (
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
          className="h-12 w-full rounded-xl border border-white/[0.06] bg-white/[0.03] px-4 text-base font-semibold text-foreground placeholder-muted-foreground/40 transition-all duration-200 focus:border-primary/30 focus:outline-none focus:ring-1 focus:ring-primary/20 [color-scheme:dark]"
        />
        <p className="text-xs text-gray-400 mt-1.5">${price.toFixed(2)} per share</p>
      </div>

      {wantsQuote && quoteQueryPending && (
        <p className="mb-4 rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-3 text-center text-sm text-gray-400">
          Loading quote from the network…
        </p>
      )}

      {blockchainUnavailable && (
        <p className="mb-4 rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-center text-sm text-destructive">
          Blockchain unavailable — could not load a live quote. Check your connection and that your wallet is on Base
          Sepolia, then try again.
        </p>
      )}

      {quote && (
        <div className="mb-4 space-y-2 rounded-xl border border-white/[0.04] bg-white/[0.02] p-4">
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

      {isConnected ? (
        <button
          onClick={handleTrade}
          disabled={!quote || isPending || isSuccess || tradeBlocked}
          className={`w-full h-11 rounded-xl text-sm font-semibold transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed focus:outline-none mt-auto ${
            mode === 'buy'
              ? 'bg-success text-white hover:bg-success/90'
              : 'bg-destructive text-white hover:bg-destructive/90'
          }`}
        >
          {isPending
            ? 'Confirming...'
            : isSuccess
              ? 'Done'
              : blockchainUnavailable
                ? 'Blockchain unavailable'
                : insufficientBuyFunds
                  ? 'Insufficient V-Bucks'
                  : insufficientSellShares
                    ? 'Insufficient shares'
                    : needsApproval
                      ? 'Approve'
                      : `${mode === 'buy' ? 'Buy' : 'Sell'} ${amount || '0'}`}
        </button>
      ) : (
        <p className="text-center text-sm text-gray-400 py-4">Connect wallet to trade</p>
      )}
    </div>
  );
}
