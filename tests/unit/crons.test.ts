// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import sharp from 'sharp';
import type { ApiRequest } from '../../lib/http';

// M16 Crons, backups and storage (NFR-005, NFR-006), with mocked Vercel Blob and Supabase clients.

const blob = { put: vi.fn(), list: vi.fn(), del: vi.fn() };
vi.mock('@vercel/blob', () => ({
  put: (...a: unknown[]) => blob.put(...a),
  list: (...a: unknown[]) => blob.list(...a),
  del: (...a: unknown[]) => blob.del(...a),
}));

const db = {
  rpc: vi.fn(),
  rows: {} as Record<string, unknown[]>,
  inserts: [] as { table: string; row: unknown }[],
  uploads: [] as { bucket: string; path: string; body: Buffer; options: unknown }[],
  files: {} as Record<string, Buffer>,
};
const client = {
  rpc: (...a: unknown[]) => db.rpc(...a),
  from: (table: string) => ({
    select: () => ({
      range: async (from: number, to: number) => ({ data: (db.rows[table] ?? []).slice(from, to + 1), error: null }),
    }),
    insert: async (row: unknown) => {
      db.inserts.push({ table, row });
      return { error: null };
    },
  }),
  storage: {
    from: (bucket: string) => ({
      download: async (path: string) =>
        db.files[path] ? { data: new Blob([new Uint8Array(db.files[path])]), error: null } : { data: null, error: { message: 'not found' } },
      upload: async (path: string, body: Buffer, options: unknown) => {
        db.uploads.push({ bucket, path, body, options });
        return { error: null };
      },
    }),
  },
};
vi.mock('../../lib/supabaseAdmin.js', () => ({ admin: () => client }));

const { default: backup, TABLES } = await import('../../api/cron/backup');
const { default: shrink } = await import('../../api/cron/shrink-photos');
const { cronAllowed, keepBackup } = await import('../../lib/cron');

function call(handler: (req: ApiRequest, res: never) => Promise<void> | void, authorization?: string) {
  const out = { status: 0, body: undefined as unknown };
  const res = {
    status(code: number) {
      out.status = code;
      return res;
    },
    json(body: unknown) {
      out.body = body;
    },
    end() {},
  };
  return Promise.resolve(handler({ method: 'GET', headers: authorization ? { authorization } : {} }, res as never)).then(() => out);
}

const SECRET = 'cron-secret-for-tests';
const OK = `Bearer ${SECRET}`;

beforeEach(() => {
  vi.clearAllMocks();
  vi.useRealTimers();
  process.env.CRON_SECRET = SECRET;
  db.rows = {};
  db.inserts = [];
  db.uploads = [];
  db.files = {};
  db.rpc.mockResolvedValue({ data: 0, error: null });
  blob.put.mockImplementation(async (pathname: string) => ({ pathname, url: `https://blob/${pathname}` }));
  blob.list.mockResolvedValue({ blobs: [], hasMore: false });
});

describe('cron secret', () => {
  it('BE-UT-025 cron: turns away a wrong or missing CRON_SECRET with 401, and touches nothing', async () => {
    for (const handler of [backup, shrink]) {
      expect((await call(handler, 'Bearer wrong')).status).toBe(401);
      expect((await call(handler)).status).toBe(401);
    }
    expect(db.rpc).not.toHaveBeenCalled();
    expect(blob.put).not.toHaveBeenCalled();
  });

  it('BE-UT-026 cron: lets nobody in when CRON_SECRET is not set, not even "Bearer undefined"', async () => {
    delete process.env.CRON_SECRET;
    expect((await call(backup, 'Bearer undefined')).status).toBe(401);
    expect(cronAllowed({ headers: { authorization: 'Bearer ' } }, '')).toBe(false);
    expect(cronAllowed({ headers: { authorization: OK } }, SECRET)).toBe(true);
  });
});

describe('backup', () => {
  it('BE-UT-027 backup: marks overdue bills, then saves every table to one file named by the Manila date', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-22T18:00:00Z')); // 02:00 on Oct 23 in Manila
    db.rows = { rooms: [{ room_id: 1 }], tenants: Array.from({ length: 1500 }, (_, i) => ({ tenant_id: i })) };
    db.rpc.mockResolvedValue({ data: 3, error: null });
    const out = await call(backup, OK);
    expect(out.status).toBe(200);
    expect(db.rpc).toHaveBeenCalledWith('refresh_overdue', { p_today: '2026-10-23' });
    const [path, body, options] = blob.put.mock.calls[0] as [string, string, { access: string }];
    expect(path).toBe('backups/santos-bh-2026-10-23.json');
    expect(options.access).toBe('private');
    const dump = JSON.parse(body) as Record<string, unknown[]>;
    expect(Object.keys(dump)).toEqual(TABLES);
    expect(dump.rooms).toHaveLength(1);
    expect(dump.tenants).toHaveLength(1500); // read in pages of 1000
    expect(out.body).toMatchObject({ saved: 'backups/santos-bh-2026-10-23.json', overdue: 3 });
  });

  it('BE-UT-028 backup: makes the Manila month\'s bills before it marks overdue bills', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-31T16:30:00Z')); // 00:30 on Nov 1 in Manila: already November there
    const calls: string[] = [];
    db.rpc.mockImplementation(async (name: string, args: unknown) => {
      calls.push(`${name} ${JSON.stringify(args)}`);
      return { data: name === 'generate_monthly_bills' ? 27 : 0, error: null };
    });
    const out = await call(backup, OK);
    expect(out.status).toBe(200);
    expect(calls).toEqual(['generate_monthly_bills {"p_month":"2026-11-01"}', 'refresh_overdue {"p_today":"2026-11-01"}']);
    expect(out.body).toMatchObject({ bills: 27 });
  });

  it('BE-UT-029 backup: stops with 500 before refresh_overdue and saves nothing when the bills cannot be made', async () => {
    db.rpc.mockImplementation(async (name: string) => (name === 'generate_monthly_bills' ? { data: null, error: { message: 'down' } } : { data: 0, error: null }));
    const out = await call(backup, OK);
    expect(out.status).toBe(500);
    expect(out.body).toMatchObject({ error: 'generate_monthly_bills: down' });
    expect(db.rpc).not.toHaveBeenCalledWith('refresh_overdue', expect.anything());
    expect(blob.put).not.toHaveBeenCalled();
  });

  it('BE-UT-030 backup: keeps the last 30 days and the 1st of each month, and deletes the rest', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-23T01:00:00Z'));
    const days = ['2026-10-23', '2026-09-24', '2026-09-23', '2026-09-01', '2026-08-15', '2026-08-01', '2025-01-01'];
    const blobs = days.map((d) => ({ pathname: `backups/santos-bh-${d}.json`, url: `https://blob/${d}` }));
    blob.list.mockResolvedValueOnce({ blobs: blobs.slice(0, 4), hasMore: true, cursor: 'next' }).mockResolvedValueOnce({ blobs: blobs.slice(4), hasMore: false });
    const out = await call(backup, OK);
    expect(blob.list).toHaveBeenLastCalledWith({ prefix: 'backups/', cursor: 'next' });
    expect(blob.del).toHaveBeenCalledWith(['https://blob/2026-09-23', 'https://blob/2026-08-15']);
    expect(out.body).toMatchObject({ removed: 2 });
  });

  it('BE-UT-031 backup: the retention rule by day', () => {
    expect(keepBackup('2026-10-23', '2026-10-23')).toBe(true);
    expect(keepBackup('2026-09-24', '2026-10-23')).toBe(true); // 29 days old: the 30th file
    expect(keepBackup('2026-09-23', '2026-10-23')).toBe(false);
    expect(keepBackup('2024-02-01', '2026-10-23')).toBe(true);
  });

  it('BE-UT-032 backup: stops with 500 and saves nothing when the database fails', async () => {
    db.rpc.mockResolvedValue({ data: null, error: { message: 'down' } });
    const out = await call(backup, OK);
    expect(out.status).toBe(500);
    expect(blob.put).not.toHaveBeenCalled();
    expect(blob.del).not.toHaveBeenCalled();
  });
});

describe('shrink photos', () => {
  it('BE-UT-033 shrink: swaps each old photo for a 400 px WebP at the same path and records both sizes', async () => {
    const photo = await sharp({ create: { width: 1600, height: 2400, channels: 3, background: '#88aacc' } }).jpeg({ quality: 95 }).toBuffer();
    db.files = { 'u1/proof.webp': photo };
    db.rpc.mockResolvedValue({ data: [{ bucket_id: 'proofs', path: 'u1/proof.webp' }, { bucket_id: 'bills', path: 'missing.jpg' }], error: null });
    const out = await call(shrink, OK);
    expect(db.rpc).toHaveBeenCalledWith('photos_due_for_shrink', { p_months: 12, p_limit: 200 });
    expect(db.uploads).toHaveLength(1);
    const up = db.uploads[0];
    expect(up).toMatchObject({ bucket: 'proofs', path: 'u1/proof.webp', options: { contentType: 'image/webp', upsert: true } });
    const meta = await sharp(up.body).metadata();
    expect(meta.format).toBe('webp');
    expect(Math.max(meta.width ?? 0, meta.height ?? 0)).toBe(400);
    expect(up.body.length).toBeLessThan(photo.length);
    expect(db.inserts).toEqual([{ table: 'archived_photos', row: { bucket_id: 'proofs', path: 'u1/proof.webp', original_bytes: photo.length, new_bytes: up.body.length } }]);
    expect(out.body).toMatchObject({ shrunk: 1, failed: ['missing.jpg'] });
  });
});

describe('shrink photos, the other paths (M21)', () => {
  it('BE-UT-034 shrink: turns away a wrong or missing CRON_SECRET with 401 and reads no photo', async () => {
    expect((await call(shrink, 'Bearer nope')).status).toBe(401);
    expect((await call(shrink)).status).toBe(401);
    expect(db.rpc).not.toHaveBeenCalled();
    expect(db.uploads).toEqual([]);
  });

  it('BE-UT-035 shrink: works only on the list photos_due_for_shrink gives (it leaves out photos in archived_photos)', async () => {
    // The database excludes archived photos (checked in the integration tests); the job shrinks exactly what it is given.
    db.files = { 'u1/old.webp': await sharp({ create: { width: 900, height: 900, channels: 3, background: '#335577' } }).jpeg().toBuffer(), 'u1/archived.webp': Buffer.from('x') };
    db.rpc.mockResolvedValue({ data: [{ bucket_id: 'proofs', path: 'u1/old.webp' }], error: null });
    const out = await call(shrink, OK);
    expect(db.uploads.map((u) => u.path)).toEqual(['u1/old.webp']);
    expect(out.body).toMatchObject({ shrunk: 1, failed: [] });
  });

  it('BE-UT-036 shrink: stops with 500 when the list of photos cannot be read', async () => {
    db.rpc.mockResolvedValue({ data: null, error: { message: 'permission denied' } });
    expect(await call(shrink, OK)).toMatchObject({ status: 500, body: { error: 'permission denied' } });
    expect(db.uploads).toEqual([]);
  });
});
