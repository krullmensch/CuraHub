import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { gooeyToast } from 'goey-toast';
import { Button } from '@/components/ui/button';
import { DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuthStore } from '@/store/authStore';
import { useEditorStore } from '@/store/editorStore';
import { autoThicknessCm } from '@/lib/book/geometry';
import { parseThickness, resetBookCover, saveBookSettings, uploadBookCover, type BookUpdate } from '@/lib/book/api';
import { effectiveTitle, formatThickness, textChange, thicknessChange, thicknessToField, titleChange } from '@/lib/book/settingsForm';
import { cn } from '@/lib/utils';

export interface BookSettingsAsset {
  id: number;
  filename: string;
  thumbnailPath?: string | null;
  metadata?: { pageCount?: number; pageWidthMm?: number; pageHeightMm?: number; coverSource?: 'pdf' | 'override' } | null;
  artwork?: { id: number; title?: string; artist?: string | null; year?: string | null; depth?: number | null; publicReadable?: boolean } | null;
}

type BookPatch = Parameters<typeof saveBookSettings>[1];

interface BookSettingsFormProps {
  /** `dialog`: local fields, „Speichern" saves all. `inline`: every field commits by itself. */
  mode: 'dialog' | 'inline';
  asset: BookSettingsAsset;
  /** Reload whatever lists this book after a change (asset browser). */
  onSaved?: () => void;
  /** Dialog mode: „Abbrechen" and a successful save. */
  onClose?: () => void;
  /** Inline mode: show the fields but don't allow edits (book not on the server yet). */
  disabled?: boolean;
}

/**
 * State that follows `value` whenever it changes from outside (a refetch after a commit, another
 * book selected) and is otherwise free to hold an unsaved edit. Adjusted during render, like
 * NumericInput, so there is no frame with the old value.
 */
function useSyncedState<T>(value: T) {
  const [local, setLocal] = useState(value);
  const [seen, setSeen] = useState(value);
  if (!Object.is(seen, value)) {
    setSeen(value);
    setLocal(value);
  }
  return [local, setLocal] as const;
}

export function BookSettingsForm({ mode, asset, onSaved, onClose, disabled = false }: BookSettingsFormProps) {
  const inline = mode === 'inline';
  const uid = useId();
  const token = useAuthStore((s) => s.token);
  const artwork = asset.artwork;
  const storedTitle = artwork?.title ?? asset.filename;
  const storedArtist = artwork?.artist ?? '';
  const storedYear = artwork?.year ?? '';
  const storedDepth = artwork?.depth ?? null;
  const storedPublic = artwork?.publicReadable ?? false;
  const pageCount = asset.metadata?.pageCount ?? 0;
  const auto = autoThicknessCm(pageCount);

  const [title, setTitle] = useSyncedState(storedTitle);
  const [artist, setArtist] = useSyncedState(storedArtist);
  const [year, setYear] = useSyncedState(storedYear);
  const [depth, setDepth] = useSyncedState(thicknessToField(storedDepth));
  const [publicReadable, setPublicReadable] = useSyncedState(storedPublic);
  // Last value sent to the server per field: a quick edit-back before the response arrives is
  // compared against this, not against the (still old) props. Follows the props when they change.
  const [committedTitle, setCommittedTitle] = useSyncedState(storedTitle);
  const [committedArtist, setCommittedArtist] = useSyncedState(storedArtist);
  const [committedYear, setCommittedYear] = useSyncedState(storedYear);
  const [committedDepth, setCommittedDepth] = useSyncedState(storedDepth);
  const [committedPublic, setCommittedPublic] = useSyncedState(storedPublic);
  const [busy, setBusy] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const sliderRef = useRef<HTMLInputElement>(null);

  const thickness = parseThickness(depth);
  const sliderValue = typeof thickness === 'number' ? thickness : auto;
  const locked = disabled || !artwork;
  // Cover actions only need the asset; artwork fields need the artwork.
  const coverLocked = disabled || !asset.id;

  const afterChange = (update: BookUpdate | null) => {
    onSaved?.();
    // Placed copies of this book pick up the new cover / thickness / label from the server
    // response; a refetch would drop the selection and the undo history.
    if (update) useEditorStore.getState().applyArtworkUpdate(update.artworkId, update.artwork, update.asset);
  };

  const invalidThickness = () =>
    gooeyToast.error('Ungültige Dicke', { description: 'Bitte einen Wert zwischen 0,3 und 8 cm eingeben.' });

  // ---- dialog mode: one save for everything ----

  const saveAll = async () => {
    if (!token || !artwork) return;
    const change = thicknessChange(storedDepth, depth);
    if (change.kind === 'invalid') {
      invalidThickness();
      return;
    }
    const patch: BookPatch = { title: effectiveTitle(title, asset.filename), artist, year, publicReadable };
    // Only when edited: the field shows a stored 1.45 as 1,5 and must not overwrite it.
    if (change.kind === 'set') patch.depth = change.value;
    setBusy(true);
    try {
      afterChange(await saveBookSettings(artwork.id, patch, token));
      gooeyToast.success('Gespeichert', { description: 'Buch-Einstellungen aktualisiert.' });
      onClose?.();
    } catch (err) {
      gooeyToast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  // ---- inline mode: commit a single field ----

  const commit = async (patch: BookPatch, revert: () => void) => {
    if (!token || !artwork) return;
    setBusy(true);
    try {
      afterChange(await saveBookSettings(artwork.id, patch, token));
    } catch (err) {
      gooeyToast.error((err as Error).message);
      revert();
    } finally {
      setBusy(false);
    }
  };

  const commitTitle = () => {
    const next = titleChange(committedTitle, title, asset.filename);
    if (next === null) return setTitle(committedTitle);
    const before = committedTitle;
    setTitle(next);
    setCommittedTitle(next);
    void commit({ title: next }, () => { setTitle(before); setCommittedTitle(before); });
  };
  const commitArtist = () => {
    const next = textChange(committedArtist, artist);
    if (next === null) return;
    const before = committedArtist;
    setCommittedArtist(next);
    void commit({ artist: next }, () => { setArtist(before); setCommittedArtist(before); });
  };
  const commitYear = () => {
    const next = textChange(committedYear, year);
    if (next === null) return;
    const before = committedYear;
    setCommittedYear(next);
    void commit({ year: next }, () => { setYear(before); setCommittedYear(before); });
  };
  const commitDepth = (raw: string) => {
    const change = thicknessChange(committedDepth, raw);
    if (change.kind === 'invalid') {
      invalidThickness();
      setDepth(thicknessToField(committedDepth));
    } else if (change.kind === 'unchanged') {
      setDepth(thicknessToField(committedDepth));
    } else {
      const before = committedDepth;
      setDepth(thicknessToField(change.value));
      setCommittedDepth(change.value);
      void commit({ depth: change.value }, () => { setDepth(thicknessToField(before)); setCommittedDepth(before); });
    }
  };
  const commitPublic = (next: boolean) => {
    const before = committedPublic;
    setPublicReadable(next);
    setCommittedPublic(next);
    void commit({ publicReadable: next }, () => { setPublicReadable(before); setCommittedPublic(before); });
  };

  // A range input fires `input` continuously while dragging and `change` once when the value is
  // committed (mouse or touch release, and every keyboard step). React's onChange is the `input`
  // event, so the commit listens to the native `change` event; pointerup/keyup would miss either
  // touch cancel or arrow-key steps. The listener reads the latest closure through a ref.
  const commitSliderRef = useRef<(v: number) => void>(() => undefined);
  commitSliderRef.current = (v) => commitDepth(formatThickness(v));
  useEffect(() => {
    const el = sliderRef.current;
    if (!inline || !el) return;
    const onCommit = () => commitSliderRef.current(Number(el.value));
    el.addEventListener('change', onCommit);
    return () => el.removeEventListener('change', onCommit);
  }, [inline]);

  const coverAction = async (action: () => Promise<BookUpdate | null>, done: string) => {
    if (!token) return;
    setBusy(true);
    try {
      afterChange(await action());
      if (!inline) gooeyToast.success(done);
    } catch (err) {
      gooeyToast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const onEnterBlur = (e: KeyboardEvent<HTMLInputElement>) => {
    if (inline && e.key === 'Enter') e.currentTarget.blur();
  };

  const { coverSource } = asset.metadata ?? {};
  const inputClass = inline ? 'h-8 text-xs bg-zinc-900 border-zinc-700 text-zinc-100' : undefined;
  const labelClass = inline ? 'text-xs text-zinc-400' : undefined;

  return (
    <div className={cn(!inline && 'space-y-4')}>
      <div className={cn(inline ? 'space-y-3' : 'grid grid-cols-[96px_1fr] gap-4')}>
        <div className={cn('space-y-2', inline && 'flex items-start gap-3 space-y-0')}>
          {asset.thumbnailPath && (
            <img src={asset.thumbnailPath} alt="Cover" className={cn('rounded border border-zinc-700', inline ? 'w-16 shrink-0' : 'w-full')} />
          )}
          <input ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp" className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              if (file && asset.id) void coverAction(() => uploadBookCover(asset.id, file, token!), 'Cover ersetzt');
            }} />
          <div className={cn('space-y-2', inline && 'min-w-0 flex-1')}>
            <Button variant="secondary" size="sm" className={cn('w-full text-xs', inline && 'bg-zinc-800 text-zinc-100 hover:bg-zinc-700')}
              disabled={busy || coverLocked} onClick={() => fileInput.current?.click()}>
              Ersatz-Cover hochladen
            </Button>
            {coverSource === 'override' && (
              <Button variant="ghost" size="sm" className="w-full text-xs" disabled={busy || coverLocked}
                onClick={() => void coverAction(() => resetBookCover(asset.id, token!), 'Cover aus PDF wiederhergestellt')}>
                Cover aus PDF verwenden
              </Button>
            )}
          </div>
        </div>

        <div className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor={`${uid}-title`} className={labelClass}>Titel</Label>
            <Input id={`${uid}-title`} value={title} className={inputClass} disabled={inline && locked}
              onChange={(e) => setTitle(e.target.value)} onKeyDown={onEnterBlur} onBlur={inline ? commitTitle : undefined} />
          </div>
          <div className="grid grid-cols-[1fr_88px] gap-2">
            <div className="space-y-1">
              <Label htmlFor={`${uid}-artist`} className={labelClass}>Künstler:in</Label>
              <Input id={`${uid}-artist`} value={artist} className={inputClass} disabled={inline && locked}
                onChange={(e) => setArtist(e.target.value)} onKeyDown={onEnterBlur} onBlur={inline ? commitArtist : undefined} />
            </div>
            <div className="space-y-1">
              <Label htmlFor={`${uid}-year`} className={labelClass}>Jahr</Label>
              <Input id={`${uid}-year`} value={year} className={inputClass} disabled={inline && locked}
                onChange={(e) => setYear(e.target.value)} onKeyDown={onEnterBlur} onBlur={inline ? commitYear : undefined} />
            </div>
          </div>
          <div className="space-y-1">
            <Label htmlFor={`${uid}-depth`} className={labelClass}>Dicke anpassen (cm)</Label>
            <input ref={sliderRef} id={`${uid}-depth-range`} type="range" min={0.3} max={8} step={0.1} value={sliderValue}
              disabled={inline && locked} onChange={(e) => setDepth(formatThickness(Number(e.target.value)))}
              className="w-full accent-blue-500" aria-label="Dicke anpassen" />
            <div className="flex items-center gap-2">
              <Input id={`${uid}-depth`} value={depth} placeholder={formatThickness(auto)} disabled={inline && locked}
                onChange={(e) => setDepth(e.target.value)} onKeyDown={onEnterBlur} onBlur={inline ? () => commitDepth(depth) : undefined}
                className={cn('w-24', inline ? inputClass : 'h-8')} />
              <Button variant="ghost" size="sm" className="text-xs" disabled={depth === '' || (inline && locked)}
                onClick={() => (inline ? commitDepth('') : setDepth(''))}>
                Automatisch ({formatThickness(auto)} cm)
              </Button>
            </div>
          </div>
          <label className={cn('flex items-start gap-2', inline ? 'text-xs text-zinc-200' : 'text-sm')}>
            <input type="checkbox" checked={publicReadable} disabled={inline && locked} className="mt-1"
              onChange={(e) => (inline ? commitPublic(e.target.checked) : setPublicReadable(e.target.checked))} />
            <span>
              Im öffentlichen Viewer lesbar
              <span className="block text-xs text-zinc-500">Wer das Buch öffnen kann, kann das PDF auch herunterladen.</span>
            </span>
          </label>
        </div>
      </div>

      {!inline && (
        <DialogFooter>
          <Button variant="outline" onClick={() => onClose?.()} disabled={busy}>Abbrechen</Button>
          <Button onClick={() => void saveAll()} disabled={busy || !artwork}>Speichern</Button>
        </DialogFooter>
      )}
    </div>
  );
}
