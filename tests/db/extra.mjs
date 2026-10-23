// Database checks added by later modules (new migrations or module checks). They run after the
// 52 reference checks, with the same seed, inside the same rolled-back transaction.
export function extraTests(db, { as, denied, eq, ids }) {
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
  };
}
