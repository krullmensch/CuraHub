import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { useEditorStore } from '../../store/editorStore';
import { publishWorkingCopy } from '../../lib/versions/resolvePublishedEdit';
import { useVersionStatus } from '../../lib/versions/versionStatus';

/** Header badge: the active version is published (read-only) or the open working copy of one. */
export function PublishedVersionBadge() {
  const published = useEditorStore((s) => s.activeVersionPublished);
  const parent = useVersionStatus((s) => s.workingCopyOf);
  const [busy, setBusy] = useState(false);

  if (published) {
    return (
      <span className="rounded-full border border-amber-500/40 bg-amber-500/10 px-2.5 py-0.5 text-xs font-medium text-amber-300">
        Veröffentlicht · schreibgeschützt
      </span>
    );
  }
  if (!parent) return null;
  return (
    <div className="flex items-center gap-2">
      <span className="rounded-full border border-blue-500/40 bg-blue-500/10 px-2.5 py-0.5 text-xs font-medium text-blue-300">
        Arbeitskopie von v{parent.id}
      </span>
      <Button
        size="sm"
        variant="outline"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          try {
            await publishWorkingCopy();
          } finally {
            setBusy(false);
          }
        }}
      >
        Neu veröffentlichen
      </Button>
    </div>
  );
}
