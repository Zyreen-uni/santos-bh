import { describe, expect, it } from 'vitest';
import { storageSummary, type StorageUsage } from '@/lib/dashboard';

const GB = 1024 * 1024 * 1024;
const MB = 1024 * 1024;
const usage = (files: number, db = 20 * MB): StorageUsage => ({ storage_bytes: files, storage_limit: GB, database_bytes: db, database_limit: 500 * MB });

describe('storageSummary (FR-017: storage used with a warning at 80%)', () => {
  it('shows the design example: 340 MB of 1 GB is 33%, no warning', () => {
    expect(storageSummary(usage(340 * MB))).toEqual({ percent: 33, databasePercent: 4, text: '340 MB of 1 GB. Warns at 80%.', warn: false });
  });

  it('warns at 80% of the files and not at 79%', () => {
    expect(storageSummary(usage(0.79 * GB)).warn).toBe(false);
    expect(storageSummary(usage(0.8 * GB)).warn).toBe(true);
    expect(storageSummary(usage(0.85 * GB)).percent).toBe(85);
  });

  it('warns at 80% of the database too', () => {
    const s = storageSummary(usage(10 * MB, 400 * MB));
    expect(s.databasePercent).toBe(80);
    expect(s.warn).toBe(true);
  });

  it('writes small sizes with one decimal and never goes over 100%', () => {
    expect(storageSummary(usage(1.25 * MB)).text).toBe('1.3 MB of 1 GB. Warns at 80%.');
    expect(storageSummary(usage(2 * GB)).percent).toBe(100);
  });
});
