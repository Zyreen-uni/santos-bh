// Account helpers. Supabase Auth needs an email, so each username maps to
// "<username>@santosbh.local". Users type only the username and password on the login page:
//   supabase.auth.signInWithPassword({ email: loginEmail(username), password })
export const USERNAME = /^[a-z0-9._]{4,30}$/;
export const loginEmail = (username: string) => `${username.toLowerCase()}@santosbh.local`;
