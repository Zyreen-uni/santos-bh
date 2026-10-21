import { useState, type FormEvent } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { supabase, loginEmail } from '@/lib/supabase';

// Design: docs/reference/ui/C-Login.html (laptop and tablet), C-Phone.html (phone).
export default function LoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    if (!username.trim() || !password) {
      setError('Please enter your username and password');
      return;
    }
    setBusy(true);
    const { error: authError } = await supabase.auth.signInWithPassword({ email: loginEmail(username.trim()), password });
    setBusy(false);
    if (authError) setError('Wrong username or password');
  }

  return (
    <main className="flex min-h-svh items-center justify-center bg-page px-4 py-10">
      <form
        onSubmit={onSubmit}
        noValidate
        className="flex w-full max-w-[440px] flex-col gap-5 rounded-card-lg bg-card px-6 py-10 sm:px-9"
      >
        <img src="/santos-logo.png" alt="Santos Boarding House" className="h-[100px] w-auto self-center" />
        <nav aria-label="Account" className="grid grid-cols-2 rounded-full bg-page p-[5px]">
          <a
            href="/login"
            aria-current="page"
            className="rounded-full bg-navy p-3 text-center text-[15px] font-bold text-white no-underline"
          >
            Login
          </a>
          <a href="/register" className="rounded-full p-3 text-center text-[15px] font-semibold text-muted no-underline">
            Register
          </a>
        </nav>
        <h1 className="m-0 text-[26px] font-extrabold text-navy">Welcome back</h1>
        <div className="flex flex-col gap-2">
          <label htmlFor="login-username" className="text-sm font-semibold text-label">
            Username
          </label>
          <input
            id="login-username"
            type="text"
            autoComplete="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className="rounded-field border border-line-strong bg-soft px-4 py-3.5 text-base text-ink"
          />
        </div>
        <div className="flex flex-col gap-2">
          <label htmlFor="login-password" className="text-sm font-semibold text-label">
            Password
          </label>
          <div className="flex overflow-hidden rounded-field border border-line-strong bg-soft">
            <input
              id="login-password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="min-w-0 grow border-0 bg-transparent px-4 py-3.5 text-base text-ink"
            />
            <button
              type="button"
              aria-label={showPassword ? 'Hide password' : 'Show password'}
              onClick={() => setShowPassword((s) => !s)}
              className="flex w-[50px] cursor-pointer items-center justify-center border-0 bg-transparent text-muted"
            >
              {showPassword ? <EyeOff size={20} aria-hidden /> : <Eye size={20} aria-hidden />}
            </button>
          </div>
        </div>
        {error && (
          <p role="alert" className="m-0 rounded-field bg-bad-bg px-4 py-3 text-sm font-semibold text-bad">
            {error}
          </p>
        )}
        <button
          type="submit"
          disabled={busy}
          className="cursor-pointer rounded-full border-0 bg-blue p-4 text-[17px] font-bold text-white hover:bg-blue-hover disabled:opacity-70"
        >
          Login
        </button>
      </form>
    </main>
  );
}
