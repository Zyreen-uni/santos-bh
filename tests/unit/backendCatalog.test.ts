// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
// @ts-expect-error: a plain .mjs script with no type declarations
import { buildCatalog, collectBackendTests } from '../../scripts/backend-catalog.mjs';

// M21 Part C: tests/catalog/backend.json and the back-end tests stay in step. Fails when a test has no catalog
// entry, an entry has no test, an entry is out of date, or a field is empty. Rebuild with: npm run catalog:backend
type Entry = { id: string; level: string; requirement: string; module: string; description: string; input: string; expected: string };
const catalog = JSON.parse(readFileSync('tests/catalog/backend.json', 'utf8')) as Entry[];

describe('back-end test catalog', { timeout: 30_000 }, () => {
  it('has one entry per back-end test, and no entry without a test', async () => {
    const tests = (await collectBackendTests()) as { id: string }[];
    const testIds = tests.map((t) => t.id);
    const entryIds = catalog.map((e) => e.id);
    expect(new Set(testIds).size).toBe(testIds.length); // no ID used twice
    expect(testIds.filter((id) => !entryIds.includes(id))).toEqual([]);
    expect(entryIds.filter((id) => !testIds.includes(id))).toEqual([]);
  });

  it('gives every entry a stable ID, a level, a requirement, a module, a description, an input and an expected result', () => {
    for (const e of catalog) {
      expect(e.id, e.id).toMatch(e.level === 'Unit' ? /^BE-UT-\d{3}$/ : /^BE-IT-\d{3}$/);
      expect(e.requirement, e.id).toMatch(/^(FR|NFR)-\d{3}$/);
      for (const field of ['module', 'description', 'input', 'expected'] as const) expect(e[field].trim(), `${e.id} ${field}`).not.toBe('');
    }
  });

  it('matches what the tests say now (rebuild it after changing a test)', async () => {
    expect(catalog).toEqual(await buildCatalog());
  });

  it('names only requirements that exist in docs/requirements.md', () => {
    const known = new Set([...readFileSync('docs/requirements.md', 'utf8').matchAll(/^- ((?:FR|NFR)-\d{3})\b/gm)].map((m) => m[1]));
    expect([...new Set(catalog.map((e) => e.requirement))].filter((r) => !known.has(r))).toEqual([]);
  });
});
