import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

/**
 * Require a valid Supabase session whose profile has `is_admin`.
 * Returns a NextResponse on failure, or `null` if the caller is an admin.
 */
export async function requireAdminSession(req: NextRequest): Promise<NextResponse | null> {
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

  return null;
}

export function backendBaseUrl(): string {
  const rawApi = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
  const apiUrl = rawApi.trim().replace(/\/+$/, '');
  return /^https?:\/\//i.test(apiUrl) ? apiUrl : `https://${apiUrl}`;
}
