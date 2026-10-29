// @vitest-environment node
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// M20 Docs sync: the requirements, the matrix and the tests stay in step. Every FR and NFR in docs/requirements.md
// has a row in docs/REQUIREMENTS-MATRIX.md that names at least one test file, and every test file it names exists.

const requirements = readFileSync('docs/requirements.md', 'utf8');
const matrix = readFileSync('docs/REQUIREMENTS-MATRIX.md', 'utf8');
// "- FR-001 (HIGH): ..." and "- NFR-001 Usability: ..."
const ids = [...requirements.matchAll(/^- ((?:FR|NFR)-\d{3})\b/gm)].map((m) => m[1]);
const rows = new Map(
  matrix
    .split(/\r?\n/)
    .filter((l) => /^\| (FR|NFR)-\d{3} \|/.test(l))
    .map((l) => [l.split('|')[1].trim(), l]),
);
const testFiles = (row: string) => [...row.matchAll(/\b((?:e2e|tests)\/[\w./-]+\.(?:tsx|ts|mjs))\b/g)].map((m) => m[1]);

describe('requirements matrix', () => {
  it('reads every requirement: FR-001 to FR-033 and NFR-001 to NFR-006', () => {
    expect(ids.filter((id) => id.startsWith('FR-'))).toHaveLength(33);
    expect(ids.filter((id) => id.startsWith('NFR-'))).toHaveLength(6);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('has a row for every requirement, and no row for a requirement that does not exist', () => {
    expect(ids.filter((id) => !rows.has(id))).toEqual([]);
    expect([...rows.keys()].filter((id) => !ids.includes(id))).toEqual([]);
  });

  it('names at least one test file on every row, and every named file exists', () => {
    const empty = ids.filter((id) => testFiles(rows.get(id) ?? '').length === 0);
    expect(empty).toEqual([]);
    const missing = ids.flatMap((id) => testFiles(rows.get(id) ?? '').filter((f) => !existsSync(f)).map((f) => `${id}: ${f}`));
    expect(missing).toEqual([]);
  });
});
