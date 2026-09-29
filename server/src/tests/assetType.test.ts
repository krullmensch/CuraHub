import { detectAssetType } from '../lib/assetType';

describe('detectAssetType', () => {
    it('detects Matroska and WebM videos by extension, whatever the browser sends', () => {
        expect(detectAssetType('', 'clip.mkv')).toBe('video');
        expect(detectAssetType('application/octet-stream', 'clip.mkv')).toBe('video');
        expect(detectAssetType('video/x-matroska', 'clip.mkv')).toBe('video');
        expect(detectAssetType('', 'clip.WEBM')).toBe('video');
        expect(detectAssetType('video/webm', 'clip.webm')).toBe('video');
    });

    it('keeps detecting the other asset types', () => {
        expect(detectAssetType('image/jpeg', 'bild.jpg')).toBe('image');
        expect(detectAssetType('video/mp4', 'clip.mp4')).toBe('video');
        expect(detectAssetType('application/octet-stream', 'modell.glb')).toBe('model3d');
        expect(detectAssetType('application/octet-stream', 'scan.spz')).toBe('splat');
        expect(detectAssetType('text/plain', 'notes.txt')).toBeNull();
    });

    it('detects PDFs as books by extension', () => {
        expect(detectAssetType('application/pdf', 'katalog.pdf')).toBe('book');
        expect(detectAssetType('', 'Katalog.PDF')).toBe('book');
        expect(detectAssetType('application/octet-stream', 'katalog.pdf')).toBe('book');
    });
});
