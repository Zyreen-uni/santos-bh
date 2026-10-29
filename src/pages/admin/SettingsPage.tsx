import { useState, type FormEvent, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarDays, ChevronRight, KeyRound, Smartphone } from 'lucide-react';
import { ChangePasswordDialog } from '@/components/ChangePassword';
import { PageHeader } from '@/components/layout/PageHeader';
import { btn } from '@/components/ui/buttons';
import { MessageDialog, Modal, PHONE_SHEET } from '@/components/ui/Modal';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/motion-primitives/dialog';
import { checkGcash, checkSettings, fetchSettings, ordinal, parseRent, rentChangeText, type SettingsData } from '@/lib/settings';
import { TextField } from '@/components/ui/Field';
import { supabase } from '@/lib/supabase';
import { cn, peso } from '@/lib/utils';

type Message = { title: string; text?: string; tone: 'ok' | 'bad' } | null;

function SettingRow({ icon, iconClass, title, value, onClick }: { icon: ReactNode; iconClass: string; title: string; value: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full cursor-pointer items-center gap-3.5 border-0 bg-transparent px-0 py-4 text-left text-ink [&+&]:border-t [&+&]:border-line"
    >
      <span aria-hidden className={cn('flex size-10 shrink-0 items-center justify-center rounded-field', iconClass)}>
        {icon}
      </span>
      <span className="flex grow flex-col">
        <span className="text-[15px] font-bold">{title}</span>
        <span className="text-[13px] text-muted">{value}</span>
      </span>
      <ChevronRight size={20} className="text-muted" aria-hidden />
    </button>
  );
}

// "Change Monthly Rent?" with the old and new rent side by side (Set-C.html).
function RentConfirm({ data, newRent, busy, onYes, onCancel }: { data: SettingsData; newRent: number; busy: boolean; onYes: () => void; onCancel: () => void }) {
  return (
    <Dialog open onOpenChange={(o) => !o && onCancel()}>
      <DialogContent className={cn('w-full max-w-[460px] rounded-card-lg border-0 bg-card px-6 py-7 text-center text-ink shadow-none backdrop:bg-overlay', PHONE_SHEET)}>
        <div className="flex flex-col items-center gap-3.5">
          <span aria-hidden className="flex size-16 items-center justify-center rounded-full bg-warn-bg text-[28px] font-extrabold text-warn">
            !
          </span>
          <DialogTitle className="m-0 text-2xl font-extrabold text-navy">Change Monthly Rent?</DialogTitle>
          <div className="flex items-center gap-3.5 text-[22px] font-extrabold">
            <span className="text-muted line-through">{peso(data.monthlyRent)}</span>
            <span aria-hidden className="text-muted">→</span>
            <span className="sr-only">to</span>
            <span className="text-navy">{peso(newRent)}</span>
          </div>
          <DialogDescription className="m-0 text-[15px] leading-normal text-muted">{rentChangeText(data, newRent, peso)}</DialogDescription>
          <div className="mt-1.5 grid w-full grid-cols-2 gap-2.5">
            <button type="button" autoFocus className={btn.soft} onClick={onCancel}>
              Cancel
            </button>
            <button type="button" className={btn.primary} disabled={busy} onClick={onYes}>
              Yes, Change Rent
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function useSaveSettings(onDone: (m: Message) => void) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (values: { monthly_rent?: number; due_day?: number; gcash_name?: string; gcash_number?: string }) => {
      const { error } = await supabase.from('billing_settings').update(values).eq('setting_id', 1);
      if (error) throw error;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['settings'] });
      await queryClient.invalidateQueries({ queryKey: ['rooms'] });
      await queryClient.invalidateQueries({ queryKey: ['tenants'] });
      onDone({ title: 'Settings Saved', tone: 'ok' });
    },
    onError: (e) => onDone({ title: 'Could Not Save', text: e.message, tone: 'bad' }),
  });
}

function RentDialog({ data, onClose, onDone }: { data: SettingsData; onClose: () => void; onDone: (m: Message) => void }) {
  const [text, setText] = useState(peso(data.monthlyRent).slice(1));
  const [error, setError] = useState('');
  const [confirming, setConfirming] = useState(false);
  const save = useSaveSettings(onDone);
  const newRent = parseRent(text);

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const problem = checkSettings(text, data.dueDay);
    if (problem) setError(problem);
    else if (newRent === data.monthlyRent) save.mutate({ monthly_rent: newRent }); // not changed: no popup
    else setConfirming(true);
  }

  return (
    <Modal open onOpenChange={(o) => !o && onClose()} title="Monthly Rent" description="One rent price for every tenant in every room.">
      <form onSubmit={onSubmit} noValidate className="mt-4 flex flex-col gap-3">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="rent" className="text-sm font-semibold text-label">
            Rent per tenant
          </label>
          <div className="flex items-center gap-2 rounded-field border border-line-strong bg-soft px-4">
            <span aria-hidden className="font-bold text-muted">
              ₱
            </span>
            <input
              id="rent"
              inputMode="decimal"
              autoComplete="off"
              value={text}
              onChange={(e) => setText(e.target.value)}
              className="w-full min-w-0 border-0 bg-transparent py-3.5 text-[15px] font-semibold text-ink"
            />
          </div>
        </div>
        <span className="text-[13px] text-muted">Current rent: {peso(data.monthlyRent)}. You will be asked to confirm.</span>
        <div className="mt-1 grid grid-cols-2 gap-2.5">
          <button type="button" className={btn.soft} onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className={btn.primary} disabled={save.isPending}>
            Save
          </button>
        </div>
      </form>
      <MessageDialog open={!!error} onClose={() => setError('')} tone="bad" title="Invalid Input" message={error} />
      {confirming && (
        <RentConfirm data={data} newRent={newRent} busy={save.isPending} onCancel={() => setConfirming(false)} onYes={() => save.mutate({ monthly_rent: newRent })} />
      )}
    </Modal>
  );
}

function DueDayDialog({ data, onClose, onDone }: { data: SettingsData; onClose: () => void; onDone: (m: Message) => void }) {
  const [day, setDay] = useState(data.dueDay);
  const [error, setError] = useState('');
  const save = useSaveSettings(onDone);
  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const problem = checkSettings(String(data.monthlyRent), day);
    if (problem) setError(problem);
    else save.mutate({ due_day: day });
  }
  return (
    <Modal open onOpenChange={(o) => !o && onClose()} title="Payment Due Day" description="Pick a day from 1 to 28. The dashed day is the current one.">
      <form onSubmit={onSubmit} className="mt-4 flex flex-col gap-4">
        <div role="group" aria-label="Due day" className="grid grid-cols-7 gap-1.5">
          {Array.from({ length: 28 }, (_, i) => i + 1).map((n) => (
            <button
              key={n}
              type="button"
              aria-pressed={n === day}
              aria-label={`Day ${n}${n === data.dueDay ? ', current' : ''}`}
              onClick={() => setDay(n)}
              className={cn(
                'h-11 cursor-pointer rounded-full border-0 text-sm',
                n === day ? 'bg-navy font-bold text-white' : 'bg-page text-ink hover:bg-soft-blue',
                n === data.dueDay && n !== day && 'outline-2 outline-offset-[-2px] outline-line-strong outline-dashed',
              )}
            >
              {n}
            </button>
          ))}
        </div>
        <span className="text-[13px] text-muted">Bills are due on the {ordinal(day)} of each month.</span>
        <div className="grid grid-cols-2 gap-2.5">
          <button type="button" className={btn.soft} onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className={btn.primary} disabled={save.isPending}>
            Save
          </button>
        </div>
      </form>
      <MessageDialog open={!!error} onClose={() => setError('')} tone="bad" title="Invalid Input" message={error} />
    </Modal>
  );
}

// The GCash account shown to tenants in Submit GCash Proof ("Send to GCash: Brian Santos, 0917 555 0123").
function GcashDialog({ data, onClose, onDone }: { data: SettingsData; onClose: () => void; onDone: (m: Message) => void }) {
  const [name, setName] = useState(data.gcashName ?? '');
  const [number, setNumber] = useState(data.gcashNumber ?? '');
  const [error, setError] = useState('');
  const save = useSaveSettings(onDone);
  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const problem = checkGcash(name, number);
    if (problem) setError(problem);
    else save.mutate({ gcash_name: name.trim(), gcash_number: number.trim() });
  }
  return (
    <Modal open onOpenChange={(o) => !o && onClose()} title="GCash Account" description="Tenants send their payments here and upload the GCash proof.">
      <form onSubmit={onSubmit} noValidate className="mt-4 flex flex-col gap-4">
        <TextField label="GCash Name" autoComplete="off" value={name} onChange={(e) => setName(e.target.value)} />
        <TextField label="GCash Number" type="tel" autoComplete="off" value={number} onChange={(e) => setNumber(e.target.value)} />
        <div className="grid grid-cols-2 gap-2.5">
          <button type="button" className={btn.soft} onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className={btn.primary} disabled={save.isPending}>
            Save
          </button>
        </div>
      </form>
      <MessageDialog open={!!error} onClose={() => setError('')} tone="bad" title="Invalid Input" message={error} />
    </Modal>
  );
}

// Settings (FR-022). Flowchart page 7, design Set-C.
export default function SettingsPage() {
  const settings = useQuery({ queryKey: ['settings'], queryFn: fetchSettings });
  const [open, setOpen] = useState<'rent' | 'due' | 'gcash' | 'password' | null>(null);
  const [message, setMessage] = useState<Message>(null);
  const done = (m: Message) => {
    setOpen(null);
    setMessage(m);
  };
  return (
    <>
      <PageHeader title="Settings" subtitle="Billing rules for all tenants" />
      {settings.isPending && <p role="status" className="text-muted">Loading settings...</p>}
      {settings.isError && <p role="alert" className="text-bad">Could not load the settings: {settings.error.message}</p>}
      {settings.data && (
        <section aria-label="Billing settings" className="w-full max-w-[640px] rounded-[26px] bg-card px-[22px] py-2 max-md:rounded-card max-md:px-4 max-md:py-1">
          <SettingRow
            icon={<span className="text-lg font-extrabold">₱</span>}
            iconClass="bg-soft-blue text-navy"
            title="Monthly Rent"
            value={`${peso(settings.data.monthlyRent)} per tenant, all rooms`}
            onClick={() => setOpen('rent')}
          />
          <SettingRow
            icon={<CalendarDays size={20} />}
            iconClass="bg-warn-bg text-warn"
            title="Payment Due Day"
            value={`${ordinal(settings.data.dueDay)} of each month`}
            onClick={() => setOpen('due')}
          />
          <SettingRow
            icon={<Smartphone size={20} />}
            iconClass="bg-ok-bg text-ok"
            title="GCash Account"
            value={settings.data.gcashName && settings.data.gcashNumber ? `${settings.data.gcashName}, ${settings.data.gcashNumber}` : 'Not set yet'}
            onClick={() => setOpen('gcash')}
          />
        </section>
      )}
      {/* FR-028: every user changes their own password; the owner has no profile page, so it is here. */}
      <section aria-label="Your account" className="mt-4 w-full max-w-[640px] rounded-[26px] bg-card px-[22px] py-2 max-md:rounded-card max-md:px-4 max-md:py-1">
        <SettingRow
          icon={<KeyRound size={20} />}
          iconClass="bg-soft-blue text-navy"
          title="Change Password"
          value="Your own login password"
          onClick={() => setOpen('password')}
        />
      </section>
      {open === 'rent' && settings.data && <RentDialog data={settings.data} onClose={() => setOpen(null)} onDone={done} />}
      {open === 'due' && settings.data && <DueDayDialog data={settings.data} onClose={() => setOpen(null)} onDone={done} />}
      {open === 'gcash' && settings.data && <GcashDialog data={settings.data} onClose={() => setOpen(null)} onDone={done} />}
      {open === 'password' && (
        <ChangePasswordDialog
          onClose={() => setOpen(null)}
          onDone={() => done({ title: 'Password Changed', text: 'Use your new password the next time you log in.', tone: 'ok' })}
        />
      )}
      <MessageDialog open={!!message} onClose={() => setMessage(null)} tone={message?.tone ?? 'ok'} title={message?.title ?? ''} message={message?.text} />
    </>
  );
}
