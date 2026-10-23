import { describe, expect, it } from 'vitest';
import { checkProfile, type ProfileForm } from '@/lib/profile';

const form = (f: Partial<ProfileForm> = {}): ProfileForm => ({
  fullName: 'Maria Reyes', username: 'maria.reyes', email: 'maria.reyes@gmail.com', contactNumber: '0917 123 4567', ...f,
});

describe('checkProfile (flowchart page 11: fields valid and photo, if any, is an image?)', () => {
  it('accepts the profile, with or without an email', () => {
    expect(checkProfile(form())).toBeNull();
    expect(checkProfile(form({ email: '' }))).toBeNull();
  });

  it('asks for the name, username and contact number', () => {
    expect(checkProfile(form({ fullName: ' ' }))).toMatch(/fill in/);
    expect(checkProfile(form({ username: '' }))).toMatch(/fill in/);
    expect(checkProfile(form({ contactNumber: '' }))).toMatch(/fill in/);
  });

  it('refuses a bad username, contact number or email', () => {
    expect(checkProfile(form({ username: 'mr' }))).toMatch(/Username must be/);
    expect(checkProfile(form({ contactNumber: 'call me' }))).toMatch(/contact number/);
    expect(checkProfile(form({ email: 'maria@' }))).toMatch(/valid email/);
  });

  it('accepts an image and refuses any other file', () => {
    expect(checkProfile(form(), new File(['x'], 'me.png', { type: 'image/png' }))).toBeNull();
    expect(checkProfile(form(), new File(['x'], 'cv.pdf', { type: 'application/pdf' }))).toBe('The photo must be an image, such as a JPG or PNG.');
  });
});
