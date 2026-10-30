import { FRAME_FINISHES, type FrameFinishId } from './frameStyles';

/** CSS swatch of a finish: the grain's light-to-dark range for wood, a sheen on metal, flat lacquer. */
export function finishSwatch(id: FrameFinishId): string {
    const surface = FRAME_FINISHES[id].surface;
    if (surface.kind === 'wood') {
        return `repeating-linear-gradient(100deg, ${surface.light} 0 3px, ${surface.dark} 3px 4px, ${surface.light} 4px 6px)`;
    }
    if (surface.kind === 'lacquer') return surface.color;
    return `linear-gradient(135deg, #ffffff66 0%, transparent 45%), ${surface.color}`;
}
