import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

/**
 * Approve a user profile (Supabase + Resend email via FastAPI).
 * Caller must be an admin (`profiles.is_admin`). Uses server-side `ADMIN_KEY`
 * to call the Python backend — never expose that key to the browser.
 */
export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Missing session' }, { status: 401 });
  }
  const accessToken = authHeader.slice(7).trim();
  if (!accessToken) {
    return NextResponse.json({ error: 'Missing session' }, { status: 401 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 });
  }

  const supabase = createClient(url, anon, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });

  // Validate JWT via Auth REST (reliable on the server; getUser(jwt) can fail across client versions).
  const authBase = url.replace(/\/+$/, '');
  const userRes = await fetch(`${authBase}/auth/v1/user`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      apikey: anon,
    },
  });
  if (!userRes.ok) {
    const hint = await userRes.text();
    return NextResponse.json(
      { error: 'Invalid session', auth_status: userRes.status, hint: hint.slice(0, 200) },
      { status: 401 }
    );
  }
  const userJson = (await userRes.json()) as { id?: string };
  const userId = userJson.id;
  if (!userId) {
    return NextResponse.json({ error: 'Invalid session' }, { status: 401 });
  }

  const { data: profile, error: profErr } = await supabase
    .from('profiles')
    .select('is_admin')
    .eq('id', userId)
    .maybeSingle();

  if (profErr || !profile?.is_admin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const adminKey = process.env.ADMIN_KEY;
  if (!adminKey) {
    return NextResponse.json({ error: 'ADMIN_KEY not set on server' }, { status: 503 });
  }

  let body: { email?: string; resend_notification?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const email = typeof body.email === 'string' ? body.email.trim() : '';
  if (!email || !email.includes('@')) {
    return NextResponse.json({ error: 'Invalid email' }, { status: 400 });
  }

  const rawApi = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
  const apiUrl = rawApi.trim().replace(/\/+$/, '');
  const backendUrl = /^https?:\/\//i.test(apiUrl) ? apiUrl : `https://${apiUrl}`;

  const upstream = await fetch(`${backendUrl}/api/admin/approve-user`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${adminKey}`,
    },
    body: JSON.stringify({
      email,
      resend_notification: Boolean(body.resend_notification),
    }),
  });

  const text = await upstream.text();
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return NextResponse.json(
      { error: 'Backend returned non-JSON', status: upstream.status },
      { status: 502 }
    );
  }

  return NextResponse.json(json, { status: upstream.status });
}
