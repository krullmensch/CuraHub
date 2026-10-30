import { useEffect, useState, useSyncExternalStore } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from '@/hooks/use-toast';
import { useAuthStore } from '../../store/authStore';
import { useEditorStore } from '../../store/editorStore';
import { publishedEditGate } from '../../lib/publishedEditGate';
import { nameForEmail } from '../../lib/live/presence';
import { resolvePublishedEdit } from '../../lib/versions/resolvePublishedEdit';
import { useVersionStatus } from '../../lib/versions/versionStatus';
import { openWorkingCopyOf } from '../../lib/versions/workingCopy';

function PublishedVersionChoices({ resolving }: { resolving: boolean }) {
  const activeVersionId = useEditorStore((s) => s.activeVersionId);
  const isCurator = useAuthStore((s) => s.isCurator);
  const versions = useVersionStatus((s) => s.versions);
  const [branchOpen, setBranchOpen] = useState(false);
  const [branchName, setBranchName] = useState('');
  const [branchError, setBranchError] = useState<string | null>(null);

  const copy = activeVersionId != null ? openWorkingCopyOf(versions, activeVersionId) : null;

  const run = async (choice: Parameters<typeof resolvePublishedEdit>[0], isBranch = false) => {
    setBranchError(null);
    const result = await resolvePublishedEdit(choice);
    // No error: nothing was asked any more (a second click while the first one resolves).
    if (result.ok || !result.error) return;
    if (isBranch) setBranchError(result.error);
    else toast.error(result.error);
  };

  const submitBranch = () => {
    const name = branchName.trim();
    if (!name) {
      setBranchError('Bitte einen Namen eingeben.');
      return;
    }
    void run({ branch: name }, true);
  };

  return (
    <div className="flex flex-col gap-2">
          {copy ? (
            <div className="flex flex-col gap-1">
              <Button disabled={resolving} onClick={() => void run({ join: copy.id })}>
                In Arbeitskopie von {nameForEmail(copy.creator.email)} wechseln
              </Button>
              <p className="text-xs text-zinc-400">Deine eben gemachte Änderung wird dabei verworfen.</p>
            </div>
          ) : (
            <div className="flex flex-col gap-1">
              <Button disabled={resolving} onClick={() => void run('workingCopy')}>
                Arbeitskopie anlegen
              </Button>
              <p className="text-xs text-zinc-400">
                Öffentlich bleibt der jetzige Stand, bis du neu veröffentlichst.
              </p>
            </div>
          )}
          {isCurator && (
            <div className="flex flex-col gap-2">
              <Button variant="outline" disabled={resolving} onClick={() => setBranchOpen(true)}>
                Neuen Branch anlegen
              </Button>
              {branchOpen && (
                <div className="flex flex-col gap-1">
                  <div className="flex gap-2">
                    <Input
                      autoFocus
                      value={branchName}
                      disabled={resolving}
                      placeholder="Name des Branches"
                      onChange={(e) => setBranchName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') submitBranch();
                      }}
                    />
                    <Button disabled={resolving} onClick={submitBranch}>Anlegen</Button>
                  </div>
                  {branchError && <p className="text-xs text-red-400">{branchError}</p>}
                </div>
              )}
            </div>
          )}
          <Button variant="outline" disabled={resolving} onClick={() => void run('discard')}>
            Verwerfen
          </Button>
        </div>
  );
}

/** Asks what to do with a change made to a published (read-only) version. */
export function PublishedVersionDialog() {
  const gate = useSyncExternalStore(publishedEditGate.subscribe, publishedEditGate.getState);
  const setDialogOpen = useEditorStore((s) => s.setDialogOpen);

  const open = gate.phase !== 'idle';
  const resolving = gate.phase === 'resolving';

  useEffect(() => {
    if (!open) return;
    setDialogOpen(true);
    return () => setDialogOpen(false);
  }, [open, setDialogOpen]);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && gate.phase === 'asking') void resolvePublishedEdit('discard');
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Diese Version ist veröffentlicht.</DialogTitle>
          <DialogDescription>Änderungen wären sonst sofort öffentlich sichtbar.</DialogDescription>
        </DialogHeader>
        <PublishedVersionChoices resolving={resolving} />
      </DialogContent>
    </Dialog>
  );
}
