// M21 Part D: builds reports/Backend-Test-Report.docx for Quality Assurance.
//   npm run report:backend   runs the unit tests (all of them, so reports/vitest.json keeps the full count) and the
//                            database tests, then builds the report. It exits 1 when any back-end test failed.
//   node scripts/backend-report.mjs   builds the report from the last run only.
// Every Actual and Status cell comes from reports/vitest.json and reports/db.json; the test details come from
// tests/catalog/backend.json. Nothing in the results is typed by hand.
import { execSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import JSZip from 'jszip';
import {
  AlignmentType, BorderStyle, Document, Footer, HeadingLevel, Packer, PageNumber, PageOrientation, Paragraph, Table, TableCell,
  TableRow, TextRun, WidthType, ShadingType,
} from 'docx';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..');
const read = (p) => JSON.parse(readFileSync(path.join(root, p), 'utf8'));
const sh = (cmd) => { try { return execSync(cmd, { cwd: root, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); } catch { return 'not available'; } };

// ---------------------------------------------------------------- run the tests (npm run report:backend)
if (process.argv.includes('--run')) {
  for (const script of ['test:unit', 'test:db']) {
    console.log(`> npm run ${script}`);
    spawnSync(`npm run ${script}`, { cwd: root, stdio: 'inherit', shell: true });
  }
}

// ---------------------------------------------------------------- results of the last run
const catalog = read('tests/catalog/backend.json');
const vitest = read('reports/vitest.json');
const db = read('reports/db.json');
const results = new Map();
for (const file of vitest.testResults ?? []) {
  for (const t of file.assertionResults ?? []) {
    const id = t.title.match(/^(BE-UT-\d{3}) /)?.[1];
    if (id) results.set(id, { status: t.status === 'passed' ? 'passed' : 'failed', ms: Math.round(t.duration ?? 0), error: (t.failureMessages ?? []).join(' ').split('\n')[0] || null });
  }
}
for (const t of db.tests ?? []) if (t.id) results.set(t.id, { status: t.status, ms: t.durationMs, error: t.error });
const rows = catalog.map((e) => ({ ...e, result: results.get(e.id) ?? { status: 'not run', ms: 0, error: 'No result in the last run.' } }));
const unit = rows.filter((r) => r.level === 'Unit');
const integration = rows.filter((r) => r.level === 'Integration');
const sum = (list) => ({
  total: list.length, passed: list.filter((r) => r.result.status === 'passed').length,
  failed: list.filter((r) => r.result.status !== 'passed').length, ms: list.reduce((n, r) => n + (r.result.ms || 0), 0),
});
const totals = { unit: sum(unit), integration: sum(integration), all: sum(rows) };

// ---------------------------------------------------------------- environment
const commit = sh('git rev-parse --short HEAD');
const dirty = sh('git status --porcelain') ? ' (with uncommitted changes)' : '';
const pgVersion = (() => {
  const container = sh('docker ps --format "{{.Names}}"').split(/\r?\n/).find((n) => n.startsWith('supabase_db_santos'));
  return container ? sh(`docker exec ${container} psql -U postgres -At -c "show server_version"`) : 'not available';
})();
const env = {
  date: new Date(db.ranAt ?? Date.now()).toLocaleString('en-US', { timeZone: 'Asia/Manila', dateStyle: 'long', timeStyle: 'short' }),
  commit: `${commit}${dirty}`, node: process.version, postgres: pgVersion, supabaseCli: sh('npx supabase --version'),
};

// ---------------------------------------------------------------- document helpers (Arial 11 pt)
const FONT = 'Arial';
const GREEN = '1E6B3E';
const RED = 'B42318';
const text = (t, o = {}) => new TextRun({ text: String(t ?? ''), font: FONT, size: o.size ?? 22, bold: o.bold, color: o.color, italics: o.italics });
const para = (t, o = {}) => new Paragraph({ children: Array.isArray(t) ? t : [text(t, o)], alignment: o.align, spacing: { after: o.after ?? 120 }, heading: o.heading });
const heading = (t, level = HeadingLevel.HEADING_1) => new Paragraph({ heading: level, spacing: { before: 240, after: 120 }, children: [text(t, { bold: true, size: level === HeadingLevel.HEADING_1 ? 32 : 26 })] });
const bullet = (t) => new Paragraph({ bullet: { level: 0 }, spacing: { after: 60 }, children: [text(t)] });
const statusRun = (status) => text(status === 'passed' ? 'Pass' : status === 'failed' ? 'Fail' : 'Not run', { bold: true, color: status === 'passed' ? GREEN : RED });
const cell = (content, width, o = {}) => new TableCell({
  width: { size: width, type: WidthType.DXA },
  shading: o.header ? { type: ShadingType.CLEAR, color: 'auto', fill: 'D9E2F3' } : undefined,
  margins: { top: 40, bottom: 40, left: 80, right: 80 },
  children: [new Paragraph({ children: Array.isArray(content) ? content : [text(content, { bold: o.header, size: o.size ?? 18 })] })],
});
// A table whose first row repeats at the top of every page.
function table(headers, widths, body) {
  return new Table({
    width: { size: widths.reduce((a, b) => a + b, 0), type: WidthType.DXA },
    columnWidths: widths,
    rows: [
      new TableRow({ tableHeader: true, children: headers.map((h, i) => cell(h, widths[i], { header: true })) }),
      ...body.map((r) => new TableRow({ cantSplit: true, children: r.map((c, i) => cell(c, widths[i])) })),
    ],
    borders: Object.fromEntries(['top', 'bottom', 'left', 'right', 'insideHorizontal', 'insideVertical'].map((s) => [s, { style: BorderStyle.SINGLE, size: 4, color: '9AA5B1' }])),
  });
}
const actual = (r) => (r.result.status === 'passed' ? `Matched the expected result (${r.result.ms} ms).` : r.result.error ?? 'No result.');
const secs = (ms) => `${(ms / 1000).toFixed(1)} s`;

// Letter: 12240 x 15840 twips. Landscape swaps them; 0.6 inch margins leave about 13,680 twips of width.
const PORTRAIT = { page: { size: { width: 12240, height: 15840, orientation: PageOrientation.PORTRAIT }, margin: { top: 1080, bottom: 1080, left: 1080, right: 1080 } } };
const LANDSCAPE = { page: { size: { width: 12240, height: 15840, orientation: PageOrientation.LANDSCAPE }, margin: { top: 864, bottom: 864, left: 864, right: 864 } } };
const footer = new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [text('Santos Boarding House, Back-End Test Report, page ', { size: 16 }), new TextRun({ children: [PageNumber.CURRENT], font: FONT, size: 16 })] })] });

// ---------------------------------------------------------------- 1. cover and 2. scope
const cover = [
  para('', { after: 2400 }),
  para('Santos Boarding House Management System', { bold: true, size: 40, align: AlignmentType.CENTER, after: 240 }),
  para('Back-End Test Report', { bold: true, size: 34, align: AlignmentType.CENTER, after: 960 }),
  para([text('Prepared by: ', { bold: true }), text('Gillado, Jhon Michael V., Back-End Developer')], { align: AlignmentType.CENTER }),
  para([text('Submitted to: ', { bold: true }), text('Castillo, Zyreen Mae M., Quality Assurance')], { align: AlignmentType.CENTER, after: 720 }),
  para([text('Date run: ', { bold: true }), text(env.date)], { align: AlignmentType.CENTER }),
  para([text('Git commit: ', { bold: true }), text(env.commit)], { align: AlignmentType.CENTER }),
  para([text('Node: ', { bold: true }), text(env.node), text('    PostgreSQL: ', { bold: true }), text(env.postgres), text('    Supabase CLI: ', { bold: true }), text(env.supabaseCli)], { align: AlignmentType.CENTER }),
];
const scope = [
  heading('1. Scope'),
  para('The back end is everything that runs on the server: the database design and its rules in supabase/migrations (tables, row level security, functions and triggers), the storage buckets, the Vercel API functions in api/ (accounts, password reset, username change, the daily backup and the photo shrinking jobs) and the server helpers in lib/.'),
  para('Out of scope: the React screens and the end-to-end tests (the same requirements through the browser). Those are for QA system testing; the requirement coverage below names the requirements that only the front end shows.'),
  heading('Test environment', HeadingLevel.HEADING_2),
  bullet('Unit tests: Vitest in Node, with the Supabase client and Vercel Blob replaced by fakes, so every success and error path of each handler and helper runs (tests/unit).'),
  bullet('Integration tests: the real local Supabase (Docker), every migration applied. The database tests run in one transaction and each is rolled back, so they never change the data (tests/db). The API tests call the real handlers with real logins on temporary accounts that are removed afterwards (tests/db/api.mjs).'),
  bullet(`Machine: ${process.platform}, Node ${env.node}, PostgreSQL ${env.postgres}, Supabase CLI ${env.supabaseCli}.`),
];

// ---------------------------------------------------------------- 3. summary
const summary = [
  heading('2. Summary'),
  table(['Level', 'Total', 'Passed', 'Failed', 'Duration'], [3000, 1600, 1600, 1600, 2200], [
    ['Unit', totals.unit.total, totals.unit.passed, totals.unit.failed, secs(totals.unit.ms)],
    ['Integration', totals.integration.total, totals.integration.passed, totals.integration.failed, secs(totals.integration.ms)],
    ['All back-end tests', totals.all.total, totals.all.passed, totals.all.failed, secs(totals.all.ms)],
  ].map((r) => r.map(String))),
  para(''),
  para(`Sources: reports/vitest.json and reports/db.json (run ${env.date}), tests/catalog/backend.json.`, { size: 18, italics: true }),
];

// ---------------------------------------------------------------- 4 and 5. test tables
const COLS = ['Test ID', 'Requirement', 'Description', 'Input', 'Expected result', 'Actual result', 'Status'];
const WIDTHS = [1150, 1050, 2900, 2900, 2900, 2050, 830];
const testRows = (list) => list.map((r) => [r.id, `${r.requirement} (${r.module})`, r.description, r.input, r.expected, actual(r), [statusRun(r.result.status)]]);
const unitTable = [heading('3. Unit tests'), table(COLS, WIDTHS, testRows(unit))];
const integrationTable = [heading('4. Integration tests'), table(COLS, WIDTHS, testRows(integration))];

// ---------------------------------------------------------------- 6. access control matrix
const CALLERS = ['owner', 'manager', 'tenant', 'other', 'anon'];
const matrixRows = new Map();
for (const r of rows.filter((x) => x.matrix)) {
  const key = `${r.matrix.thing}|${r.matrix.op}`;
  if (!matrixRows.has(key)) matrixRows.set(key, { thing: r.matrix.thing, op: r.matrix.op, cells: {} });
  const got = r.result.status === 'passed' ? r.matrix.expected : r.result.status === 'failed' ? (r.matrix.expected === 'Allowed' ? 'Refused' : 'Allowed') : 'Not run';
  matrixRows.get(key).cells[r.matrix.caller] = { got, ok: r.result.status === 'passed' };
}
const matrixCell = (c) => [text(`${c.got} `, { size: 18 }), text(c.ok ? '✓' : '✗', { bold: true, color: c.ok ? GREEN : RED, size: 18 })];
const accessMatrix = [
  heading('5. Access control matrix'),
  para('Each cell is what the caller got when they tried; ✓ means it matches the expected result written from the policies, ✗ means it does not. "Tenant" is Ben acting on his own rows; "Another tenant" is Carl acting on Ben\'s rows; the tenant manager is Anna. Every table and bucket also has a control test (BE-IT-580 to BE-IT-655) that runs the same statement as the database owner, so a "Refused" always comes from a policy, never from a broken statement.', { size: 18 }),
  table(['Table or bucket', 'Operation', 'Owner', 'Tenant manager', 'Tenant', 'Another tenant', 'Signed-out'], [2700, 1400, 1900, 1900, 1900, 1900, 1900],
    [...matrixRows.values()].map((m) => [m.thing, m.op, ...CALLERS.map((c) => (m.cells[c] ? matrixCell(m.cells[c]) : 'none'))])),
];

// ---------------------------------------------------------------- 7. requirement coverage
const requirements = [...readFileSync(path.join(root, 'docs/requirements.md'), 'utf8').matchAll(/^- ((?:FR|NFR)-\d{3})(?: \((\w+)\))?:? ?(?:[\w ]+:)? ?(.*)$/gm)]
  .map((m) => ({ id: m[1], text: m[3].trim() }));
const byReq = new Map();
for (const r of rows) (byReq.get(r.requirement) ?? byReq.set(r.requirement, []).get(r.requirement)).push(r.id);
const idList = (ids) => {
  if (!ids?.length) return 'Front end only, for QA system testing';
  const sorted = [...ids].sort();
  return sorted.length > 12 ? `${sorted.slice(0, 12).join(', ')} and ${sorted.length - 12} more` : sorted.join(', ');
};
const coverage = [
  heading('6. Requirement coverage'),
  table(['Requirement', 'What it says', 'Back-end tests'], [1300, 6300, 6080], requirements.map((q) => [q.id, q.text, idList(byReq.get(q.id))])),
];

// ---------------------------------------------------------------- 8. defects
const defects = read('tests/catalog/defects.json');
const defectSection = [
  heading('7. Defects found and fixed'),
  para('Back-end defects found while building and reviewing the modules (docs/NOTES.md and reports/reviews). Each is fixed, and the tests on the right now fail if it comes back. Their status is from this run.', { size: 18 }),
  table(['Module', 'Defect', 'Fix', 'Found in', 'Guarded by (status this run)'], [900, 4200, 3700, 2000, 2880], defects.map((d) => [
    d.module, d.defect, d.fix, d.source,
    d.guards.flatMap((id, i) => [...(i ? [text(', ', { size: 18 })] : []), text(`${id} `, { size: 18 }), statusRun(results.get(id)?.status ?? 'not run')]),
  ])),
];

// ---------------------------------------------------------------- 9. notes for QA
const seedSrc = readFileSync(path.join(root, 'scripts/seed.mjs'), 'utf8');
const seedUsers = [...seedSrc.matchAll(/\['([A-Z][\w ]+)', '([a-z]+\.[a-z]+)', '[\d ]+', '(\d{3})'/g)].map((m) => `${m[2]} (${m[1]}, room ${m[3]})`);
const qa = [
  heading('8. Notes for QA'),
  heading('Retest at system level (in the browser)', HeadingLevel.HEADING_2),
  bullet('Every screen at laptop, tablet and phone width; the requirements marked "Front end only" in the coverage table.'),
  bullet('Monthly bills from the 1st (FR-027): a tenant added mid-month shows rent only; Utility Billing names the bills it did not change after a re-save.'),
  bullet('Password reset and change (FR-028): the owner resets a tenant\'s password from the tenant\'s profile; the tenant changes it in My Profile; the owner in Settings.'),
  bullet('The Settings GCash Account popup (FR-033) has database and unit tests but no end-to-end test yet.'),
  bullet('On the live site: run the new migration 20261031000000_bill_snapshot.sql on the cloud database first, or monthly bills and passwords behave as before.'),
  heading('Seed accounts', HeadingLevel.HEADING_2),
  para('After npm run seed: the owner is "owner" (Brian Santos) and Maria Reyes (maria.reyes) is the tenant manager (docs/sample-data.md). The passwords are random, made by the seed, and kept only in the local, git-ignored .env.test file (OWNER_PASSWORD for the owner, TENANT_PASSWORD for every tenant). They are not printed in this report on purpose.'),
  para(`Tenants: ${seedUsers.join('; ')}.`, { size: 18 }),
  heading('Rerun this report', HeadingLevel.HEADING_2),
  bullet('Start Docker, then: npx supabase start'),
  bullet('npm run report:backend   (runs the unit and database tests, then writes reports/Backend-Test-Report.docx)'),
  bullet('npm run catalog:backend   (only after adding or changing a back-end test: rebuilds tests/catalog/backend.json)'),
  bullet('npm run verify   (everything, including the end-to-end tests; about 20 to 45 minutes)'),
];

// ---------------------------------------------------------------- 10. sign-off
const signRow = (role, name) => [role, name, '', ''];
const signOff = [
  heading('9. Sign-off'),
  table(['Role', 'Name', 'Signature', 'Date'], [3500, 4300, 3000, 2000], [
    signRow('Prepared by (Back-End Developer)', 'Gillado, Jhon Michael V.'),
    signRow('Reviewed by (Quality Assurance)', 'Castillo, Zyreen Mae M.'),
    signRow('Approved by (Project Manager)', 'Mayores, Darylle F.'),
  ].map((r) => r.map((c, i) => (i === 2 ? '______________________________' : i === 3 ? '________________' : c)))),
];

// ---------------------------------------------------------------- build
const doc = new Document({
  creator: 'Gillado, Jhon Michael V.',
  title: 'Santos Boarding House Management System: Back-End Test Report',
  styles: { default: { document: { run: { font: FONT, size: 22 } } } },
  sections: [
    { properties: PORTRAIT, footers: { default: footer }, children: [...cover] },
    { properties: PORTRAIT, footers: { default: footer }, children: [...scope, ...summary] },
    { properties: LANDSCAPE, footers: { default: footer }, children: [...unitTable] },
    { properties: LANDSCAPE, footers: { default: footer }, children: [...integrationTable] },
    { properties: LANDSCAPE, footers: { default: footer }, children: [...accessMatrix] },
    { properties: LANDSCAPE, footers: { default: footer }, children: [...coverage] },
    { properties: LANDSCAPE, footers: { default: footer }, children: [...defectSection] },
    { properties: PORTRAIT, footers: { default: footer }, children: [...qa, ...signOff] },
  ],
});
const out = path.join(root, 'reports/Backend-Test-Report.docx');
writeFileSync(out, await Packer.toBuffer(doc));
writeFileSync(path.join(root, 'reports/backend-report.json'), JSON.stringify({ env, totals, matrixRows: matrixRows.size, requirements: requirements.length }, null, 1));
console.log(`reports/Backend-Test-Report.docx: ${totals.all.passed} of ${totals.all.total} passed (unit ${totals.unit.passed}/${totals.unit.total}, integration ${totals.integration.passed}/${totals.integration.total})`);
if (!existsSync(out)) process.exit(1);

// ---------------------------------------------------------------- open the file again and check it
// Every table has rows under its header, every Status cell in the test tables says Pass, Fail or Not run, and the
// number of rows in each test table matches the summary.
const xml = await (await JSZip.loadAsync(readFileSync(out))).file('word/document.xml').async('string');
const cellText = (c) => [...c.matchAll(/<w:t(?: [^>]*)?>([^<]*)<\/w:t>/g)].map((m) => m[1]).join('');
const tables = [...xml.matchAll(/<w:tbl>([\s\S]*?)<\/w:tbl>/g)].map((t) => [...t[1].matchAll(/<w:tr[ >]([\s\S]*?)<\/w:tr>/g)].map((r) => [...r[1].matchAll(/<w:tc>([\s\S]*?)<\/w:tc>/g)].map((c) => cellText(c[1]))));
const problems = [];
tables.forEach((t, i) => { if (t.length < 2) problems.push(`table ${i + 1} has no rows`); });
const testTables = tables.filter((t) => t[0]?.[0] === 'Test ID');
if (testTables.length !== 2) problems.push(`expected 2 test tables, found ${testTables.length}`);
const [unitRows, integrationRows] = testTables.map((t) => t.slice(1));
for (const [name, list, total] of [['unit', unitRows, totals.unit.total], ['integration', integrationRows, totals.integration.total]]) {
  if (!list || list.length !== total) problems.push(`${name} table has ${list?.length} rows, the summary says ${total}`);
  for (const r of list ?? []) if (!['Pass', 'Fail', 'Not run'].includes(r.at(-1))) problems.push(`${r[0]}: empty Status`);
  const passedInTable = (list ?? []).filter((r) => r.at(-1) === 'Pass').length;
  const passedInSummary = name === 'unit' ? totals.unit.passed : totals.integration.passed;
  if (passedInTable !== passedInSummary) problems.push(`${name}: ${passedInTable} Pass cells, the summary says ${passedInSummary}`);
}
if (problems.length) {
  console.error(`The report failed its own check:\n- ${problems.join('\n- ')}`);
  process.exit(1);
}
console.log(`Checked the file: ${tables.length} tables all with rows; ${unitRows.length} unit and ${integrationRows.length} integration rows, every Status filled; totals match the summary.`);
process.exit(totals.all.failed ? 1 : 0);
