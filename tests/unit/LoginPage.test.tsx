import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';

const signInWithPassword = vi.fn();
const signOut = vi.fn();
const loadAccount = vi.fn();
vi.mock('@/lib/supabase', () => ({
  supabase: { auth: { signInWithPassword: (...a: unknown[]) => signInWithPassword(...a), signOut: () => signOut() } },
  loginEmail: (u: string) => `${u.toLowerCase()}@santosbh.local`,
}));
vi.mock('@/lib/auth', async (orig) => ({
  ...(await orig<typeof import('@/lib/auth')>()),
  useAuth: () => ({ session: null, account: null, loading: false, signOut }),
  loadAccount: (...a: unknown[]) => loadAccount(...a),
}));

const { default: LoginPage } = await import('@/pages/LoginPage');

function renderLogin() {
  return render(
    <MemoryRouter initialEntries={['/login']}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/admin" element={<h1>Admin home</h1>} />
        <Route path="/tenant" element={<h1>Tenant home</h1>} />
      </Routes>
    </MemoryRouter>,
  );
}

async function fillAndSubmit(username: string, password: string) {
  await userEvent.type(screen.getByLabelText('Username'), username);
  await userEvent.type(screen.getByLabelText('Password'), password);
  await userEvent.click(screen.getByRole('button', { name: 'Login' }));
}

beforeEach(() => vi.clearAllMocks());

describe('LoginPage', () => {
  it('shows the fields from the design', () => {
    renderLogin();
    expect(screen.getByRole('heading', { name: 'Welcome back' })).toBeInTheDocument();
    expect(screen.getByLabelText('Username')).toBeInTheDocument();
    expect(screen.getByLabelText('Password')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Login' })).toBeInTheDocument();
  });

  it('asks for both fields before it tries to sign in', async () => {
    renderLogin();
    await userEvent.click(screen.getByRole('button', { name: 'Login' }));
    expect(screen.getByRole('dialog')).toHaveTextContent('Invalid Username or Password');
    expect(signInWithPassword).not.toHaveBeenCalled();
  });

  it('signs in with the username email and shows "Invalid Username or Password", OK goes back', async () => {
    signInWithPassword.mockResolvedValueOnce({ data: { session: null }, error: { status: 400, message: 'Invalid login credentials' } });
    renderLogin();
    await fillAndSubmit('Maria.Reyes', 'wrong-pass');
    expect(signInWithPassword).toHaveBeenCalledWith({ email: 'maria.reyes@santosbh.local', password: 'wrong-pass' });
    expect(await screen.findByRole('dialog')).toHaveTextContent('Invalid Username or Password');
    await userEvent.click(screen.getByRole('button', { name: 'OK' }));
    expect(screen.queryByText('Invalid Username or Password')).not.toBeInTheDocument();
  });

  it('opens the admin dashboard for the owner and the tenant dashboard for a tenant', async () => {
    signInWithPassword.mockResolvedValue({ data: { session: { user: { id: 'u1' } } }, error: null });
    loadAccount.mockResolvedValueOnce({ role: 'admin', status: 'active' });
    const first = renderLogin();
    await fillAndSubmit('owner', 'secret-pass');
    expect(await screen.findByRole('heading', { name: 'Admin home' })).toBeInTheDocument();
    first.unmount();

    loadAccount.mockResolvedValueOnce({ role: 'tenant', status: 'active' });
    renderLogin();
    await fillAndSubmit('maria.reyes', 'secret-pass');
    expect(await screen.findByRole('heading', { name: 'Tenant home' })).toBeInTheDocument();
  });

  it('refuses an inactive account and signs it out', async () => {
    signInWithPassword.mockResolvedValueOnce({ data: { session: { user: { id: 'u2' } } }, error: null });
    loadAccount.mockResolvedValueOnce({ role: 'tenant', status: 'inactive' });
    renderLogin();
    await fillAndSubmit('tony.bernardo', 'secret-pass');
    expect(await screen.findByRole('dialog')).toHaveTextContent('Account Inactive');
    expect(screen.getByRole('dialog')).toHaveTextContent('This account is inactive');
    expect(signOut).toHaveBeenCalled();
  });

  it('shows and hides the password', async () => {
    renderLogin();
    const input = screen.getByLabelText('Password');
    expect(input).toHaveAttribute('type', 'password');
    await userEvent.click(screen.getByRole('button', { name: 'Show password' }));
    expect(input).toHaveAttribute('type', 'text');
  });
});
