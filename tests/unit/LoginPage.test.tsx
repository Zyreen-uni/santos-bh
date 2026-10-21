import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';

const signInWithPassword = vi.fn();
vi.mock('@/lib/supabase', () => ({
  supabase: { auth: { signInWithPassword: (...a: unknown[]) => signInWithPassword(...a) } },
  loginEmail: (u: string) => `${u.toLowerCase()}@santosbh.local`,
}));

const { default: LoginPage } = await import('@/pages/LoginPage');

function renderLogin() {
  return render(
    <MemoryRouter>
      <LoginPage />
    </MemoryRouter>,
  );
}

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
    expect(screen.getByRole('alert')).toHaveTextContent('Please enter your username and password');
    expect(signInWithPassword).not.toHaveBeenCalled();
  });

  it('signs in with the username email', async () => {
    signInWithPassword.mockResolvedValueOnce({ error: { message: 'Invalid login credentials' } });
    renderLogin();
    await userEvent.type(screen.getByLabelText('Username'), 'Maria.Reyes');
    await userEvent.type(screen.getByLabelText('Password'), 'wrong-pass');
    await userEvent.click(screen.getByRole('button', { name: 'Login' }));
    expect(signInWithPassword).toHaveBeenCalledWith({ email: 'maria.reyes@santosbh.local', password: 'wrong-pass' });
    expect(await screen.findByRole('alert')).toHaveTextContent('Wrong username or password');
  });

  it('shows and hides the password', async () => {
    renderLogin();
    const input = screen.getByLabelText('Password');
    expect(input).toHaveAttribute('type', 'password');
    await userEvent.click(screen.getByRole('button', { name: 'Show password' }));
    expect(input).toHaveAttribute('type', 'text');
  });
});
