'use client';

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { Session, User } from '@supabase/supabase-js';
import { supabase } from './supabase';
import { useRouter, usePathname } from 'next/navigation';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  isApproved: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  session: null,
  loading: true,
  isApproved: false,
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

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [isApproved, setIsApproved] = useState(false);
  const router = useRouter();
  const pathname = usePathname();

  async function checkApproval(userId: string) {
    // `maybeSingle()` returns `null` instead of erroring when no row is found —
    // safer than `.single()` which rejects on missing/duplicate rows and used
    // to leave us hung on the loading screen forever.
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('is_approved')
        .eq('id', userId)
        .maybeSingle();

      if (error) {
        console.warn('[auth] approval check failed:', error.message);
      }
      setIsApproved(data?.is_approved ?? false);
    } catch (err) {
      console.warn('[auth] approval check threw:', err);
      setIsApproved(false);
    }
  }

  useEffect(() => {
    // `.finally` guarantees we exit the loading state even if `getSession` or
    // `checkApproval` rejects. Without this, a stale/invalid session in
    // localStorage would hang the entire app on the "Loading..." screen.
    supabase.auth
      .getSession()
      .then(async ({ data: { session } }) => {
        setSession(session);
        if (session?.user) {
          await checkApproval(session.user.id);
        }
      })
      .catch((err) => {
        console.warn('[auth] getSession failed:', err);
      })
      .finally(() => setLoading(false));

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        setSession(session);
        try {
          if (session?.user) {
            await checkApproval(session.user.id);
          } else {
            setIsApproved(false);
          }
        } finally {
          setLoading(false);
        }
      }
    );

    return () => subscription.unsubscribe();
  }, []);

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
    <AuthContext.Provider value={{ user, session, loading, isApproved, signOut }}>
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
