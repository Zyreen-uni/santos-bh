import { useState, type FormEvent } from 'react';
import { Navigate, useNavigate } from 'react-router';
import { AuthCard, SubmitButton } from '@/components/AuthCard';
import { PasswordField, TextField } from '@/components/ui/Field';
import { MessageDialog } from '@/components/ui/Modal';
import { supabase, loginEmail } from '@/lib/supabase';
import { homeFor, loadAccount, useAuth } from '@/lib/auth';

// Flowchart page 1, left side. Design: C-Login.html (laptop and tablet), C-Phone.html (phone).
export default function LoginPage() {
  const { account, loading } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!username.trim() || !password) {
      setError('Enter your username and password.');
      return;
    }
    setBusy(true);
    const { data, error: authError } = await supabase.auth.signInWithPassword({ email: loginEmail(username.trim()), password });
    if (authError || !data.session) {
      setBusy(false);
      setError(authError?.status === 400 || !authError ? 'Check your username and password, then try again.' : authError.message);
      return;
    }
    try {
      const acc = await loadAccount(data.session);
      if (acc.status !== 'active') {
        await supabase.auth.signOut();
        setBusy(false);
        setError('This account is inactive. Ask the owner for help.');
        return;
      }
      navigate(homeFor(acc), { replace: true });
    } catch (err) {
      await supabase.auth.signOut();
      setBusy(false);
      setError(err instanceof Error ? err.message : 'Could not open your account. Try again.');
    }
  }

  // Already signed in: the Login page is not needed (also stops the back button from showing it).
  if (!loading && account && !busy) return <Navigate to={homeFor(account)} replace />;

  return (
    <AuthCard active="login" onSubmit={onSubmit}>
      <h1 className="m-0 text-[26px] font-extrabold text-navy max-md:text-2xl">Welcome back</h1>
      <TextField label="Username" autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} />
      <PasswordField
        label="Password"
        autoComplete="current-password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />
      <SubmitButton busy={busy}>Login</SubmitButton>
      <MessageDialog
        open={!!error}
        onClose={() => setError('')}
        tone="bad"
        title="Invalid Username or Password"
        message={error}
      />
    </AuthCard>
  );
}
