import { MAX_PASSEPARTOUT_WIDTH_CM, type FrameStyleId } from './frameStyles';
import type { PassepartoutValue } from './passepartout';
import type { ArtworkInstanceData } from '@/store/editorStore';

/** Frame and passepartout edits of one artwork as new instance lists (properties panel, mobile planner). */
export function withFrameStyle(list: ArtworkInstanceData[], id: number, frameStyle: FrameStyleId): ArtworkInstanceData[] {
  return list.map((inst) => (inst.id === id ? { ...inst, frameStyle } : inst));
}

export function withPassepartout(list: ArtworkInstanceData[], id: number, value: PassepartoutValue): ArtworkInstanceData[] {
  const width = Math.min(Math.max(value.width, 0), MAX_PASSEPARTOUT_WIDTH_CM);
  return list.map((inst) =>
    inst.id === id ? { ...inst, passepartoutWidth: width, passepartoutPlacement: value.placement } : inst,
  );
}
