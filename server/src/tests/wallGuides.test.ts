import {
    MAX_GUIDE_FACES,
    MAX_GUIDES_PER_FACE,
    dropWallGuides,
    guidesFromIndexKeys,
    guidesToIndexKeys,
    parseWallGuides,
    remapWallGuides,
    wallGuidesSchema,
    wallLayoutPatchSchema,
    type WallGuides,
} from '../lib/wallGuides';

const h = (value: number) => ({ axis: 'h' as const, value });
const v = (value: number) => ({ axis: 'v' as const, value });

describe('wall guide keys across version copies', () => {
    const guides: WallGuides = {
        'wall:11:front': [h(1.45)],
        'wall:12:left': [v(0.05)],
        'wall:99:back': [v(1)], // wall is not part of the copy
        'room:satellit:0': [v(2)],
    };
    const wallIdToIndex = new Map([[11, 0], [12, 1]]);

    it('turns wall ids into positions and drops walls that are not copied', () => {
        expect(guidesToIndexKeys(guides, wallIdToIndex)).toEqual({
            'wallIndex:0:front': [h(1.45)],
            'wallIndex:1:left': [v(0.05)],
            'room:satellit:0': [v(2)],
        });
    });

    it('turns positions into the new wall ids', () => {
        expect(guidesFromIndexKeys({
            'wallIndex:0:front': [h(1.45)],
            'wallIndex:5:back': [v(1)], // out of range
            'wall:11:front': [h(2)], // stale wall key
            'room:satellit:0': [v(2)],
        }, [21, 22])).toEqual({
            'wall:21:front': [h(1.45)],
            'room:satellit:0': [v(2)],
        });
    });

    it('remaps in one go, also temporary negative ids', () => {
        expect(remapWallGuides({ 'wall:-1:front': [h(1)] }, new Map([[-1, 0]]), [30]))
            .toEqual({ 'wall:30:front': [h(1)] });
    });
});

describe('dropWallGuides', () => {
    it('removes all faces of a wall and nothing else', () => {
        const guides: WallGuides = { 'wall:1:front': [h(1)], 'wall:1:back': [h(2)], 'wall:12:front': [h(3)] };
        expect(dropWallGuides(guides, 1)).toEqual({ 'wall:12:front': [h(3)] });
    });

    it('returns the same object when the wall had no guides', () => {
        const guides: WallGuides = { 'wall:12:front': [h(3)] };
        expect(dropWallGuides(guides, 1)).toBe(guides);
    });
});

describe('wallGuidesSchema face cap', () => {
    it('accepts up to MAX_GUIDE_FACES keys', () => {
        const guides: WallGuides = Object.fromEntries(
            Array.from({ length: MAX_GUIDE_FACES }, (_, i) => [`room:x:${i}`, [h(1)]]),
        );
        expect(() => wallGuidesSchema.parse(guides)).not.toThrow();
    });

    it('rejects more than MAX_GUIDE_FACES keys', () => {
        const guides: WallGuides = Object.fromEntries(
            Array.from({ length: MAX_GUIDE_FACES + 1 }, (_, i) => [`room:x:${i}`, [h(1)]]),
        );
        expect(() => wallGuidesSchema.parse(guides)).toThrow();
    });
});

describe('parseWallGuides', () => {
    it('reads stored JSON and treats null or broken data as empty', () => {
        expect(parseWallGuides({ 'wall:1:front': [h(1)] })).toEqual({ 'wall:1:front': [h(1)] });
        expect(parseWallGuides(null)).toEqual({});
        expect(parseWallGuides({ 'wall:1:front': [{ axis: 'x', value: 1 }] })).toEqual({});
    });
});

describe('wallLayoutPatchSchema', () => {
    it('accepts a hanging height and guides, also left of the wall', () => {
        expect(wallLayoutPatchSchema.parse({ hangingHeight: 1.45, guides: { 'wall:1:front': [v(-0.5)] } }))
            .toEqual({ hangingHeight: 1.45, guides: { 'wall:1:front': [v(-0.5)] } });
    });

    it('rejects heights outside 1 cm … 9.99 m', () => {
        expect(() => wallLayoutPatchSchema.parse({ hangingHeight: 0 })).toThrow();
        expect(() => wallLayoutPatchSchema.parse({ hangingHeight: 10 })).toThrow();
    });

    it('rejects unknown axes, far-away values and too many guides', () => {
        expect(() => wallLayoutPatchSchema.parse({ guides: { a: [{ axis: 'x', value: 1 }] } })).toThrow();
        expect(() => wallLayoutPatchSchema.parse({ guides: { a: [v(101)] } })).toThrow();
        const many = Array.from({ length: MAX_GUIDES_PER_FACE + 1 }, (_, i) => v(i / 100));
        expect(() => wallLayoutPatchSchema.parse({ guides: { a: many } })).toThrow();
    });
});
