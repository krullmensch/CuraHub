import { describe, expect, it } from 'vitest';
import { parseSplatHeight, splatAnchor, splatHeightToField, splatRealScale, type SplatFrame } from './splats';

const frame: SplatFrame = { min: [-9, 0, -5], max: [9, 13.6, 5], count: 100 };

describe('splatRealScale', () => {
    it('scales the robust frame to the real height', () => {
        const height = splatAnchor(frame).size.y;
        expect(splatRealScale(height, 140) * height).toBeCloseTo(1.4, 6);
    });
    it('keeps the file units without a real height', () => {
        expect(splatRealScale(13.6, null)).toBe(1);
        expect(splatRealScale(13.6, undefined)).toBe(1);
        expect(splatRealScale(13.6, 0)).toBe(1);
    });
    it('ignores a flat frame', () => {
        expect(splatRealScale(0, 140)).toBe(1);
    });
});

describe('parseSplatHeight', () => {
    it('reads metres with comma or dot and returns cm', () => {
        expect(parseSplatHeight('1,4')).toBe(140);
        expect(parseSplatHeight(' 1.735 ')).toBe(173.5);
    });
    it('treats an empty field as the file scale', () => {
        expect(parseSplatHeight('')).toBeNull();
    });
    it('rejects nonsense', () => {
        expect(parseSplatHeight('abc')).toBe('invalid');
        expect(parseSplatHeight('0')).toBe('invalid');
        expect(parseSplatHeight('-2')).toBe('invalid');
        expect(parseSplatHeight('5000')).toBe('invalid');
    });
});

describe('splatHeightToField', () => {
    it('shows metres with a decimal comma and round-trips through parseSplatHeight', () => {
        expect(splatHeightToField(140)).toBe('1,4');
        expect(splatHeightToField(173.5)).toBe('1,735');
        expect(parseSplatHeight(splatHeightToField(173.5))).toBe(173.5);
        expect(splatHeightToField(null)).toBe('');
    });
});
