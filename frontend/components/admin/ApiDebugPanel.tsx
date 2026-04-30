'use client';

import { useCallback, useMemo, useState } from 'react';
import { Loader2, Play, Terminal } from 'lucide-react';
import { useAuth } from '@/lib/AuthContext';
import deploymentsFallback from '@/deployments.json';

const NULL_WALLET = '0x0000000000000000000000000000000000000001';
const MAX_JSON_CHARS = 200_000;

type ProbeVia = 'public' | 'admin-proxy';

type ApiProbe = {
  id: string;
  label: string;
  method: 'GET' | 'POST';
  /** Same-origin path (includes query) or admin path for proxy */
  path: string;
  body?: unknown;
  via: ProbeVia;
  /** May hit NBA API or write snapshots — use sparingly */
  heavy?: boolean;
};

type RowState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'done'; http: number; ms: number; body: unknown }
  | { status: 'error'; http?: number; ms?: number; message: string };

function stringifyBody(data: unknown): string {
  try {
    const s = JSON.stringify(data, null, 2);
    if (s.length > MAX_JSON_CHARS) {
      return `${s.slice(0, MAX_JSON_CHARS)}\n\n… (truncated, ${s.length} chars total)`;
    }
    return s;
  } catch {
    return String(data);
  }
}

async function parseJsonResponse(res: Response): Promise<unknown> {
  const text = await res.text();
  try {
    return JSON.parse(text) as unknown;
  } catch {
    const slice = text.length > 12_000 ? `${text.slice(0, 12_000)}…` : text;
    return { _nonJsonBody: slice };
  }
}

function buildProbes(samplePlayerId: string): ApiProbe[] {
  return [
    { id: 'health', label: 'Backend liveness', method: 'GET', path: '/statix-backend/health', via: 'public' },
    { id: 'health-db', label: 'Backend + DB tables', method: 'GET', path: '/statix-backend/health/db', via: 'public' },
    { id: 'players', label: 'Player list', method: 'GET', path: '/api/players/', via: 'public' },
    { id: 'games-today', label: 'Games today', method: 'GET', path: '/api/players/games-today', via: 'public' },
    {
      id: 'upcoming',
      label: 'Upcoming games (24h)',
      method: 'GET',
      path: '/api/players/upcoming-games?hours=24',
      via: 'public',
    },
    {
      id: 'player',
      label: `Player detail (${samplePlayerId})`,
      method: 'GET',
      path: `/api/players/${encodeURIComponent(samplePlayerId)}`,
      via: 'public',
    },
    {
      id: 'player-games',
      label: `Player game log`,
      method: 'GET',
      path: `/api/players/${encodeURIComponent(samplePlayerId)}/games`,
      via: 'public',
    },
    {
      id: 'price-history',
      label: 'Price history (7d)',
      method: 'GET',
      path: `/api/players/${encodeURIComponent(samplePlayerId)}/price-history?days=7`,
      via: 'public',
    },
    { id: 'contracts', label: 'Trading contracts', method: 'GET', path: '/api/trading/contracts', via: 'public' },
    {
      id: 'quote',
      label: 'Quote (buy 0.01 sh, idx 0)',
      method: 'POST',
      path: '/api/trading/quote',
      body: { player_index: 0, side: 'buy', shares: 0.01 },
      via: 'public',
    },
    {
      id: 'tx-player',
      label: 'Transactions (player 0)',
      method: 'GET',
      path: '/api/trading/transactions?player_index=0&limit=5',
      via: 'public',
    },
    {
      id: 'tx-recent',
      label: 'Recent transactions',
      method: 'GET',
      path: '/api/trading/transactions/recent?limit=5',
      via: 'public',
    },
    {
      id: 'tx-history',
      label: 'Wallet history (null wallet)',
      method: 'GET',
      path: `/api/trading/history/${NULL_WALLET}?limit=3`,
      via: 'public',
    },
    {
      id: 'tx-summary',
      label: 'Wallet summary (null wallet)',
      method: 'GET',
      path: `/api/trading/summary/${NULL_WALLET}`,
      via: 'public',
    },
    {
      id: 'portfolio-snaps',
      label: 'Portfolio snapshots (null wallet)',
      method: 'GET',
      path: `/api/trading/portfolio-snapshots?wallet=${NULL_WALLET}&days=7`,
      via: 'public',
    },
    { id: 'div-config', label: 'Dividends config', method: 'GET', path: '/api/dividends/config', via: 'public' },
    { id: 'div-rounds', label: 'Dividends rounds', method: 'GET', path: '/api/dividends/rounds', via: 'public' },
    {
      id: 'div-round-1',
      label: 'Dividends round #1',
      method: 'GET',
      path: '/api/dividends/rounds/1',
      via: 'public',
    },
    {
      id: 'div-top',
      label: 'Top performers',
      method: 'GET',
      path: '/api/dividends/top-performers',
      via: 'public',
    },
    {
      id: 'div-board',
      label: 'Leaderboard',
      method: 'GET',
      path: '/api/dividends/leaderboard',
      via: 'public',
    },
    {
      id: 'div-user',
      label: 'Dividends user (null wallet)',
      method: 'GET',
      path: `/api/dividends/user/${NULL_WALLET}`,
      via: 'public',
    },
    {
      id: 'admin-snap-wallets',
      label: 'Admin: snapshot wallets',
      method: 'GET',
      path: '/api/admin/snapshot-wallets',
      via: 'admin-proxy',
    },
    {
      id: 'admin-refresh-players',
      label: 'Admin: refresh players (NBA)',
      method: 'GET',
      path: '/api/admin/refresh-players',
      via: 'admin-proxy',
      heavy: true,
    },
    {
      id: 'admin-run-snapshot',
      label: 'Admin: run portfolio snapshot',
      method: 'POST',
      path: '/api/admin/run-snapshot',
      body: {},
      via: 'admin-proxy',
      heavy: true,
    },
  ];
}

export function ApiDebugPanel() {
  const { session } = useAuth();
  const samplePlayerId = useMemo(() => {
    const raw = (deploymentsFallback as { players?: { id: string }[] }).players ?? [];
    return raw[0]?.id ?? 'nikola_jokic';
  }, []);

  const probes = useMemo(() => buildProbes(samplePlayerId), [samplePlayerId]);

  const [rows, setRows] = useState<Record<string, RowState>>(() =>
    Object.fromEntries(probes.map(p => [p.id, { status: 'idle' as const }]))
  );

  const [lastView, setLastView] = useState<{
    id: string;
    label: string;
    method: string;
    path: string;
    state: RowState;
  } | null>(null);

  const [runningAll, setRunningAll] = useState(false);

  const runOne = useCallback(
    async (p: ApiProbe) => {
      setRows(prev => ({ ...prev, [p.id]: { status: 'loading' } }));
      const t0 = performance.now();
      try {
        if (p.via === 'admin-proxy') {
          const tok = session?.access_token;
          if (!tok) {
            const ms = Math.round(performance.now() - t0);
            const err: RowState = { status: 'error', ms, message: 'Not signed in (need session for admin proxy)' };
            setRows(prev => ({ ...prev, [p.id]: err }));
            setLastView({ id: p.id, label: p.label, method: p.method, path: p.path, state: err });
            return;
          }
          const res = await fetch('/api/admin/debug-proxy', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${tok}`,
            },
            body: JSON.stringify({
              method: p.method,
              path: p.path,
              body: p.method === 'POST' ? p.body ?? {} : undefined,
            }),
          });
          const ms = Math.round(performance.now() - t0);
          const body = await parseJsonResponse(res);
          const st: RowState = { status: 'done', http: res.status, ms, body };
          setRows(prev => ({ ...prev, [p.id]: st }));
          setLastView({ id: p.id, label: p.label, method: p.method, path: p.path, state: st });
          return;
        }

        const res = await fetch(p.path, {
          method: p.method,
          headers: p.method === 'POST' ? { 'Content-Type': 'application/json' } : undefined,
          body: p.method === 'POST' ? JSON.stringify(p.body ?? {}) : undefined,
          cache: 'no-store',
        });
        const ms = Math.round(performance.now() - t0);
        const body = await parseJsonResponse(res);
        const st: RowState = { status: 'done', http: res.status, ms, body };
        setRows(prev => ({ ...prev, [p.id]: st }));
        setLastView({ id: p.id, label: p.label, method: p.method, path: p.path, state: st });
      } catch (e) {
        const ms = Math.round(performance.now() - t0);
        const msg = e instanceof Error ? e.message : 'Request failed';
        const err: RowState = { status: 'error', ms, message: msg };
        setRows(prev => ({ ...prev, [p.id]: err }));
        setLastView({ id: p.id, label: p.label, method: p.method, path: p.path, state: err });
      }
    },
    [session?.access_token]
  );

  const runAll = useCallback(async () => {
    setRunningAll(true);
    for (const p of probes) {
      await runOne(p);
      await new Promise(r => setTimeout(r, 120));
    }
    setRunningAll(false);
  }, [probes, runOne]);

  const displayJson =
    lastView?.state.status === 'done'
      ? stringifyBody(lastView.state.body)
      : lastView?.state.status === 'error'
        ? stringifyBody({
            error: lastView.state.message,
            http: lastView.state.http,
            ms: lastView.state.ms,
          })
        : '// Run an endpoint to see JSON here';

  return (
    <section className="overflow-hidden rounded-3xl border border-white/[0.06] bg-gradient-to-b from-white/[0.02] to-transparent">
      <div className="border-b border-white/[0.06] px-5 py-4 sm:px-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Terminal className="h-4 w-4 text-primary" />
            <h2 className="text-[11px] font-medium uppercase tracking-[0.2em] text-muted-foreground/80">
              API debug
            </h2>
          </div>
          <button
            type="button"
            disabled={runningAll}
            onClick={() => void runAll()}
            className="inline-flex items-center gap-1.5 rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 py-1.5 text-xs font-medium text-foreground transition hover:bg-white/[0.07] disabled:opacity-50"
          >
            {runningAll ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
            Run all
          </button>
        </div>
        <p className="mt-2 max-w-2xl text-xs text-muted-foreground">
          Same-origin routes match production rewrites. Admin paths use a server proxy (
          <code className="rounded bg-white/[0.06] px-1 font-mono text-[10px]">ADMIN_KEY</code>
          ). Sample player id from bundled deployments:{' '}
          <code className="rounded bg-white/[0.06] px-1 font-mono text-[10px]">{samplePlayerId}</code>
        </p>
      </div>

      <div className="grid gap-0 lg:grid-cols-[minmax(0,420px)_1fr] lg:divide-x lg:divide-white/[0.06]">
        <div className="max-h-[min(52vh,28rem)] overflow-auto">
          <table className="w-full text-left text-xs">
            <thead className="sticky top-0 z-[1] border-b border-white/[0.06] bg-card/95 backdrop-blur-sm">
              <tr className="text-[10px] uppercase tracking-wider text-muted-foreground/80">
                <th className="px-4 py-2 font-medium">Endpoint</th>
                <th className="w-24 px-2 py-2 font-medium">Result</th>
                <th className="w-16 px-2 py-2 font-medium text-right">Run</th>
              </tr>
            </thead>
            <tbody>
              {probes.map(p => {
                const st = rows[p.id] ?? { status: 'idle' as const };
                return (
                  <tr key={p.id} className="border-b border-white/[0.04] hover:bg-white/[0.02]">
                    <td className="px-4 py-2.5">
                      <div className="font-mono text-[10px] text-muted-foreground/90">
                        {p.method} {p.path.length > 48 ? `${p.path.slice(0, 46)}…` : p.path}
                      </div>
                      <div className="mt-0.5 text-[11px] text-foreground/90">
                        {p.label}
                        {p.heavy ? (
                          <span className="ml-1.5 text-amber-500/90">· heavy</span>
                        ) : null}
                      </div>
                    </td>
                    <td className="px-2 py-2.5 align-top">
                      {st.status === 'idle' ? (
                        <span className="text-muted-foreground">—</span>
                      ) : st.status === 'loading' ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                      ) : st.status === 'error' ? (
                        <span className="text-destructive">Err</span>
                      ) : (
                        <span className={st.http >= 200 && st.http < 300 ? 'text-emerald-400/90' : 'text-amber-400/90'}>
                          {st.http}
                        </span>
                      )}
                      {st.status === 'done' || st.status === 'error' ? (
                        <span className="ml-1 text-muted-foreground">{st.ms}ms</span>
                      ) : null}
                    </td>
                    <td className="px-2 py-2 text-right align-top">
                      <button
                        type="button"
                        disabled={st.status === 'loading' || runningAll}
                        onClick={() => {
                          void runOne(p);
                        }}
                        className="rounded-md border border-white/[0.08] bg-white/[0.04] px-2 py-1 text-[10px] font-medium text-foreground hover:bg-white/[0.08] disabled:opacity-40"
                      >
                        Run
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="flex min-h-[12rem] flex-col p-4 sm:p-5">
          {lastView ? (
            <p className="mb-2 font-mono text-[10px] leading-relaxed text-muted-foreground">
              <span className="text-foreground/80">{lastView.method}</span> {lastView.path}
              <span className="mx-2 text-white/20">·</span>
              {lastView.label}
            </p>
          ) : null}
          <pre className="min-h-0 flex-1 overflow-auto rounded-xl border border-white/[0.06] bg-black/40 p-3 font-mono text-[11px] leading-relaxed text-foreground/90 subpixel-antialiased">
            {displayJson}
          </pre>
        </div>
      </div>
    </section>
  );
}
