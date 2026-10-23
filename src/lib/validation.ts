import { USERNAME } from '../../lib/accounts';

export interface RegisterInput {
  fullName: string;
  username: string;
  contactNumber: string;
  email: string;
  password: string;
  confirmPassword: string;
}

export const MIN_PASSWORD = 8;

// The one validation check of the Register form (flowchart page 1). Returns what is wrong, or null.
export function checkRegister(f: RegisterInput): string | null {
  if (!f.fullName.trim() || !f.username.trim() || !f.contactNumber.trim() || !f.password || !f.confirmPassword) {
    return 'Please fill in your full name, username, contact number and password.';
  }
  if (!USERNAME.test(f.username.trim())) {
    return 'Username must be 4 to 30 lowercase letters, numbers, dots or underscores.';
  }
  if (!/^[0-9 +()-]{7,20}$/.test(f.contactNumber.trim())) return 'Enter a valid contact number, such as 0917 123 4567.';
  if (f.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email.trim())) return 'Enter a valid email or leave it empty.';
  if (f.password.length < MIN_PASSWORD) return `Password must have at least ${MIN_PASSWORD} characters.`;
  if (f.password !== f.confirmPassword) return 'Passwords do not match.';
  return null;
}
