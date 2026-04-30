import { NextRequest, NextResponse } from 'next/server';
import { backendBaseUrl, requireAdminSession } from '@/lib/admin-session';

/**
 * Approve a user profile (Supabase + Resend email via FastAPI).
 * Caller must be an admin (`profiles.is_admin`). Uses server-side `ADMIN_KEY`
 * to call the Python backend — never expose that key to the browser.
 */
export async function POST(req: NextRequest) {
  const gate = await requireAdminSession(req);
  if (gate) return gate;

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

  const backendUrl = backendBaseUrl();

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
