import { describe, expect, it } from 'vitest';
import { viewerFrameloop } from './viewerFrameloop';

describe('viewerFrameloop', () => {
    it('renders continuously only while walking in a visible tab', () => {
        expect(viewerFrameloop(true, true, false)).toBe('always');
        expect(viewerFrameloop(false, true, false)).toBe('demand');
        expect(viewerFrameloop(true, false, false)).toBe('demand');
    });

    it('an open book pauses the loop (touch viewer keeps walking behind the reader)', () => {
        expect(viewerFrameloop(true, true, true)).toBe('demand');
    });
});
