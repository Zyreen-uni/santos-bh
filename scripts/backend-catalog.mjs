// M21 Part C: builds tests/catalog/backend.json, one entry per back-end test:
//   id, level (Unit or Integration), requirement, module, description, input, expected, file.
// Run: npm run catalog:backend. tests/unit/backendCatalog.test.ts fails when the file and the tests disagree.
import { readdirSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..');
const load = (p) => import(pathToFileURL(path.join(root, p)).href);

const WORDS = { owner: 'The owner', manager: 'The tenant manager (Anna)', tenant: 'The tenant (Ben, on his own rows)', other: 'Another tenant (Carl, on Ben\'s rows)', anon: 'A signed-out visitor' };
const OP_WORDS = { select: 'reads', insert: 'adds a row to', update: 'changes', delete: 'deletes' };

// Every back-end test that exists in the code, with the fields the code itself carries.
export async function collectBackendTests() {
  const { suite } = await load('tests/db/suite.mjs');
  const { extraTests } = await load('tests/db/extra.mjs');
  const { REFERENCE_IDS } = await load('tests/db/reference-ids.mjs');
  const { backendCases } = await load('tests/db/backend.mjs');
  const { cells, cellTitle, controls, controlTitle } = await load('tests/db/rls.mjs');
  const { apiCases } = await load('tests/db/api.mjs');
  const s = suite({ query: async () => ({ rows: [] }) });
  const tests = [];

  for (const [title, id] of Object.entries(REFERENCE_IDS)) tests.push({ id, level: 'Integration', description: title, file: 'tests/db/suite.mjs' });
  for (const title of Object.keys(extraTests({}, s.helpers))) {
    const [, id, rest] = title.match(/^(BE-IT-\d{3}) (.*)$/) ?? [];
    tests.push({ id, level: 'Integration', description: rest, file: 'tests/db/extra.mjs' });
  }
  for (const c of backendCases({}, s.helpers)) {
    tests.push({ id: c.id, level: 'Integration', description: c.title, file: 'tests/db/backend.mjs', requirement: c.req, module: c.module, input: c.input, expected: c.expected });
  }
  for (const c of cells()) {
    const what = c.kind === 'table' ? `the ${c.thing.name} table` : `the ${c.thing.name} storage bucket`;
    tests.push({
      id: c.id, level: 'Integration', description: cellTitle(c).replace(/^BE-IT-\d{3} /, ''), file: 'tests/db/rls.mjs', requirement: 'NFR-004', module: 'M21',
      input: `${WORDS[c.caller]} ${OP_WORDS[c.op]} ${what} (${c.thing.target}).`,
      expected: `${c.expected}${c.expected === 'Refused' ? ' (an error or 0 rows)' : ''}. ${c.thing.why}`,
      matrix: { thing: c.kind === 'table' ? c.thing.name : `storage: ${c.thing.name}`, op: c.op, caller: c.caller, expected: c.expected },
    });
  }
  for (const c of controls()) {
    const what = c.kind === 'table' ? `the ${c.thing.name}` : `the storage ${c.thing.name}`;
    tests.push({
      id: c.id, level: 'Integration', description: controlTitle(c).replace(/^BE-IT-\d{3} /, ''), file: 'tests/db/rls.mjs', requirement: 'NFR-004', module: 'M21',
      input: `Run the matrix's ${c.op} statement on ${what} as the database owner (row level security does not apply).`,
      expected: 'It works, so every "Refused" in the matrix comes from a policy or a trigger, not from a broken statement.',
    });
  }
  for (const c of apiCases()) tests.push({ id: c.id, level: 'Integration', description: c.title, file: 'tests/db/api.mjs', requirement: c.req, module: c.module, input: c.input, expected: c.expected });

  for (const f of readdirSync(path.join(root, 'tests/unit')).filter((n) => n.endsWith('.test.ts') || n.endsWith('.test.tsx'))) {
    const src = readFileSync(path.join(root, 'tests/unit', f), 'utf8');
    for (const m of src.matchAll(/\bit\((['"])(BE-UT-\d{3}) ((?:\\.|(?!\1).)*)\1/g)) {
      tests.push({ id: m[2], level: 'Unit', description: m[3].replace(/\\'/g, "'"), file: `tests/unit/${f}` });
    }
  }
  return tests;
}

export async function buildCatalog() {
  const { META } = await load('tests/catalog/meta.mjs');
  const tests = await collectBackendTests();
  return tests
    .map((t) => {
      const m = META[t.id];
      return {
        id: t.id, level: t.level,
        requirement: t.requirement ?? m?.[0] ?? '', module: t.module ?? m?.[1] ?? '',
        description: t.description, input: t.input ?? m?.[2] ?? '', expected: t.expected ?? m?.[3] ?? '',
        file: t.file, ...(t.matrix ? { matrix: t.matrix } : {}),
      };
    })
    .sort((a, b) => (a.level === b.level ? a.id.localeCompare(b.id) : a.level === 'Unit' ? -1 : 1));
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.join(root, 'scripts', 'backend-catalog.mjs')) {
  const catalog = await buildCatalog();
  const missing = catalog.filter((e) => !e.requirement || !e.module || !e.input || !e.expected);
  if (missing.length) throw new Error(`no catalog fields for: ${missing.map((e) => e.id).join(', ')}`);
  mkdirSync(path.join(root, 'tests/catalog'), { recursive: true });
  writeFileSync(path.join(root, 'tests/catalog/backend.json'), `${JSON.stringify(catalog, null, 1)}\n`);
  console.log(`tests/catalog/backend.json: ${catalog.filter((e) => e.level === 'Unit').length} unit, ${catalog.filter((e) => e.level === 'Integration').length} integration`);
}
