import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder';

// Process-local lock: replaces supabase-js's default `navigator.locks`-based
// implementation. The default coordinates token refresh across browser tabs,
// but if a tab is closed (or the page is hard-refreshed) mid-refresh the lock
// can stay held forever — the next page load then deadlocks on `getSession()`
// and the user sees an infinite loading screen. A simple in-memory lock chain
// scoped to the page lifetime can't get stuck across refreshes; the worst
// downside is multiple tabs may issue parallel refresh requests, which the
// auth server handles gracefully.
let lockChain: Promise<unknown> = Promise.resolve();
function processLock<R>(_name: string, _acquireTimeout: number, fn: () => Promise<R>): Promise<R> {
  const next = lockChain.then(() => fn());
  lockChain = next.catch(() => undefined);
  return next;
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    lock: processLock,
  },
});
