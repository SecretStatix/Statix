"use client";

import { useMemo, useState } from "react";
import { formatUnits } from "viem";
import { useAccount } from "wagmi";
import type { MarketDetail } from "@/lib/h2h-api";
import { useDBucksBalance } from "@/hooks/useContracts";
import {
  useCalcBuyAmount,
  useCalcSellAmount,
  useCollateralAllowance,
  useApproveCollateral,
  useCTFApprovalForFPMM,
  useH2HBuy,
  useH2HSell,
  useFPMMState,
  useOutcomeBalance,
  H2H_COLLATERAL_DECIMALS,
} from "@/hooks/h2h/useH2HTrade";

interface Props {
  market: MarketDetail;
  side: "A" | "B";
  isOpen: boolean;
  onClose: () => void;
}

type Mode = "buy" | "sell";

const SLIPPAGE_BPS = 200; // 2% slippage cap

function applyMinSlippage(amount: number) {
  return (amount * (10_000 - SLIPPAGE_BPS)) / 10_000;
}

function fromUnits(v: bigint | undefined | null): number {
  if (v == null) return 0;
  return Number(formatUnits(v, H2H_COLLATERAL_DECIMALS));
}

export function H2HTradeModal({ market, side, isOpen, onClose }: Props) {
  const { address } = useAccount();
  const fpmm = (market.fpmm_address || "") as `0x${string}` | "";
  const playerName = side === "A" ? market.player_a.name : market.player_b.name;

  const [mode, setMode] = useState<Mode>("buy");
  const [amount, setAmount] = useState<string>("10");

  const amountNum = Number(amount) || 0;
  const state = useFPMMState(fpmm);
  const { data: dbucksBal } = useDBucksBalance(address);
  const { data: allowance } = useCollateralAllowance(fpmm);
  const { data: outcomeBal } = useOutcomeBalance(fpmm, side);

  const buyQuote = useCalcBuyAmount(fpmm, mode === "buy" ? amountNum : 0, side);
  const sellQuote = useCalcSellAmount(fpmm, mode === "sell" ? amountNum : 0, side);

  const approve = useApproveCollateral(fpmm);
  const ctfApproval = useCTFApprovalForFPMM(fpmm);
  const buyer = useH2HBuy(fpmm);
  const seller = useH2HSell(fpmm);

  const quoteTokens = mode === "buy" ? fromUnits(buyQuote.data as bigint | undefined) : 0;
  const quoteOut = mode === "sell" ? fromUnits(sellQuote.data as bigint | undefined) : 0;

  const needsCollateralApproval =
    mode === "buy" &&
    amountNum > 0 &&
    (allowance == null || (allowance as bigint) < BigInt(Math.ceil(amountNum * 10 ** H2H_COLLATERAL_DECIMALS)));

  const needsCTFApproval = mode === "sell" && !ctfApproval.isApproved;

  const outcomeBalHuman = fromUnits(outcomeBal as bigint | undefined);
  const dbucksBalHuman = fromUnits(dbucksBal as bigint | undefined);

  const insufficientBalance =
    (mode === "buy" && amountNum > dbucksBalHuman) ||
    (mode === "sell" && amountNum > outcomeBalHuman);

  const busy =
    approve.isPending ||
    approve.isConfirming ||
    ctfApproval.isPending ||
    ctfApproval.isConfirming ||
    buyer.isPending ||
    buyer.isConfirming ||
    seller.isPending ||
    seller.isConfirming;

  const priceText = useMemo(() => {
    if (state.priceA == null) return "—";
    const p = side === "A" ? state.priceA : 1 - state.priceA;
    return `${(p * 100).toFixed(1)}¢ / $1`;
  }, [state.priceA, side]);

  const actionLabel = () => {
    if (needsCollateralApproval) return approve.isPending ? "Approving…" : "Approve DBucks";
    if (needsCTFApproval) return ctfApproval.isPending ? "Approving…" : "Approve CTF";
    if (mode === "buy") return buyer.isPending ? "Buying…" : `Buy ${playerName}`;
    return seller.isPending ? "Selling…" : `Sell ${playerName}`;
  };

  const onSubmit = () => {
    if (!fpmm || amountNum <= 0 || busy) return;
    if (needsCollateralApproval) {
      approve.approve();
      return;
    }
    if (needsCTFApproval) {
      ctfApproval.approveAll();
      return;
    }
    if (mode === "buy") {
      const minTokens = applyMinSlippage(quoteTokens);
      buyer.buy(side, amountNum, minTokens);
    } else {
      const minOut = applyMinSlippage(quoteOut);
      seller.sell(side, amountNum, minOut);
    }
  };

  if (!isOpen) return null;

  const disabled =
    !fpmm ||
    fpmm.length !== 42 ||
    amountNum <= 0 ||
    busy ||
    (mode === "buy" && !needsCollateralApproval && insufficientBalance) ||
    (mode === "sell" && !needsCTFApproval && insufficientBalance);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-xl border border-border bg-card p-6">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">
              {mode === "buy" ? "Buy" : "Sell"} {playerName}
            </h2>
            <div className="text-xs text-muted-foreground">Current price: {priceText}</div>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            ×
          </button>
        </div>

        <div className="mb-4 grid grid-cols-2 gap-2 rounded-md bg-secondary p-1 text-sm">
          <button
            onClick={() => setMode("buy")}
            className={`h-8 rounded ${mode === "buy" ? "bg-background font-semibold" : "text-muted-foreground"}`}
          >
            Buy
          </button>
          <button
            onClick={() => setMode("sell")}
            className={`h-8 rounded ${mode === "sell" ? "bg-background font-semibold" : "text-muted-foreground"}`}
          >
            Sell
          </button>
        </div>

        <label className="mb-3 block text-xs uppercase tracking-wide text-muted-foreground">
          {mode === "buy" ? "DBucks to spend" : "Outcome tokens to sell"}
        </label>
        <input
          type="number"
          min="0"
          step="0.01"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="mb-3 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground"
        />

        <div className="mb-4 space-y-1 text-xs text-muted-foreground">
          {mode === "buy" ? (
            <>
              <div>
                Balance: <span className="text-foreground">{dbucksBalHuman.toFixed(2)} DBucks</span>
              </div>
              <div>
                You receive ≈{" "}
                <span className="text-foreground">{quoteTokens.toFixed(4)} {playerName} shares</span>
              </div>
              <div>Min (2% slippage): {applyMinSlippage(quoteTokens).toFixed(4)}</div>
            </>
          ) : (
            <>
              <div>
                Holdings: <span className="text-foreground">{outcomeBalHuman.toFixed(4)} shares</span>
              </div>
              <div>
                You receive ≈ <span className="text-foreground">{quoteOut.toFixed(4)} DBucks</span>
              </div>
              <div>Min (2% slippage): {applyMinSlippage(quoteOut).toFixed(4)}</div>
            </>
          )}
          {insufficientBalance && (
            <div className="text-destructive">Insufficient {mode === "buy" ? "DBucks" : "shares"}.</div>
          )}
        </div>

        <button
          onClick={onSubmit}
          disabled={disabled}
          className="h-11 w-full rounded-md bg-primary text-sm font-semibold text-primary-foreground disabled:opacity-50"
        >
          {actionLabel()}
        </button>

        {(buyer.isSuccess || seller.isSuccess || approve.isSuccess || ctfApproval.isSuccess) && (
          <div className="mt-3 text-center text-xs text-success">Confirmed ✓</div>
        )}
      </div>
    </div>
  );
}
