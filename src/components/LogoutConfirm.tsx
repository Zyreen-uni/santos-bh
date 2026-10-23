import { useState } from 'react';
import { useNavigate } from 'react-router';
import { LogOut } from 'lucide-react';
import { ConfirmDialog, MessageDialog } from '@/components/ui/Modal';
import { useAuth } from '@/lib/auth';

// Login shows "Logged Out Successfully" once after a logout. The note is kept in sessionStorage, because once the
// session ends the route guard opens Login before this popup's own navigation can pass any state along.
const LOGGED_OUT = 'santos-logged-out';

export function hasLoggedOutNote(): boolean {
  try {
    return sessionStorage.getItem(LOGGED_OUT) === '1';
  } catch {
    return false;
  }
}

export function clearLoggedOutNote() {
  try {
    sessionStorage.removeItem(LOGGED_OUT);
  } catch {
    // nothing to clear
  }
}

// Logout (FR-016). Flowchart page 15, design Out-A: "Are you sure you want to log out?" Cancel keeps the session;
// Log Out ends it and opens Login. The protected page is replaced in the history, and the route guard sends a
// signed-out visitor to Login, so the back button cannot reopen it.
export function LogoutConfirm({ open, onCancel }: { open: boolean; onCancel: () => void }) {
  const { signOut } = useAuth();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');
  return (
    <>
      <ConfirmDialog
        open={open}
        icon={<LogOut size={26} aria-hidden />}
        title="Are you sure you want to log out?"
        message="You will need your username and password to log back in."
        confirmLabel="Log Out"
        busy={busy}
        onCancel={onCancel}
        onConfirm={async () => {
          setBusy(true);
          try {
            sessionStorage.setItem(LOGGED_OUT, '1');
          } catch {
            // No storage (private mode): log out without the note.
          }
          try {
            await signOut();
            navigate('/login', { replace: true });
          } catch (e) {
            // Still signed in: no note for Login, and the popup can be used again.
            clearLoggedOutNote();
            onCancel();
            setProblem(e instanceof Error ? e.message : 'Check your connection, then try again.');
          } finally {
            setBusy(false);
          }
        }}
      />
      <MessageDialog
        open={!!problem}
        onClose={() => setProblem('')}
        tone="bad"
        title="Could Not Log Out"
        message={`You are still logged in. ${problem}`}
      />
    </>
  );
}
