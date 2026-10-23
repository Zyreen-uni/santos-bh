import { supabase } from '@/lib/supabase';
import type { ChipTone } from '@/components/ui/Chip';

export type ConcernStatus = 'pending' | 'in_progress' | 'resolved';

export const CONCERN_STATUS: Record<ConcernStatus, { label: string; tone: ChipTone }> = {
  pending: { label: 'Pending', tone: 'warn' },
  in_progress: { label: 'In Progress', tone: 'info' },
  resolved: { label: 'Resolved', tone: 'ok' },
};

export interface Message {
  message_id: number;
  body: string;
  from_owner: boolean;
  created_at: string;
}

export interface Concern {
  concern_id: number;
  code: string; // "C-0011"
  tenant_id: number;
  tenant_name: string;
  room_number: string | null;
  subject: string;
  details: string;
  status: ConcernStatus;
  created_at: string;
  responded_at: string | null;
  messages: Message[]; // oldest first
}

export const concernCode = (id: number) => `C-${String(id).padStart(4, '0')}`;

type Row = Omit<Concern, 'code' | 'tenant_name' | 'room_number' | 'messages'> & {
  tenants: { full_name: string; room_assignments: { date_ended: string | null; rooms: { room_number: string } }[] };
  concern_messages: Message[];
};

// Concerns with their conversations, newest first. The owner gets every concern; a tenant gets their own.
export async function fetchConcerns(): Promise<Concern[]> {
  const { data, error } = await supabase
    .from('concerns')
    .select(`concern_id, tenant_id, subject, details, status, created_at, responded_at,
      tenants(full_name, room_assignments(date_ended, rooms(room_number))),
      concern_messages(message_id, body, from_owner, created_at)`)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data as unknown as Row[]).map((c) => ({
    concern_id: c.concern_id,
    code: concernCode(c.concern_id),
    tenant_id: c.tenant_id,
    tenant_name: c.tenants.full_name,
    room_number: c.tenants.room_assignments?.find((a) => a.date_ended === null)?.rooms.room_number ?? null,
    subject: c.subject,
    details: c.details,
    status: c.status,
    created_at: c.created_at,
    responded_at: c.responded_at,
    messages: [...c.concern_messages].sort((a, b) => a.created_at.localeCompare(b.created_at) || a.message_id - b.message_id),
  }));
}

// "Oct 16" and "Oct 16, 6:10 PM" in Philippine time.
export const shortDay = (iso: string) => new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'Asia/Manila' });
export const dayTime = (iso: string) =>
  new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Manila' });

// Search by tenant name, subject or concern number.
export function matchConcern(c: Concern, text: string) {
  const q = text.trim().toLowerCase();
  return !q || c.tenant_name.toLowerCase().includes(q) || c.subject.toLowerCase().includes(q) || c.code.toLowerCase().includes(q);
}

export function concernCounts(list: Concern[]) {
  const counts = { all: list.length, pending: 0, in_progress: 0, resolved: 0 };
  for (const c of list) counts[c.status] += 1;
  return counts;
}

export async function sendMessage(concernId: number, body: string) {
  const { error } = await supabase.from('concern_messages').insert({ concern_id: concernId, body });
  if (error) throw error;
}

// The owner's name for "Brian Santos, Owner" on replies and announcements.
export async function fetchOwnerName(): Promise<string> {
  const { data, error } = await supabase.rpc('owner_name');
  if (error) throw error;
  return (data as string | null) ?? 'Owner';
}

export const MAX_SUBJECT = 150;

// Flowchart page 13: "Subject and details filled?" No: "Please Fill All Fields".
export function checkConcern(subject: string, details: string): string | null {
  if (!subject.trim() && !details.trim()) return 'The subject and the details are empty. Tell the owner what is wrong, then submit.';
  if (!subject.trim()) return 'The subject is empty. Write a short title, such as "Leaking faucet".';
  if (!details.trim()) return 'The details are empty. Tell the owner what is wrong, then submit.';
  if (subject.trim().length > MAX_SUBJECT) return `The subject is too long. Keep it to ${MAX_SUBJECT} letters.`;
  return null;
}

// "Owner replied Oct 20", "Fixed Sep 14" (MyCon-C-Tablet.html), or "Waiting for the owner".
export function concernNote(c: Pick<Concern, 'status' | 'responded_at'>) {
  if (c.status === 'resolved' && c.responded_at) return `Fixed ${shortDay(c.responded_at)}`;
  if (c.responded_at) return `Owner replied ${shortDay(c.responded_at)}`;
  return 'Waiting for the owner';
}
