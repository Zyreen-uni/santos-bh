import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { AuthCard, SubmitButton } from '@/components/AuthCard';
import { PasswordField, TextField } from '@/components/ui/Field';
import { MessageDialog } from '@/components/ui/Modal';
import { supabase, loginEmail } from '@/lib/supabase';
import { checkRegister, type RegisterInput } from '@/lib/validation';

const EMPTY: RegisterInput = { fullName: '', username: '', contactNumber: '', email: '', password: '', confirmPassword: '' };

// Flowchart page 1, right side. Design: C-Register.html (laptop and tablet), C-Phone.html (phone).
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
    <AuthCard active="register" onSubmit={onSubmit} wide>
      <div className="flex flex-col gap-1">
        <h1 className="m-0 text-[26px] font-extrabold text-navy max-md:text-2xl">Create your tenant account</h1>
        <p className="m-0 text-[15px] text-muted">The owner assigns your room after you register.</p>
      </div>
      <div className="grid grid-cols-2 gap-4 max-md:grid-cols-1">
        <TextField label="Full Name" className="col-span-2 max-md:col-span-1" autoComplete="name" value={form.fullName} onChange={set('fullName')} />
        <TextField label="Username" autoComplete="username" autoCapitalize="none" value={form.username} onChange={set('username')} />
        <TextField label="Contact #" type="tel" autoComplete="tel" value={form.contactNumber} onChange={set('contactNumber')} />
        <TextField label="Email" className="col-span-2 max-md:col-span-1" type="email" autoComplete="email" value={form.email} onChange={set('email')} />
        <PasswordField label="Password" autoComplete="new-password" value={form.password} onChange={set('password')} />
        <PasswordField label="Confirm Password" autoComplete="new-password" value={form.confirmPassword} onChange={set('confirmPassword')} />
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
    </AuthCard>
  );
}
