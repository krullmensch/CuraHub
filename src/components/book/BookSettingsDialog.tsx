import { useRef, useState } from 'react';
import { gooeyToast } from 'goey-toast';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuthStore } from '@/store/authStore';
import { useEditorStore } from '@/store/editorStore';
import { autoThicknessCm } from '@/lib/book/geometry';
import { parseThickness, resetBookCover, saveBookSettings, uploadBookCover } from '@/lib/book/api';

export interface BookSettingsAsset {
  id: number;
  filename: string;
  thumbnailPath?: string | null;
  metadata?: { pageCount?: number; pageWidthMm?: number; pageHeightMm?: number; coverSource?: 'pdf' | 'override' } | null;
  artwork?: { id: number; title?: string; artist?: string | null; year?: string | null; depth?: number | null; publicReadable?: boolean } | null;
}

interface BookSettingsDialogProps {
  asset: BookSettingsAsset;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Reload the asset list after a change. */
  onSaved: () => void;
}

const fmt = (v: number) => v.toFixed(1).replace('.', ',');

export function BookSettingsDialog({ asset, open, onOpenChange, onSaved }: BookSettingsDialogProps) {
  const token = useAuthStore((s) => s.token);
  const artwork = asset.artwork;
  const pageCount = asset.metadata?.pageCount ?? 0;
  const auto = autoThicknessCm(pageCount);
  const [title, setTitle] = useState(artwork?.title ?? asset.filename);
  const [artist, setArtist] = useState(artwork?.artist ?? '');
  const [year, setYear] = useState(artwork?.year ?? '');
  const [depth, setDepth] = useState(artwork?.depth != null ? fmt(artwork.depth) : '');
  const [publicReadable, setPublicReadable] = useState(artwork?.publicReadable ?? false);
  const [busy, setBusy] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const thickness = parseThickness(depth);
  const sliderValue = typeof thickness === 'number' ? thickness : auto;

  const afterChange = () => {
    onSaved();
    // Placed copies of this book pick up the new cover / thickness / label.
    useEditorStore.getState().triggerInstancesRefresh();
  };

  const save = async () => {
    if (!token || !artwork) return;
    if (thickness === 'invalid') {
      gooeyToast.error('Ungültige Dicke', { description: 'Bitte einen Wert zwischen 0,3 und 8 cm eingeben.' });
      return;
    }
    setBusy(true);
    try {
      await saveBookSettings(artwork.id, { title: title.trim() || asset.filename, artist, year, depth: thickness, publicReadable }, token);
      afterChange();
      gooeyToast.success('Gespeichert', { description: 'Buch-Einstellungen aktualisiert.' });
      onOpenChange(false);
    } catch (err) {
      gooeyToast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const coverAction = async (action: () => Promise<void>, done: string) => {
    if (!token) return;
    setBusy(true);
    try {
      await action();
      afterChange();
      gooeyToast.success(done);
    } catch (err) {
      gooeyToast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const { pageWidthMm, pageHeightMm, coverSource } = asset.metadata ?? {};

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Buch-Einstellungen</DialogTitle>
          <DialogDescription>
            {pageCount} Seiten{pageWidthMm && pageHeightMm ? ` · ${Math.round(pageWidthMm)} × ${Math.round(pageHeightMm)} mm` : ''}
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-[96px_1fr] gap-4">
          <div className="space-y-2">
            {asset.thumbnailPath && <img src={asset.thumbnailPath} alt="Cover" className="w-full rounded border border-zinc-700" />}
            <input ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp" className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = '';
                if (file) void coverAction(() => uploadBookCover(asset.id, file, token!), 'Cover ersetzt');
              }} />
            <Button variant="secondary" size="sm" className="w-full text-xs" disabled={busy} onClick={() => fileInput.current?.click()}>
              Ersatz-Cover hochladen
            </Button>
            {coverSource === 'override' && (
              <Button variant="ghost" size="sm" className="w-full text-xs" disabled={busy}
                onClick={() => void coverAction(() => resetBookCover(asset.id, token!), 'Cover aus PDF wiederhergestellt')}>
                Cover aus PDF verwenden
              </Button>
            )}
          </div>

          <div className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="book-title">Titel</Label>
              <Input id="book-title" value={title} onChange={(e) => setTitle(e.target.value)} />
            </div>
            <div className="grid grid-cols-[1fr_88px] gap-2">
              <div className="space-y-1">
                <Label htmlFor="book-artist">Künstler:in</Label>
                <Input id="book-artist" value={artist} onChange={(e) => setArtist(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="book-year">Jahr</Label>
                <Input id="book-year" value={year} onChange={(e) => setYear(e.target.value)} />
              </div>
            </div>
            <div className="space-y-1">
              <Label htmlFor="book-depth">Dicke anpassen (cm)</Label>
              <input id="book-depth-range" type="range" min={0.3} max={8} step={0.1} value={sliderValue}
                onChange={(e) => setDepth(fmt(Number(e.target.value)))} className="w-full accent-blue-500" aria-label="Dicke anpassen" />
              <div className="flex items-center gap-2">
                <Input id="book-depth" value={depth} placeholder={fmt(auto)} onChange={(e) => setDepth(e.target.value)} className="h-8 w-24" />
                <Button variant="ghost" size="sm" className="text-xs" onClick={() => setDepth('')} disabled={depth === ''}>
                  Automatisch ({fmt(auto)} cm)
                </Button>
              </div>
            </div>
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" checked={publicReadable} onChange={(e) => setPublicReadable(e.target.checked)} className="mt-1" />
              <span>
                Im öffentlichen Viewer lesbar
                <span className="block text-xs text-zinc-500">Wer das Buch öffnen kann, kann das PDF auch herunterladen.</span>
              </span>
            </label>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Abbrechen</Button>
          <Button onClick={() => void save()} disabled={busy || !artwork}>Speichern</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
