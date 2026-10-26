import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { AuthForm, AuthHeading, SubmitButton } from '@/components/AuthCard';
import { PasswordField, TextField } from '@/components/ui/Field';
import { MessageDialog } from '@/components/ui/Modal';
import { supabase, loginEmail } from '@/lib/supabase';
import { checkRegister, type RegisterInput } from '@/lib/validation';

const EMPTY: RegisterInput = { fullName: '', username: '', contactNumber: '', email: '', password: '', confirmPassword: '' };

// Flowchart page 1, right side. Design: C-Register.html (laptop and tablet), C-Phone.html (phone).
// Shown inside the shared Login / Register card (AuthPage). Three rows of two fields on a laptop and a tablet, so the
// card fits the screen without scrolling; on a phone the name and the email take a full row.
// Every new account is a tenant: the database trigger sets the role, whatever the form sends.
export default function RegisterPage() {
  const navigate = useNavigate();
  const [form, setForm] = useState(EMPTY);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  const set = (key: keyof RegisterInput) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [key]: e.target.value }));

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const problem = checkRegister(form);
    if (problem) {
      setError(problem);
      return;
    }
    setBusy(true);
    const { error: signUpError } = await supabase.auth.signUp({
      email: loginEmail(form.username.trim()),
      password: form.password,
      options: {
        data: { full_name: form.fullName.trim(), contact_number: form.contactNumber.trim(), email: form.email.trim() || null },
      },
    });
    if (signUpError) {
      setBusy(false);
      setError(/already|exists|registered/i.test(signUpError.message) ? 'That username is taken. Choose another one.' : signUpError.message);
      return;
    }
    // Sign-up signs the new tenant in. The flowchart sends them to Login instead.
    await supabase.auth.signOut();
    setBusy(false);
    setDone(true);
  }

  return (
    <AuthForm onSubmit={onSubmit}>
      <AuthHeading title="Create your tenant account" subtitle="The owner assigns your room after you register." />
      <div className="grid grid-cols-2 gap-x-3 gap-y-3 short:gap-y-2">
        <TextField compact label="Full Name" className="max-md:col-span-2" autoComplete="name" value={form.fullName} onChange={set('fullName')} />
        <TextField compact label="Username" autoComplete="username" autoCapitalize="none" value={form.username} onChange={set('username')} />
        <TextField compact label="Contact #" type="tel" autoComplete="tel" value={form.contactNumber} onChange={set('contactNumber')} />
        <TextField compact label="Email" className="max-md:col-span-2" type="email" autoComplete="email" value={form.email} onChange={set('email')} />
        <PasswordField compact label="Password" autoComplete="new-password" value={form.password} onChange={set('password')} />
        <PasswordField compact label="Confirm Password" autoComplete="new-password" value={form.confirmPassword} onChange={set('confirmPassword')} />
      </div>
      <SubmitButton busy={busy}>Register</SubmitButton>
      <MessageDialog open={!!error} onClose={() => setError('')} tone="bad" title="Invalid Input" message={error} />
      <MessageDialog
        open={done}
        onClose={() => navigate('/login', { replace: true })}
        tone="ok"
        title="Registration Successful"
        message="You can now log in with your username and password."
      />
    </AuthForm>
  );
}
