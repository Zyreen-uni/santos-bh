// Dev only: serves the Vercel functions in api/ at /api/*, so the app and the e2e tests
// work with `vite` alone, without the Vercel CLI. /api/admin/accounts loads api/admin/accounts.ts.
import { existsSync } from 'node:fs';
import path from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Plugin, ViteDevServer } from 'vite';
import type { ApiHandler, ApiRequest, ApiResponse } from './lib/http';

async function readBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  const text = Buffer.concat(chunks).toString('utf8');
  if (!text) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function wrapResponse(res: ServerResponse): ApiResponse {
  const api: ApiResponse = {
    status(code) {
      res.statusCode = code;
      return api;
    },
    json(body) {
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify(body));
    },
    end() {
      res.end();
    },
  };
  return api;
}

export function apiDevServer(): Plugin {
  return {
    name: 'santos-api-dev-server',
    apply: 'serve',
    configureServer(server: ViteDevServer) {
      server.middlewares.use(async (req, res, next) => {
        const url = new URL(req.url || '/', 'http://localhost');
        if (!url.pathname.startsWith('/api/')) return next();
        const name = url.pathname.slice('/api/'.length).replace(/\/$/, '');
        const file = path.join(server.config.root, 'api', `${name}.ts`);
        if (!/^[a-z0-9/-]+$/.test(name) || !existsSync(file)) {
          res.statusCode = 404;
          res.end('Not found');
          return;
        }
        try {
          const mod = (await server.ssrLoadModule(file)) as { default: ApiHandler };
          const apiReq: ApiRequest = { method: req.method, headers: req.headers, body: await readBody(req) };
          await mod.default(apiReq, wrapResponse(res));
        } catch (e) {
          res.statusCode = 500;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }));
        }
      });
    },
  };
}
