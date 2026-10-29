// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createServer, type ViteDevServer } from 'vite';
import { apiDevServer } from '../../vite-plugin-api';

// The dev plugin serves api/*.ts at /api/*, so e2e tests run without the Vercel CLI.
// The first request transforms the function and its imports on demand, which can take a few seconds.
describe('api dev server', { timeout: 30_000 }, () => {
  let server: ViteDevServer;
  let base: string;

  beforeAll(async () => {
    process.env.CRON_SECRET = 'unit-test-secret';
    server = await createServer({ configFile: false, root: process.cwd(), plugins: [apiDevServer()], logLevel: 'silent', server: { port: 0 } });
    await server.listen();
    const address = server.httpServer!.address();
    base = `http://localhost:${typeof address === 'object' && address ? address.port : 0}`;
  });

  afterAll(async () => {
    await server.close();
  });

  it('BE-UT-048 the dev server runs the function for /api/<name>', async () => {
    const res = await fetch(`${base}/api/cron/backup`, { headers: { authorization: 'Bearer wrong' } });
    expect(res.status).toBe(401);
  });

  it('BE-UT-049 the dev server answers 404 for a function that does not exist', async () => {
    const res = await fetch(`${base}/api/nothing-here`);
    expect(res.status).toBe(404);
  });

  it('BE-UT-050 the dev server passes the JSON body and method to the function', async () => {
    const res = await fetch(`${base}/api/admin/accounts`, { method: 'GET' });
    expect(res.status).toBe(405);
    expect(await res.json()).toEqual({ error: 'Use POST' });
  });
});
