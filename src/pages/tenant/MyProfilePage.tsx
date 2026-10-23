import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, BedDouble, Camera, Image as ImageIcon, Trash2 } from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { Chip } from '@/components/ui/Chip';
import { btn } from '@/components/ui/buttons';
import { TextField } from '@/components/ui/Field';
import { MessageDialog, Modal } from '@/components/ui/Modal';
import { initials, useAuth } from '@/lib/auth';
import { changePhoto, changeUsername, checkProfile, fetchMyProfile, removePhoto, saveDetails, type MyProfile, type ProfileForm } from '@/lib/profile';
import { supabase } from '@/lib/supabase';
import { shortDate } from '@/lib/tenants';
import { cn, peso } from '@/lib/utils';

type Message = { title: string; text?: string; tone: 'ok' | 'bad' } | null;

function Avatar({ profile, size = 80 }: { profile: MyProfile; size?: 80 | 34 }) {
  const cls = size === 80 ? 'size-20 text-2xl' : 'size-[34px] text-xs';
  return profile.photo_url ? (
    <img src={profile.photo_url} alt={`Profile photo of ${profile.full_name}`} className={cn('rounded-full object-cover', cls)} />
  ) : (
    <span role="img" aria-label={`Profile photo of ${profile.full_name}`} className={cn('flex items-center justify-center rounded-full bg-soft-blue font-bold text-navy', cls)}>
      {initials(profile.full_name)}
    </span>
  );
}

function useProfileActions(profile: MyProfile, onDone: (m: Message) => void) {
  const queryClient = useQueryClient();
  const { account } = useAuth();
  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ['my-profile'] });
    await queryClient.invalidateQueries({ queryKey: ['account'] });
  };
  const setPhoto = useMutation({
    mutationFn: (file: File) => changePhoto(account!.userId, profile.tenant_id, file, profile.photo_path),
    onSuccess: async () => {
      await refresh();
      onDone({ title: 'Changes Saved', text: 'Your new profile photo is saved.', tone: 'ok' });
    },
    onError: (e) => onDone({ title: 'Could Not Save the Photo', text: e.message, tone: 'bad' }),
  });
  const dropPhoto = useMutation({
    mutationFn: () => removePhoto(profile.tenant_id, profile.photo_path),
    onSuccess: async () => {
      await refresh();
      onDone({ title: 'Changes Saved', text: 'Your profile photo is removed.', tone: 'ok' });
    },
    onError: (e) => onDone({ title: 'Could Not Remove the Photo', text: e.message, tone: 'bad' }),
  });
  return { setPhoto, dropPhoto, refresh };
}

// Phone: Take a Photo, Choose from Gallery, Remove Photo (Prof-C-Phone-Photo.html). Laptop and tablet: Change Photo, Remove.
function PhotoSheet({ profile, onClose, onDone }: { profile: MyProfile; onClose: () => void; onDone: (m: Message) => void }) {
  const camera = useRef<HTMLInputElement>(null);
  const gallery = useRef<HTMLInputElement>(null);
  const { setPhoto, dropPhoto } = useProfileActions(profile, onDone);
  const pick = (f?: File) => {
    if (!f) return;
    if (!f.type.startsWith('image/')) onDone({ title: 'Invalid Input', text: 'The photo must be an image, such as a JPG or PNG.', tone: 'bad' });
    else setPhoto.mutate(f);
  };
  const option = 'flex w-full cursor-pointer items-center gap-3 rounded-field border-0 bg-soft px-4 py-3.5 text-left text-[15px] font-semibold text-ink hover:bg-soft-blue';
  return (
    <Modal open onOpenChange={(o) => !o && onClose()} title="Change Profile Photo">
      <div className="mt-4 flex flex-col gap-2.5">
        <button type="button" className={cn(option, 'md:hidden')} onClick={() => camera.current?.click()} disabled={setPhoto.isPending}>
          <Camera size={20} aria-hidden />
          Take a Photo
        </button>
        <button type="button" className={option} onClick={() => gallery.current?.click()} disabled={setPhoto.isPending}>
          <ImageIcon size={20} aria-hidden />
          <span className="md:hidden">Choose from Gallery</span>
          <span className="max-md:hidden">Change Photo</span>
        </button>
        {profile.photo_path && (
          <button type="button" className={cn(option, 'text-bad')} onClick={() => dropPhoto.mutate()} disabled={dropPhoto.isPending}>
            <Trash2 size={20} aria-hidden />
            <span className="md:hidden">Remove Photo</span>
            <span className="max-md:hidden">Remove</span>
          </button>
        )}
        <button type="button" className={cn(btn.soft, 'mt-1')} onClick={onClose}>
          Cancel
        </button>
        <input ref={camera} type="file" accept="image/*" capture="user" className="sr-only" tabIndex={-1} aria-hidden="true" onChange={(e) => pick(e.target.files?.[0])} />
        <input ref={gallery} type="file" accept="image/*" className="sr-only" tabIndex={-1} aria-hidden="true" data-photo-input="gallery" onChange={(e) => pick(e.target.files?.[0])} />
      </div>
    </Modal>
  );
}

// Edit Profile (Prof-C-Tablet.html): photo, Full Name, Username, Email, Contact #.
function EditProfile({ profile, onClose, onDone }: { profile: MyProfile; onClose: () => void; onDone: (m: Message) => void }) {
  const { account } = useAuth();
  const { refresh, dropPhoto } = useProfileActions(profile, onDone);
  const [form, setForm] = useState<ProfileForm>({ fullName: profile.full_name, username: profile.username, email: profile.email ?? '', contactNumber: profile.contact_number });
  const [photo, setPhotoFile] = useState<File | null>(null);
  const [error, setError] = useState('');
  const file = useRef<HTMLInputElement>(null);
  const set = (key: keyof ProfileForm) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [key]: e.target.value }));
  // A preview of the chosen photo, released when it changes or the popup closes.
  const preview = useMemo(() => (photo ? URL.createObjectURL(photo) : null), [photo]);
  useEffect(() => () => {
    if (preview) URL.revokeObjectURL(preview);
  }, [preview]);

  const save = useMutation({
    mutationFn: async () => {
      if (photo) await changePhoto(account!.userId, profile.tenant_id, photo, profile.photo_path);
      await saveDetails(profile.tenant_id, form);
      if (form.username.trim().toLowerCase() !== profile.username) await changeUsername(supabase, form.username);
    },
    onSuccess: async () => {
      await refresh();
      onDone({ title: 'Changes Saved', tone: 'ok' });
    },
    onError: (e) => setError(e.message),
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const problem = checkProfile(form, photo);
    if (problem) setError(problem);
    else save.mutate();
  }

  return (
    <Modal open onOpenChange={(o) => !o && onClose()} title="Edit Profile" className="max-w-[600px] max-md:max-h-[92svh] max-md:overflow-y-auto">
      <form onSubmit={onSubmit} noValidate className="mt-4 flex flex-col gap-4">
        <div className="flex items-center gap-4">
          {preview ? (
            <img src={preview} alt="New profile photo" className="size-20 rounded-full object-cover" />
          ) : (
            <Avatar profile={profile} />
          )}
          <div className="flex flex-col gap-2">
            <span className="text-[15px] font-bold">Profile Photo</span>
            <div className="flex gap-2">
              <button type="button" className={cn(btn.soft, 'px-4 py-2 text-sm')} onClick={() => file.current?.click()}>
                Change Photo
              </button>
              {(profile.photo_path || photo) && (
                <button
                  type="button"
                  className={cn(btn.danger, 'px-4 py-2 text-sm')}
                  onClick={() => (photo ? setPhotoFile(null) : dropPhoto.mutate())}
                  disabled={dropPhoto.isPending}
                >
                  Remove
                </button>
              )}
            </div>
            <span className="text-[13px] text-muted">JPG or PNG. It is resized to save space.</span>
            <input ref={file} type="file" accept="image/*" className="sr-only" tabIndex={-1} aria-hidden="true" onChange={(e) => setPhotoFile(e.target.files?.[0] ?? null)} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3.5 max-md:grid-cols-1">
          <TextField label="Full Name" autoComplete="name" value={form.fullName} onChange={set('fullName')} />
          <TextField label="Username" autoCapitalize="none" autoComplete="username" value={form.username} onChange={set('username')} />
          <TextField label="Email" type="email" autoComplete="email" value={form.email} onChange={set('email')} />
          <TextField label="Contact #" type="tel" autoComplete="tel" value={form.contactNumber} onChange={set('contactNumber')} />
        </div>
        <span className="text-[13px] text-muted">
          {profile.date_started ? `Date Started (${shortDate(profile.date_started)}) and room are set by the owner.` : 'Your room is set by the owner.'}
          {form.username.trim().toLowerCase() !== profile.username && ' A new username is your new login.'}
        </span>
        <div className="flex gap-2.5">
          <button type="button" className={cn(btn.soft, 'flex-1')} onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className={cn(btn.primary, 'flex-[2]')} disabled={save.isPending}>
            {save.isPending ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </form>
      <MessageDialog open={!!error} onClose={() => setError('')} tone="bad" title="Invalid Input" message={error} />
    </Modal>
  );
}

function ProfileCards({ profile, isManager, onPhoto }: { profile: MyProfile; isManager: boolean; onPhoto: () => void }) {
  const rows: [string, string][] = [
    ['Full Name', profile.full_name],
    ['Username', profile.username],
    ['Email', profile.email || 'None'],
    ['Contact #', profile.contact_number],
    ['Date Started', profile.date_started ? shortDate(profile.date_started) : 'None'],
  ];
  return (
    <div className="flex flex-col gap-4">
      <section aria-label="Profile" className="flex flex-col items-center gap-2 rounded-[26px] bg-card p-6 text-center">
        <span className="relative">
          <Avatar profile={profile} />
          <button
            type="button"
            aria-label="Change profile photo"
            onClick={onPhoto}
            className="absolute -right-1 -bottom-1 flex size-8 cursor-pointer items-center justify-center rounded-full border-2 border-card bg-navy text-white"
          >
            <Camera size={15} aria-hidden />
          </button>
        </span>
        <h2 className="m-0 text-[22px] font-extrabold text-navy">{profile.full_name}</h2>
        <span className="text-sm text-muted">@{profile.username}</span>
        <div className="flex gap-1.5">
          {profile.status === 'active' ? <Chip tone="ok">Active</Chip> : <Chip tone="off">Inactive</Chip>}
          {isManager && <Chip tone="warn">Tenant Manager</Chip>}
        </div>
      </section>
      <section aria-label="Details" className="rounded-[22px] bg-card px-5 py-1.5">
        <dl className="m-0 flex flex-col text-[15px]">
          {rows.map(([k, v], i) => (
            <div key={k} className={cn('flex justify-between gap-3 py-3', i > 0 && 'border-t border-line')}>
              <dt className="text-muted">{k}</dt>
              <dd className="m-0 min-w-0 text-right font-semibold break-words">{v}</dd>
            </div>
          ))}
        </dl>
      </section>
    </div>
  );
}

// My Room: rent, occupants, available slots, 8 bed spaces and the roommates (Prof-C.html, Prof-C-Phone.html).
function RoomCard({ profile }: { profile: MyProfile }) {
  const room = profile.room;
  if (!room) {
    return (
      <section aria-label="My Room" className="rounded-[26px] bg-card p-6">
        <h2 className="m-0 text-[22px] font-extrabold text-navy">My Room</h2>
        <p className="m-0 mt-2 text-sm text-muted">The owner has not given you a room yet.</p>
      </section>
    );
  }
  const open = Math.max(0, room.capacity - room.occupants);
  const beds = Array.from({ length: 8 }, (_, i) => (i < room.occupants ? 'taken' : i < room.capacity ? 'open' : 'none'));
  return (
    <section aria-labelledby="my-room" className="flex flex-col gap-4 rounded-[26px] bg-card p-6 max-md:p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col">
          <h2 id="my-room" className="m-0 text-[22px] font-extrabold text-navy">
            Room {room.room_number}
          </h2>
          <span className="text-sm text-muted">{room.building}</span>
        </div>
        <Chip tone="info">Occupied</Chip>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <div className="flex flex-col gap-0.5 rounded-2xl bg-page p-3">
          <span className="text-xs text-muted">Monthly Rent</span>
          <strong className="text-lg">{peso(profile.monthlyRent)}</strong>
        </div>
        <div className="flex flex-col gap-0.5 rounded-2xl bg-page p-3">
          <span className="text-xs text-muted">Occupants</span>
          <strong className="text-lg">
            {room.occupants} of {room.capacity}
          </strong>
        </div>
        <div className="flex flex-col gap-0.5 rounded-2xl bg-ok-bg p-3">
          <span className="text-xs text-ok">Available Slots</span>
          <strong className="text-lg text-ok">{open}</strong>
        </div>
      </div>
      <div className="grid grid-cols-4 gap-2" aria-label="Bed spaces">
        {beds.map((b, i) => (
          <span
            key={i}
            role="img"
            aria-label={`Bed space ${i + 1} ${b === 'taken' ? 'taken' : b === 'open' ? 'open' : 'not used'}`}
            className={cn(
              'flex h-[54px] items-center justify-center rounded-2xl text-[13px] font-semibold',
              b === 'taken' ? 'bg-soft-blue text-navy' : b === 'open' ? 'border-2 border-dashed border-line-strong text-muted' : 'bg-line text-muted',
            )}
          >
            {b === 'taken' ? <BedDouble size={20} aria-hidden /> : b === 'open' ? 'Open' : ''}
          </span>
        ))}
      </div>
      <h3 className="m-0 mt-1 text-base font-bold">Roommates</h3>
      {profile.roommates.length === 0 && <p className="m-0 text-sm text-muted">No roommates yet.</p>}
      <ul className="m-0 grid list-none grid-cols-2 gap-3 p-0 max-md:grid-cols-1">
        {profile.roommates.map((r) => (
          <li key={`${r.full_name}-${r.date_started}`} className="flex items-center gap-2.5">
            <span aria-hidden className="flex size-[34px] shrink-0 items-center justify-center rounded-full bg-soft-blue text-xs font-bold text-navy">
              {initials(r.full_name)}
            </span>
            <span className="flex flex-col">
              <span className="text-sm font-bold">{r.full_name}</span>
              <span className="text-xs text-muted">Since {shortDate(r.date_started)}</span>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

// My Profile and My Room (FR-018). Flowchart page 11, design Prof-C. On a phone, /tenant/profile shows the
// profile and /tenant/room the room; laptop and tablet show both side by side.
export default function MyProfilePage({ section }: { section: 'profile' | 'room' }) {
  const { account } = useAuth();
  const query = useQuery({ queryKey: ['my-profile', account?.userId], enabled: !!account, queryFn: () => fetchMyProfile(account!.userId) });
  const [dialog, setDialog] = useState<'edit' | 'photo' | null>(null);
  const [message, setMessage] = useState<Message>(null);
  const done = (m: Message) => {
    setDialog(null);
    setMessage(m);
  };
  const profile = query.data;
  return (
    <>
      <PageHeader
        title="My Profile and Room"
        aside={
          profile && (
            <button type="button" className={cn(btn.navy, section === 'room' && 'max-md:hidden')} onClick={() => setDialog('edit')}>
              Edit Profile
            </button>
          )
        }
      />
      {query.isPending && <p role="status" className="text-muted">Loading your profile...</p>}
      {query.isError && <p role="alert" className="text-bad">Could not load your profile: {query.error.message}</p>}
      {profile && (
        <div className="grid grid-cols-[1fr_1.25fr] items-start gap-[18px] max-lg:grid-cols-1">
          <div className={cn(section === 'room' && 'max-md:hidden')}>
            <ProfileCards profile={profile} isManager={!!account?.isManager} onPhoto={() => setDialog('photo')} />
          </div>
          <div className={cn('flex flex-col gap-3', section === 'profile' && 'max-md:hidden')}>
            <RoomCard profile={profile} />
            <Link to="/tenant" className={cn(btn.soft, 'bg-card md:hidden')}>
              <ArrowLeft size={16} aria-hidden />
              Back
            </Link>
          </div>
        </div>
      )}
      {profile && dialog === 'edit' && <EditProfile profile={profile} onClose={() => setDialog(null)} onDone={done} />}
      {profile && dialog === 'photo' && <PhotoSheet profile={profile} onClose={() => setDialog(null)} onDone={done} />}
      <MessageDialog open={!!message} onClose={() => setMessage(null)} tone={message?.tone ?? 'ok'} title={message?.title ?? ''} message={message?.text} />
    </>
  );
}
