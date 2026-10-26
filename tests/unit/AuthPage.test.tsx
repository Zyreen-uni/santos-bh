import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';

vi.mock('@/lib/supabase', () => ({ supabase: { auth: {} }, loginEmail: (u: string) => u }));
vi.mock('@/lib/auth', async (orig) => ({
  ...(await orig<typeof import('@/lib/auth')>()),
  useAuth: () => ({ session: null, account: null, loading: false, signOut: vi.fn() }),
}));

// jsdom has no ResizeObserver; the card only uses it to animate its height.
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
} as unknown as typeof ResizeObserver;

const { default: AuthPage } = await import('@/pages/AuthPage');

function at(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route element={<AuthPage />}>
          <Route path="/login" />
          <Route path="/register" />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

// One card for Login and Register: the address picks the tab, and the card stays when the tab changes.
describe('AuthPage', () => {
  it('opens the tab the address names', () => {
    at('/register');
    expect(screen.getByRole('heading', { name: 'Create your tenant account' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Register' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Login' })).not.toHaveAttribute('aria-current');
  });

  it('switches the form inside the same card', async () => {
    at('/login');
    const card = screen.getByRole('navigation', { name: 'Account' }).parentElement;
    expect(screen.getByRole('heading', { name: 'Welcome back' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('link', { name: 'Register' }));
    expect(await screen.findByRole('heading', { name: 'Create your tenant account' })).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Account' }).parentElement).toBe(card);
    expect(screen.getByRole('link', { name: 'Register' })).toHaveAttribute('aria-current', 'page');
  });

  it('lays Register out in pairs so the card stays short', () => {
    at('/register');
    for (const label of ['Full Name', 'Username', 'Contact #', 'Email', 'Password', 'Confirm Password']) {
      expect(screen.getByLabelText(label, { exact: true })).toBeInTheDocument();
    }
    expect(screen.getByLabelText('Full Name').closest('.grid')).toHaveClass('grid-cols-2');
  });
});
