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

const PUBLIC_PATHS = ['/login', '/signup', '/forgot-password', '/reset-password'];

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [isApproved, setIsApproved] = useState(false);
  const router = useRouter();
  const pathname = usePathname();

  async function checkApproval(userId: string) {
    const { data } = await supabase
      .from('profiles')
      .select('is_approved')
      .eq('id', userId)
      .single();

    setIsApproved(data?.is_approved ?? false);
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session?.user) {
        checkApproval(session.user.id).then(() => setLoading(false));
      } else {
        setLoading(false);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setSession(session);
        if (session?.user) {
          checkApproval(session.user.id).then(() => setLoading(false));
        } else {
          setIsApproved(false);
          setLoading(false);
        }
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (loading) return;

    const isPublicPath = PUBLIC_PATHS.includes(pathname);
    const isPendingPath = pathname === '/pending';
    const isResetPath = pathname === '/reset-password';

    if (isResetPath && session) {
      return;
    }

    if (!session && !isPublicPath) {
      router.push('/login');
    } else if (session && isPublicPath) {
      router.push(isApproved ? '/' : '/pending');
    } else if (session && !isApproved && !isPendingPath && !isPublicPath) {
      router.push('/pending');
    } else if (session && isApproved && isPendingPath) {
      router.push('/');
    }
  }, [session, loading, isApproved, pathname, router]);

  const signOut = async () => {
    await supabase.auth.signOut();
    router.push('/login');
  };

  const user = session?.user ?? null;

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-gray-400 text-lg">Loading...</div>
      </div>
    );
  }

  return (
    <AuthContext.Provider value={{ user, session, loading, isApproved, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}
