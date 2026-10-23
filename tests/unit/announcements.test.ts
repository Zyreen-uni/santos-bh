import { describe, expect, it } from 'vitest';
import { checkAnnouncement, postedLabel, type Announcement } from '@/lib/announcements';

const post = (p: Partial<Announcement>): Announcement => ({
  announcement_id: 1, title: 'Water interruption on Oct 22', message: 'The pump is repaired.', status: 'published',
  published_at: '2026-10-18T02:00:00Z', created_at: '2026-10-18T02:00:00Z', updated_at: '2026-10-18T02:00:00Z', ...p,
});

describe('checkAnnouncement (flowchart page 9: title and message filled?)', () => {
  it('accepts a title and a message', () => {
    expect(checkAnnouncement('Fire drill on Nov 8', 'Join at 9 AM.')).toBeNull();
  });

  it('says what is empty, like Ann-A-Phone.html', () => {
    expect(checkAnnouncement('Fire drill on Nov 8', '  ')).toBe('The message is empty. Write the announcement, then save.');
    expect(checkAnnouncement('', 'Join at 9 AM.')).toBe('The title is empty. Write the announcement, then save.');
    expect(checkAnnouncement(' ', '')).toBe('The title and the message are empty. Write the announcement, then save.');
  });

  it('refuses a title over 150 letters', () => {
    expect(checkAnnouncement('x'.repeat(151), 'Hi')).toMatch(/too long/);
  });
});

describe('postedLabel', () => {
  it('shows the posted date for a published post and the saved day for a draft (Ann-A.html)', () => {
    expect(postedLabel(post({}))).toBe('Oct 18, 2026');
    expect(postedLabel(post({ status: 'draft', published_at: null, updated_at: '2026-10-18T23:30:00Z' }))).toBe('Saved Oct 19');
  });
});
