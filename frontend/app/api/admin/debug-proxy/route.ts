import { NextRequest, NextResponse } from 'next/server';
import { backendBaseUrl, requireAdminSession } from '@/lib/admin-session';

/** Allowlisted admin paths the debug UI may invoke (server adds ADMIN_KEY). */
const ALLOWED: Array<{ method: 'GET' | 'POST'; path: string }> = [
  { method: 'GET', path: '/api/admin/snapshot-wallets' },
  { method: 'GET', path: '/api/admin/refresh-players' },
  { method: 'POST', path: '/api/admin/run-snapshot' },
];

function isAllowed(method: string, path: string): boolean {
  const m = method.toUpperCase();
  return ALLOWED.some((e) => e.method === m && e.path === path);
}

/**
 * Forward an allowlisted FastAPI admin call using server `ADMIN_KEY`.
 * Caller must be a Supabase admin (`profiles.is_admin`).
 */
export async function POST(req: NextRequest) {
  const gate = await requireAdminSession(req);
  if (gate) return gate;

  const adminKey = process.env.ADMIN_KEY;
  if (!adminKey) {
    return NextResponse.json({ error: 'ADMIN_KEY not set on server' }, { status: 503 });
  }

  let payload: { method?: string; path?: string; body?: unknown };
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const method = typeof payload.method === 'string' ? payload.method.toUpperCase() : '';
  const path = typeof payload.path === 'string' ? payload.path.trim() : '';
  if (!path.startsWith('/api/admin/')) {
    return NextResponse.json({ error: 'path must start with /api/admin/' }, { status: 400 });
  }
  if (method !== 'GET' && method !== 'POST') {
    return NextResponse.json({ error: 'method must be GET or POST' }, { status: 400 });
  }
  if (!isAllowed(method, path)) {
    return NextResponse.json(
      { error: 'path not allowlisted for debug proxy', path, allowed: ALLOWED },
      { status: 403 }
    );
  }

  const backendUrl = backendBaseUrl();
  const headers: Record<string, string> = {
    Authorization: `Bearer ${adminKey}`,
  };
  let body: string | undefined;
  if (method === 'POST') {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(payload.body ?? {});
  }

  const upstream = await fetch(`${backendUrl}${path}`, { method, headers, body });

  const text = await upstream.text();
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return NextResponse.json(
      { raw: text.slice(0, 8000), status: upstream.status, note: 'non-json body' },
      { status: upstream.status }
    );
  }

  return NextResponse.json(json, { status: upstream.status });
}
