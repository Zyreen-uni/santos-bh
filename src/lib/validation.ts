import { MIN_PASSWORD, USERNAME } from '../../lib/accounts';

export { MIN_PASSWORD };

export interface RegisterInput {
  fullName: string;
  username: string;
  contactNumber: string;
  email: string;
  password: string;
  confirmPassword: string;
}


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

// Reset Password (the owner, flowchart page 4): one check, one message.
export function checkNewPassword(password: string, confirm: string): string | null {
  if (!password || !confirm) return 'Type the new password twice.';
  if (password.length < MIN_PASSWORD) return `Password must have at least ${MIN_PASSWORD} characters.`;
  if (password !== confirm) return 'The new passwords do not match.';
  return null;
}

// Change Password (every user, flowchart page 11): the current password, then the new one twice.
export function checkChangePassword(current: string, password: string, confirm: string): string | null {
  if (!current) return 'Type your current password.';
  const problem = checkNewPassword(password, confirm);
  if (problem) return problem;
  if (password === current) return 'The new password must be different from the current one.';
  return null;
}
