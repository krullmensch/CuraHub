import { useState } from 'react';
import { Copy, Check } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

interface StartPasswordDialogProps {
  /** null = closed. */
  account: { username: string; password: string; created: boolean } | null;
  onClose: () => void;
}

/** Shows a generated start password once (after creating an account or resetting its password). */
export function StartPasswordDialog({ account, onClose }: StartPasswordDialogProps) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    if (!account) return;
    try {
      await navigator.clipboard.writeText(`Benutzername: ${account.username}\nStartpasswort: ${account.password}`);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  return (
    <Dialog open={account !== null} onOpenChange={(open) => { if (!open) { setCopied(false); onClose(); } }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{account?.created ? 'Konto angelegt' : 'Passwort zurückgesetzt'}</DialogTitle>
          <DialogDescription className="text-zinc-400">
            Gib diese Daten an die Person weiter. Das Startpasswort wird nur jetzt angezeigt; bei der ersten
            Anmeldung legt sie ein eigenes Passwort fest.
          </DialogDescription>
        </DialogHeader>
        {account && (
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm rounded-md border border-zinc-800 bg-zinc-900 px-4 py-3">
            <dt className="text-zinc-400">Benutzername</dt>
            <dd className="font-mono text-zinc-100 select-all">{account.username}</dd>
            <dt className="text-zinc-400">Startpasswort</dt>
            <dd className="font-mono text-zinc-100 select-all">{account.password}</dd>
          </dl>
        )}
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={copy} className="border-zinc-700 bg-transparent text-zinc-200 hover:bg-zinc-800">
            {copied ? <Check className="w-4 h-4 mr-2" /> : <Copy className="w-4 h-4 mr-2" />}
            {copied ? 'Kopiert' : 'Kopieren'}
          </Button>
          <Button onClick={() => { setCopied(false); onClose(); }}>Fertig</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
