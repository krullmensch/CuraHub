import fs from 'fs';
import os from 'os';
import path from 'path';
import express from 'express';
import request from 'supertest';
import { capRangeHeader, isVideoPath, VIDEO_RANGE_CHUNK_BYTES, videoStreamHandler } from '../lib/videoRanges';

describe('capRangeHeader', () => {
    it('limits open-ended ranges to one chunk', () => {
        expect(capRangeHeader('bytes=0-', 100)).toBe('bytes=0-99');
        expect(capRangeHeader('bytes=500-', 100)).toBe('bytes=500-599');
    });

    it('limits long closed ranges and keeps short ones', () => {
        expect(capRangeHeader('bytes=0-1000', 100)).toBe('bytes=0-99');
        expect(capRangeHeader('bytes=10-20', 100)).toBe('bytes=10-20');
    });

    it('leaves suffix and multi-part ranges alone', () => {
        expect(capRangeHeader('bytes=-500', 100)).toBe('bytes=-500');
        expect(capRangeHeader('bytes=0-10, 20-30', 100)).toBe('bytes=0-10, 20-30');
    });

    it('recognises video files only', () => {
        expect(isVideoPath('/clip-1.MP4')).toBe(true);
        expect(isVideoPath('/clip.webm')).toBe(true);
        expect(isVideoPath('/picture.webp')).toBe(false);
    });
});

describe('videoStreamHandler', () => {
    const size = VIDEO_RANGE_CHUNK_BYTES * 2 + 123;
    let dir: string;
    let app: express.Express;

    beforeAll(() => {
        dir = fs.mkdtempSync(path.join(os.tmpdir(), 'curahub-video-ranges-'));
        fs.mkdirSync(path.join(dir, 'uploads'));
        fs.writeFileSync(path.join(dir, 'uploads', 'clip.mp4'), Buffer.alloc(size, 1));
        fs.writeFileSync(path.join(dir, 'secret.mp4'), Buffer.alloc(10, 2));
        app = express();
        app.get('/uploads/stream', videoStreamHandler(path.join(dir, 'uploads')));
    });

    afterAll(() => {
        fs.rmSync(dir, { recursive: true, force: true });
    });

    it('answers bytes=0- with the first chunk', async () => {
        const res = await request(app).get('/uploads/stream?src=clip.mp4').set('Range', 'bytes=0-');
        expect(res.status).toBe(206);
        expect(res.headers['content-range']).toBe(`bytes 0-${VIDEO_RANGE_CHUNK_BYTES - 1}/${size}`);
        expect(Number(res.headers['content-length'])).toBe(VIDEO_RANGE_CHUNK_BYTES);
        expect(res.headers['content-type']).toBe('video/mp4');
        expect(res.headers['cache-control']).toBe('private, max-age=604800');
    });

    it('ends the last chunk at the end of the file', async () => {
        const start = VIDEO_RANGE_CHUNK_BYTES * 2;
        const res = await request(app).get('/uploads/stream?src=clip.mp4').set('Range', `bytes=${start}-`);
        expect(res.status).toBe(206);
        expect(res.headers['content-range']).toBe(`bytes ${start}-${size - 1}/${size}`);
    });

    it('rejects non-videos, missing files and paths outside the uploads directory', async () => {
        expect((await request(app).get('/uploads/stream?src=clip.webp')).status).toBe(400);
        expect((await request(app).get('/uploads/stream')).status).toBe(400);
        expect((await request(app).get('/uploads/stream?src=missing.mp4')).status).toBe(404);
        expect((await request(app).get(`/uploads/stream?src=${encodeURIComponent('../secret.mp4')}`)).status).toBe(403);
    });
});
