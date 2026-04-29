'use client';

import { useCallback, useEffect, useState } from 'react';
import { Activity, Database, RefreshCw } from 'lucide-react';

type LivenessPayload = { status?: string; name?: string; version?: string };

type DbTableCheck = { ok: boolean; row_count?: number | null; error?: string };

type DbHealthPayload = {
  status?: string;
  supabase?: boolean;
  detail?: string;
  tables?: Record<string, DbTableCheck>;
};

type CheckResult<T> =
  | { state: 'idle' | 'loading' }
  | { state: 'ok'; ms: number; body: T }
  | { state: 'error'; ms: number; message: string; status?: number };

function formatCheckedAt(d: Date) {
  return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

async function fetchJson<T>(url: string, timeoutMs: number): Promise<{ ok: boolean; status: number; body: T | null; ms: number; error?: string }> {
  const started = performance.now();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctrl.signal, cache: 'no-store' });
    const ms = Math.round(performance.now() - started);
    let body: T | null = null;
    try {
      body = (await res.json()) as T;
    } catch {
      body = null;
    }
    return { ok: res.ok, status: res.status, body, ms };
  } catch (e) {
    const ms = Math.round(performance.now() - started);
    const message = e instanceof Error ? e.message : 'Request failed';
    return { ok: false, status: 0, body: null, ms, error: e instanceof DOMException && e.name === 'AbortError' ? 'Timeout' : message };
  } finally {
    clearTimeout(timer);
  }
}

export function BackendHealthPanel() {
  const [liveness, setLiveness] = useState<CheckResult<LivenessPayload>>({ state: 'idle' });
  const [db, setDb] = useState<CheckResult<DbHealthPayload>>({ state: 'idle' });
  const [checkedAt, setCheckedAt] = useState<Date | null>(null);

  const run = useCallback(async () => {
    setLiveness({ state: 'loading' });
    setDb({ state: 'loading' });

    const [liveRes, dbRes] = await Promise.all([
      fetchJson<LivenessPayload>('/statix-backend/health', 12_000),
      fetchJson<DbHealthPayload>('/statix-backend/health/db', 15_000),
    ]);

    if (liveRes.error || !liveRes.body) {
      setLiveness({
        state: 'error',
        ms: liveRes.ms,
        message: liveRes.error || `HTTP ${liveRes.status}`,
        status: liveRes.status,
      });
    } else if (!liveRes.ok || liveRes.body.status !== 'healthy') {
      setLiveness({
        state: 'error',
        ms: liveRes.ms,
        message: liveRes.body.status ? `Unexpected status: ${liveRes.body.status}` : `HTTP ${liveRes.status}`,
        status: liveRes.status,
      });
    } else {
      setLiveness({ state: 'ok', ms: liveRes.ms, body: liveRes.body });
    }

    if (dbRes.error || !dbRes.body) {
      setDb({
        state: 'error',
        ms: dbRes.ms,
        message: dbRes.error || `HTTP ${dbRes.status}`,
        status: dbRes.status,
      });
    } else if (!dbRes.ok) {
      setDb({
        state: 'error',
        ms: dbRes.ms,
        message: `HTTP ${dbRes.status}`,
        status: dbRes.status,
      });
    } else {
      setDb({ state: 'ok', ms: dbRes.ms, body: dbRes.body });
    }

    setCheckedAt(new Date());
  }, []);

  useEffect(() => {
    run();
  }, [run]);

  const badge = (variant: 'ok' | 'bad' | 'pending' | 'warn', label: string) => {
    const cls =
      variant === 'ok'
        ? 'rounded-md bg-success/15 px-2 py-0.5 text-xs font-medium text-success'
        : variant === 'bad'
          ? 'rounded-md bg-destructive/15 px-2 py-0.5 text-xs font-medium text-destructive'
          : variant === 'warn'
            ? 'rounded-md bg-amber-500/15 px-2 py-0.5 text-xs font-medium text-amber-500'
            : 'rounded-md bg-white/[0.06] px-2 py-0.5 text-xs font-medium text-muted-foreground';
    return <span className={cls}>{label}</span>;
  };

  return (
    <section className="px-5 py-6 sm:px-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-[11px] font-medium uppercase tracking-[0.2em] text-muted-foreground/80">API health</h2>
        <div className="flex items-center gap-3">
          {checkedAt && (
            <span className="text-xs text-muted-foreground tabular-nums">Checked {formatCheckedAt(checkedAt)}</span>
          )}
          <button
            type="button"
            onClick={() => run()}
            disabled={liveness.state === 'loading' || db.state === 'loading'}
            className="inline-flex items-center gap-1.5 rounded-lg border border-white/[0.08] bg-secondary/50 px-3 py-1.5 text-xs font-medium text-foreground transition hover:bg-secondary disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${liveness.state === 'loading' || db.state === 'loading' ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        {/* Liveness */}
        <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2">
              <Activity className="h-4 w-4 text-primary" />
              <span className="text-sm font-medium text-foreground">Backend process</span>
            </div>
            {liveness.state === 'loading' && badge('pending', '…')}
            {liveness.state === 'ok' && badge('ok', 'Live')}
            {liveness.state === 'error' && badge('bad', 'Down')}
          </div>
          <p className="mt-2 text-xs text-muted-foreground">GET /health — FastAPI responding.</p>
          {liveness.state === 'ok' && (
            <p className="mt-2 font-mono text-xs text-muted-foreground">
              {liveness.body.version ?? '—'} · {liveness.ms} ms
            </p>
          )}
          {liveness.state === 'error' && (
            <p className="mt-2 text-xs text-destructive">{liveness.message}</p>
          )}
        </div>

        {/* Supabase */}
        <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2">
              <Database className="h-4 w-4 text-primary" />
              <span className="text-sm font-medium text-foreground">Supabase (service)</span>
            </div>
            {db.state === 'loading' && badge('pending', '…')}
            {db.state === 'ok' &&
              badge(db.body.status === 'healthy' ? 'ok' : 'warn', db.body.status === 'healthy' ? 'Healthy' : 'Degraded')}
            {db.state === 'error' && badge('bad', 'Error')}
          </div>
          <p className="mt-2 text-xs text-muted-foreground">GET /health/db — key tables reachable from the backend.</p>
          {db.state === 'ok' && (
            <>
              <p className="mt-2 font-mono text-xs text-muted-foreground">{db.ms} ms</p>
              {db.body.detail && <p className="mt-1 text-xs text-amber-500/90">{db.body.detail}</p>}
              {db.body.tables && (
                <ul className="mt-3 space-y-1 border-t border-white/[0.06] pt-3">
                  {Object.entries(db.body.tables).map(([name, row]) => (
                    <li key={name} className="flex items-center justify-between text-xs">
                      <span className="font-mono text-muted-foreground">{name}</span>
                      {row.ok ? (
                        <span className="text-success">ok{row.row_count != null ? ` (${row.row_count} rows)` : ''}</span>
                      ) : (
                        <span className="max-w-[60%] truncate text-destructive" title={row.error}>
                          {row.error ?? 'fail'}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
          {db.state === 'error' && <p className="mt-2 text-xs text-destructive">{db.message}</p>}
        </div>
      </div>
    </section>
  );
}
