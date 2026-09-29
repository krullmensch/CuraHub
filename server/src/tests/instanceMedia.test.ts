import { INSTANCE_MEDIA } from '../routes/instances';

describe('instance media', () => {
    it('accepts books next to the existing media', () => {
        expect(INSTANCE_MEDIA).toEqual(['frame', 'wallpaper', 'projector', 'display', 'model3d', 'monitor', 'beamer', 'splat', 'book']);
    });
});
