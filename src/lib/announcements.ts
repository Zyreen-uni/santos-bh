import { supabase } from '@/lib/supabase';

export type PostStatus = 'draft' | 'published';

export interface Announcement {
  announcement_id: number;
  title: string;
  message: string;
  status: PostStatus;
  published_at: string | null;
  created_at: string;
  updated_at: string;
}

// The owner gets every announcement; a tenant only the published ones (row level security).
// Newest first: published by their posted date, drafts by when they were saved.
export async function fetchAnnouncements(): Promise<Announcement[]> {
  const { data, error } = await supabase
    .from('announcements')
    .select('announcement_id, title, message, status, published_at, created_at, updated_at');
  if (error) throw error;
  return (data as Announcement[]).sort((a, b) => sortDate(b).localeCompare(sortDate(a)));
}

const sortDate = (a: Announcement) => a.published_at ?? a.updated_at;

// "Oct 18, 2026" for a published post, "Saved Oct 19" for a draft (Ann-A.html).
export function postedLabel(a: Announcement) {
  if (a.status === 'published' && a.published_at) {
    return new Date(a.published_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'Asia/Manila' });
  }
  return `Saved ${new Date(a.updated_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'Asia/Manila' })}`;
}

export const MAX_TITLE = 150;

// Flowchart page 9: "Title and message filled?" No: "Please Fill All Fields" with what is missing.
export function checkAnnouncement(title: string, message: string): string | null {
  const t = title.trim();
  const m = message.trim();
  if (!t && !m) return 'The title and the message are empty. Write the announcement, then save.';
  if (!t) return 'The title is empty. Write the announcement, then save.';
  if (!m) return 'The message is empty. Write the announcement, then save.';
  if (t.length > MAX_TITLE) return `The title is too long. Keep it to ${MAX_TITLE} letters.`;
  return null;
}
