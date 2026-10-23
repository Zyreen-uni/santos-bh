// Database checks added by later modules (new migrations or module checks). They run after the
// 52 reference checks, with the same seed, inside the same rolled-back transaction.
export function extraTests(db, { as, denied, eq, ids, saveBills, ROOMS, bill, ganna }) {
  return {
    // ---------------- M2 Manage Rooms
    'M2 owner adds, edits and deactivates a room': async () => {
      const r = (await as(ids.owner, `insert into public.rooms (building_id, room_number, capacity) values (2, '204', 6) returning room_id, status`)).rows[0];
      eq(r.status, 'available', 'new room status');
      eq((await as(ids.owner, `update public.rooms set capacity = 8, room_number = '205' where room_id = $1`, [r.room_id])).rowCount, 1, 'edit');
      eq((await as(ids.owner, `update public.rooms set status = 'inactive' where room_id = $1`, [r.room_id])).rowCount, 1, 'deactivate');
      const log = (await db.query(`select actor_name, new_data from public.activity_logs where table_name = 'rooms' and record_id = $1 and action = 'update' order by log_id`, [String(r.room_id)])).rows;
      eq(log.length, 2, 'room changes logged'); eq(log[1].new_data.status, 'inactive', 'deactivation logged'); eq(log[1].actor_name, 'owner', 'by owner');
    },
    'M2 capacity over 8 is refused when adding a room': async () => {
      await denied(ids.owner, `insert into public.rooms (building_id, room_number, capacity) values (1, '103', 9)`);
      await denied(ids.owner, `insert into public.rooms (building_id, room_number, capacity) values (1, '103', 0)`);
    },
    'M2 room numbers are unique': async () => {
      await denied(ids.owner, `insert into public.rooms (building_id, room_number) values (2, '101')`);
    },
    'M2 a tenant cannot add, edit or deactivate rooms': async () => {
      await denied(ids.ben, `insert into public.rooms (building_id, room_number) values (1, '103')`);
      eq((await as(ids.ben, `update public.rooms set capacity = 4 where room_id = $1`, [ids.r101])).rowCount, 0, 'edit');
      eq((await as(ids.ben, `update public.rooms set status = 'inactive' where room_id = $1`, [ids.r203])).rowCount, 0, 'deactivate');
      eq((await as(ids.ben, `delete from public.rooms where room_id = $1`, [ids.r203])).rowCount, 0, 'delete');
      eq((await db.query(`select status, capacity from public.rooms where room_id = $1`, [ids.r101])).rows[0].capacity, 8, 'unchanged');
    },
    'M2 a tenant reads every room and the occupancy count is the active current tenants': async () => {
      eq((await as(ids.ben, `select * from public.rooms`)).rowCount, 5, 'rooms');
      const occ = async () => (await as(ids.owner, `select count(*)::int as n from public.room_assignments ra join public.tenants t using (tenant_id)
        where ra.room_id = $1 and ra.date_ended is null and t.status = 'active'`, [ids.r101])).rows[0].n;
      eq(await occ(), 2, 'anna and ben in 101');
      await db.query(`update public.tenants set status = 'inactive' where tenant_id = $1`, [ids.t_ben]);
      eq(await occ(), 1, 'inactive tenant leaves the count');
    },

    // ---------------- M3 Manage Tenants and Tenant Manager (migration 20261023000000_room_rules.sql)
    'M3 the 9th tenant in a room is refused': async () => {
      await as(ids.owner, `update public.rooms set capacity = 3 where room_id = $1`, [ids.r101]);
      await as(ids.owner, `insert into public.room_assignments (tenant_id, room_id) values ($1, $2)`, [ids.t_dina, ids.r101]);
      const err = await denied(ids.owner, `insert into public.room_assignments (tenant_id, room_id) values ($1, $2)`, [ids.t_fe, ids.r101]);
      eq(/Room 101 is full/.test(err.message), true, `full message: ${err.message}`);
      // A full room with 8 beds: fill 203 with 8 tenants, the 9th is refused.
      for (let i = 0; i < 8; i++) {
        const t = (await as(ids.owner, `insert into public.tenants (full_name, contact_number) values ($1, '0917') returning tenant_id`, [`T${i}`])).rows[0].tenant_id;
        await as(ids.owner, `insert into public.room_assignments (tenant_id, room_id) values ($1, $2)`, [t, ids.r203]);
      }
      await denied(ids.owner, `insert into public.room_assignments (tenant_id, room_id) values ($1, $2)`, [ids.t_fe, ids.r203]);
    },
    'M3 moving into a full room is refused, moving within free space works': async () => {
      await as(ids.owner, `update public.rooms set capacity = 1 where room_id = $1`, [ids.r201]);
      const a = (await db.query(`select assignment_id from public.room_assignments where tenant_id = $1 and date_ended is null`, [ids.t_ben])).rows[0].assignment_id;
      await denied(ids.owner, `update public.room_assignments set room_id = $1 where assignment_id = $2`, [ids.r201, a]);
      eq((await as(ids.owner, `update public.room_assignments set room_id = $1 where assignment_id = $2`, [ids.r102, a])).rowCount, 1, 'move to 102');
    },
    'M3 an inactive room takes no tenants': async () => {
      await as(ids.owner, `update public.rooms set status = 'inactive' where room_id = $1`, [ids.r203]);
      const err = await denied(ids.owner, `insert into public.room_assignments (tenant_id, room_id) values ($1, $2)`, [ids.t_dina, ids.r203]);
      eq(/inactive/.test(err.message), true, 'inactive message');
    },
    'M3 a room with tenants cannot be deactivated or set below its tenants': async () => {
      const e1 = await denied(ids.owner, `update public.rooms set status = 'inactive' where room_id = $1`, [ids.r101]);
      eq(/Move them first/.test(e1.message), true, 'deactivate message');
      await denied(ids.owner, `update public.rooms set capacity = 1 where room_id = $1`, [ids.r101]);
      eq((await as(ids.owner, `update public.rooms set capacity = 2 where room_id = $1`, [ids.r101])).rowCount, 1, 'capacity equal to tenants');
    },
    'M3 marking a tenant inactive ends the room assignment and frees the bed': async () => {
      await as(ids.owner, `update public.tenants set status = 'inactive' where tenant_id = $1`, [ids.t_ben]);
      const a = (await db.query(`select date_ended from public.room_assignments where tenant_id = $1`, [ids.t_ben])).rows[0];
      eq(a.date_ended !== null, true, 'assignment ended');
      eq((await db.query(`select public.room_occupants($1) as n`, [ids.r101])).rows[0].n, 1, 'room 101 has one tenant left');
      eq((await db.query(`select status from public.profiles where id = $1`, [ids.ben])).rows[0].status, 'inactive', 'login ended');
    },
    'M3 owner adds a tenant with a room and sees the rental history': async () => {
      const t = (await as(ids.owner, `insert into public.tenants (full_name, contact_number) values ('Paolo Ramos', '0956 678 9012') returning tenant_id`)).rows[0].tenant_id;
      await as(ids.owner, `insert into public.room_assignments (tenant_id, room_id, date_started) values ($1, $2, '2026-01-06')`, [t, ids.r203]);
      const cur = (await db.query(`select assignment_id from public.room_assignments where tenant_id = $1`, [t])).rows[0].assignment_id;
      await as(ids.owner, `update public.room_assignments set date_ended = '2026-05-31' where assignment_id = $1`, [cur]);
      await as(ids.owner, `insert into public.room_assignments (tenant_id, room_id, date_started) values ($1, $2, '2026-06-01')`, [t, ids.r102]);
      const h = (await as(ids.owner, `select r.room_number, ra.date_ended from public.room_assignments ra join public.rooms r using (room_id)
        where ra.tenant_id = $1 order by ra.date_started desc`, [t])).rows;
      eq(h.map((x) => x.room_number).join(), '102,203', 'history'); eq(h[0].date_ended, null, 'current room');
    },
    'M3 a tenant cannot add tenants, assign rooms or read another tenant': async () => {
      await denied(ids.ben, `insert into public.tenants (full_name, contact_number) values ('X', '1')`);
      await denied(ids.ben, `insert into public.room_assignments (tenant_id, room_id) values ($1, $2)`, [ids.t_ben, ids.r203]);
      eq((await as(ids.ben, `select * from public.tenants where tenant_id = $1`, [ids.t_anna])).rowCount, 0, 'other tenant');
      eq((await as(ids.ben, `select * from public.room_assignments where tenant_id = $1`, [ids.t_anna])).rowCount, 0, 'other history');
      eq((await as(ids.ben, `select * from public.profiles where id = $1`, [ids.anna])).rowCount, 0, 'other profile');
    },
    'M3 add_tenant saves the tenant and the room together; a full room saves neither': async () => {
      const id = (await as(ids.owner, `select public.add_tenant('Paolo Ramos', '0956 678 9012', $1, '2026-10-19', 'paolo@gmail.com') as id`, [ids.r203])).rows[0].id;
      const t = (await db.query(`select t.full_name, t.email, ra.room_id, ra.date_started from public.tenants t
        join public.room_assignments ra using (tenant_id) where t.tenant_id = $1`, [id])).rows[0];
      eq(t.full_name, 'Paolo Ramos', 'name'); eq(t.email, 'paolo@gmail.com', 'email'); eq(t.room_id, ids.r203, 'room');
      eq(t.date_started.toISOString().slice(0, 10), '2026-10-19', 'date started');
      await as(ids.owner, `update public.rooms set capacity = 2 where room_id = $1`, [ids.r101]);
      const before = (await db.query(`select count(*)::int as n from public.tenants`)).rows[0].n;
      await denied(ids.owner, `select public.add_tenant('Full Room', '0917 000 0000', $1, '2026-10-19')`, [ids.r101]);
      eq((await db.query(`select count(*)::int as n from public.tenants`)).rows[0].n, before, 'no half-saved tenant');
      await denied(ids.ben, `select public.add_tenant('X', '0917 000 0000', $1, '2026-10-19')`, [ids.r203]);
    },
    'M3 move_tenant ends the old stay the day before and starts the new one': async () => {
      await db.query(`update public.room_assignments set date_started = '2026-06-01' where tenant_id = $1`, [ids.t_ben]);
      await as(ids.owner, `select public.move_tenant($1, $2, '2026-10-20')`, [ids.t_ben, ids.r203]);
      const h = (await db.query(`select room_id, date_started, date_ended from public.room_assignments where tenant_id = $1 order by date_started`, [ids.t_ben])).rows;
      eq(h.length, 2, 'two stays'); eq(h[0].date_ended.toISOString().slice(0, 10), '2026-10-19', 'old stay ends the day before');
      eq(h[1].room_id, ids.r203, 'new room'); eq(h[1].date_ended, null, 'new stay is current');
      await as(ids.owner, `select public.move_tenant($1, $2, '2026-10-21')`, [ids.t_ben, ids.r203]);
      eq((await db.query(`select count(*)::int as n from public.room_assignments where tenant_id = $1`, [ids.t_ben])).rows[0].n, 2, 'same room: no change');
      await as(ids.owner, `select public.move_tenant($1, $2)`, [ids.t_dina, ids.r102]);
      eq((await db.query(`select room_id from public.room_assignments where tenant_id = $1 and date_ended is null`, [ids.t_dina])).rows[0].room_id, ids.r102, 'room for a tenant with none');
      await denied(ids.ben, `select public.move_tenant($1, $2)`, [ids.t_ben, ids.r102]);
    },
    // Migration 20261023010000_link_owner_created_login.sql: Supabase Auth writes app_metadata after the insert.
    'M3 owner-created login links when app_metadata.tenant_id arrives after the insert': async () => {
      const u = (await db.query(`insert into auth.users (id, email) values (gen_random_uuid(), 'fe.cruz@santosbh.local') returning id`)).rows[0].id;
      const stray = (await db.query(`select tenant_id from public.tenants where user_id = $1`, [u])).rows[0].tenant_id;
      await db.query(`update auth.users set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || $2::jsonb where id = $1`, [u, JSON.stringify({ tenant_id: ids.t_fe })]);
      eq((await db.query(`select user_id from public.tenants where tenant_id = $1`, [ids.t_fe])).rows[0].user_id, u, 'owner record linked');
      eq((await db.query(`select count(*)::int as n from public.tenants where tenant_id = $1`, [stray])).rows[0].n, 0, 'empty record removed');
      eq((await db.query(`select count(*)::int as n from public.tenants where user_id = $1`, [u])).rows[0].n, 1, 'one record for the login');
    },
    'M3 a login with records cannot be moved onto another tenant, and a taken record is refused': async () => {
      // ben's tenant record has a room, so it cannot be dropped for fe's record.
      await denied('server', `update auth.users set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || $2::jsonb where id = $1`, [ids.ben, JSON.stringify({ tenant_id: ids.t_fe })]);
      const u = (await db.query(`insert into auth.users (id, email) values (gen_random_uuid(), 'new.one@santosbh.local') returning id`)).rows[0].id;
      await denied('server', `update auth.users set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || $2::jsonb where id = $1`, [u, JSON.stringify({ tenant_id: ids.t_anna })]);
      eq((await db.query(`select user_id from public.tenants where tenant_id = $1`, [ids.t_anna])).rows[0].user_id, ids.anna, 'anna keeps her login');
    },
    'M3 marking the manager inactive ends manager access at the rule (is_manager, save_utility_bills, bill photos)': async () => {
      eq((await as(ids.anna, `select public.is_manager() as m`)).rows[0].m, true, 'anna is manager before');
      await as(ids.owner, `update public.tenants set status = 'inactive' where tenant_id = $1`, [ids.t_anna]);
      eq((await as(ids.anna, `select public.is_manager() as m`)).rows[0].m, false, 'is_manager after');
      eq((await db.query(`select count(*)::int as n from public.tenant_manager`)).rows[0].n, 0, 'manager row removed');
      await denied(ids.anna, `select public.save_utility_bills('2026-10-01', 900, '2026-10/rest.jpg', '[]')`);
      await denied(ids.anna, `select public.generate_monthly_bills('2026-10-01')`);
      await denied(ids.anna, `insert into storage.objects (bucket_id, name) values ('utility-bills', '2026-10/after.jpg')`);
    },
    'M3 a tenant cannot assign the manager: not the manager, not another tenant': async () => {
      await db.query(`delete from public.tenant_manager`);
      // non-manager tenant names themselves, and the former manager names someone else
      await denied(ids.ben, `insert into public.tenant_manager (setting_id, tenant_id) values (1, $1)`, [ids.t_ben]);
      await denied(ids.anna, `insert into public.tenant_manager (setting_id, tenant_id) values (1, $1)`, [ids.t_carl]);
      await db.query(`insert into public.tenant_manager (tenant_id) values ($1)`, [ids.t_anna]);
      // the current manager cannot hand the role on, and a non-manager cannot take it or remove it
      eq((await as(ids.anna, `update public.tenant_manager set tenant_id = $1`, [ids.t_ben])).rowCount, 0, 'manager passes the role');
      eq((await as(ids.ben, `update public.tenant_manager set tenant_id = $1`, [ids.t_ben])).rowCount, 0, 'tenant takes the role');
      eq((await as(ids.ben, `delete from public.tenant_manager`)).rowCount, 0, 'tenant removes the role');
      await denied(ids.ben, `insert into public.tenant_manager (setting_id, tenant_id) values (1, $1)
        on conflict (setting_id) do update set tenant_id = excluded.tenant_id`, [ids.t_ben]);
      eq((await db.query(`select tenant_id from public.tenant_manager`)).rows[0].tenant_id, ids.t_anna, 'manager unchanged');
    },
    // ---------------- M4 Settings
    'M4 due day outside 1 to 28 and rent of 0 or less are refused; the owner saves good values': async () => {
      for (const d of [0, 29, 31]) await denied(ids.owner, `update public.billing_settings set due_day = $1`, [d]);
      for (const r of [0, -1]) await denied(ids.owner, `update public.billing_settings set monthly_rent = $1`, [r]);
      eq((await as(ids.owner, `update public.billing_settings set monthly_rent = 1600, due_day = 28 where setting_id = 1`)).rowCount, 1, 'owner saves');
      const s = (await db.query(`select monthly_rent, due_day from public.billing_settings`)).rows[0];
      eq(s.monthly_rent, '1600.00', 'rent'); eq(s.due_day, 28, 'due day');
      eq((await as(ids.anna, `update public.billing_settings set monthly_rent = 1`)).rowCount, 0, 'the manager cannot change settings');
    },
    'M4 a rent change keeps the rent of bills already made; the next month uses the new rent': async () => {
      await saveBills(ids.anna, ROOMS());
      await as(ids.owner, `update public.billing_settings set monthly_rent = 1600`);
      // the manager corrects October after the change: the October rent stays
      await saveBills(ids.anna, ROOMS());
      const oct = (await db.query(`select distinct rent_share from public.monthly_bills where billing_month = '2026-10-01'`)).rows;
      eq(oct.map((r) => r.rent_share).join(), '1500.00', 'October keeps 1500');
      await as(ids.anna, `select public.save_utility_bills('2026-11-01', 900, '2026-11/rest.jpg', $1::jsonb)`, [JSON.stringify(ROOMS())]);
      const nov = (await db.query(`select distinct rent_share, total_amount from public.monthly_bills where billing_month = '2026-11-01' and tenant_id = $1`, [ids.t_ben])).rows[0];
      eq(nov.rent_share, '1600.00', 'November uses 1600'); eq(nov.total_amount, '2500.00', 'November total 1600 + 600 + 300');
      const log = (await db.query(`select old_data, new_data, actor_name from public.activity_logs where table_name = 'billing_settings' order by log_id desc limit 1`)).rows[0];
      eq(log.old_data.monthly_rent, 1500, 'old rent logged'); eq(log.new_data.monthly_rent, 1600, 'new rent logged'); eq(log.actor_name, 'owner', 'by owner');
    },
    // ---------------- M5 Utility Billing
    'M5 room_occupancy gives every signed-in user the active count per room, and nothing to visitors': async () => {
      const counts = async (uid) => Object.fromEntries((await as(uid, `select room_id, active_tenants from public.room_occupancy()`)).rows.map((r) => [r.room_id, r.active_tenants]));
      const ben = await counts(ids.ben);
      eq(ben[ids.r101], 2, '101'); eq(ben[ids.r201], 1, '201'); eq(ben[ids.r203], 0, '203');
      eq(JSON.stringify(await counts(ids.owner)), JSON.stringify(ben), 'same for the owner');
      await db.query(`update public.tenants set status = 'inactive' where tenant_id = $1`, [ids.t_ben]);
      eq((await counts(ids.anna))[ids.r101], 1, 'inactive tenant left out');
      await denied(null, `select * from public.room_occupancy()`);
    },
    'M5 manager_name gives every signed-in user the manager name only, and nothing to visitors': async () => {
      eq((await as(ids.carl, `select public.manager_name() as n`)).rows[0].n, 'ANNA', 'carl sees the manager name');
      await db.query(`update public.tenants set status = 'inactive' where tenant_id = $1`, [ids.t_anna]);
      eq((await as(ids.carl, `select public.manager_name() as n`)).rows[0].n, null, 'no manager after inactive');
      await denied(null, `select public.manager_name()`);
    },
    'M5 an empty room makes no electric bill and no tenant bill': async () => {
      const r = await saveBills(ids.anna, ROOMS());
      eq(r.rows[0].n, 3, 'three bills');
      eq((await db.query(`select count(*)::int as n from public.utility_bills where room_id = $1`, [ids.r203])).rows[0].n, 0, 'no utility row for 203');
      eq((await db.query(`select count(*)::int as n from public.monthly_bills where room_id = $1`, [ids.r203])).rows[0].n, 0, 'no tenant bill in 203');
    },
    'M5 the October sample gives the exact shares from docs/sample-data.md': async () => {
      // 27 tenants: 101 (7), 102 (6), 201 (8), 202 (6). The 4 reference tenants count, so add 23 more.
      const want = { [ids.r101]: 7, [ids.r102]: 6, [ids.r201]: 8, [ids.r202]: 6 };
      const have = { [ids.r101]: 2, [ids.r102]: 0, [ids.r201]: 1, [ids.r202]: 0 };
      for (const [room, n] of Object.entries(want)) {
        for (let i = have[room]; i < n; i++) {
          const t = (await db.query(`insert into public.tenants (full_name, contact_number) values ($1, '0917') returning tenant_id`, [`S${room}-${i}`])).rows[0].tenant_id;
          await db.query(`insert into public.room_assignments (tenant_id, room_id) values ($1, $2)`, [t, room]);
        }
      }
      await db.query(`update public.billing_settings set due_day = 25`);
      const rooms = [[ids.r101, 1960], [ids.r102, 1800], [ids.r201, 2400], [ids.r202, 1560]].map(([room_id, amount]) => ({ room_id, amount, photo_path: `2026-10/room-${room_id}.webp` }));
      const n = (await as(ids.anna, `select public.save_utility_bills('2026-10-01', 810, '2026-10/rest-house.webp', $1::jsonb) as n`, [JSON.stringify(rooms)])).rows[0].n;
      eq(n, 27, '27 October bills');
      const shares = (await db.query(`select room_id, electric_share, water_share, total_amount, due_date from public.monthly_bills where billing_month = '2026-10-01'`)).rows;
      const by = Object.fromEntries(shares.map((s) => [s.room_id, s]));
      eq(by[ids.r101].electric_share, '280.00', '101 electric 1960 / 7'); eq(by[ids.r101].total_amount, '1810.00', 'Luis 1810');
      eq(by[ids.r102].electric_share, '300.00', '102 electric 1800 / 6'); eq(by[ids.r102].total_amount, '1830.00', 'Maria 1830');
      eq(by[ids.r201].electric_share, '300.00', '201 electric 2400 / 8'); eq(by[ids.r201].total_amount, '1830.00', 'Ana 1830');
      eq(by[ids.r202].electric_share, '260.00', '202 electric 1560 / 6'); eq(by[ids.r202].total_amount, '1790.00', '202 total');
      eq(new Set(shares.map((s) => s.water_share)).size === 1 && shares[0].water_share === '30.00', true, 'water 810 / 27 = 30 each');
      eq(shares[0].due_date.toISOString().slice(0, 10), '2026-10-25', 'due Oct 25');
    },
    'M5 owner correction updates the bills at once; a non-manager tenant cannot save or upload bill photos': async () => {
      await saveBills(ids.anna, ROOMS());
      await as(ids.owner, `select public.save_utility_bills('2026-10-01', 900, '2026-10/rest.jpg', $1::jsonb)`,
        [JSON.stringify([{ room_id: ids.r101, amount: 1300, photo_path: '2026-10/101.jpg' }, { room_id: ids.r201, amount: 600, photo_path: '2026-10/201.jpg' }])]);
      eq((await bill('ben')).electric_share, '650.00', 'corrected 1300 / 2');
      eq((await db.query(`select entered_by from public.utility_bills where room_id = $1`, [ids.r101])).rows[0].entered_by, ids.owner, 'owner entered it');
      await denied(ids.carl, `select public.save_utility_bills('2026-10-01', 900, '2026-10/rest.jpg', '[]')`);
      await denied(ids.carl, `insert into storage.objects (bucket_id, name) values ('utility-bills', '2026-10/fake.webp')`);
      eq((await as(ids.carl, `update public.utility_bills set amount = 1`)).rowCount, 0, 'tenant cannot correct a row');
    },
    // ---------------- M6 Manage Payments (migration 20261025000000_payments.sql)
    'M6 record_payment saves a cash payment as paid with the next receipt number': async () => {
      const b = await ganna();
      const r = (await as(ids.owner, `select * from public.record_payment($1, 2400, '2026-10-20', 'cash')`, [b.bill_id])).rows[0];
      eq(r.receipt_number, 'OR-000001', 'receipt'); eq(r.bill_status, 'paid', 'paid in full'); eq(r.amount_paid, '2400.00', 'amount paid');
      const p = (await db.query(`select method, status, submitted_by, verified_by from public.payments where payment_id = $1`, [r.payment_id])).rows[0];
      eq(p.method, 'cash', 'method'); eq(p.status, 'verified', 'payment verified'); eq(p.submitted_by, ids.owner, 'recorded by owner'); eq(p.verified_by, ids.owner, 'verified by owner');
      await denied(ids.owner, `select * from public.record_payment($1, 10, '2026-10-20', 'cash')`, [b.bill_id]); // already paid
    },
    'M6 a part payment keeps the bill unpaid; the next payment gets the next receipt': async () => {
      const b = await ganna();
      eq((await as(ids.owner, `select * from public.record_payment($1, 1000, '2026-10-20', 'cash')`, [b.bill_id])).rows[0].bill_status, 'unpaid', 'part paid');
      const r2 = (await as(ids.owner, `select * from public.record_payment($1, 1400, '2026-10-21', 'cash')`, [b.bill_id])).rows[0];
      eq(r2.receipt_number, 'OR-000002', 'second receipt'); eq(r2.bill_status, 'paid', 'now paid');
    },
    'M6 record_payment refuses a tenant, an amount of 0, a GCash payment with no proof, and a future date': async () => {
      const b = await ganna();
      await denied(ids.ben, `select * from public.record_payment($1, 100, '2026-10-20', 'cash')`, [b.bill_id]);
      await denied(ids.owner, `select * from public.record_payment($1, 0, '2026-10-20', 'cash')`, [b.bill_id]);
      await denied(ids.owner, `select * from public.record_payment($1, 100, '2026-10-20', 'gcash', '123')`, [b.bill_id]);
      await denied(ids.owner, `select * from public.record_payment($1, 100, current_date + 30, 'cash')`, [b.bill_id]);
      eq((await bill('ben')).status, 'unpaid', 'nothing saved');
    },
    'M6 verify makes the next OR number, reject sets the bill back to unpaid': async () => {
      const b = await ganna();
      await db.query(`select setval('public.receipt_number_seq', 12, true)`); // the sample's latest receipt is OR-000012
      const pay = async () => (await as(ids.ben, `insert into public.payments (bill_id, amount, method, reference_no, proof_path)
        values ($1, 2400, 'gcash', '1023', $2) returning payment_id`, [b.bill_id, `${ids.ben}/oct.webp`])).rows[0].payment_id;
      const p1 = await pay();
      eq((await bill('ben')).status, 'pending', 'pending after proof');
      eq((await as(ids.owner, `select * from public.verify_payment($1, false)`, [p1])).rows[0].payment_status, 'rejected', 'rejected');
      eq((await bill('ben')).status, 'unpaid', 'unpaid after reject');
      const v = (await as(ids.owner, `select * from public.verify_payment($1, true)`, [await pay()])).rows[0];
      eq(v.receipt_number, 'OR-000013', 'next OR number'); eq((await bill('ben')).status, 'paid', 'paid');
    },
    'M6 refresh_overdue marks unpaid bills past the due date only, and a proof turns an overdue bill pending': async () => {
      await db.query(`update public.billing_settings set due_day = 25`);
      await ganna(); // October bills, due Oct 25
      const a = await bill('anna');
      await as(ids.anna, `insert into public.payments (bill_id, amount, method) values ($1, 100, 'cash')`, [a.bill_id]); // anna: pending
      eq((await as(ids.owner, `select public.refresh_overdue('2026-10-25') as n`)).rows[0].n, 0, 'on the due day: not overdue');
      eq((await as(ids.owner, `select public.refresh_overdue('2026-10-26') as n`)).rows[0].n, 2, 'ben and carl after the due day');
      eq((await bill('ben')).status, 'overdue', 'ben overdue'); eq((await bill('anna')).status, 'pending', 'pending stays pending');
      eq((await as(ids.owner, `select public.refresh_overdue('2026-10-26') as n`)).rows[0].n, 0, 'runs twice safely');
      await as(ids.ben, `insert into public.payments (bill_id, amount, method) values ($1, 2400, 'cash')`, [(await bill('ben')).bill_id]);
      eq((await bill('ben')).status, 'pending', 'overdue bill with a payment is pending');
    },
    'M6 the owner lists every bill; a tenant sees only their own bills, payments and receipts': async () => {
      await ganna();
      const b = await bill('ben');
      await as(ids.owner, `select * from public.record_payment($1, 2400, '2026-10-20', 'cash')`, [b.bill_id]);
      eq((await as(ids.owner, `select * from public.monthly_bills`)).rowCount, 3, 'owner bills');
      eq((await as(ids.carl, `select * from public.monthly_bills`)).rowCount, 1, 'carl bills');
      eq((await as(ids.carl, `select * from public.payments`)).rowCount, 0, 'carl payments');
      eq((await as(ids.carl, `select * from public.receipts`)).rowCount, 0, 'carl receipts');
      eq((await as(ids.ben, `select * from public.receipts`)).rowCount, 1, 'ben receipt');
    },
    // ---------------- M7 Manage Concerns (migration 20261026000000_concern_messages.sql)
    'M7 a new concern starts its conversation; the owner reply shows for the tenant and fills admin_response': async () => {
      const c = (await as(ids.ben, `insert into public.concerns (tenant_id, subject, details) values ($1, 'Leak', 'The sink leaks.') returning concern_id`, [ids.t_ben])).rows[0].concern_id;
      let msgs = (await as(ids.ben, `select body, from_owner, author_id from public.concern_messages where concern_id = $1 order by message_id`, [c])).rows;
      eq(msgs.length, 1, 'first message'); eq(msgs[0].body, 'The sink leaks.', 'details'); eq(msgs[0].from_owner, false, 'from tenant'); eq(msgs[0].author_id, ids.ben, 'author');
      await as(ids.owner, `insert into public.concern_messages (concern_id, body) values ($1, '  I will fix it today.  ')`, [c]);
      msgs = (await as(ids.ben, `select body, from_owner from public.concern_messages where concern_id = $1 order by message_id`, [c])).rows;
      eq(msgs.length, 2, 'tenant sees the reply'); eq(msgs[1].body, 'I will fix it today.', 'trimmed reply'); eq(msgs[1].from_owner, true, 'from owner');
      const concern = (await db.query(`select admin_response, responded_at from public.concerns where concern_id = $1`, [c])).rows[0];
      eq(concern.admin_response, 'I will fix it today.', 'admin_response'); eq(concern.responded_at !== null, true, 'responded_at');
      await as(ids.ben, `insert into public.concern_messages (concern_id, body) values ($1, 'Thank you po.')`, [c]);
      eq((await db.query(`select admin_response from public.concerns where concern_id = $1`, [c])).rows[0].admin_response, 'I will fix it today.', 'tenant reply does not change admin_response');
    },
    'M7 an empty response and someone else\'s conversation are refused; nobody fakes the owner': async () => {
      const c = (await as(ids.ben, `insert into public.concerns (tenant_id, subject, details) values ($1, 'Leak', 'Sink') returning concern_id`, [ids.t_ben])).rows[0].concern_id;
      await denied(ids.owner, `insert into public.concern_messages (concern_id, body) values ($1, '   ')`, [c]);
      await denied(ids.anna, `insert into public.concern_messages (concern_id, body) values ($1, 'Not mine')`, [c]);
      eq((await as(ids.anna, `select * from public.concern_messages where concern_id = $1`, [c])).rowCount, 0, 'anna cannot read it');
      await as(ids.ben, `insert into public.concern_messages (concern_id, body, from_owner, author_id) values ($1, 'Fake owner', true, $2)`, [c, ids.owner]);
      const m = (await db.query(`select from_owner, author_id from public.concern_messages where body = 'Fake owner'`)).rows[0];
      eq(m.from_owner, false, 'not from owner'); eq(m.author_id, ids.ben, 'author is ben');
      eq((await as(ids.ben, `update public.concern_messages set body = 'x'`)).rowCount, 0, 'no edits');
      eq((await as(ids.owner, `delete from public.concern_messages`)).rowCount, 0, 'no deletes');
    },
    'M7 a status change is logged with the old and new status': async () => {
      const c = (await as(ids.ben, `insert into public.concerns (tenant_id, subject, details) values ($1, 'Leak', 'Sink') returning concern_id`, [ids.t_ben])).rows[0].concern_id;
      await as(ids.owner, `update public.concerns set status = 'in_progress', updated_at = now() where concern_id = $1`, [c]);
      const log = (await db.query(`select actor_name, old_data, new_data, tenant_id from public.activity_logs where table_name = 'concerns' and record_id = $1 and action = 'update'`, [String(c)])).rows;
      eq(log.length, 1, 'one log'); eq(log[0].old_data.status, 'pending', 'old'); eq(log[0].new_data.status, 'in_progress', 'new');
      eq(log[0].actor_name, 'owner', 'by owner'); eq(log[0].tenant_id, ids.t_ben, 'about ben');
      eq((await as(ids.ben, `select * from public.activity_logs where table_name = 'concern_messages'`)).rowCount, 1, 'ben sees his message log');
    },
    'M7 owner_name gives signed-in users the owner name only, and nothing to visitors': async () => {
      await db.query(`update auth.users set raw_user_meta_data = '{"full_name": "Brian Santos"}' where id = $1`, [ids.owner]);
      eq((await as(ids.ben, `select public.owner_name() as n`)).rows[0].n, 'Brian Santos', 'ben sees the owner name');
      await denied(null, `select public.owner_name()`);
    },
    'M7 record_payment refuses an amount above the balance (M6 review)': async () => {
      const b = await ganna();
      const err = await denied(ids.owner, `select * from public.record_payment($1, 2400.01, '2026-10-20', 'cash')`, [b.bill_id]);
      eq(err.message, 'The amount is more than the balance of this bill', 'message');
      await as(ids.owner, `select * from public.record_payment($1, 1000, '2026-10-20', 'cash')`, [b.bill_id]);
      await denied(ids.owner, `select * from public.record_payment($1, 1400.01, '2026-10-20', 'cash')`, [b.bill_id]);
      eq((await as(ids.owner, `select * from public.record_payment($1, 1400, '2026-10-20', 'cash')`, [b.bill_id])).rows[0].bill_status, 'paid', 'the exact balance is fine');
    },
    // ---------------- M8 Manage Announcements (migration 20261027000000_announcement_dates.sql)
    'M8 a draft has no posted date; publishing sets it and keeps it through edits; back to draft clears it': async () => {
      const a = (await as(ids.owner, `insert into public.announcements (title, message) values (' Room inspection ', 'Keep beds tidy.') returning announcement_id, status, published_at, title`)).rows[0];
      eq(a.status, 'draft', 'draft by default'); eq(a.published_at, null, 'no date'); eq(a.title, 'Room inspection', 'trimmed');
      await as(ids.owner, `update public.announcements set status = 'published' where announcement_id = $1`, [a.announcement_id]);
      const posted = (await db.query(`select published_at from public.announcements where announcement_id = $1`, [a.announcement_id])).rows[0].published_at;
      eq(posted !== null, true, 'posted date set');
      await as(ids.owner, `update public.announcements set message = 'Keep beds and lockers tidy.' where announcement_id = $1`, [a.announcement_id]);
      eq(String((await db.query(`select published_at from public.announcements where announcement_id = $1`, [a.announcement_id])).rows[0].published_at), String(posted), 'kept on edit');
      await as(ids.owner, `update public.announcements set status = 'draft' where announcement_id = $1`, [a.announcement_id]);
      eq((await db.query(`select published_at from public.announcements where announcement_id = $1`, [a.announcement_id])).rows[0].published_at, null, 'cleared');
    },
    'M8 an empty title or message is refused': async () => {
      await denied(ids.owner, `insert into public.announcements (title, message) values ('', 'Hi')`);
      await denied(ids.owner, `insert into public.announcements (title, message) values ('Hi', '   ')`);
    },
    'M8 tenants never see drafts and cannot write; the owner edits and deletes': async () => {
      const d = (await as(ids.owner, `insert into public.announcements (title, message) values ('Secret draft', 'Later') returning announcement_id`)).rows[0].announcement_id;
      eq((await as(ids.ben, `select * from public.announcements where announcement_id = $1`, [d])).rowCount, 0, 'draft hidden');
      eq((await as(ids.ben, `select * from public.announcements where status = 'draft'`)).rowCount, 0, 'no drafts at all');
      eq((await as(ids.ben, `update public.announcements set title = 'x'`)).rowCount, 0, 'tenant edit');
      eq((await as(ids.ben, `delete from public.announcements`)).rowCount, 0, 'tenant delete');
      eq((await as(ids.owner, `delete from public.announcements where announcement_id = $1`, [d])).rowCount, 1, 'owner deletes');
      const log = (await db.query(`select action, old_data from public.activity_logs where table_name = 'announcements' and record_id = $1 order by log_id`, [String(d)])).rows;
      eq(log.map((l) => l.action).join(), 'insert,delete', 'logged'); eq(log[1].old_data.title, 'Secret draft', 'deleted title kept in the log');
    },
    // ---------------- M11 My Profile and My Room (migration 20261028000000_roommates.sql)
    'M11 my_roommates lists only the other active tenants of my own room': async () => {
      const r = (await as(ids.anna, `select full_name from public.my_roommates()`)).rows.map((x) => x.full_name);
      eq(r.join(), 'BEN', 'anna sees ben (room 101)');
      eq((await as(ids.carl, `select * from public.my_roommates()`)).rowCount, 0, 'carl alone in 201');
      eq((await as(ids.dina, `select * from public.my_roommates()`)).rowCount, 0, 'no room, no roommates');
      await db.query(`update public.tenants set status = 'inactive' where tenant_id = $1`, [ids.t_ben]);
      eq((await as(ids.anna, `select * from public.my_roommates()`)).rowCount, 0, 'inactive roommate left');
      await denied(null, `select * from public.my_roommates()`);
    },
    'M11 a tenant edits their own name, email and contact; the change is logged; not another tenant': async () => {
      eq((await as(ids.ben, `update public.tenants set full_name = 'Ben Dela Cruz', email = 'ben@gmail.com', contact_number = '0917 000 1234' where tenant_id = $1`, [ids.t_ben])).rowCount, 1, 'own row');
      const log = (await db.query(`select actor_name, old_data, new_data, tenant_id from public.activity_logs where table_name = 'tenants' and record_id = $1 and action = 'update' order by log_id desc limit 1`, [String(ids.t_ben)])).rows[0];
      eq(log.actor_name, 'benny', 'by ben'); eq(log.old_data.full_name, 'BEN', 'old name'); eq(log.new_data.full_name, 'Ben Dela Cruz', 'new name'); eq(log.tenant_id, ids.t_ben, 'about ben');
      eq((await as(ids.ben, `update public.tenants set full_name = 'X' where tenant_id = $1`, [ids.t_anna])).rowCount, 0, 'not anna');
      await denied(ids.ben, `update public.tenants set photo_path = $1 where tenant_id = $2`, [`${ids.anna}/me.webp`, ids.t_ben]);
    },
    'M11 change_username is for the server only and refuses a taken or bad username': async () => {
      await denied(ids.ben, `select public.change_username($1, 'benjamin')`, [ids.ben]);
      await denied('server', `select public.change_username($1, 'anna')`, [ids.ben]);
      await denied('server', `select public.change_username($1, 'B!')`, [ids.ben]);
      await as('server', `select public.change_username($1, 'benjamin')`, [ids.ben]);
      eq((await db.query(`select username from public.profiles where id = $1`, [ids.ben])).rows[0].username, 'benjamin', 'renamed');
    },
    // ---------------- M12 My Payments (migration 20261029000000_gcash.sql)
    'M12 the owner sets the GCash account, tenants read it but cannot change it': async () => {
      eq((await as(ids.owner, `update public.billing_settings set gcash_name = 'Brian Santos', gcash_number = '0917 555 0123'`)).rowCount, 1, 'owner sets');
      eq((await as(ids.ben, `select gcash_name, gcash_number from public.billing_settings`)).rows[0].gcash_number, '0917 555 0123', 'tenant reads');
      eq((await as(ids.ben, `update public.billing_settings set gcash_number = '0999 999 9999'`)).rowCount, 0, 'tenant cannot change');
      await denied(ids.owner, `update public.billing_settings set gcash_number = 'call me'`);
    },
    'M12 utility_entered names who entered the month and when, for any signed-in user only': async () => {
      await saveBills(ids.anna, ROOMS());
      const r = (await as(ids.carl, `select * from public.utility_entered('2026-10-01')`)).rows;
      eq(r.length, 1, 'one row'); eq(r[0].entered_by, 'ANNA', 'the manager'); eq(r[0].entered_at !== null, true, 'when');
      eq((await as(ids.carl, `select * from public.utility_entered('2026-09-01')`)).rowCount, 0, 'no bills that month');
      await denied(null, `select * from public.utility_entered('2026-10-01')`);
    },
    'M12 a tenant submits a GCash proof for their own bill only, and it starts as pending': async () => {
      const b = await ganna();
      const p = (await as(ids.ben, `insert into public.payments (bill_id, amount, method, reference_no, proof_path) values ($1, 2400, 'gcash', '1023 456', $2) returning status, submitted_by`, [b.bill_id, `${ids.ben}/oct.webp`])).rows[0];
      eq(p.status, 'pending', 'pending'); eq(p.submitted_by, ids.ben, 'submitted by ben');
      eq((await bill('ben')).status, 'pending', 'bill pending');
      const anna = await bill('anna');
      await denied(ids.ben, `insert into public.payments (bill_id, amount, method, reference_no, proof_path) values ($1, 100, 'gcash', '1', $2)`, [anna.bill_id, `${ids.ben}/x.webp`]);
      eq((await as(ids.carl, `select * from public.payments`)).rowCount, 0, 'carl sees no other payments');
    },
    // ---------------- M13 My Concerns and Announcements
    'M13 a submitted concern gets the next number, starts Pending and opens its conversation': async () => {
      const a = (await as(ids.ben, `insert into public.concerns (tenant_id, subject, details) values ($1, 'Leak', 'The sink leaks.') returning concern_id, status`, [ids.t_ben])).rows[0];
      const b = (await as(ids.ben, `insert into public.concerns (tenant_id, subject, details) values ($1, 'Fan', 'The fan is noisy.') returning concern_id`, [ids.t_ben])).rows[0];
      eq(a.status, 'pending', 'pending'); eq(Number(b.concern_id), Number(a.concern_id) + 1, 'next number');
      eq((await as(ids.ben, `select body, from_owner from public.concern_messages where concern_id = $1`, [b.concern_id])).rows, [{ body: 'The fan is noisy.', from_owner: false }], 'first message');
      await denied(ids.ben, `insert into public.concerns (tenant_id, subject, details, status) values ($1, 'Leak', 'Sink', 'resolved')`, [ids.t_ben]);
      await denied(ids.ben, `insert into public.concerns (tenant_id, subject, details) values ($1, 'Leak', 'Sink')`, [ids.t_anna]);
      eq((await as(ids.ben, `update public.concerns set status = 'resolved' where concern_id = $1`, [a.concern_id])).rowCount, 0, 'tenant cannot change the status');
      eq((await as(ids.anna, `select * from public.concerns where concern_id = $1`, [a.concern_id])).rowCount, 0, 'anna cannot see it');
    },
    'M13 tenants see only published announcements; the owner sees drafts too': async () => {
      await as(ids.owner, `insert into public.announcements (title, message, status) values ('Posted', 'Hello', 'published'), ('Hidden', 'Soon', 'draft')`);
      eq((await as(ids.ben, `select title from public.announcements where title in ('Posted', 'Hidden') order by title`)).rows.map((r) => r.title), ['Posted'], 'tenant');
      eq((await as(ids.owner, `select title from public.announcements where title in ('Posted', 'Hidden') order by title`)).rows.map((r) => r.title), ['Hidden', 'Posted'], 'owner');
      await denied(ids.ben, `insert into public.announcements (title, message, status) values ('Mine', 'x', 'published')`);
    },
    'M3 manager swap: the old manager loses the role at once': async () => {
      eq((await as(ids.owner, `insert into public.tenant_manager (setting_id, tenant_id) values (1, $1)
        on conflict (setting_id) do update set tenant_id = excluded.tenant_id, assigned_at = now()`, [ids.t_carl])).rowCount, 1, 'upsert');
      eq((await as(ids.carl, `select public.is_manager() as m`)).rows[0].m, true, 'carl is manager');
      eq((await as(ids.anna, `select public.is_manager() as m`)).rows[0].m, false, 'anna is not');
      await denied(ids.anna, `select public.save_utility_bills('2026-10-01', 900, 'a', '[]')`);
    },
  };
}
