import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

// The signed-in account: role from profiles, the tenant record (null for the owner) and the manager flag.
export interface Account {
  userId: string;
  username: string;
  role: 'admin' | 'tenant';
  status: 'active' | 'inactive';
  fullName: string;
  tenantId: number | null;
  isManager: boolean;
}

interface AuthState {
  session: Session | null;
  account: Account | null;
  loading: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export async function loadAccount(session: Session): Promise<Account> {
  const userId = session.user.id;
  const [profile, tenant, manager] = await Promise.all([
    supabase.from('profiles').select('username, role, status').eq('id', userId).single(),
    supabase.from('tenants').select('tenant_id, full_name, status').eq('user_id', userId).maybeSingle(),
    supabase.from('tenant_manager').select('tenant_id').maybeSingle(),
  ]);
  if (profile.error) throw profile.error;
  const t = tenant.data;
  return {
    userId,
    username: profile.data.username,
    role: profile.data.role,
    status: profile.data.status,
    fullName: t?.full_name || (session.user.user_metadata?.full_name as string | undefined) || profile.data.username,
    tenantId: t?.tenant_id ?? null,
    isManager: !!t && t.status === 'active' && manager.data?.tenant_id === t.tenant_id,
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [sessionLoaded, setSessionLoaded] = useState(false);
  const queryClient = useQueryClient();

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setSessionLoaded(true);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      setSessionLoaded(true);
      if (!next) queryClient.clear();
    });
    return () => data.subscription.unsubscribe();
  }, [queryClient]);

  const account = useQuery({
    queryKey: ['account', session?.user.id],
    queryFn: () => loadAccount(session!),
    enabled: !!session,
    staleTime: 60_000,
  });

  // Throws when Supabase could not end the session, so Logout can say so.
  const signOut = useCallback(async () => {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  }, []);
  const value: AuthState = {
    session,
    account: session ? (account.data ?? null) : null,
    loading: !sessionLoaded || (!!session && account.isPending),
    signOut,
  };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}

export const homeFor = (account: Pick<Account, 'role'>) => (account.role === 'admin' ? '/admin' : '/tenant');

// "MR" for Maria Reyes.
export const initials = (name: string) =>
  name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join('');
