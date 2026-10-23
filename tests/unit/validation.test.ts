import { describe, expect, it } from 'vitest';
import { checkRegister, type RegisterInput } from '@/lib/validation';

const ok: RegisterInput = {
  fullName: 'Maria Reyes', username: 'maria.reyes', contactNumber: '0917 123 4567',
  email: 'maria.reyes@gmail.com', password: 'password1', confirmPassword: 'password1',
};

describe('checkRegister', () => {
  it('accepts a complete form', () => {
    expect(checkRegister(ok)).toBeNull();
    expect(checkRegister({ ...ok, email: '' })).toBeNull();
  });

  it('asks for every required field', () => {
    for (const key of ['fullName', 'username', 'contactNumber', 'password', 'confirmPassword'] as const) {
      expect(checkRegister({ ...ok, [key]: '' })).toMatch(/fill in/);
    }
    expect(checkRegister({ ...ok, fullName: '   ' })).toMatch(/fill in/);
  });

  it('refuses a bad username', () => {
    expect(checkRegister({ ...ok, username: 'ben' })).toMatch(/Username must be 4 to 30/);
    expect(checkRegister({ ...ok, username: 'Maria Reyes' })).toMatch(/Username/);
  });

  it('refuses a bad contact number or email', () => {
    expect(checkRegister({ ...ok, contactNumber: 'call me' })).toMatch(/contact number/);
    expect(checkRegister({ ...ok, email: 'maria@' })).toMatch(/valid email/);
  });

  it('needs a long enough password that matches', () => {
    expect(checkRegister({ ...ok, password: 'short', confirmPassword: 'short' })).toMatch(/at least 8/);
    expect(checkRegister({ ...ok, confirmPassword: 'password2' })).toBe('Passwords do not match.');
  });
});
