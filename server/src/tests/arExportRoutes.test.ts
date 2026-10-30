import request from 'supertest';
import { app } from '../index';
import { signArJobToken } from '../lib/arExportToken';

// Guards that answer before any database access (the DB-backed routes are in arExportRoutesDb.test.ts).
describe('AR export job routes: token guard', () => {
    const token = signArJobToken(5, 'job-1');

    it('403 without an Authorization header', async () => {
        expect((await request(app).get('/api/ar-export/5/scene')).status).toBe(403);
        expect((await request(app).post('/api/ar-export/5/files')).status).toBe(403);
    });
    it('403 for a header that is not a Bearer token or a garbage token', async () => {
        expect((await request(app).get('/api/ar-export/5/scene').set('Authorization', token)).status).toBe(403);
        expect((await request(app).get('/api/ar-export/5/scene').set('Authorization', 'Bearer nope')).status).toBe(403);
        expect((await request(app).post('/api/ar-export/5/files').set('Authorization', 'Bearer nope')).status).toBe(403);
    });
    it('403 when the token belongs to another version', async () => {
        expect((await request(app).get('/api/ar-export/6/scene').set('Authorization', `Bearer ${token}`)).status).toBe(403);
    });
    it('400 for a non-numeric version id', async () => {
        expect((await request(app).get('/api/ar-export/abc/scene').set('Authorization', `Bearer ${token}`)).status).toBe(400);
    });
    it('is not behind the user login: a JWT-less request gets the token answer, not 401', async () => {
        const res = await request(app).get('/api/ar-export/5/scene');
        expect(res.status).not.toBe(401);
    });
    it('answers 409 stale when no job is running for a valid token', async () => {
        const res = await request(app).post('/api/ar-export/5/files')
            .set('Authorization', `Bearer ${token}`)
            .attach('glb', Buffer.from('g'), 'a.glb')
            .attach('usdz', Buffer.from('u'), 'a.usdz');
        expect(res.status).toBe(409);
    });
});
