import request from 'supertest';
import jwt from 'jsonwebtoken';
import { app } from '../index';
import { setAdminSystemDeps } from '../routes/admin';
import { JWT_SECRET } from '../lib/jwtSecret';

beforeAll(() => {
    setAdminSystemDeps({
        pingDb: async () => {}, migrationRows: async () => ({ finished: 1, failed: 0 }), migrationFolderCount: () => 1,
        uploadsDir: '/tmp', writeProbe: async () => {}, run: async () => {}, freeBytes: async () => 100 * 1024 ** 3,
        reachHsbi: async () => {}, backups: async () => null,
    });
});

describe('GET /admin/system', () => {
    it('is admin-only', async () => {
        const token = jwt.sign({ userId: 1, role: 'curator' }, JWT_SECRET);
        expect((await request(app).get('/api/admin/system').set('Authorization', `Bearer ${token}`)).status).toBe(403);
    });
    it('returns checks, public URL and version for admins', async () => {
        const token = jwt.sign({ userId: 1, role: 'admin' }, JWT_SECRET);
        const res = await request(app).get('/api/admin/system').set('Authorization', `Bearer ${token}`);
        expect(res.status).toBe(200);
        expect(res.body.checks).toHaveLength(9);
        expect(res.body).toHaveProperty('publicUrl');
        expect(typeof res.body.version).toBe('string');
    });
});
