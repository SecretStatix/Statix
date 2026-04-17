"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useAccount } from "wagmi";
import {
  getMarket,
  getUserPositions,
  listMarkets,
  type MarketDetail,
  type MarketSummary,
  type UserPosition,
} from "@/lib/h2h-api";
import { useH2HRedeem } from "@/hooks/h2h/useH2HTrade";

interface Row {
  position: UserPosition;
  market?: MarketSummary;
  conditionId?: `0x${string}`;
}

function RedeemButton({ conditionId }: { conditionId: `0x${string}` | "" | undefined }) {
  const { redeem, isPending, isConfirming, isSuccess } = useH2HRedeem(conditionId ?? "");
  return (
    <button
      onClick={redeem}
      disabled={isPending || isConfirming || !conditionId}
      className="h-8 rounded-md bg-success px-3 text-xs font-semibold text-white disabled:opacity-50"
    >
      {isSuccess ? "Redeemed ✓" : isPending || isConfirming ? "Redeeming…" : "Redeem"}
    </button>
  );
}

export default function H2HPortfolioPage() {
  const { address } = useAccount();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!address) {
      setRows([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const [positions, openMarkets, resolvedMarkets] = await Promise.all([
          getUserPositions(address),
          listMarkets("open").catch(() => [] as MarketSummary[]),
          listMarkets("resolved").catch(() => [] as MarketSummary[]),
        ]);
        if (cancelled) return;
        const byId = new Map<number, MarketSummary>();
        [...openMarkets, ...resolvedMarkets].forEach((m) => byId.set(m.id, m));

        const base: Row[] = positions.map((p) => ({
          position: p,
          market: byId.get(p.market_id),
        }));

        // Fetch conditionId for redeemable rows so the Redeem button can fire.
        const redeemable = base.filter((r) => r.position.redeemable);
        const details = await Promise.all(
          redeemable.map((r) =>
            getMarket(r.position.market_id).catch(() => null as MarketDetail | null),
          ),
        );
        const condById = new Map<number, `0x${string}`>();
        details.forEach((d) => {
          if (d && d.condition_id) condById.set(d.id, d.condition_id as `0x${string}`);
        });

        if (cancelled) return;
        setRows(
          base.map((r) =>
            r.position.redeemable
              ? { ...r, conditionId: condById.get(r.position.market_id) }
              : r,
          ),
        );
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [address]);

  const { open, settled } = useMemo(() => {
    const openRows: Row[] = [];
    const settledRows: Row[] = [];
    rows.forEach((r) => {
      if (r.market?.status === "open") openRows.push(r);
      else settledRows.push(r);
    });
    return { open: openRows, settled: settledRows };
  }, [rows]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Your H2H Positions</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Open bets, redeemable winnings, and settled history.
        </p>
      </div>

      {!address ? (
        <div className="rounded-xl border border-border bg-card py-16 text-center text-sm text-muted-foreground">
          Connect your wallet to see positions.
        </div>
      ) : loading ? (
        <div className="h-40 animate-pulse rounded-xl border border-border bg-card" />
      ) : rows.length === 0 ? (
        <div className="rounded-xl border border-border bg-card py-16 text-center text-sm text-muted-foreground">
          No H2H positions yet.{" "}
          <Link href="/h2h" className="text-primary underline">
            Browse markets
          </Link>
          .
        </div>
      ) : (
        <>
          {open.length > 0 && <Section title="Open" rows={open} />}
          {settled.length > 0 && <Section title="Settled" rows={settled} />}
        </>
      )}
    </div>
  );
}

function Section({ title, rows }: { title: string; rows: Row[] }) {
  return (
    <div>
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </h2>
      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <table className="w-full text-sm">
          <thead className="bg-secondary/50 text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-4 py-2 text-left">Market</th>
              <th className="px-4 py-2 text-right">Side A</th>
              <th className="px-4 py-2 text-right">Side B</th>
              <th className="px-4 py-2 text-right">Status</th>
              <th className="px-4 py-2 text-right" />
            </tr>
          </thead>
          <tbody>
            {rows.map(({ position, market, conditionId }) => {
              const resolved = market?.status === "resolved" || market?.status === "voided";
              return (
                <tr key={position.market_id} className="border-t border-border">
                  <td className="px-4 py-3">
                    <Link
                      href={`/h2h/${position.market_id}`}
                      className="font-medium text-foreground hover:text-primary"
                    >
                      {market
                        ? `${market.player_a.name} vs ${market.player_b.name}`
                        : `Market #${position.market_id}`}
                    </Link>
                    {market && (
                      <div className="text-xs text-muted-foreground">
                        {market.player_a.team} vs {market.player_b.team}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-xs">
                    {position.shares_a > 0 ? (
                      <>
                        {position.shares_a.toFixed(2)}
                        {position.avg_price_a != null && (
                          <div className="text-[10px] text-muted-foreground">
                            @ {position.avg_price_a.toFixed(3)}
                          </div>
                        )}
                      </>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-xs">
                    {position.shares_b > 0 ? (
                      <>
                        {position.shares_b.toFixed(2)}
                        {position.avg_price_b != null && (
                          <div className="text-[10px] text-muted-foreground">
                            @ {position.avg_price_b.toFixed(3)}
                          </div>
                        )}
                      </>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right text-xs">
                    {!market ? (
                      <span className="text-muted-foreground">—</span>
                    ) : market.status === "open" ? (
                      <span className="text-primary">Open</span>
                    ) : market.status === "voided" ? (
                      <span className="text-yellow-400">Voided</span>
                    ) : market.winner === "A" ? (
                      <span className="text-success">{market.player_a.name} won</span>
                    ) : market.winner === "B" ? (
                      <span className="text-success">{market.player_b.name} won</span>
                    ) : (
                      <span className="text-muted-foreground">Tie</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {resolved && position.redeemable && (
                      <RedeemButton conditionId={conditionId} />
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
