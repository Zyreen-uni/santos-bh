import { useEffect, useState, type FormEvent } from 'react';
import { Navigate, useNavigate } from 'react-router';
import { Check } from 'lucide-react';
import { AuthForm, AuthHeading, SubmitButton } from '@/components/AuthCard';
import { clearLoggedOutNote, hasLoggedOutNote } from '@/components/LogoutConfirm';
import { TextEffect } from '@/components/motion-primitives/text-effect';
import { PasswordField, TextField } from '@/components/ui/Field';
import { MessageDialog } from '@/components/ui/Modal';
import { supabase, loginEmail } from '@/lib/supabase';
import { homeFor, loadAccount, useAuth } from '@/lib/auth';

// Flowchart page 1, left side. Design: C-Login.html (laptop and tablet), C-Phone.html (phone).
// Shown inside the shared Login / Register card (AuthPage).
export default function LoginPage() {
  const { account, loading } = useAuth();
  const navigate = useNavigate();
  // Shown once: the page keeps it for this visit, and a reload or the next visit has no note.
  const [loggedOut] = useState(hasLoggedOutNote);
  useEffect(clearLoggedOutNote, []);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  // Wrong credentials use the flowchart's title; other problems get their own.
  const [error, setError] = useState<{ title: string; message: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!username.trim() || !password) {
      setError({ title: 'Invalid Username or Password', message: 'Enter your username and password.' });
      return;
    }
    setBusy(true);
    const { data, error: authError } = await supabase.auth.signInWithPassword({ email: loginEmail(username.trim()), password });
    if (authError || !data.session) {
      setBusy(false);
      setError(
        authError?.status === 400 || !authError
          ? { title: 'Invalid Username or Password', message: 'Check your username and password, then try again.' }
          : { title: 'Login Failed', message: authError.message },
      );
      return;
    }
    try {
      const acc = await loadAccount(data.session);
      if (acc.status !== 'active') {
        await supabase.auth.signOut();
        setBusy(false);
        setError({ title: 'Account Inactive', message: 'This account is inactive. Ask the owner for help.' });
        return;
      }
      navigate(homeFor(acc), { replace: true });
    } catch (err) {
      await supabase.auth.signOut();
      setBusy(false);
      setError({ title: 'Login Failed', message: err instanceof Error ? err.message : 'Could not open your account. Try again.' });
    }
  }

  // Already signed in: the Login page is not needed (also stops the back button from showing it).
  if (!loading && account && !busy) return <Navigate to={homeFor(account)} replace />;

  return (
    <AuthForm onSubmit={onSubmit}>
      {loggedOut && (
        <div role="status" className="flex items-center gap-2.5 rounded-2xl bg-ok-bg px-4 py-2.5 text-[15px] font-bold text-ok">
          <span aria-hidden className="flex size-[26px] shrink-0 items-center justify-center rounded-full bg-ok text-white">
            <Check size={16} strokeWidth={2.6} />
          </span>
          <TextEffect per="word" preset="fade" as="span">
            Logged Out Successfully
          </TextEffect>
        </div>
      )}
      <AuthHeading title="Welcome back" />
      <TextField compact label="Username" autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} />
      <PasswordField
        compact
        label="Password"
        autoComplete="current-password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />
      <SubmitButton busy={busy}>Login</SubmitButton>
      <MessageDialog open={!!error} onClose={() => setError(null)} tone="bad" title={error?.title ?? ''} message={error?.message} />
    </AuthForm>
  );
}
