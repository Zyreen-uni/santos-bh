import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { uploadProfilePhoto } from '@/lib/photos';

export interface Roommate {
  full_name: string;
  date_started: string;
}

export interface MyProfile {
  tenant_id: number;
  full_name: string;
  username: string;
  email: string | null;
  contact_number: string;
  photo_path: string | null;
  photo_url: string | null; // signed URL of the photo
  status: 'active' | 'inactive';
  date_started: string | null;
  room: { room_number: string; building: string; capacity: number; occupants: number } | null;
  roommates: Roommate[];
  monthlyRent: number;
}

export async function fetchMyProfile(userId: string): Promise<MyProfile> {
  const [tenant, profile, stay, counts, roommates, settings] = await Promise.all([
    supabase.from('tenants').select('tenant_id, full_name, email, contact_number, photo_path, status').eq('user_id', userId).single(),
    supabase.from('profiles').select('username').eq('id', userId).single(),
    supabase.from('room_assignments').select('room_id, date_started, rooms(room_number, capacity, buildings(name))').is('date_ended', null).maybeSingle(),
    supabase.rpc('room_occupancy'),
    supabase.rpc('my_roommates'),
    supabase.from('billing_settings').select('monthly_rent').single(),
  ]);
  for (const r of [tenant, profile, stay, counts, roommates, settings]) if (r.error) throw r.error;
  const s = stay.data as unknown as { room_id: number; date_started: string; rooms: { room_number: string; capacity: number; buildings: { name: string } } } | null;
  const occupants = ((counts.data ?? []) as { room_id: number; active_tenants: number }[]).find((c) => c.room_id === s?.room_id)?.active_tenants ?? 0;
  let photoUrl: string | null = null;
  if (tenant.data!.photo_path) {
    const { data } = await supabase.storage.from('avatars').createSignedUrl(tenant.data!.photo_path, 3600);
    photoUrl = data?.signedUrl ?? null;
  }
  return {
    ...tenant.data!,
    username: profile.data!.username,
    photo_url: photoUrl,
    date_started: s?.date_started ?? null,
    room: s ? { room_number: s.rooms.room_number, building: s.rooms.buildings.name, capacity: s.rooms.capacity, occupants } : null,
    roommates: (roommates.data ?? []) as Roommate[],
    monthlyRent: Number(settings.data!.monthly_rent),
  };
}

export interface ProfileForm {
  fullName: string;
  username: string;
  email: string;
  contactNumber: string;
}

// Flowchart page 11: "Fields valid and photo (if any) is an image?" Returns what is wrong, or null.
export function checkProfile(f: ProfileForm, photo?: File | null): string | null {
  if (!f.fullName.trim() || !f.username.trim() || !f.contactNumber.trim()) return 'Please fill in your full name, username and contact number.';
  if (f.fullName.trim().length > 100) return 'The full name is too long.';
  if (!/^[a-z0-9._]{4,30}$/.test(f.username.trim().toLowerCase())) return 'Username must be 4 to 30 lowercase letters, numbers, dots or underscores.';
  if (!/^[0-9 +()-]{7,20}$/.test(f.contactNumber.trim())) return 'Enter a valid contact number, such as 0917 123 4567.';
  if (f.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email.trim())) return 'Enter a valid email or leave it empty.';
  if (photo && !photo.type.startsWith('image/')) return 'The photo must be an image, such as a JPG or PNG.';
  return null;
}

// Saves the contact details on the tenant record (the tenant's own row; RLS and the guard trigger allow only these).
export async function saveDetails(tenantId: number, f: ProfileForm) {
  const { error } = await supabase
    .from('tenants')
    .update({ full_name: f.fullName.trim(), email: f.email.trim() || null, contact_number: f.contactNumber.trim() })
    .eq('tenant_id', tenantId);
  if (error) throw error;
}

// The username is the login, so it changes on the server (api/account/username).
export async function changeUsername(client: SupabaseClient, username: string) {
  const { data } = await client.auth.getSession();
  const res = await fetch('/api/account/username', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${data.session?.access_token ?? ''}` },
    body: JSON.stringify({ username: username.trim().toLowerCase() }),
  });
  const body = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) throw new Error(body.error || `Could not change the username (error ${res.status}).`);
  // The login email changed: refresh the session so the next sign-in and token use the new one.
  await client.auth.refreshSession();
}

// New photo: shrink to 512 px, upload to the tenant's own folder, save the path, then remove the old file.
export async function changePhoto(userId: string, tenantId: number, file: File, oldPath: string | null) {
  const path = await uploadProfilePhoto(supabase, userId, file);
  const { error } = await supabase.from('tenants').update({ photo_path: path }).eq('tenant_id', tenantId);
  if (error) {
    await supabase.storage.from('avatars').remove([path]);
    throw error;
  }
  if (oldPath) await supabase.storage.from('avatars').remove([oldPath]);
  return path;
}

export async function removePhoto(tenantId: number, oldPath: string | null) {
  const { error } = await supabase.from('tenants').update({ photo_path: null }).eq('tenant_id', tenantId);
  if (error) throw error;
  if (oldPath) await supabase.storage.from('avatars').remove([oldPath]);
}
