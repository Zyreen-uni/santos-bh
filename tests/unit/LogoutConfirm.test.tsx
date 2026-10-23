import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router';

// M15 Logout (FR-016). Flowchart page 15, design Out-A.

const signOut = vi.fn();
vi.mock('@/lib/supabase', () => ({ supabase: { auth: { signOut: () => signOut() } }, loginEmail: (u: string) => u }));
vi.mock('@/lib/auth', async (orig) => ({
  ...(await orig<typeof import('@/lib/auth')>()),
  useAuth: () => ({ session: null, account: null, loading: false, signOut }),
}));

const { LogoutConfirm } = await import('@/components/LogoutConfirm');
const { default: LoginPage } = await import('@/pages/LoginPage');

function Page() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <h1>Rooms</h1>
      <button type="button" onClick={() => setOpen(true)}>
        Logout
      </button>
      <LogoutConfirm open={open} onCancel={() => setOpen(false)} />
    </>
  );
}

function renderApp() {
  return render(
    <MemoryRouter initialEntries={['/login', '/admin/rooms']} initialIndex={1}>
      <Routes>
        <Route path="/admin/rooms" element={<Page />} />
        <Route path="/login" element={<LoginPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  signOut.mockResolvedValue(undefined);
  sessionStorage.clear();
});

describe('Logout', () => {
  it('asks first, and Cancel keeps the session and the page', async () => {
    renderApp();
    await userEvent.click(screen.getByRole('button', { name: 'Logout' }));
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent('Are you sure you want to log out?');
    expect(dialog).toHaveTextContent('You will need your username and password to log back in.');
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(signOut).not.toHaveBeenCalled();
    expect(screen.getByRole('heading', { name: 'Rooms' })).toBeInTheDocument();
  });

  it('Log Out signs out and opens Login with "Logged Out Successfully"', async () => {
    renderApp();
    await userEvent.click(screen.getByRole('button', { name: 'Logout' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Log Out' }));
    expect(signOut).toHaveBeenCalledOnce();
    expect(await screen.findByRole('heading', { name: 'Welcome back' })).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Logged Out Successfully');
  });

  it('a failed sign-out says "Could Not Log Out", keeps the page and leaves no note for Login', async () => {
    signOut.mockRejectedValueOnce(new Error('Network error.'));
    renderApp();
    await userEvent.click(screen.getByRole('button', { name: 'Logout' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Log Out' }));
    const problem = await screen.findByRole('dialog', { name: 'Could Not Log Out' });
    expect(problem).toHaveTextContent('You are still logged in. Network error.');
    await userEvent.click(screen.getByRole('button', { name: 'OK' }));
    expect(screen.getByRole('heading', { name: 'Rooms' })).toBeInTheDocument();
    expect(sessionStorage.getItem('santos-logged-out')).toBeNull();
    // The popup works again.
    await userEvent.click(screen.getByRole('button', { name: 'Logout' }));
    expect(await screen.findByRole('button', { name: 'Log Out' })).toBeEnabled();
  });

  it('Login without a logout shows no note', () => {
    render(
      <MemoryRouter initialEntries={['/login']}>
        <LoginPage />
      </MemoryRouter>,
    );
    expect(screen.queryByText('Logged Out Successfully')).toBeNull();
  });
});
