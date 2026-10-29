import { useState, type FormEvent } from 'react';
import { useMutation } from '@tanstack/react-query';
import { btn } from '@/components/ui/buttons';
import { PasswordField } from '@/components/ui/Field';
import { MessageDialog, Modal } from '@/components/ui/Modal';
import { useAuth } from '@/lib/auth';
import { loginEmail, supabase } from '@/lib/supabase';
import { checkChangePassword } from '@/lib/validation';
import { cn } from '@/lib/utils';

// Change Password (FR-028, flowchart page 11): every user changes their own password after typing the current one.
// Tenants open it from Edit Profile, the owner from Settings. The current password is checked by signing in with it.
export function ChangePasswordDialog({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const { account } = useAuth();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const change = useMutation({
    mutationFn: async () => {
      const { error: wrong } = await supabase.auth.signInWithPassword({ email: loginEmail(account!.username), password: current });
      if (wrong) throw new Error('The current password is wrong. Type it again.');
      const { error: failed } = await supabase.auth.updateUser({ password: next });
      if (failed) throw new Error(/different/i.test(failed.message) ? 'The new password must be different from the current one.' : failed.message);
    },
    onSuccess: onDone,
    onError: (e) => setError(e.message),
  });
  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const problem = checkChangePassword(current, next, confirm);
    if (problem) setError(problem);
    else change.mutate();
  }
  return (
    <Modal open onOpenChange={(o) => !o && onClose()} title="Change Password" description="Type your current password, then the new one twice.">
      <form onSubmit={onSubmit} noValidate className="mt-4 flex flex-col gap-4">
        <PasswordField label="Current Password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} />
        <PasswordField label="New Password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} />
        <PasswordField label="Confirm New Password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        <div className="mt-1 flex gap-2.5">
          <button type="button" className={cn(btn.soft, 'flex-1')} onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className={cn(btn.primary, 'flex-[2]')} disabled={change.isPending}>
            {change.isPending ? 'Saving...' : 'Change Password'}
          </button>
        </div>
      </form>
      <MessageDialog open={!!error} onClose={() => setError('')} tone="bad" title="Invalid Input" message={error} />
    </Modal>
  );
}
