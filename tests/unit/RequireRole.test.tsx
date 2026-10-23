import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import type { Account } from '@/lib/auth';

let state: { session: object | null; account: Partial<Account> | null; loading: boolean };
const signOut = vi.fn().mockResolvedValue(undefined); // like the real one: a promise
vi.mock('@/lib/auth', async (orig) => ({
  ...(await orig<typeof import('@/lib/auth')>()),
  useAuth: () => ({ ...state, signOut }),
}));

const { RequireRole } = await import('@/components/RequireRole');

function at(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/login" element={<h1>Login</h1>} />
        <Route path="/admin" element={<RequireRole role="admin"><h1>Admin</h1></RequireRole>} />
        <Route path="/tenant" element={<RequireRole role="tenant"><h1>Tenant</h1></RequireRole>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('RequireRole', () => {
  it('sends a signed-out visitor to Login', () => {
    state = { session: null, account: null, loading: false };
    at('/admin');
    expect(screen.getByRole('heading', { name: 'Login' })).toBeInTheDocument();
  });

  it('sends a tenant who opens /admin to /tenant', () => {
    state = { session: {}, account: { role: 'tenant', status: 'active' }, loading: false };
    at('/admin');
    expect(screen.getByRole('heading', { name: 'Tenant' })).toBeInTheDocument();
  });

  it('sends the owner who opens /tenant to /admin', () => {
    state = { session: {}, account: { role: 'admin', status: 'active' }, loading: false };
    at('/tenant');
    expect(screen.getByRole('heading', { name: 'Admin' })).toBeInTheDocument();
  });

  it('signs out an inactive account', () => {
    state = { session: {}, account: { role: 'tenant', status: 'inactive' }, loading: false };
    at('/tenant');
    expect(screen.getByRole('heading', { name: 'Login' })).toBeInTheDocument();
    expect(signOut).toHaveBeenCalled();
  });

  it('waits while the account loads', () => {
    state = { session: {}, account: null, loading: true };
    at('/tenant');
    expect(screen.getByRole('status')).toHaveTextContent('Loading');
  });
});
