// @vitest-environment node
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

// M17 Final pass, security review: the server secrets never reach browser code (CLAUDE.md, Hard rules).

const SECRETS = ['SERVICE_ROLE', 'service_role', 'CRON_SECRET', 'BLOB_READ_WRITE_TOKEN', 'SUPABASE_SECRET'];

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = path.join(dir, name);
    return statSync(p).isDirectory() ? files(p) : [p];
  });
}

describe('secrets stay on the server', () => {
  it('no file in src/ names a server secret', () => {
    const hits = files('src').flatMap((f) => {
      const text = readFileSync(f, 'utf8');
      return SECRETS.filter((s) => text.includes(s)).map((s) => `${f}: ${s}`);
    });
    expect(hits).toEqual([]);
  });

  it('no VITE_ variable (sent to the browser) holds a secret', () => {
    const vite = readdirSync('.')
      .filter((f) => f.startsWith('.env'))
      .flatMap((f) => readFileSync(f, 'utf8').split(/\r?\n/))
      .filter((l) => l.startsWith('VITE_'))
      .map((l) => l.slice(0, l.indexOf('=')));
    for (const name of vite) expect(name).toMatch(/^VITE_SUPABASE_(URL|ANON_KEY)$/);
  });

  it('the server secrets are read only in api/ and lib/', () => {
    for (const dir of ['api', 'lib']) {
      for (const f of files(dir)) expect(readFileSync(f, 'utf8')).not.toMatch(/VITE_/);
    }
  });
});
