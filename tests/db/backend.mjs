// M21 Part B: back-end integration tests on the real local Supabase database, BE-IT-114 to BE-IT-162. Like every db
// test they run inside the runner's transaction, each rolled back after it. Each case carries its catalog fields
// (requirement, module, input, expected) so tests/catalog/backend.json and the QA report read them from here.
// Groups: 1 schema rules, 3 every callable function, 4 every trigger, 5 billing math, 6 history logs.

export function backendCases(db, { as, denied, eq, ids, MONTH, saveBills, ROOMS, bill, ganna }) {
  const one = async (uid, sql, params = []) => (await as(uid, sql, params)).rows[0];
  const count = async (sql, params = []) => Number((await db.query(sql, params)).rows[0].count);
  const benPays = async (b, amount = 2400) => (await as(ids.ben, `insert into public.payments (bill_id, amount, method, reference_no, proof_path)
    values ($1, $2, 'gcash', '1023', $3) returning payment_id`, [b.bill_id, amount, `${ids.ben}/oct.webp`])).rows[0].payment_id;

  return [
    // ---------------------------------------------------------------- 1. schema rules
    {
      id: 'BE-IT-114', req: 'FR-001', module: 'M2', title: 'a room takes a capacity of 1 to 8 only',
      input: 'Insert rooms with capacity 0, 9 and 8.', expected: 'Capacity 0 and 9 are refused by the database; 8 is saved.',
      fn: async () => {
        await denied('server', `insert into public.rooms (building_id, room_number, capacity) values (1, 'C0', 0)`);
        await denied('server', `insert into public.rooms (building_id, room_number, capacity) values (1, 'C9', 9)`);
        eq((await as('server', `insert into public.rooms (building_id, room_number, capacity) values (1, 'C8', 8)`)).rowCount, 1, 'capacity 8');
      },
    },
    {
      id: 'BE-IT-115', req: 'FR-002', module: 'M2', title: 'room numbers are unique',
      input: 'Insert a second room 101.', expected: 'Refused: room numbers are unique.',
      fn: async () => { await denied('server', `insert into public.rooms (building_id, room_number) values (2, '101')`); },
    },
    {
      id: 'BE-IT-116', req: 'FR-022', module: 'M4', title: 'the due day is 1 to 28 and the rent is above 0',
      input: 'Set due_day 0, 29 and 28; set monthly_rent 0.', expected: 'Due day 0 and 29 and rent 0 are refused; due day 28 is saved.',
      fn: async () => {
        await denied('server', `update public.billing_settings set due_day = 0`);
        await denied('server', `update public.billing_settings set due_day = 29`);
        await denied('server', `update public.billing_settings set monthly_rent = 0`);
        eq((await as('server', `update public.billing_settings set due_day = 28`)).rowCount, 1, 'due day 28');
      },
    },
    {
      id: 'BE-IT-117', req: 'FR-006', module: 'M3', title: 'a tenant has one current room at a time',
      input: 'Give Ben (already in room 101) a second current room.', expected: 'Refused: only one assignment with no end date per tenant.',
      fn: async () => { await denied('server', `insert into public.room_assignments (tenant_id, room_id) values ($1, $2)`, [ids.t_ben, ids.r201]); },
    },
    {
      id: 'BE-IT-118', req: 'FR-023', module: 'M3', title: 'there is one tenant manager at a time',
      input: 'Insert a second manager row (setting_id 2), and the same tenant twice.', expected: 'Both refused: one row, one tenant.',
      fn: async () => {
        await denied('server', `insert into public.tenant_manager (setting_id, tenant_id) values (2, $1)`, [ids.t_ben]);
        await denied('server', `insert into public.tenant_manager (setting_id, tenant_id) values (2, $1)`, [ids.t_anna]);
      },
    },
    {
      id: 'BE-IT-119', req: 'FR-019', module: 'M5', title: 'utility bill meter rules',
      input: 'Insert a room meter with no room, a rest house meter with a room, an amount of 0, a month not on the 1st, and the same meter twice in a month.',
      expected: 'All five are refused; one room meter per room per month is saved.',
      fn: async () => {
        const row = (type, room, amount, month) => as('server', `insert into public.utility_bills (billing_month, meter_type, room_id, amount, photo_path, entered_by)
          values ($1, $2, $3, $4, 'x.jpg', $5)`, [month, type, room, amount, ids.owner]);
        for (const [type, room, amount, month] of [['room', null, 100, MONTH], ['rest_house', ids.r101, 100, MONTH], ['room', ids.r101, 0, MONTH], ['room', ids.r101, 100, '2026-10-15']]) {
          let refused = false;
          try { await row(type, room, amount, month); } catch { refused = true; }
          eq(refused, true, `${type} ${room} ${amount} ${month}`);
        }
        eq((await row('room', ids.r101, 100, MONTH)).rowCount, 1, 'one room meter');
        let twice = false;
        try { await row('room', ids.r101, 200, MONTH); } catch { twice = true; }
        eq(twice, true, 'the same meter twice in a month');
      },
    },
    {
      id: 'BE-IT-120', req: 'FR-010', module: 'M12', title: 'a GCash payment needs a proof and a reference, and an amount above 0',
      input: 'Insert a GCash payment with no proof, one with no reference, a payment of 0, and a cash payment with no proof.',
      expected: 'The first three are refused; the cash payment is saved.',
      fn: async () => {
        const b = await ganna();
        const pay = (method, amount, ref, proof) => as('server', `insert into public.payments (bill_id, amount, method, reference_no, proof_path) values ($1, $2, $3, $4, $5)`, [b.bill_id, amount, method, ref, proof]);
        for (const args of [['gcash', 100, '1', null], ['gcash', 100, null, 'x/p.webp'], ['cash', 0, null, null]]) {
          let refused = false;
          try { await pay(...args); } catch { refused = true; }
          eq(refused, true, args.join(' '));
        }
        eq((await pay('cash', 100, null, null)).rowCount, 1, 'cash with no proof');
      },
    },
    {
      id: 'BE-IT-121', req: 'FR-012', module: 'M13', title: 'a concern needs a subject of 1 to 150 letters and details; a message 1 to 2000',
      input: 'Insert a concern with an empty subject, a 151-letter subject, empty details, and a message of 2001 letters.',
      expected: 'All four are refused; a normal concern is saved.',
      fn: async () => {
        for (const [subject, details] of [['', 'x'], ['x'.repeat(151), 'x'], ['Leak', '']]) {
          let refused = false;
          try { await as('server', `insert into public.concerns (tenant_id, subject, details) values ($1, $2, $3)`, [ids.t_ben, subject, details]); } catch { refused = true; }
          eq(refused, true, `subject ${subject.length}, details ${details.length}`);
        }
        const c = await one('server', `insert into public.concerns (tenant_id, subject, details) values ($1, 'Leak', 'The sink leaks.') returning concern_id`, [ids.t_ben]);
        await denied('server', `insert into public.concern_messages (concern_id, body) values ($1, $2)`, [c.concern_id, 'x'.repeat(2001)]);
      },
    },

    // ---------------------------------------------------------------- 3. every callable function
    {
      id: 'BE-IT-122', req: 'FR-019', module: 'M5', title: 'save_utility_bills: the manager saves, a tenant is refused, a missing photo is refused',
      input: 'save_utility_bills for October as Anna (manager), as Ben, and as Anna with no rest house photo.',
      expected: 'Anna: 3 bills in the split. Ben: refused. No photo: refused.',
      fn: async () => {
        eq((await saveBills(ids.anna, ROOMS())).rows[0].n, 3, 'manager');
        await denied(ids.ben, `select public.save_utility_bills($1, 900, 'r.jpg', '[]')`, [MONTH]);
        await denied(ids.anna, `select public.save_utility_bills($1, 900, '', '[]')`, [MONTH]);
      },
    },
    {
      id: 'BE-IT-123', req: 'FR-027', module: 'M18', title: 'generate_monthly_bills: the owner runs it for any day of the month, a tenant is refused',
      input: 'generate_monthly_bills(2026-10-15) as the owner, then as Ben.',
      expected: 'The owner makes 3 bills dated 2026-10-01 (the month, not the day). Ben: refused.',
      fn: async () => {
        eq((await one(ids.owner, `select public.generate_monthly_bills('2026-10-15') as n`)).n, 3, 'bills');
        eq(await count(`select count(*) from public.monthly_bills where billing_month = '2026-10-01'`), 3, 'on the 1st');
        await denied(ids.ben, `select public.generate_monthly_bills('2026-10-15')`);
      },
    },
    {
      id: 'BE-IT-124', req: 'FR-011', module: 'M6', title: 'verify_payment approve: a receipt, a paid bill; a tenant, a non-pending or unknown payment is refused',
      input: 'Ben sends ₱2,400 by GCash; the owner approves it; then Ben tries, the owner approves it again, and the owner approves payment 999999.',
      expected: 'Receipt OR-000001, bill Paid. Ben: refused. Second approval: refused. Unknown payment: refused.',
      fn: async () => {
        const p = await benPays(await ganna());
        await denied(ids.ben, `select * from public.verify_payment($1, true)`, [p]);
        const r = await one(ids.owner, `select * from public.verify_payment($1, true)`, [p]);
        eq(r.receipt_number, 'OR-000001', 'receipt'); eq((await bill('ben')).status, 'paid', 'bill');
        await denied(ids.owner, `select * from public.verify_payment($1, true)`, [p]);
        await denied(ids.owner, `select * from public.verify_payment(999999, true)`);
      },
    },
    {
      id: 'BE-IT-125', req: 'FR-011', module: 'M6', title: 'verify_payment reject: the payment is rejected, the bill is unpaid again, no receipt',
      input: 'Ben sends a GCash proof; the owner rejects it.', expected: 'Payment Rejected, bill Unpaid, 0 receipts.',
      fn: async () => {
        const p = await benPays(await ganna());
        const r = await one(ids.owner, `select * from public.verify_payment($1, false)`, [p]);
        eq(r.payment_status, 'rejected', 'payment'); eq(r.receipt_number, null, 'no receipt');
        eq((await bill('ben')).status, 'unpaid', 'bill'); eq(await count(`select count(*) from public.receipts`), 0, 'receipts');
      },
    },
    {
      id: 'BE-IT-126', req: 'FR-029', module: 'M6', title: 'record_payment: paid with a receipt; a tenant, 0, above the balance or a future date is refused',
      input: 'The owner records ₱2,400 cash for Ben; then Ben records; then 0, ₱99,999 and a date next year.',
      expected: 'Paid, OR-000001. Ben, 0, above the balance and the future date: all refused.',
      fn: async () => {
        const b = await ganna();
        await denied(ids.ben, `select * from public.record_payment($1, 100, '2026-10-20', 'cash')`, [b.bill_id]);
        await denied(ids.owner, `select * from public.record_payment($1, 0, '2026-10-20', 'cash')`, [b.bill_id]);
        await denied(ids.owner, `select * from public.record_payment($1, 99999, '2026-10-20', 'cash')`, [b.bill_id]);
        await denied(ids.owner, `select * from public.record_payment($1, 100, '2027-12-31', 'cash')`, [b.bill_id]);
        const r = await one(ids.owner, `select * from public.record_payment($1, 2400, '2026-10-20', 'cash')`, [b.bill_id]);
        eq(`${r.receipt_number} ${r.bill_status}`, 'OR-000001 paid', 'recorded');
      },
    },
    {
      id: 'BE-IT-127', req: 'FR-009', module: 'M6', title: 'refresh_overdue: only unpaid bills past the due date; a signed-out visitor is refused',
      input: 'October bills due Oct 5. refresh_overdue on Oct 5, then Oct 6; then as a visitor.',
      expected: 'Oct 5: 0 bills. Oct 6: 3 bills Overdue. Visitor: refused.',
      fn: async () => {
        await ganna();
        eq((await one(ids.owner, `select public.refresh_overdue('2026-10-05') as n`)).n, 0, 'on the due day');
        eq((await one(ids.owner, `select public.refresh_overdue('2026-10-06') as n`)).n, 3, 'after');
        await denied(null, `select public.refresh_overdue('2026-10-06')`);
      },
    },
    {
      id: 'BE-IT-128', req: 'FR-017', module: 'M9', title: 'storage_usage: the owner gets the space used; a tenant is refused',
      input: 'storage_usage() as the owner and as Ben.', expected: 'Owner: database and storage bytes with the free plan limits. Ben: refused.',
      fn: async () => {
        const u = (await one(ids.owner, `select public.storage_usage() as u`)).u;
        eq(['database_bytes', 'database_limit', 'storage_bytes', 'storage_limit', 'buckets'].every((k) => k in u), true, 'keys');
        eq(u.database_limit, 500 * 1024 * 1024, 'database limit');
        await denied(ids.ben, `select public.storage_usage()`);
      },
    },
    {
      id: 'BE-IT-129', req: 'FR-026', module: 'M6', title: 'proof_files: the owner lists a month\'s proofs with clear file names; a tenant is refused',
      input: 'Ben sends a proof for October. proof_files(October) and proof_files(September) as the owner, then as Ben.',
      expected: 'October: 1 file named 2026-10_Room-101_BEN_payment-<id>.webp. September: 0. Ben: refused.',
      fn: async () => {
        const p = await benPays(await ganna());
        const files = (await as(ids.owner, `select * from public.proof_files($1)`, [MONTH])).rows;
        eq(files.length, 1, 'one'); eq(files[0].file_name, `2026-10_Room-101_BEN_payment-${p}.webp`, 'name');
        eq((await as(ids.owner, `select * from public.proof_files('2026-09-01')`)).rowCount, 0, 'september');
        await denied(ids.ben, `select * from public.proof_files($1)`, [MONTH]);
      },
    },
    {
      id: 'BE-IT-130', req: 'FR-031', module: 'M11', title: 'change_username: the server changes it; an app user, a bad or a taken username is refused',
      input: 'change_username(Ben, "ben.new") as the server; then as Ben; then "Bad Name" and "anna".',
      expected: 'Server: Ben is ben.new. Ben himself: refused. Bad format and taken: refused.',
      fn: async () => {
        await as('server', `select public.change_username($1, 'ben.new')`, [ids.ben]);
        eq((await db.query(`select username from public.profiles where id = $1`, [ids.ben])).rows[0].username, 'ben.new', 'changed');
        await denied(ids.ben, `select public.change_username($1, 'ben.other')`, [ids.ben]);
        await denied('server', `select public.change_username($1, 'Bad Name')`, [ids.ben]);
        await denied('server', `select public.change_username($1, 'anna')`, [ids.ben]);
      },
    },
    {
      id: 'BE-IT-131', req: 'FR-020', module: 'M5', title: 'room_occupancy: counts per room for any signed-in user; a visitor is refused',
      input: 'room_occupancy() as Carl, then as a visitor.', expected: 'Room 101: 2, room 201: 1, other rooms: 0. Visitor: refused.',
      fn: async () => {
        const r = Object.fromEntries((await as(ids.carl, `select room_id, active_tenants from public.room_occupancy()`)).rows.map((x) => [String(x.room_id), x.active_tenants]));
        eq(`${r[ids.r101]} ${r[ids.r201]} ${r[ids.r102]}`, '2 1 0', 'counts');
        await denied(null, `select * from public.room_occupancy()`);
      },
    },
    {
      id: 'BE-IT-132', req: 'FR-021', module: 'M10', title: 'manager_name: the manager\'s name only; none after the manager leaves; a visitor is refused',
      input: 'manager_name() as Carl; again after Anna is marked inactive; as a visitor.', expected: 'ANNA; then empty; visitor refused.',
      fn: async () => {
        eq((await one(ids.carl, `select public.manager_name() as n`)).n, 'ANNA', 'name');
        await db.query(`update public.tenants set status = 'inactive' where tenant_id = $1`, [ids.t_anna]);
        eq((await one(ids.carl, `select public.manager_name() as n`)).n, null, 'none');
        await denied(null, `select public.manager_name()`);
      },
    },
    {
      id: 'BE-IT-133', req: 'FR-032', module: 'M11', title: 'my_roommates: the others in my room only; nothing without a room; a visitor is refused',
      input: 'my_roommates() as Ben, as Dina (no room), as a visitor.', expected: 'Ben: ANNA only. Dina: none. Visitor: refused.',
      fn: async () => {
        eq((await as(ids.ben, `select full_name from public.my_roommates()`)).rows.map((r) => r.full_name).join(), 'ANNA', 'ben');
        eq((await as(ids.dina, `select * from public.my_roommates()`)).rowCount, 0, 'dina');
        await denied(null, `select * from public.my_roommates()`);
      },
    },
    {
      id: 'BE-IT-134', req: 'FR-024', module: 'M12', title: 'utility_entered: who entered the month and when; nothing for an empty month; a visitor is refused',
      input: 'Anna saves October. utility_entered(October) and (November) as Carl; October as a visitor.', expected: 'October: ANNA with a time. November: none. Visitor: refused.',
      fn: async () => {
        await ganna();
        eq((await one(ids.carl, `select * from public.utility_entered($1)`, [MONTH])).entered_by, 'ANNA', 'october');
        eq((await as(ids.carl, `select * from public.utility_entered('2026-11-01')`)).rowCount, 0, 'november');
        await denied(null, `select * from public.utility_entered($1)`, [MONTH]);
      },
    },
    {
      id: 'BE-IT-135', req: 'FR-027', module: 'M18', title: 'bills_kept: rooms with paid or pending bills; empty when none; a tenant is refused',
      input: 'October bills, no payments: bills_kept as the owner. Ben sends a proof: again. Then as Ben.', expected: 'No rows; then room 101: 1. Ben: refused.',
      fn: async () => {
        const b = await ganna();
        eq((await as(ids.owner, `select * from public.bills_kept($1)`, [MONTH])).rowCount, 0, 'none');
        await benPays(b);
        eq((await as(ids.owner, `select room_number, kept from public.bills_kept($1)`, [MONTH])).rows.map((r) => `${r.room_number}:${r.kept}`).join(), '101:1', 'kept');
        await denied(ids.ben, `select * from public.bills_kept($1)`, [MONTH]);
      },
    },
    {
      id: 'BE-IT-136', req: 'FR-027', module: 'M18', title: 'month_split: the split per room; empty for a month with no bills; a visitor is refused',
      input: 'month_split(October) after the bills, month_split(December), and as a visitor.', expected: 'Room 101: 2, room 201: 1. December: none. Visitor: refused.',
      fn: async () => {
        await ganna();
        const s = Object.fromEntries((await as(ids.ben, `select room_id, tenants from public.month_split($1)`, [MONTH])).rows.map((r) => [String(r.room_id), r.tenants]));
        eq(`${s[ids.r101]} ${s[ids.r201]}`, '2 1', 'split');
        eq((await as(ids.ben, `select * from public.month_split('2026-12-01')`)).rowCount, 0, 'december');
        await denied(null, `select * from public.month_split($1)`, [MONTH]);
      },
    },
    {
      id: 'BE-IT-137', req: 'FR-030', module: 'M7', title: 'owner_name: the owner\'s name for any signed-in user; a visitor is refused',
      input: 'owner_name() as Ben, then as a visitor.', expected: 'The owner\'s sign-up name (owner here); visitor refused.',
      fn: async () => {
        eq((await one(ids.ben, `select public.owner_name() as n`)).n, 'owner', 'name');
        await denied(null, `select public.owner_name()`);
      },
    },
    {
      id: 'BE-IT-138', req: 'FR-025', module: 'M14', title: 'log_actors: the people in my own logs; a visitor is refused',
      input: 'The owner edits Ben\'s record. log_actors() as Ben, as Carl, as a visitor.', expected: 'Ben sees owner; Carl does not; visitor refused.',
      fn: async () => {
        await as(ids.owner, `update public.tenants set email = 'ben@x.ph' where tenant_id = $1`, [ids.t_ben]);
        eq((await as(ids.ben, `select username from public.log_actors()`)).rows.some((r) => r.username === 'owner'), true, 'ben');
        eq((await as(ids.carl, `select username from public.log_actors()`)).rows.some((r) => r.username === 'owner'), false, 'carl');
        await denied(null, `select * from public.log_actors()`);
      },
    },
    {
      id: 'BE-IT-139', req: 'FR-004', module: 'M3', title: 'add_tenant: the owner adds a tenant with a room; a tenant or a full room is refused',
      input: 'add_tenant("Zed", room 201) as the owner; as Ben; then into a room of capacity 1 that is taken.', expected: 'Owner: a tenant id and a current room 201. Ben: refused. Full room: refused.',
      fn: async () => {
        const t = (await one(ids.owner, `select public.add_tenant('Zed', '0917 000 0000', $1, '2026-10-20') as id`, [ids.r201])).id;
        eq(await count(`select count(*) from public.room_assignments where tenant_id = $1 and room_id = $2 and date_ended is null`, [t, ids.r201]), 1, 'room');
        await denied(ids.ben, `select public.add_tenant('Zed', '0917', $1, '2026-10-20')`, [ids.r201]);
        await db.query(`update public.rooms set capacity = 1 where room_id = $1`, [ids.r203]);
        await as(ids.owner, `select public.add_tenant('One', '0917', $1, '2026-10-20')`, [ids.r203]);
        await denied(ids.owner, `select public.add_tenant('Two', '0917', $1, '2026-10-20')`, [ids.r203]);
      },
    },
    {
      id: 'BE-IT-140', req: 'FR-006', module: 'M3', title: 'move_tenant: the old stay ends the day before, the new one starts; a tenant or an inactive tenant is refused',
      input: 'move_tenant(Ben, room 201, 2026-10-20) as the owner; as Ben; for Dina after she is marked inactive.', expected: 'Room 101 ends 2026-10-19, room 201 starts 2026-10-20. Ben: refused. Inactive: refused.',
      fn: async () => {
        // The suite seeds Ben's stay as starting today; start it in January, as a real tenant's would.
        await db.query(`update public.room_assignments set date_started = '2026-01-01' where tenant_id = $1`, [ids.t_ben]);
        await as(ids.owner, `select public.move_tenant($1, $2, '2026-10-20')`, [ids.t_ben, ids.r201]);
        const stays = (await db.query(`select room_id, date_started::text, date_ended::text from public.room_assignments where tenant_id = $1 order by date_started`, [ids.t_ben])).rows;
        eq(stays.at(-1).room_id, ids.r201, 'new room'); eq(stays.at(-1).date_ended, null, 'current');
        eq(stays.find((s) => String(s.room_id) === String(ids.r101)).date_ended, '2026-10-19', 'old ends');
        await denied(ids.ben, `select public.move_tenant($1, $2, '2026-10-21')`, [ids.t_ben, ids.r101]);
        await db.query(`update public.tenants set status = 'inactive' where tenant_id = $1`, [ids.t_dina]);
        await denied(ids.owner, `select public.move_tenant($1, $2, '2026-10-21')`, [ids.t_dina, ids.r101]);
      },
    },
    {
      id: 'BE-IT-141', req: 'FR-003', module: 'M2', title: 'room_occupants: active tenants now, leaving out one assignment',
      input: 'room_occupants(room 101) and with Ben\'s assignment left out; then with Anna inactive.', expected: '2, then 1, then 1.',
      fn: async () => {
        eq((await one(ids.carl, `select public.room_occupants($1) as n`, [ids.r101])).n, 2, 'now');
        const a = (await db.query(`select assignment_id from public.room_assignments where tenant_id = $1`, [ids.t_ben])).rows[0].assignment_id;
        eq((await one(ids.carl, `select public.room_occupants($1, $2) as n`, [ids.r101, a])).n, 1, 'except');
        await db.query(`update public.tenants set status = 'inactive' where tenant_id = $1`, [ids.t_anna]);
        eq((await one(ids.carl, `select public.room_occupants($1) as n`, [ids.r101])).n, 1, 'inactive left out');
      },
    },
    {
      id: 'BE-IT-142', req: 'NFR-006', module: 'M16', title: 'photos_due_for_shrink: old photos not yet shrunk, for the server only',
      input: 'A proof from 13 months ago and one archived already; list as the server, then as the owner.', expected: 'Server: the old, not archived proof only. Owner: refused.',
      fn: async () => {
        const b = await ganna();
        const ins = (path) => db.query(`insert into public.payments (bill_id, amount, method, reference_no, proof_path, created_at) values ($1, 10, 'gcash', '1', $2, now() - interval '13 months')`, [b.bill_id, path]);
        await ins('x/old.webp'); await ins('x/done.webp');
        await db.query(`insert into public.archived_photos (bucket_id, path) values ('proofs', 'x/done.webp')`);
        eq((await as('server', `select path from public.photos_due_for_shrink(12)`)).rows.map((r) => r.path).join(), 'x/old.webp', 'due');
        await denied(ids.owner, `select * from public.photos_due_for_shrink(12)`);
      },
    },
    {
      id: 'BE-IT-143', req: 'NFR-003', module: 'M1', title: 'is_admin, is_manager and my_tenant_id answer for the caller only',
      input: 'Ask each as the owner, Anna (manager), Ben and a visitor.', expected: 'Owner: admin, no tenant. Anna: manager. Ben: neither, his tenant id. Visitor: no, no, none.',
      fn: async () => {
        const who = async (uid) => one(uid, `select public.is_admin() a, public.is_manager() m, public.my_tenant_id() t`);
        const o = await who(ids.owner); eq(`${o.a} ${o.m} ${o.t}`, 'true false null', 'owner');
        const a = await who(ids.anna); eq(`${a.a} ${a.m}`, 'false true', 'anna');
        const b = await who(ids.ben); eq(`${b.a} ${b.m} ${b.t}`, `false false ${ids.t_ben}`, 'ben');
        const v = await who(null); eq(`${v.a} ${v.m} ${v.t}`, 'false false null', 'visitor');
      },
    },

    // ---------------------------------------------------------------- 4. every trigger
    {
      id: 'BE-IT-144', req: 'FR-005', module: 'M1', title: 'handle_new_user: a self-registered login becomes a tenant with a tenant record',
      input: 'Sign up nina.cruz@santosbh.local with full name and contact, and a role "admin" in the sign-up data.',
      expected: 'Profile nina.cruz, role tenant (the sign-up data cannot make an admin), a tenant record Nina Cruz.',
      fn: async () => {
        const u = (await db.query(`insert into auth.users (id, email, raw_user_meta_data) values (gen_random_uuid(), 'Nina.Cruz@santosbh.local', $1) returning id`,
          [{ full_name: 'Nina Cruz', contact_number: '0917 1', role: 'admin' }])).rows[0].id;
        const p = (await db.query(`select username, role from public.profiles where id = $1`, [u])).rows[0];
        eq(`${p.username} ${p.role}`, 'nina.cruz tenant', 'profile');
        eq((await db.query(`select full_name from public.tenants where user_id = $1`, [u])).rows[0].full_name, 'Nina Cruz', 'tenant');
      },
    },
    {
      id: 'BE-IT-145', req: 'FR-005', module: 'M3', title: 'link_owner_created_login: a login whose tenant id arrives later links to the owner\'s record',
      input: 'Create a login with no app_metadata (the trigger makes an empty tenant), then set app_metadata.tenant_id to the FE record.',
      expected: 'FE\'s record gets the login; the empty record is removed; still one record per login.',
      fn: async () => {
        const u = (await db.query(`insert into auth.users (id, email) values (gen_random_uuid(), 'fe.later@santosbh.local') returning id`)).rows[0].id;
        eq(await count(`select count(*) from public.tenants where user_id = $1`, [u]), 1, 'empty record made');
        await db.query(`update auth.users set raw_app_meta_data = $2 where id = $1`, [u, { tenant_id: ids.t_fe }]);
        eq((await db.query(`select tenant_id from public.tenants where user_id = $1`, [u])).rows.map((r) => String(r.tenant_id)).join(), String(ids.t_fe), 'linked');
      },
    },
    {
      id: 'BE-IT-146', req: 'FR-018', module: 'M11', title: 'guard_tenant_update: a tenant edits contact details and own photo only',
      input: 'Ben sets his contact number, his status, his login, and a photo outside his folder.', expected: 'Contact: saved. Status, login and the outside photo: refused.',
      fn: async () => {
        eq((await as(ids.ben, `update public.tenants set contact_number = '0917 9' where tenant_id = $1`, [ids.t_ben])).rowCount, 1, 'contact');
        await denied(ids.ben, `update public.tenants set status = 'inactive' where tenant_id = $1`, [ids.t_ben]);
        await denied(ids.ben, `update public.tenants set user_id = null where tenant_id = $1`, [ids.t_ben]);
        await denied(ids.ben, `update public.tenants set photo_path = $2 where tenant_id = $1`, [ids.t_ben, `${ids.carl}/p.webp`]);
        eq((await as(ids.ben, `update public.tenants set photo_path = $2 where tenant_id = $1`, [ids.t_ben, `${ids.ben}/p.webp`])).rowCount, 1, 'own photo');
      },
    },
    {
      id: 'BE-IT-147', req: 'FR-023', module: 'M3', title: 'on_tenant_inactive and end_room_on_inactive: marking inactive ends the role, the login and the room',
      input: 'The owner marks Anna (manager, room 101) inactive.', expected: 'No manager, Anna\'s account inactive, her room 101 stay ended today.',
      fn: async () => {
        await as(ids.owner, `update public.tenants set status = 'inactive' where tenant_id = $1`, [ids.t_anna]);
        eq(await count(`select count(*) from public.tenant_manager`), 0, 'manager');
        eq((await db.query(`select status from public.profiles where id = $1`, [ids.anna])).rows[0].status, 'inactive', 'account');
        eq(await count(`select count(*) from public.room_assignments where tenant_id = $1 and date_ended is null`, [ids.t_anna]), 0, 'room');
      },
    },
    {
      id: 'BE-IT-148', req: 'FR-009', module: 'M6', title: 'on_payment_submitted: a proof turns an unpaid or overdue bill pending',
      input: 'Ben\'s bill is overdue; Ben sends a GCash proof.', expected: 'The bill is Pending.',
      fn: async () => {
        const b = await ganna();
        await db.query(`update public.monthly_bills set status = 'overdue' where bill_id = $1`, [b.bill_id]);
        await benPays(b);
        eq((await bill('ben')).status, 'pending', 'pending');
      },
    },
    {
      id: 'BE-IT-149', req: 'FR-025', module: 'M14', title: 'log_change writes a row for every logged table',
      input: 'Change one row in each logged table: rooms, tenants, room_assignments, billing_settings, tenant_manager, utility_bills, monthly_bills, payments, receipts, concerns, concern_messages, announcements.',
      expected: 'Each of the 12 tables has at least one history row.',
      fn: async () => {
        const b = await ganna();
        const p = await benPays(b);
        await as(ids.owner, `select * from public.verify_payment($1, true)`, [p]);
        await as(ids.owner, `update public.rooms set capacity = 7 where room_id = $1`, [ids.r102]);
        await as(ids.owner, `update public.billing_settings set due_day = 6`);
        await as(ids.owner, `update public.tenant_manager set tenant_id = $1`, [ids.t_ben]);
        await as(ids.ben, `insert into public.concerns (tenant_id, subject, details) values ($1, 'Leak', 'Sink')`, [ids.t_ben]);
        await as(ids.owner, `insert into public.announcements (title, message) values ('Note', 'Hello')`);
        const logged = (await db.query(`select distinct table_name from public.activity_logs`)).rows.map((r) => r.table_name);
        for (const t of ['rooms', 'tenants', 'room_assignments', 'billing_settings', 'tenant_manager', 'utility_bills', 'monthly_bills', 'payments', 'receipts', 'concerns', 'concern_messages', 'announcements']) {
          eq(logged.includes(t), true, t);
        }
      },
    },
    {
      id: 'BE-IT-150', req: 'FR-001', module: 'M3', title: 'room rules: no tenant into a full or inactive room; no deactivating a room with tenants; capacity not below its tenants',
      input: 'Room 203 at capacity 1 with one tenant: add another; deactivate room 101 (2 tenants); set room 101 capacity 1; deactivate empty room 202 and give it a tenant.',
      expected: 'All four refused; deactivating the empty room is allowed.',
      fn: async () => {
        await db.query(`update public.rooms set capacity = 1 where room_id = $1`, [ids.r203]);
        await db.query(`insert into public.room_assignments (tenant_id, room_id) values ($1, $2)`, [ids.t_dina, ids.r203]);
        await denied(ids.owner, `insert into public.room_assignments (tenant_id, room_id) values ($1, $2)`, [ids.t_fe, ids.r203]);
        await denied(ids.owner, `update public.rooms set status = 'inactive' where room_id = $1`, [ids.r101]);
        await denied(ids.owner, `update public.rooms set capacity = 1 where room_id = $1`, [ids.r101]);
        eq((await as(ids.owner, `update public.rooms set status = 'inactive' where room_id = $1`, [ids.r202])).rowCount, 1, 'empty room');
        await denied(ids.owner, `insert into public.room_assignments (tenant_id, room_id) values ($1, $2)`, [ids.t_fe, ids.r202]);
      },
    },
    {
      id: 'BE-IT-151', req: 'FR-014', module: 'M8', title: 'announcement_dates: publishing sets the posted date, a draft has none, text is trimmed',
      input: 'Insert "  Rules  " as a draft, publish it, set it back to draft.', expected: 'Draft: no date, title "Rules". Published: a date. Back to draft: no date.',
      fn: async () => {
        const a = await one(ids.owner, `insert into public.announcements (title, message) values ('  Rules  ', ' Be quiet ') returning announcement_id, title, published_at`);
        eq(`${a.title} ${a.published_at}`, 'Rules null', 'draft');
        await as(ids.owner, `update public.announcements set status = 'published' where announcement_id = $1`, [a.announcement_id]);
        eq((await db.query(`select published_at from public.announcements where announcement_id = $1`, [a.announcement_id])).rows[0].published_at !== null, true, 'posted');
        await as(ids.owner, `update public.announcements set status = 'draft' where announcement_id = $1`, [a.announcement_id]);
        eq((await db.query(`select published_at from public.announcements where announcement_id = $1`, [a.announcement_id])).rows[0].published_at, null, 'cleared');
      },
    },
    {
      id: 'BE-IT-152', req: 'FR-027', module: 'M18', title: 'bill_joiner: a tenant given a room after the bills exist gets a rent-only bill at once',
      input: 'October bills exist; the owner gives Dina room 201 from 2026-10-20.', expected: 'Dina has an October bill: rent 1,500, no shares, outside the split.',
      fn: async () => {
        await ganna();
        await as(ids.owner, `insert into public.room_assignments (tenant_id, room_id, date_started) values ($1, $2, '2026-10-20')`, [ids.t_dina, ids.r201]);
        const d = await bill('dina');
        eq(`${d.rent_share} ${d.electric_share} ${d.water_share} ${d.in_split}`, '1500.00 0.00 0.00 false', 'joiner');
      },
    },
    {
      id: 'BE-IT-153', req: 'FR-030', module: 'M7', title: 'concern triggers: the first message, who wrote it, and the owner\'s reply as the response',
      input: 'Ben submits a concern; Ben adds a message pretending to be the owner; the owner replies.',
      expected: 'First message = the details. Ben\'s message is saved as his (not the owner\'s). The owner\'s reply fills admin_response and responded_at.',
      fn: async () => {
        const c = (await one(ids.ben, `insert into public.concerns (tenant_id, subject, details) values ($1, 'Leak', 'The sink leaks.') returning concern_id`, [ids.t_ben])).concern_id;
        await as(ids.ben, `insert into public.concern_messages (concern_id, body, from_owner, author_id) values ($1, 'Fake', true, $2)`, [c, ids.owner]);
        const msgs = (await db.query(`select body, from_owner, author_id from public.concern_messages where concern_id = $1 order by message_id`, [c])).rows;
        eq(msgs[0].body, 'The sink leaks.', 'first'); eq(`${msgs[1].from_owner} ${msgs[1].author_id}`, `false ${ids.ben}`, 'not the owner');
        await as(ids.owner, `insert into public.concern_messages (concern_id, body) values ($1, 'Fixed today.')`, [c]);
        const k = (await db.query(`select admin_response, responded_at from public.concerns where concern_id = $1`, [c])).rows[0];
        eq(`${k.admin_response} ${k.responded_at !== null}`, 'Fixed today. true', 'response');
      },
    },

    // ---------------------------------------------------------------- 5. billing math end to end
    {
      id: 'BE-IT-154', req: 'FR-021', module: 'M5', title: 'every bill total is rent plus electric share plus water share',
      input: 'Save October: room 101 ₱1,200 (2 tenants), room 201 ₱600 (1), rest house ₱900 (3).', expected: 'Anna and Ben 1,500 + 600 + 300 = 2,400; Carl 1,500 + 600 + 300 = 2,400; every total equals its parts.',
      fn: async () => {
        await ganna();
        const rows = (await db.query(`select rent_share + electric_share + water_share = total_amount ok, total_amount from public.monthly_bills where billing_month = $1`, [MONTH])).rows;
        eq(rows.length, 3, 'bills'); eq(rows.every((r) => r.ok), true, 'parts'); eq(rows.map((r) => r.total_amount).join(), '2400.00,2400.00,2400.00', 'totals');
      },
    },
    {
      id: 'BE-IT-155', req: 'FR-020', module: 'M18', title: 'an uneven split rounds to the centavo and still adds up to the bill',
      input: 'Room 101 with 3 tenants and a ₱1,000 bill; rest house ₱1,000 over 4 tenants is even, ₱1,001 is not.',
      expected: 'Room 101: 333.34, 333.33, 333.33 (= 1,000.00). Water over 4: shares add up to 1,001.00.',
      fn: async () => {
        await db.query(`insert into public.room_assignments (tenant_id, room_id) values ($1, $2)`, [ids.t_dina, ids.r101]);
        await as(ids.anna, `select public.save_utility_bills($1, 1001, 'r.jpg', $2::jsonb)`, [MONTH, JSON.stringify([{ room_id: ids.r101, amount: 1000, photo_path: 'a.jpg' }])]);
        const room = (await db.query(`select electric_share from public.monthly_bills where billing_month = $1 and room_id = $2 order by tenant_id`, [MONTH, ids.r101])).rows.map((r) => r.electric_share);
        eq(room.join(' '), '333.34 333.33 333.33', 'room');
        const water = (await db.query(`select sum(water_share) s from public.monthly_bills where billing_month = $1`, [MONTH])).rows[0].s;
        eq(water, '1001.00', 'water adds up');
      },
    },
    {
      id: 'BE-IT-156', req: 'FR-027', module: 'M18', title: 'after a joiner, a leaver and a mover, the month\'s shares still follow the snapshot',
      input: 'October saved; Dina joins room 101, Carl is marked inactive, Ben moves to room 201; the manager saves again.',
      expected: 'Anna and Ben still split room 101 by 2 (600 each), Carl keeps room 201 by 1 (600), Dina pays rent only.',
      fn: async () => {
        await ganna();
        await as(ids.owner, `insert into public.room_assignments (tenant_id, room_id, date_started) values ($1, $2, '2026-10-20')`, [ids.t_dina, ids.r101]);
        await as(ids.owner, `update public.tenants set status = 'inactive' where tenant_id = $1`, [ids.t_carl]);
        await as(ids.owner, `select public.move_tenant($1, $2, '2026-10-21')`, [ids.t_ben, ids.r201]);
        await saveBills(ids.anna, ROOMS());
        eq(`${(await bill('anna')).electric_share} ${(await bill('ben')).electric_share} ${(await bill('carl')).electric_share} ${(await bill('dina')).electric_share}`,
          '600.00 600.00 600.00 0.00', 'shares');
        eq(`${(await bill('ben')).room_id}`, `${ids.r101}`, 'ben stays on room 101 for October');
      },
    },
    {
      id: 'BE-IT-157', req: 'FR-009', module: 'M6', title: 'a bill turns overdue only after its due date, and a paid bill never does',
      input: 'Due day 10. Carl pays in cash. refresh_overdue on Oct 10, then Oct 11.', expected: 'Oct 10: none. Oct 11: Anna and Ben Overdue, Carl stays Paid.',
      fn: async () => {
        await db.query(`update public.billing_settings set due_day = 10`);
        await ganna();
        await as(ids.owner, `select * from public.record_payment($1, 2400, '2026-10-09', 'cash')`, [(await bill('carl')).bill_id]);
        eq((await one(ids.owner, `select public.refresh_overdue('2026-10-10') n`)).n, 0, 'due day');
        eq((await one(ids.owner, `select public.refresh_overdue('2026-10-11') n`)).n, 2, 'after');
        eq(`${(await bill('ben')).status} ${(await bill('carl')).status}`, 'overdue paid', 'statuses');
      },
    },
    {
      id: 'BE-IT-158', req: 'FR-011', module: 'M6', title: 'receipt numbers go OR-000001 upward with no gaps, even around a rejection',
      input: 'Approve Anna\'s payment, reject Ben\'s, approve Carl\'s, then record a cash payment for Ben.', expected: 'OR-000001, OR-000002, OR-000003 in that order; the rejection takes no number.',
      fn: async () => {
        await ganna();
        const pay = async (name) => (await as(ids[name], `insert into public.payments (bill_id, amount, method, reference_no, proof_path) values ($1, 2400, 'gcash', '1', $2) returning payment_id`,
          [(await bill(name)).bill_id, `${ids[name]}/p.webp`])).rows[0].payment_id;
        const a = await pay('anna'); const b = await pay('ben'); const c = await pay('carl');
        const nums = [];
        nums.push((await one(ids.owner, `select * from public.verify_payment($1, true)`, [a])).receipt_number);
        await as(ids.owner, `select * from public.verify_payment($1, false)`, [b]);
        nums.push((await one(ids.owner, `select * from public.verify_payment($1, true)`, [c])).receipt_number);
        nums.push((await one(ids.owner, `select * from public.record_payment($1, 2400, '2026-10-20', 'cash')`, [(await bill('ben')).bill_id])).receipt_number);
        eq(nums.join(' '), 'OR-000001 OR-000002 OR-000003', 'numbers');
      },
    },

    // ---------------------------------------------------------------- 6. history logs
    {
      id: 'BE-IT-159', req: 'FR-025', module: 'M14', title: 'a change writes one row with the actor, the action and only the old and new values that changed',
      input: 'The owner changes Ben\'s contact number.', expected: 'One update row: actor owner, tenant Ben, old and new contact number, no other columns.',
      fn: async () => {
        await as(ids.owner, `update public.tenants set contact_number = '0917 4' where tenant_id = $1`, [ids.t_ben]);
        const logs = (await db.query(`select actor_name, action, tenant_id, old_data, new_data from public.activity_logs where table_name = 'tenants' and record_id = $1 and action = 'update'`, [String(ids.t_ben)])).rows;
        eq(logs.length, 1, 'one row');
        const l = logs[0];
        eq(`${l.actor_name} ${l.action} ${l.tenant_id}`, `owner update ${ids.t_ben}`, 'who and what');
        eq(Object.keys(l.new_data).filter((k) => k !== 'updated_at').join(), 'contact_number', 'changed columns only');
        eq(`${l.old_data.contact_number} -> ${l.new_data.contact_number}`, '0917 -> 0917 4', 'old and new');
      },
    },
    {
      id: 'BE-IT-160', req: 'FR-025', module: 'M14', title: 'an update that changes nothing but updated_at writes no row',
      input: 'Set Ben\'s updated_at only.', expected: '0 new history rows.',
      fn: async () => {
        const before = await count(`select count(*) from public.activity_logs`);
        await db.query(`update public.tenants set updated_at = now() where tenant_id = $1`, [ids.t_ben]);
        eq(await count(`select count(*) from public.activity_logs`), before, 'no row');
      },
    },
    {
      id: 'BE-IT-161', req: 'FR-025', module: 'M14', title: 'a tenant reads only the history rows about their own records',
      input: 'The owner changes Ben\'s and Carl\'s contact numbers; both read the logs.', expected: 'Ben sees only rows with his tenant id; Carl only his.',
      fn: async () => {
        await as(ids.owner, `update public.tenants set contact_number = '0917 5' where tenant_id in ($1, $2)`, [ids.t_ben, ids.t_carl]);
        for (const [uid, t] of [[ids.ben, ids.t_ben], [ids.carl, ids.t_carl]]) {
          const rows = (await as(uid, `select tenant_id from public.activity_logs`)).rows;
          eq(rows.length > 0 && rows.every((r) => String(r.tenant_id) === String(t)), true, `own rows for ${t}`);
        }
      },
    },
    {
      id: 'BE-IT-162', req: 'FR-025', module: 'M14', title: 'nobody edits or deletes a history row, the owner included',
      input: 'The owner and Ben try to update and delete history rows.', expected: '0 rows changed or deleted.',
      fn: async () => {
        await as(ids.owner, `update public.tenants set contact_number = '0917 6' where tenant_id = $1`, [ids.t_ben]);
        for (const uid of [ids.owner, ids.ben]) {
          eq((await as(uid, `update public.activity_logs set actor_name = 'x'`)).rowCount, 0, 'update');
          eq((await as(uid, `delete from public.activity_logs`)).rowCount, 0, 'delete');
        }
      },
    },
  ];
}

export function backendTests(db, helpers) {
  return Object.fromEntries(backendCases(db, helpers).map((c) => [`${c.id} ${c.title}`, c.fn]));
}
