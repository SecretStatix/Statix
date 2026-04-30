'use client';

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { Session, User } from '@supabase/supabase-js';
import { supabase } from './supabase';
import { useRouter, usePathname } from 'next/navigation';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  /** May use protected routes (market, etc.): true if `profiles.is_approved` and/or `is_admin`. */
  isApproved: boolean;
  isAdmin: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  session: null,
  loading: true,
  isApproved: false,
  isAdmin: false,
  signOut: async () => {},
});

export function useAuth() {
  return useContext(AuthContext);
}

// Paths that don't require auth at all — anyone can view them.
const PUBLIC_PATHS = ['/', '/login', '/signup', '/forgot-password', '/reset-password'];

// Paths that should bounce signed-in (approved) users away — landing on /login
// while already logged in is a no-op the user almost never wants. The marketing
// landing page (/) intentionally does NOT live here so signed-in users can
// still browse it (we just swap the CTA copy to "Open Market").
const AUTH_PATHS = ['/login', '/signup', '/forgot-password'];

/** Coerce PostgREST / driver quirks (null, 't', strings) to a real boolean. */
function parseDbBool(value: unknown): boolean {
  if (value === true || value === 1) return true;
  if (value === false || value === 0 || value == null) return false;
  if (typeof value === 'string') {
    const v = value.toLowerCase();
    return v === 'true' || v === 't' || v === '1' || v === 'yes';
  }
  return Boolean(value);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  /** True when the user may use the app (market, etc.): approved and/or admin. */
  const [isApproved, setIsApproved] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const router = useRouter();
  const pathname = usePathname();

  async function checkApproval(userId: string) {
    // Ensure the client JWT is attached before RLS-scoped reads (avoids rare
    // races where the first profiles query runs before auth is wired).
    try {
      await supabase.auth.getUser();
    } catch {
      // non-fatal — proceed with select
    }

    const applyRow = (data: { is_approved?: unknown; is_admin?: unknown } | null) => {
      const rowApproved = parseDbBool(data?.is_approved);
      const rowAdmin = parseDbBool((data as { is_admin?: unknown } | null)?.is_admin);
      setIsAdmin(rowAdmin);
      // Admins can use the app even if is_approved was not flipped; gate also
      // survives odd partial reads where only is_admin is returned.
      setIsApproved(rowApproved || rowAdmin);
    };

    for (let attempt = 0; attempt < 3; attempt++) {
      if (attempt > 0) {
        await new Promise((r) => setTimeout(r, 200 * attempt));
        try {
          await supabase.auth.getUser();
        } catch {
          // ignore
        }
      }

      try {
        let { data, error } = await supabase
          .from('profiles')
          .select('is_approved, is_admin')
          .eq('id', userId)
          .maybeSingle();

        // If the `is_admin` column hasn't been added to this Supabase project
        // yet, the combined query errors and `data` comes back null — which used
        // to bounce already-approved users to /pending. Fall back to the legacy
        // shape so the approval gate keeps working until the migration runs.
        if (error && /is_admin/i.test(error.message)) {
          const fallback = await supabase
            .from('profiles')
            .select('is_approved')
            .eq('id', userId)
            .maybeSingle();
          data = fallback.data as typeof data;
          error = fallback.error;
        }

        if (error) {
          console.warn('[auth] approval check failed:', error.message);
          if (attempt === 2) {
            setIsApproved(false);
            setIsAdmin(false);
          }
          continue;
        }

        if (!data) {
          console.warn('[auth] no profiles row for user (RLS or missing profile)');
          if (attempt === 2) {
            setIsApproved(false);
            setIsAdmin(false);
          }
          continue;
        }

        applyRow(data);
        return;
      } catch (err) {
        console.warn('[auth] approval check threw:', err);
        if (attempt === 2) {
          setIsApproved(false);
          setIsAdmin(false);
        }
      }
    }
  }

  useEffect(() => {
    let cancelled = false;

    // Hard ceiling on the loading screen. supabase-js v2 coordinates token
    // refreshes via `navigator.locks`; if a previous tab/page exits mid-refresh
    // the lock can stay held and `getSession()` will hang forever with no
    // rejection. Without this fallback, refreshing the page after a stuck lock
    // produces an infinite loading screen.
    const hardCeiling = setTimeout(() => {
      if (!cancelled) {
        console.warn('[auth] auth init exceeded 6s — forcing loading=false');
        setLoading(false);
      }
    }, 6000);

    async function init() {
      try {
        // Race getSession against a 4s timeout so a stuck lock can't hang us.
        const result = await Promise.race([
          supabase.auth.getSession(),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('getSession timeout')), 4000)
          ),
        ]);
        if (cancelled) return;

        const session = result.data.session;
        setSession(session);
        if (session?.user) {
          await checkApproval(session.user.id);
        }
      } catch (err) {
        console.warn('[auth] init failed:', err);
      } finally {
        if (!cancelled) {
          clearTimeout(hardCeiling);
          setLoading(false);
        }
      }
    }

    init();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        if (cancelled) return;
        setSession(session);
        try {
          if (session?.user) {
            await checkApproval(session.user.id);
          } else {
            setIsApproved(false);
            setIsAdmin(false);
          }
        } finally {
          if (!cancelled) setLoading(false);
        }
      }
    );

    return () => {
      cancelled = true;
      clearTimeout(hardCeiling);
      subscription.unsubscribe();
    };
  }, []);

  // If an admin updates this user's profile in Supabase, pick up is_approved without a hard refresh
  // (requires `profiles` in the `supabase_realtime` publication — harmless if not enabled).
  useEffect(() => {
    const uid = session?.user?.id;
    if (!uid) return;

    const refetchGate = () => {
      void supabase
        .from('profiles')
        .select('is_approved, is_admin')
        .eq('id', uid)
        .maybeSingle()
        .then(({ data, error }) => {
          if (error || !data) return;
          const rowApproved = parseDbBool(data.is_approved);
          const rowAdmin = parseDbBool(data.is_admin);
          setIsAdmin(rowAdmin);
          setIsApproved(rowApproved || rowAdmin);
        });
    };

    const channel = supabase
      .channel(`profile-gate-${uid}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'profiles', filter: `id=eq.${uid}` },
        refetchGate
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [session?.user?.id]);

  useEffect(() => {
    if (loading) return;

    const isPublicPath = PUBLIC_PATHS.includes(pathname);
    const isAuthPath = AUTH_PATHS.includes(pathname);
    const isPendingPath = pathname === '/pending';
    const isResetPath = pathname === '/reset-password';

    if (isResetPath && session) {
      return;
    }

    if (!session && !isPublicPath) {
      router.push('/login');
    } else if (session && isAuthPath) {
      router.push(isApproved ? '/market' : '/pending');
    } else if (session && !isApproved && !isPendingPath && !isPublicPath) {
      router.push('/pending');
    } else if (session && isApproved && isPendingPath) {
      router.push('/market');
    }
  }, [session, loading, isApproved, pathname, router]);

  const signOut = async () => {
    await supabase.auth.signOut();
    router.push('/');
  };

  const user = session?.user ?? null;

  const isPublicPath = PUBLIC_PATHS.includes(pathname);
  const isAuthPath = AUTH_PATHS.includes(pathname);
  const isPendingPath = pathname === '/pending';
  const isResetPath = pathname === '/reset-password';

  // Show blank screen while a redirect is about to fire — prevents a one-render
  // flash of protected content before router.push lands. Conditions here MUST
  // mirror the redirect logic in the useEffect above; previously they didn't
  // (a stray `session && isPublicPath` clause blanked the landing page for any
  // signed-in user with no matching redirect, leaving them stuck forever).
  const redirectImminent =
    !loading &&
    !(isResetPath && session) &&
    (
      (!session && !isPublicPath) ||
      (session && isAuthPath) ||
      (session && !isApproved && !isPendingPath && !isPublicPath) ||
      (session && isApproved && isPendingPath)
    );

  if (loading) {
    return <AuthLoadingScreen />;
  }

  if (redirectImminent) {
    return <div className="min-h-screen bg-background" />;
  }

  return (
    <AuthContext.Provider value={{ user, session, loading, isApproved, isAdmin, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

// Visible loading state with a recovery escape hatch. If a stale Supabase
// session ever stalls the app again (network blip, RLS migration, etc.), the
// user can clear it themselves instead of seeing a blank screen.
function AuthLoadingScreen() {
  const [showRecover, setShowRecover] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setShowRecover(true), 4000);
    return () => clearTimeout(t);
  }, []);

  async function clearAndReload() {
    try {
      await supabase.auth.signOut();
    } catch {
      // ignore — we're nuking local state regardless
    }
    try {
      // Strip any stale Supabase tokens that survive signOut.
      Object.keys(localStorage)
        .filter((k) => k.startsWith('sb-') || k.includes('supabase'))
        .forEach((k) => localStorage.removeItem(k));
    } catch {
      // localStorage may be unavailable in some embedded contexts
    }
    window.location.assign('/');
  }

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-4 px-6 text-center">
      <div className="h-8 w-8 rounded-full border-2 border-white/10 border-t-primary animate-spin" />
      <div className="text-foreground text-base font-medium">Loading…</div>
      {showRecover && (
        <div className="mt-2 max-w-sm text-sm text-muted-foreground">
          Stuck here?{' '}
          <button
            type="button"
            onClick={clearAndReload}
            className="font-medium text-primary underline-offset-4 hover:underline"
          >
            Clear session and reload
          </button>
        </div>
      )}
    </div>
  );
}
