import { lazy, Suspense, useCallback, useState } from 'react';
import { Smartphone } from 'lucide-react';
import { useEditorStore, type ArtworkInstanceData } from '@/store/editorStore';
import { FrameControls } from '@/components/properties/FrameControls';
import { useFrameState } from './useFrameState';
import { frameStyleOf, type FrameStyleId } from '@/lib/frameStyles';
import { passepartoutOf, type PassepartoutValue } from '@/lib/passepartout';
import { withFrameStyle, withPassepartout } from '@/lib/frameEdits';
import { arArtworkInstance, canOfferAr } from '@/lib/mobilePlanner/arArtwork';
import { scaleForSizeCm, type SizeCm } from '@/lib/mobilePlanner/arSize';
import { SizeFields } from './SizeFields';
import { FramePreview } from './FramePreview';
import { pictureSize } from '@/lib/wallEditor/footprint';
import { useHeldByOthers } from '@/hooks/use-held-claims';
import { claimKey } from '@/lib/live/claims';
import { displayArtworkTitle } from '@/lib/artworkTitle';

const ArWallSheet = lazy(() => import('./ArWallSheet'));

function cm(m: number): string {
  return (m * 100).toLocaleString('de-DE', { maximumFractionDigits: 1 });
}

/** One selected artwork: info, frame and passepartout, „In AR an Wand". */
function SelectedArtwork({ inst }: { inst: ArtworkInstanceData }) {
  const held = useHeldByOthers().get(claimKey('instance', inst.id));
  // Snapshot when AR opens: a re-render must not hand the builder a new instance.
  const [arInstance, setArInstance] = useState<ArtworkInstanceData | null>(null);
  const closeAr = useCallback(() => setArInstance(null), []);
  const commit = useCallback((next: { frameStyle: FrameStyleId; passepartout: PassepartoutValue }) => {
    const store = useEditorStore.getState();
    const current = store.localInstances.find((i) => i.id === inst.id);
    if (!current) return;
    let list = store.localInstances;
    if (frameStyleOf(current.frameStyle) !== next.frameStyle) list = withFrameStyle(list, inst.id, next.frameStyle);
    const pp = passepartoutOf(current);
    if (pp.width !== next.passepartout.width || pp.placement !== next.passepartout.placement) {
      list = withPassepartout(list, inst.id, next.passepartout);
    }
    if (list !== store.localInstances) store.commitLocalChange(list);
  }, [inst.id]);
  const frame = useFrameState({ frameStyle: frameStyleOf(inst.frameStyle), passepartout: passepartoutOf(inst) }, commit);

  const size = pictureSize(inst);
  // Frames and AR are for pictures only (the properties panel also hides frames for videos).
  const isPicture = canOfferAr(inst.artwork.asset.type ?? 'image');
  const title = displayArtworkTitle(inst.artwork.title ?? '') || inst.artwork.asset.filename || 'Kunstwerk';
  const sizeLabel = `${cm(size.w)} × ${cm(size.h)} cm`;

  // Same as the properties panel's „Size (cm)": the hung size is the instance scale.
  const changeSize = (next: SizeCm) => {
    const store = useEditorStore.getState();
    const scale = scaleForSizeCm(inst, next);
    store.commitLocalChange(store.localInstances.map((i) => (i.id === inst.id ? { ...i, ...scale } : i)));
  };

  return (
    <div className="space-y-4">
      <div>
        <div className="text-lg font-semibold text-white" style={{ fontFamily: '"Funnel Display", sans-serif' }}>{title}</div>
        <div className="text-sm text-zinc-400">
          {[inst.artwork.artist, inst.artwork.year].filter(Boolean).join(' — ')}
        </div>
        <div className="text-xs text-zinc-500 mt-1">{sizeLabel}</div>
      </div>

      {isPicture && (
        <FramePreview
          imageUrl={inst.artwork.asset.thumbnailPath || inst.artwork.asset.path}
          size={{ w: size.w * 100, h: size.h * 100 }}
          frameStyle={frame.frameStyle}
          passepartout={frame.passepartout}
        />
      )}

      {isPicture && (
        <SizeFields size={{ w: size.w * 100, h: size.h * 100 }} onChange={changeSize} disabled={!!held} />
      )}

      {isPicture && (
        held ? (
          <p className="text-sm text-amber-400">Wird gerade von {held.name} bearbeitet</p>
        ) : (
          <FrameControls
            frameStyle={frame.frameStyle}
            onFrameToggle={frame.onFrameToggle}
            onFrameStyleChange={frame.onFrameStyleChange}
            passepartout={frame.passepartout}
            onPassepartoutToggle={frame.onPassepartoutToggle}
            onPassepartoutChange={frame.onPassepartoutChange}
            pictureCm={{ w: size.w * 100, h: size.h * 100 }}
          />
        )
      )}

      {isPicture && (
        <div>
          <button
            type="button"
            onClick={() => setArInstance(arArtworkInstance(inst, { frameStyle: frame.frameStyle, passepartout: frame.passepartout }))}
            className="w-full flex items-center justify-center gap-2 rounded-lg bg-blue-600 py-3 text-sm font-semibold text-white disabled:opacity-40"
          >
            <Smartphone size={16} />
            In AR an Wand
          </button>
        </div>
      )}

      {arInstance && (
        <Suspense fallback={null}>
          <ArWallSheet instance={arInstance} title={title} sizeLabel={sizeLabel} onClose={closeAr} />
        </Suspense>
      )}
    </div>
  );
}

export function RoomTab() {
  const selected = useEditorStore((s) =>
    s.selectedInstanceId === null ? null : s.localInstances.find((i) => i.id === s.selectedInstanceId) ?? null,
  );
  if (!selected) return <p className="py-6 text-center text-sm text-zinc-400">Tippe ein Kunstwerk an.</p>;
  // Keyed by id and frame values: the panel starts over from the artwork whenever its frame changes
  // from outside (a discarded edit on a published version, an undo, a remote change).
  const pp = passepartoutOf(selected);
  const key = `${selected.id}:${frameStyleOf(selected.frameStyle)}:${pp.width}:${pp.placement}`;
  return <SelectedArtwork key={key} inst={selected} />;
}
