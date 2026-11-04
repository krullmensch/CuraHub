import { useEffect } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { PasswordChangeForm } from './PasswordChangeForm';
import { useAuthStore } from '@/store/authStore';
import { useEditorStore } from '@/store/editorStore';
import { toast } from '@/hooks/use-toast';

interface ChangePasswordDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** "Passwort ändern" for a logged-in local account (editor header). */
export function ChangePasswordDialog({ open, onOpenChange }: ChangePasswordDialogProps) {
  const token = useAuthStore((s) => s.token);
  const username = useAuthStore((s) => s.user?.email);
  const setDialogOpen = useEditorStore((s) => s.setDialogOpen);

  // Keeps the editor's shortcuts away from the password fields.
  useEffect(() => {
    if (!open) return;
    setDialogOpen(true);
    return () => setDialogOpen(false);
  }, [open, setDialogOpen]);

  if (!token) return null;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Passwort ändern</DialogTitle>
          <DialogDescription className="text-zinc-400">Gilt ab der nächsten Anmeldung; du bleibst angemeldet.</DialogDescription>
        </DialogHeader>
        {open && (
          <PasswordChangeForm
            token={token}
            username={username}
            variant="dialog"
            submitLabel="Passwort ändern"
            onDone={() => {
              onOpenChange(false);
              toast.success('Passwort geändert');
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
