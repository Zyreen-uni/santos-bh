import { execSync } from 'node:child_process';

// Every e2e run starts from the same sample data (docs/sample-data.md).
export default function globalSetup() {
  execSync('node scripts/seed.mjs', { stdio: 'inherit' });
}
