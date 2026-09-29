import { useState } from 'react';
import { BookOpen, Settings2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useEditorStore } from '@/store/editorStore';
import { openBookForInstance } from '@/lib/book/viewerActions';
import { BookSettingsDialog } from './BookSettingsDialog';

/** Properties panel of a selected book: open it, edit its settings. */
export function BookPropertiesActions({ instanceId }: { instanceId: number }) {
  const inst = useEditorStore((s) => s.localInstances.find((i) => i.id === instanceId));
  const [settingsOpen, setSettingsOpen] = useState(false);
  if (!inst) return null;
  const asset = inst.artwork.asset;
  return (
    <div className="space-y-2">
      <Button variant="secondary" size="sm" className="w-full text-xs bg-zinc-800 text-zinc-100" onClick={() => openBookForInstance(inst, false)}>
        <BookOpen className="mr-2 h-4 w-4" /> Buch öffnen
      </Button>
      <Button variant="secondary" size="sm" className="w-full text-xs bg-zinc-800 text-zinc-100" disabled={!asset.id || !inst.artwork.id} onClick={() => setSettingsOpen(true)}>
        <Settings2 className="mr-2 h-4 w-4" /> Buch-Einstellungen
      </Button>
      {settingsOpen && asset.id && inst.artwork.id && (
        <BookSettingsDialog
          open
          onOpenChange={setSettingsOpen}
          onSaved={() => undefined}
          asset={{
            id: asset.id,
            filename: inst.artwork.title ?? '',
            thumbnailPath: asset.thumbnailPath,
            metadata: asset.metadata,
            artwork: { id: inst.artwork.id, title: inst.artwork.title, artist: inst.artwork.artist, year: inst.artwork.year, depth: inst.artwork.depth, publicReadable: inst.artwork.publicReadable },
          }}
        />
      )}
    </div>
  );
}
