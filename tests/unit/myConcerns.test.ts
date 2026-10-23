import { describe, expect, it } from 'vitest';
import { checkConcern, concernNote, MAX_SUBJECT } from '@/lib/concerns';

// M13 My Concerns (FR-012). Flowchart page 13: "Subject and details filled?"
describe('submit concern checks', () => {
  it('asks for both fields when both are empty or only spaces', () => {
    expect(checkConcern('', '')).toMatch(/subject and the details are empty/);
    expect(checkConcern('   ', ' \n ')).toMatch(/subject and the details are empty/);
  });

  it('names the one field that is missing', () => {
    expect(checkConcern('', 'The sink leaks.')).toMatch(/^The subject is empty/);
    expect(checkConcern('Leaking sink', '  ')).toMatch(/^The details are empty/);
  });

  it('refuses a subject longer than the limit and accepts a filled form', () => {
    expect(checkConcern('x'.repeat(MAX_SUBJECT + 1), 'Details')).toMatch(/too long/);
    expect(checkConcern('x'.repeat(MAX_SUBJECT), 'Details')).toBeNull();
    expect(checkConcern(' Leaking sink ', ' The sink in the CR leaks. ')).toBeNull();
  });
});

describe('concern note on the card', () => {
  it('waits for the owner until there is a reply', () => {
    expect(concernNote({ status: 'pending', responded_at: null })).toBe('Waiting for the owner');
  });

  it('shows the reply day in Philippine time, and "Fixed" once resolved', () => {
    // 2026-10-19 22:31 UTC is Oct 20 in Manila.
    expect(concernNote({ status: 'in_progress', responded_at: '2026-10-19T22:31:00Z' })).toBe('Owner replied Oct 20');
    expect(concernNote({ status: 'resolved', responded_at: '2026-09-14T07:00:00Z' })).toBe('Fixed Sep 14');
  });
});
