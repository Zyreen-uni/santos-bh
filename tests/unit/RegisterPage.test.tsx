import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';

const signUp = vi.fn();
const signOut = vi.fn();
vi.mock('@/lib/supabase', () => ({
  supabase: { auth: { signUp: (...a: unknown[]) => signUp(...a), signOut: () => signOut() } },
  loginEmail: (u: string) => `${u.toLowerCase()}@santosbh.local`,
}));

const { default: RegisterPage } = await import('@/pages/RegisterPage');

function renderRegister() {
  return render(
    <MemoryRouter initialEntries={['/register']}>
      <Routes>
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/login" element={<h1>Login page</h1>} />
      </Routes>
    </MemoryRouter>,
  );
}

// Click each field and paste its value: typing ~50 keys one by one could pass the 5 s test limit when the
// whole suite runs in parallel.
async function fill(values: Record<string, string>) {
  for (const [label, value] of Object.entries(values)) {
    if (!value) continue;
    await userEvent.click(screen.getByLabelText(label));
    await userEvent.paste(value);
  }
}

const GOOD = {
  'Full Name': 'Nina Cruz', Username: 'nina.cruz', 'Contact #': '0917 000 1111',
  Email: '', Password: 'password1', 'Confirm Password': 'password1',
};

beforeEach(() => vi.clearAllMocks());

describe('RegisterPage', () => {
  it('has the fields of C-Register in order', () => {
    renderRegister();
    const labels = screen.getAllByText(/^(Full Name|Username|Contact #|Email|Password|Confirm Password)$/).map((l) => l.textContent);
    expect(labels).toEqual(['Full Name', 'Username', 'Contact #', 'Email', 'Password', 'Confirm Password']);
  });

  it('shows "Invalid Input" when the passwords do not match, and OK goes back to the form', async () => {
    renderRegister();
    await fill({ ...GOOD, 'Confirm Password': 'password2' });
    await userEvent.click(screen.getByRole('button', { name: 'Register' }));
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveTextContent('Invalid Input');
    expect(dialog).toHaveTextContent('Passwords do not match.');
    expect(signUp).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'OK' }));
    expect(screen.getByLabelText('Full Name')).toHaveValue('Nina Cruz');
  });

  it('saves the account, signs out, shows "Registration Successful" and OK opens Login', async () => {
    signUp.mockResolvedValueOnce({ error: null });
    renderRegister();
    await fill(GOOD);
    await userEvent.click(screen.getByRole('button', { name: 'Register' }));
    expect(signUp).toHaveBeenCalledWith({
      email: 'nina.cruz@santosbh.local',
      password: 'password1',
      options: { data: { full_name: 'Nina Cruz', contact_number: '0917 000 1111', email: null } },
    });
    expect(signOut).toHaveBeenCalled();
    expect(await screen.findByRole('dialog')).toHaveTextContent('Registration Successful');
    await userEvent.click(screen.getByRole('button', { name: 'OK' }));
    expect(screen.getByRole('heading', { name: 'Login page' })).toBeInTheDocument();
  });

  it('says when the username is taken', async () => {
    signUp.mockResolvedValueOnce({ error: { message: 'User already registered' } });
    renderRegister();
    await fill(GOOD);
    await userEvent.click(screen.getByRole('button', { name: 'Register' }));
    expect(await screen.findByRole('dialog')).toHaveTextContent('That username is taken');
  });
});
