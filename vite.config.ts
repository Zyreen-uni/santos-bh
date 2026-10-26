import path from 'node:path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { apiDevServer } from './vite-plugin-api';

export default defineConfig(({ mode }) => {
  // Server-only variables (no VITE_ prefix) go to process.env for the api/ functions in dev.
  // Vite only sends VITE_ variables to the browser bundle.
  const env = loadEnv(mode, process.cwd(), '');
  for (const key of ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'CRON_SECRET']) {
    if (env[key] && !process.env[key]) process.env[key] = env[key];
  }
  return {
    plugins: [react(), tailwindcss(), apiDevServer()],
    resolve: { alias: { '@': path.resolve(import.meta.dirname, 'src') } },
    server: { port: 5417, strictPort: true },
  };
});
