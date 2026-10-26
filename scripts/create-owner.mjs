// npm run create-owner: makes the owner (admin) login directly, so nobody has to use the Register page.
// The service role key is read from your shell only; it is never saved to a file.
//   Cloud:  set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the shell, then run npm run create-owner
//   Local:  npm run create-owner -- --local
// Options: --username owner  --name "Brian Santos". The password is asked for and not shown on screen.
// Run it twice (with two usernames) to make one login for the owner and one for you as the developer.
import { createClient } from '@supabase/supabase-js';
import { pathToFileURL } from 'node:url';

export const USERNAME = /^[a-z0-9._]{4,30}$/;
export const MIN_PASSWORD = 8;
export const loginEmail = (username) => `${username.toLowerCase()}@santosbh.local`;

// Creates the login, makes its profile the admin and removes the tenant record the sign-up trigger made.
// If a later step fails, the new login is deleted again, so a half-made account is never left behind.
export async function createOwner(client, { username, fullName, password }) {
  username = (username || '').trim().toLowerCase();
  if (!USERNAME.test(username)) throw new Error('Username must be 4 to 30 letters, numbers, dots or underscores.');
  if (!password || password.length < MIN_PASSWORD) throw new Error(`Password must have at least ${MIN_PASSWORD} characters.`);

  const { data, error } = await client.auth.admin.createUser({
    email: loginEmail(username), password, email_confirm: true, user_metadata: { full_name: fullName || '' },
  });
  if (error) throw new Error(error.status === 422 ? `The username "${username}" is taken.` : error.message, { cause: error.cause });
  const id = data.user.id;
  try {
    const role = await client.from('profiles').update({ role: 'admin', status: 'active' }).eq('id', id).select('id');
    if (role.error) throw new Error(role.error.message);
    if (!role.data?.length) throw new Error('The profile for the new login was not found.');
    const tenant = await client.from('tenants').delete().eq('user_id', id);
    if (tenant.error) throw new Error(tenant.error.message);
  } catch (e) {
    await client.auth.admin.deleteUser(id);
    throw e;
  }
  return { id, username };
}

function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : undefined;
}

// Asks for a line without echoing it when run in a terminal. Piped input is read as is.
function askHidden(question) {
  return new Promise((resolve) => {
    const { stdin, stdout } = process;
    stdout.write(question);
    if (!stdin.isTTY) {
      let buf = '';
      stdin.setEncoding('utf8');
      const onData = (chunk) => {
        buf += chunk;
        const nl = buf.indexOf('\n');
        if (nl > -1) { stdin.off('data', onData); stdin.pause(); stdout.write('\n'); resolve(buf.slice(0, nl).replace(/\r$/, '')); }
      };
      stdin.on('data', onData);
      return;
    }
    let value = '';
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding('utf8');
    const onData = (ch) => {
      if (ch === '\r' || ch === '\n') {
        stdin.setRawMode(false); stdin.pause(); stdin.off('data', onData); stdout.write('\n'); resolve(value);
      } else if (ch === '\u0003') {
        stdout.write('\n'); process.exit(1);
      } else if (ch === '\u0008' || ch === '\u007f') {
        value = value.slice(0, -1);
      } else {
        value += ch;
      }
    };
    stdin.on('data', onData);
  });
}

async function main() {
  let url = process.env.SUPABASE_URL;
  let key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (process.argv.includes('--local')) {
    const { localSupabase } = await import('./local-env.mjs');
    ({ apiUrl: url, serviceRoleKey: key } = localSupabase());
  }
  if (!url || !key) {
    console.error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in this shell first (or use --local).');
    process.exit(1);
  }
  const username = arg('username') || 'owner';
  const fullName = arg('name') || 'Brian Santos';
  console.log(`Making the owner login "${username}" (${fullName}) on ${url}`);
  const password = await askHidden('Password: ');
  if (process.stdin.isTTY && (await askHidden('Type the password again: ')) !== password) {
    console.error('Passwords do not match.');
    process.exit(1);
  }
  const client = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
  await createOwner(client, { username, fullName, password });
  console.log(`Done. Log in with the username "${username}" and that password.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  // "fetch failed" alone says nothing; the cause names the network or key problem.
  main().catch((e) => { console.error(e.message, e.cause ? `(${e.cause.code || ''} ${e.cause.message || e.cause})` : ''); process.exit(1); });
}
