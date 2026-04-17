"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { LPMetricsRow } from "@/lib/h2h-api";

const LS_KEY = "h2h_admin_key";

async function fetchLPMetrics(adminKey: string): Promise<LPMetricsRow[]> {
  const res = await fetch("/api/h2h/admin/lp-metrics", {
    headers: { "X-Admin-Key": adminKey },
  });
  if (res.status === 401) throw new Error("Unauthorized");
  if (!res.ok) throw new Error(`Failed: ${res.status}`);
  return res.json();
}

export default function H2HAdminLPPage() {
  const [adminKey, setAdminKey] = useState<string>("");
  const [rows, setRows] = useState<LPMetricsRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const saved = typeof window !== "undefined" ? localStorage.getItem(LS_KEY) : null;
    if (saved) setAdminKey(saved);
  }, []);

  const load = useCallback(async () => {
    if (!adminKey) return;
    setLoading(true);
    setError(null);
    try {
      const data = await fetchLPMetrics(adminKey);
      setRows(data);
      localStorage.setItem(LS_KEY, adminKey);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Fetch failed");
    } finally {
      setLoading(false);
    }
  }, [adminKey]);

  useEffect(() => {
    if (adminKey) load();
  }, [adminKey, load]);

  const totals = useMemo(() => {
    let seed = 0;
    let fees = 0;
    let pnl = 0;
    let volume = 0;
    rows.forEach((r) => {
      seed += r.seed_collateral ?? 0;
      fees += r.fees_collected ?? 0;
      pnl += r.lp_pnl ?? 0;
      volume += r.total_volume ?? 0;
    });
    return { seed, fees, pnl, volume };
  }, [rows]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">H2H LP Metrics</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Protocol LP P&amp;L per market. For internal monitoring before opening LPing.
        </p>
      </div>

      <div className="flex items-center gap-2">
        <input
          type="password"
          placeholder="Admin key"
          value={adminKey}
          onChange={(e) => setAdminKey(e.target.value)}
          className="w-64 rounded-md border border-border bg-background px-3 py-2 text-sm"
        />
        <button
          onClick={load}
          disabled={!adminKey || loading}
          className="h-9 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-50"
        >
          {loading ? "Loading…" : "Refresh"}
        </button>
        {error && <span className="text-xs text-destructive">{error}</span>}
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Kpi label="Markets" value={String(rows.length)} />
        <Kpi label="Seed" value={`$${totals.seed.toFixed(0)}`} />
        <Kpi label="Fees" value={`$${totals.fees.toFixed(2)}`} />
        <Kpi
          label="LP P&L"
          value={`$${totals.pnl.toFixed(2)}`}
          tone={totals.pnl >= 0 ? "pos" : "neg"}
        />
      </div>

      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-secondary/50 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left">Market</th>
                <th className="px-3 py-2 text-left">Status</th>
                <th className="px-3 py-2 text-right">Seed</th>
                <th className="px-3 py-2 text-right">Volume</th>
                <th className="px-3 py-2 text-right">Fees</th>
                <th className="px-3 py-2 text-right">LP P&amp;L</th>
                <th className="px-3 py-2 text-right">Return %</th>
                <th className="px-3 py-2 text-right">Eff. Fee %</th>
                <th className="px-3 py-2 text-right">Skew</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && !loading && (
                <tr>
                  <td colSpan={9} className="px-3 py-8 text-center text-xs text-muted-foreground">
                    {adminKey ? "No metrics yet." : "Enter admin key to load."}
                  </td>
                </tr>
              )}
              {rows.map((r) => (
                <tr key={r.market_id} className="border-t border-border">
                  <td className="px-3 py-2">
                    <div className="font-medium text-foreground">
                      {r.player_a_name} vs {r.player_b_name}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      #{r.market_id} · {new Date(r.tip_off_at).toLocaleDateString()}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-xs capitalize">{r.status}</td>
                  <td className="px-3 py-2 text-right font-mono text-xs">
                    ${(r.seed_collateral ?? 0).toFixed(0)}
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-xs">
                    ${(r.total_volume ?? 0).toFixed(0)}
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-xs">
                    ${(r.fees_collected ?? 0).toFixed(2)}
                  </td>
                  <td
                    className={`px-3 py-2 text-right font-mono text-xs ${(r.lp_pnl ?? 0) >= 0 ? "text-success" : "text-destructive"}`}
                  >
                    ${(r.lp_pnl ?? 0).toFixed(2)}
                  </td>
                  <td
                    className={`px-3 py-2 text-right font-mono text-xs ${(r.lp_return_pct ?? 0) >= 0 ? "text-success" : "text-destructive"}`}
                  >
                    {r.lp_return_pct != null ? `${r.lp_return_pct.toFixed(2)}%` : "—"}
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-xs">
                    {r.effective_fee_rate != null ? `${r.effective_fee_rate.toFixed(2)}%` : "—"}
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-xs">
                    {r.final_pool_skew != null ? r.final_pool_skew.toFixed(2) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function Kpi({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "pos" | "neg";
}) {
  const color =
    tone === "pos" ? "text-success" : tone === "neg" ? "text-destructive" : "text-foreground";
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={`mt-1 text-lg font-semibold ${color}`}>{value}</div>
    </div>
  );
}
