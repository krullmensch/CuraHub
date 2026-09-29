import { describe, expect, it } from 'vitest';
import { isSupportedUploadFile, isVideoFile } from './uploadFiles';

const file = (name: string, type: string) => new File([new Uint8Array(1)], name, { type });

describe('video uploads', () => {
  it('accepts Matroska and WebM without a MIME type (Safari sends none for .mkv)', () => {
    for (const name of ['clip.mkv', 'clip.MKV', 'clip.webm']) {
      expect(isVideoFile(file(name, ''))).toBe(true);
      expect(isSupportedUploadFile(file(name, ''))).toBe(true);
    }
  });

  it('accepts videos by MIME type', () => {
    expect(isVideoFile(file('clip', 'video/x-matroska'))).toBe(true);
    expect(isSupportedUploadFile(file('clip', 'video/webm'))).toBe(true);
  });

  it('does not take other files for videos', () => {
    expect(isVideoFile(file('bild.jpg', 'image/jpeg'))).toBe(false);
    expect(isSupportedUploadFile(file('notes.txt', 'text/plain'))).toBe(false);
  });
});
