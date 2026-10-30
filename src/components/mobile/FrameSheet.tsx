import { useCallback, useState } from 'react';
import { SizeFields } from './SizeFields';
import type { SizeCm } from '@/lib/mobilePlanner/arSize';
import { FrameControls } from '@/components/properties/FrameControls';
import { useFrameState } from './useFrameState';
import { useEditorStore } from '@/store/editorStore';
import type { FrameStyleId } from '@/lib/frameStyles';
import type { PassepartoutValue } from '@/lib/passepartout';

interface FrameSheetProps {
  title: string;
  /** Starting size: the artwork's cm values or its pixel size, like the editor places it. */
  pictureCm: SizeCm;
  onStart: (frame: { frameStyle: FrameStyleId; passepartout: PassepartoutValue }, size: SizeCm) => void;
  onCancel: () => void;
}

/** Asset list: pick frame and passepartout before AR (preset: the last combination picked anywhere). */
export function FrameSheet({ title, pictureCm, onStart, onCancel }: FrameSheetProps) {
  const initial = useEditorStore.getState();
  // Nothing to write — the choice only lives in this sheet (and becomes the default for new drops).
  const commit = useCallback(() => {}, []);
  const [size, setSize] = useState(pictureCm);
  const frame = useFrameState({ frameStyle: initial.defaultFrameStyle, passepartout: initial.defaultPassepartout }, commit);

  return (
    <div className="fixed inset-0 z-[1150] flex items-end bg-black/60" onClick={onCancel}>
      <div
        className="w-full max-h-[85dvh] overflow-y-auto rounded-t-2xl border-t border-zinc-700 bg-zinc-900 p-4 text-white"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 16px)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 truncate font-semibold" style={{ fontFamily: '"Funnel Display", sans-serif' }}>{title}</div>
        <div className="mb-4">
          <SizeFields size={size} onChange={setSize} />
        </div>
        <FrameControls
          frameStyle={frame.frameStyle}
          onFrameToggle={frame.onFrameToggle}
          onFrameStyleChange={frame.onFrameStyleChange}
          passepartout={frame.passepartout}
          onPassepartoutToggle={frame.onPassepartoutToggle}
          onPassepartoutChange={frame.onPassepartoutChange}
          pictureCm={size}
        />
        <div className="mt-4 flex gap-2">
          <button type="button" onClick={onCancel} className="flex-1 rounded-lg border border-zinc-700 py-3 text-sm">Abbrechen</button>
          <button
            type="button"
            onClick={() => onStart({ frameStyle: frame.frameStyle, passepartout: frame.passepartout }, size)}
            className="flex-1 rounded-lg bg-blue-600 py-3 text-sm font-semibold"
          >
            In AR an Wand
          </button>
        </div>
      </div>
    </div>
  );
}
