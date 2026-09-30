import { BookOpen } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { useEditorStore } from '@/store/editorStore';
import { openBookForInstance } from '@/lib/book/viewerActions';
import { displayArtworkTitle } from '@/lib/artworkTitle';
import { BookSettingsForm } from './BookSettingsForm';

/** Properties panel of a selected book: open it, edit its settings inline. */
export function BookPropertiesActions({ instanceId }: { instanceId: number }) {
  const inst = useEditorStore((s) => s.localInstances.find((i) => i.id === instanceId));
  if (!inst) return null;
  const { artwork } = inst;
  const asset = artwork.asset;
  // Freshly dropped books have no server ids until the round trip finished.
  const saved = !!asset.id && !!artwork.id;
  return (
    <div className="space-y-3">
      <Button variant="secondary" size="sm" className="w-full text-xs bg-zinc-800 text-zinc-100" onClick={() => openBookForInstance(inst, false)}>
        <BookOpen className="mr-2 h-4 w-4" /> Buch öffnen
      </Button>
      <div className="space-y-3">
        <Label className="text-xs text-zinc-400 uppercase tracking-wider">Buch</Label>
        {!saved && <p className="text-xs text-zinc-500">Wird gespeichert …</p>}
        {/* Keyed by instance: switching books never shows the previous book's unsaved fields;
            fresh data for the same book flows in through the form's per-field sync. */}
        <BookSettingsForm
          key={instanceId}
          mode="inline"
          disabled={!saved}
          asset={{
            id: asset.id ?? 0,
            // Server instances carry the file name; a freshly dropped one only has its title.
            filename: displayArtworkTitle(asset.filename ?? artwork.title ?? ''),
            thumbnailPath: asset.thumbnailPath,
            metadata: asset.metadata,
            artwork: artwork.id
              ? { id: artwork.id, title: artwork.title, artist: artwork.artist, year: artwork.year, depth: artwork.depth, publicReadable: artwork.publicReadable }
              : null,
          }}
        />
      </div>
    </div>
  );
}
