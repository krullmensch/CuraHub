import { useId, useState } from 'react';
import { gooeyToast } from 'goey-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useEditorStore } from '@/store/editorStore';
import { useAuthStore } from '@/store/authStore';
import { parseSplatHeight, splatHeightToField } from '@/lib/splats';

/**
 * Real height of a Gaussian splat. Photo-trained captures have no unit, so the curator states it
 * once; it is stored on the artwork (Artwork.height, cm) and scales every placement of the capture
 * (SplatInstance). Empty = the file's units count as metres.
 */
export function SplatHeightControl({ instanceId }: { instanceId: number }) {
  const uid = useId();
  const token = useAuthStore((s) => s.token);
  const artworkId = useEditorStore((s) => s.localInstances.find((i) => i.id === instanceId)?.artwork.id);
  const storedHeight = useEditorStore((s) => s.localInstances.find((i) => i.id === instanceId)?.artwork.height ?? null);
  const [field, setField] = useState(splatHeightToField(storedHeight));
  const [seen, setSeen] = useState(storedHeight);
  const [busy, setBusy] = useState(false);
  // Follow the stored value when it changes from outside (another placement of the same capture).
  if (!Object.is(seen, storedHeight)) {
    setSeen(storedHeight);
    setField(splatHeightToField(storedHeight));
  }
  // Freshly dropped splats have no artwork id until the round trip finished.
  const locked = !artworkId || !token || busy;

  const save = async (height: number | null) => {
    if (!artworkId || !token) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/artworks/${artworkId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ height }),
      });
      if (!res.ok) throw new Error('Höhe konnte nicht gespeichert werden');
      const json = (await res.json()) as { height: number | null };
      // Every placed copy of this capture rescales; a refetch would drop selection and undo history.
      useEditorStore.getState().applyArtworkUpdate(artworkId, { height: json.height ?? null });
    } catch (err) {
      gooeyToast.error((err as Error).message);
      setField(splatHeightToField(storedHeight));
    } finally {
      setBusy(false);
    }
  };

  const commit = () => {
    const next = parseSplatHeight(field);
    if (next === 'invalid') {
      gooeyToast.error('Ungültige Höhe', { description: 'Bitte einen Wert zwischen 0,01 und 1000 m eingeben.' });
      setField(splatHeightToField(storedHeight));
      return;
    }
    setField(splatHeightToField(next));
    if (next !== storedHeight) void save(next);
  };

  return (
    <div className="space-y-2">
      <Label htmlFor={`${uid}-height`} className="text-xs text-zinc-400 uppercase tracking-wider">Echte Höhe (m)</Label>
      <div className="flex gap-2">
        <Input
          id={`${uid}-height`}
          inputMode="decimal"
          value={field}
          placeholder="Maßstab der Datei"
          disabled={locked}
          onChange={(e) => setField(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur();
          }}
          className="h-8 text-xs bg-zinc-900 border-zinc-700 text-zinc-100"
        />
        {storedHeight != null && (
          <Button
            variant="secondary"
            size="sm"
            className="h-8 text-xs bg-zinc-800 text-zinc-100"
            disabled={locked}
            onClick={() => { setField(''); void save(null); }}
          >
            Zurücksetzen
          </Button>
        )}
      </div>
      <p className="text-[10px] text-zinc-500">
        Höhe des Objekts im Original. Gilt für alle Platzierungen dieses Splats; die Größe oben skaliert nur diese Platzierung.
      </p>
    </div>
  );
}
