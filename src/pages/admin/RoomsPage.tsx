import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronDown } from 'lucide-react';
import { AnimatedGroup } from '@/components/motion-primitives/animated-group';
import { Disclosure, DisclosureContent, DisclosureTrigger } from '@/components/motion-primitives/disclosure';
import { PageHeader } from '@/components/layout/PageHeader';
import { Chip, type ChipTone } from '@/components/ui/Chip';
import { btn } from '@/components/ui/buttons';
import { SelectField, TextField } from '@/components/ui/Field';
import { ConfirmDialog, MessageDialog, Modal } from '@/components/ui/Modal';
import { supabase } from '@/lib/supabase';
import {
  checkRoom, fetchRooms, occupancyText, roomRow, shownStatus, type Room, type RoomForm, type RoomStatusLabel, type RoomsData,
} from '@/lib/rooms';
import { cn, peso } from '@/lib/utils';

const TONE: Record<RoomStatusLabel, ChipTone> = { Occupied: 'info', Available: 'ok', Inactive: 'off' };
// Cards appear quickly, one after another (docs/design.md: under 300 ms).
const CARDS = {
  container: { visible: { transition: { staggerChildren: 0.04 } } },
  item: { hidden: { opacity: 0, y: 8 }, visible: { opacity: 1, y: 0, transition: { duration: 0.2 } } },
};

type Dialog =
  | { kind: 'add' }
  | { kind: 'edit'; room: Room }
  | { kind: 'view'; room: Room }
  | { kind: 'deactivate'; room: Room }
  | null;

function OccupancyBar({ room }: { room: Room }) {
  const pct = Math.min(100, Math.round((room.occupants.length / room.capacity) * 100));
  const full = room.occupants.length >= room.capacity;
  return (
    <div className="h-2 rounded-full bg-line" role="presentation">
      {pct > 0 && <div className={cn('h-2 rounded-full', full ? 'bg-navy' : 'bg-blue')} style={{ width: `${pct}%` }} />}
    </div>
  );
}

// Laptop and tablet card (Rooms-B.html, Rooms-B-Tablet.html).
function RoomCard({ room, rent, onOpen }: { room: Room; rent: number; onOpen: (d: Dialog) => void }) {
  const status = shownStatus(room);
  return (
    <article aria-label={`Room ${room.room_number}`} className="flex flex-col gap-3 rounded-card bg-card p-5 max-lg:rounded-[22px] max-lg:p-[18px]">
      <div className="flex items-center justify-between gap-2">
        <h3 className="m-0 text-[22px] font-extrabold text-navy max-lg:text-xl">Room {room.room_number}</h3>
        <Chip tone={TONE[status]}>{status}</Chip>
      </div>
      <OccupancyBar room={room} />
      <div className="flex justify-between gap-2 text-sm text-muted">
        <span>{occupancyText(room)}</span>
        <span>
          {peso(rent)}
          <span className="max-lg:hidden"> per tenant</span>
        </span>
      </div>
      <div className="flex gap-2 max-lg:gap-1.5">
        <button type="button" className={cn(btn.card, 'flex-1')} onClick={() => onOpen({ kind: 'view', room })}>
          View
        </button>
        <button type="button" className={cn(btn.card, 'flex-1')} onClick={() => onOpen({ kind: 'edit', room })}>
          Edit
        </button>
        {room.status !== 'inactive' && (
          <button type="button" className={cn(btn.cardDanger, 'flex-[1.3]')} onClick={() => onOpen({ kind: 'deactivate', room })}>
            Deactivate
          </button>
        )}
      </div>
    </article>
  );
}

// Phone card (Rooms-B-Phone.html): tap to open the room sheet.
function PhoneRoomCard({ room, onOpen }: { room: Room; onOpen: (d: Dialog) => void }) {
  const status = shownStatus(room);
  return (
    <button
      type="button"
      onClick={() => onOpen({ kind: 'view', room })}
      aria-label={`Room ${room.room_number}, ${status}, ${occupancyText(room)}`}
      className="flex w-full cursor-pointer flex-col gap-2.5 rounded-[20px] border-0 bg-card p-4 text-left"
    >
      <span className="flex w-full justify-between">
        <span className="text-lg font-extrabold text-navy">Room {room.room_number}</span>
        <Chip tone={TONE[status]}>{status}</Chip>
      </span>
      <span className="w-full">
        <OccupancyBar room={room} />
      </span>
    </button>
  );
}

function RoomFormDialog({
  data, editing, open, onClose, onSaved,
}: {
  data: RoomsData;
  editing?: Room;
  open: boolean;
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<RoomForm>(() => ({
    roomNumber: editing?.room_number ?? '',
    buildingId: String(editing?.building_id ?? data.buildings[0]?.building_id ?? ''),
    capacity: String(editing?.capacity ?? 8),
    status: editing?.status ?? 'available',
  }));
  const [error, setError] = useState('');
  const set = (key: keyof RoomForm) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const save = useMutation({
    mutationFn: async () => {
      const row = roomRow(form);
      const { error: dbError } = editing
        ? await supabase.from('rooms').update(row).eq('room_id', editing.room_id)
        : await supabase.from('rooms').insert(row);
      if (dbError) throw new Error(dbError.code === '23505' ? `Room ${row.room_number} already exists.` : dbError.message);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['rooms'] });
      onSaved(editing ? 'Room Updated Successfully' : 'Room Added Successfully');
    },
    onError: (e) => setError(e.message),
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const problem = checkRoom(form, data.rooms, editing);
    if (problem) setError(problem);
    else save.mutate();
  }

  return (
    <Modal open={open} onOpenChange={(o) => !o && onClose()} title={editing ? `Edit Room ${editing.room_number}` : 'Add Room'}>
      <form onSubmit={onSubmit} noValidate className="mt-4 flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-3.5 max-md:grid-cols-1">
          <TextField label="Room #" value={form.roomNumber} onChange={set('roomNumber')} />
          <SelectField
            label="Building"
            value={form.buildingId}
            onChange={set('buildingId')}
            options={data.buildings.map((b) => ({ value: String(b.building_id), label: b.name }))}
          />
          <div className="col-span-2 flex flex-col gap-2 max-md:col-span-1">
            <span className="text-sm font-semibold text-label">Rent</span>
            <span className="rounded-field bg-page px-4 py-3.5 text-base text-muted">{peso(data.monthlyRent)} per tenant, set in Settings</span>
          </div>
          <TextField label="Capacity" type="number" inputMode="numeric" min={1} max={8} value={form.capacity} onChange={set('capacity')} />
          <SelectField
            label="Status"
            value={form.status}
            onChange={set('status')}
            options={[
              { value: 'occupied', label: 'Occupied' },
              { value: 'available', label: 'Available' },
              { value: 'inactive', label: 'Inactive' },
            ]}
          />
        </div>
        <div className="mt-1 flex justify-end gap-2.5 max-md:grid max-md:grid-cols-2">
          <button type="button" className={btn.soft} onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className={btn.primary} disabled={save.isPending}>
            {editing ? 'Save Changes' : 'Add Room'}
          </button>
        </div>
      </form>
      <MessageDialog open={!!error} onClose={() => setError('')} tone="bad" title="Invalid Input" message={error} />
    </Modal>
  );
}

function RoomViewDialog({ room, rent, onClose, onOpen }: { room: Room; rent: number; onClose: () => void; onOpen: (d: Dialog) => void }) {
  const status = shownStatus(room);
  const slots = Math.max(0, room.capacity - room.occupants.length);
  return (
    <Modal open onOpenChange={(o) => !o && onClose()} title={`Room ${room.room_number}`} description={room.building}>
      <div className="mt-3 flex flex-col gap-3.5">
        <Chip tone={TONE[status]} className="self-start">
          {status}
        </Chip>
        <div className="grid grid-cols-3 gap-2">
          <div className="flex flex-col gap-0.5 rounded-2xl bg-page p-3">
            <span className="text-xs text-muted">Rent per tenant</span>
            <span className="text-[17px] font-extrabold">{peso(rent)}</span>
          </div>
          <div className="flex flex-col gap-0.5 rounded-2xl bg-page p-3">
            <span className="text-xs text-muted">Occupants</span>
            <span className="text-[17px] font-extrabold">
              {room.occupants.length} / {room.capacity}
            </span>
          </div>
          <div className="flex flex-col gap-0.5 rounded-2xl bg-ok-bg p-3">
            <span className="text-xs text-ok">Available Slots</span>
            <span className="text-[17px] font-extrabold text-ok">{slots}</span>
          </div>
        </div>
        <h3 className="m-0 mt-1 text-[15px] font-bold">Occupants</h3>
        {room.occupants.length ? (
          <ul className="m-0 grid list-none grid-cols-2 gap-2 p-0">
            {room.occupants.map((name) => (
              <li key={name} className="rounded-xl bg-soft px-3 py-2.5 text-sm">
                {name}
              </li>
            ))}
          </ul>
        ) : (
          <p className="m-0 text-sm text-muted">No tenants in this room yet.</p>
        )}
        <div className="mt-1 grid grid-cols-2 gap-2.5">
          <button type="button" className={btn.soft} onClick={onClose}>
            Back
          </button>
          <button type="button" className={btn.navy} onClick={() => onOpen({ kind: 'edit', room })}>
            Edit
          </button>
        </div>
        {room.status !== 'inactive' && (
          <button type="button" className={cn(btn.danger, 'md:hidden')} onClick={() => onOpen({ kind: 'deactivate', room })}>
            Deactivate
          </button>
        )}
      </div>
    </Modal>
  );
}

// Manage Rooms (FR-001 to FR-003). Flowchart page 3, design Rooms-B.
export default function RoomsPage() {
  const queryClient = useQueryClient();
  const rooms = useQuery({ queryKey: ['rooms'], queryFn: fetchRooms });
  const [dialog, setDialog] = useState<Dialog>(null);
  const [message, setMessage] = useState<{ title: string; text?: string; tone: 'ok' | 'bad' } | null>(null);

  const deactivate = useMutation({
    mutationFn: async (room: Room) => {
      const { error } = await supabase.from('rooms').update({ status: 'inactive' }).eq('room_id', room.room_id);
      if (error) throw error;
    },
    onSuccess: async (_d, room) => {
      await queryClient.invalidateQueries({ queryKey: ['rooms'] });
      setDialog(null);
      setMessage({ title: 'Room Deactivated', text: `Room ${room.room_number} no longer takes tenants.`, tone: 'ok' });
    },
    onError: (e) => {
      setDialog(null);
      setMessage({ title: 'Could Not Deactivate', text: e.message, tone: 'bad' });
    },
  });

  const header = (
    <PageHeader
      title="Rooms"
      aside={
        <button type="button" className={cn(btn.primary, 'max-md:px-4 max-md:py-2.5 max-md:text-sm')} onClick={() => setDialog({ kind: 'add' })} disabled={!rooms.data}>
          + Add Room
        </button>
      }
    />
  );

  if (rooms.isPending) return <>{header}<p role="status" className="text-muted">Loading rooms...</p></>;
  if (rooms.isError) return <>{header}<p role="alert" className="text-bad">Could not load the rooms: {rooms.error.message}</p></>;

  const data = rooms.data;
  const groups = data.buildings.map((b) => ({ building: b, rooms: data.rooms.filter((r) => r.building_id === b.building_id) }));
  const target = dialog && dialog.kind !== 'add' ? dialog.room : undefined;
  const occupied = target ? target.occupants.length : 0;

  return (
    <>
      {header}
      {/* Laptop and tablet: cards by building. */}
      <div className="flex flex-col gap-[18px] max-md:hidden">
        {groups.map(({ building, rooms: list }) => (
          <section key={building.building_id} aria-label={building.name} className="flex flex-col gap-4">
            <h2 className="m-0 mt-1 text-[17px] font-bold text-muted max-lg:text-base">{building.name}</h2>
            {list.length ? (
              <AnimatedGroup variants={CARDS} className="grid grid-cols-3 gap-4 max-lg:grid-cols-2 max-lg:gap-3.5">
                {list.map((room) => (
                  <RoomCard key={room.room_id} room={room} rent={data.monthlyRent} onOpen={setDialog} />
                ))}
              </AnimatedGroup>
            ) : (
              <p className="m-0 text-sm text-muted">No rooms in {building.name} yet.</p>
            )}
          </section>
        ))}
      </div>
      {/* Phone: rooms by building in a disclosure (docs/design.md). */}
      <div className="flex flex-col gap-3 md:hidden">
        {groups.map(({ building, rooms: list }) => (
          <Disclosure key={building.building_id} open className="flex flex-col gap-3" transition={{ duration: 0.2 }}>
            <DisclosureTrigger>
              <div className="flex cursor-pointer items-center justify-between rounded-full py-1 text-[15px] font-bold text-muted" aria-label={building.name}>
                <h2 className="m-0 text-[15px] font-bold">{building.name}</h2>
                <ChevronDown size={18} aria-hidden />
              </div>
            </DisclosureTrigger>
            <DisclosureContent>
              <div className="flex flex-col gap-3 pb-1">
                {list.map((room) => (
                  <PhoneRoomCard key={room.room_id} room={room} onOpen={setDialog} />
                ))}
              </div>
            </DisclosureContent>
          </Disclosure>
        ))}
      </div>

      {(dialog?.kind === 'add' || dialog?.kind === 'edit') && (
        <RoomFormDialog
          key={dialog.kind === 'edit' ? dialog.room.room_id : 'add'}
          open
          data={data}
          editing={dialog.kind === 'edit' ? dialog.room : undefined}
          onClose={() => setDialog(null)}
          onSaved={(title) => {
            setDialog(null);
            setMessage({ title, tone: 'ok' });
          }}
        />
      )}
      {dialog?.kind === 'view' && <RoomViewDialog room={dialog.room} rent={data.monthlyRent} onClose={() => setDialog(null)} onOpen={setDialog} />}
      {dialog?.kind === 'deactivate' &&
        (occupied > 0 ? (
          <MessageDialog
            open
            tone="bad"
            title="Move Its Tenants First"
            message={`Room ${dialog.room.room_number} has ${occupied} tenants. Move them to other rooms before you deactivate it.`}
            onClose={() => setDialog(null)}
          />
        ) : (
          <ConfirmDialog
            open
            danger
            title="Deactivate this room?"
            message={`Room ${dialog.room.room_number} will stop taking tenants. You can set it back to Available with Edit.`}
            confirmLabel="Deactivate"
            busy={deactivate.isPending}
            onConfirm={() => deactivate.mutate(dialog.room)}
            onCancel={() => setDialog(null)}
          />
        ))}
      <MessageDialog open={!!message} onClose={() => setMessage(null)} tone={message?.tone ?? 'ok'} title={message?.title ?? ''} message={message?.text} />
    </>
  );
}
