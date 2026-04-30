'use client';

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { Session, User } from '@supabase/supabase-js';
import { supabase } from './supabase';

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

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [isApproved, setIsApproved] = useState(false);

  async function checkApproval(userId: string) {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('is_approved')
        .eq('id', userId)
        .maybeSingle();

      if (error) console.warn('[auth] approval check failed:', error.message);
      setIsApproved(data?.is_approved ?? false);
    } catch (err) {
      console.warn('[auth] approval check threw:', err);
      setIsApproved(false);
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
          } finally {
            if (!cancelled) setLoading(false);
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

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider value={{ user: session?.user ?? null, session, loading, isApproved, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}
