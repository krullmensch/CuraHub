import { isPassepartoutPlacement, type PassepartoutPlacement } from './frameStyles';

export interface PassepartoutValue {
    /** Width at the sides in cm, 0 = none. */
    width: number;
    placement: PassepartoutPlacement;
}

export const NO_PASSEPARTOUT: PassepartoutValue = { width: 0, placement: 'center' };

export function passepartoutOf(inst: { passepartoutWidth?: number | null; passepartoutPlacement?: unknown }): PassepartoutValue {
    return {
        width: Math.max(0, inst.passepartoutWidth ?? 0),
        placement: isPassepartoutPlacement(inst.passepartoutPlacement) ? inst.passepartoutPlacement : 'center',
    };
}
