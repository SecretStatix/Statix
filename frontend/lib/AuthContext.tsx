'use client';

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { Session, User } from '@supabase/supabase-js';
import { supabase } from './supabase';

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

    // Hard ceiling — navigator.locks can hang getSession() indefinitely on stale tabs.
    const hardCeiling = setTimeout(() => {
      if (!cancelled) {
        console.warn('[auth] auth init exceeded 6s — forcing loading=false');
        setLoading(false);
      }
    }, 6000);

    async function init() {
      try {
        const result = await Promise.race([
          supabase.auth.getSession(),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('getSession timeout')), 4000)
          ),
        ]);
        if (cancelled) return;

        const session = result.data.session;
        setSession(session);
        if (session?.user) await checkApproval(session.user.id);
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
      async (event, session) => {
        if (cancelled) return;
        setSession(session);
        // Only re-check approval on actual sign-in events, not token refreshes.
        // Token refreshes don't change the user or their approval status, and
        // re-running checkApproval risks a failed query setting isApproved=false.
        if (session?.user && (event === 'SIGNED_IN' || event === 'INITIAL_SESSION')) {
          try {
            await checkApproval(session.user.id);
          } else {
            setIsApproved(false);
            setIsAdmin(false);
          }
        } else if (!session) {
          setIsApproved(false);
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
  };

  return (
    <AuthContext.Provider value={{ user, session, loading, isApproved, isAdmin, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}
