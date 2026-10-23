import { useEffect, type ReactNode } from 'react';
import { Navigate } from 'react-router';
import { homeFor, useAuth } from '@/lib/auth';

// Route guard (NFR-003). Signed out: Login. Wrong role: that account's own dashboard,
// so a tenant who opens /admin lands on /tenant. Inactive accounts are signed out.
export function RequireRole({ role, children }: { role: 'admin' | 'tenant'; children: ReactNode }) {
  const { session, account, loading, signOut } = useAuth();
  const inactive = !!account && account.status !== 'active';

  useEffect(() => {
    // The page shows Login either way; a failed sign-out is tried again on the next visit.
    if (inactive) signOut().catch(() => undefined);
  }, [inactive, signOut]);

  if (loading) {
    return (
      <div role="status" className="flex min-h-svh items-center justify-center bg-page text-muted">
        Loading...
      </div>
    );
  }
  if (!session || !account || inactive) return <Navigate to="/login" replace />;
  if (account.role !== role) return <Navigate to={homeFor(account)} replace />;
  return <>{children}</>;
}
