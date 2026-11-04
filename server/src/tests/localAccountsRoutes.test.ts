// Routes for local accounts (admin create/reset, own password change), with Prisma mocked so
// they run without a database.
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import request from 'supertest';

type MockRow = { id: number; email: string; role: string; password_hash: string | null; must_change_password: boolean };
const mockRows: MockRow[] = [];
const mockUser = {
    findUnique: jest.fn(async ({ where }: { where: { id?: number; email?: string } }) =>
        mockRows.find((r) => (where.id !== undefined ? r.id === where.id : r.email === where.email)) ?? null),
    create: jest.fn(async ({ data }: { data: Omit<MockRow, 'id'> }) => {
        const row = { id: mockRows.length + 100, ...data };
        mockRows.push(row);
        return row;
    }),
    update: jest.fn(async ({ where, data }: { where: { id: number }; data: Partial<MockRow> }) => {
        const row = mockRows.find((r) => r.id === where.id)!;
        Object.assign(row, data);
        return row;
    }),
};

jest.mock('@prisma/client', () => {
    const client = () => new Proxy({}, {
        get: (_t, model) => (model === 'user' ? mockUser : new Proxy({}, { get: () => jest.fn() })),
    });
    return { PrismaClient: jest.fn(client), Prisma: { PrismaClientKnownRequestError: class extends Error {} } };
});

import { app } from '../index';
import { JWT_SECRET } from '../lib/jwtSecret';

const bearer = (userId: number, role: string) => `Bearer ${jwt.sign({ userId, role }, JWT_SECRET)}`;

beforeEach(async () => {
    mockRows.length = 0;
    mockRows.push(
        { id: 1, email: 'chef@hsbi.de', role: 'admin', password_hash: null, must_change_password: false },
        { id: 2, email: 'gast', role: 'curator', password_hash: await bcrypt.hash('altes-passwort-1', 4), must_change_password: true },
    );
});

describe('POST /api/admin/users', () => {
    it('is admin-only', async () => {
        const res = await request(app).post('/api/admin/users').set('Authorization', bearer(2, 'prof')).send({ username: 'neu', role: 'curator' });
        expect(res.status).toBe(403);
    });
    it('creates a local account and returns the start password once', async () => {
        const res = await request(app).post('/api/admin/users').set('Authorization', bearer(1, 'admin')).send({ username: 'Neu.Konto', role: 'curator' });
        expect(res.status).toBe(201);
        expect(res.body.user).toMatchObject({ email: 'neu.konto', role: 'curator' });
        expect(res.body.password).toMatch(/^[a-z2-9]{4}(-[a-z2-9]{4}){3}$/);
        const row = mockRows.find((r) => r.email === 'neu.konto')!;
        expect(row.must_change_password).toBe(true);
        await expect(bcrypt.compare(res.body.password, row.password_hash!)).resolves.toBe(true);
    });
    it('rejects an existing name and invalid roles', async () => {
        const auth = bearer(1, 'admin');
        expect((await request(app).post('/api/admin/users').set('Authorization', auth).send({ username: 'gast', role: 'curator' })).status).toBe(409);
        expect((await request(app).post('/api/admin/users').set('Authorization', auth).send({ username: 'neu', role: 'root' })).status).toBe(400);
    });
});

describe('POST /api/admin/users/:id/password', () => {
    it('resets local accounts only', async () => {
        const auth = bearer(1, 'admin');
        const ok = await request(app).post('/api/admin/users/2/password').set('Authorization', auth);
        expect(ok.status).toBe(200);
        expect(typeof ok.body.password).toBe('string');
        expect((await request(app).post('/api/admin/users/1/password').set('Authorization', auth)).status).toBe(400);
    });
});

describe('POST /api/auth/me/password', () => {
    it('needs a login', async () => {
        expect((await request(app).post('/api/auth/me/password').send({ current: 'a', next: 'b' })).status).toBe(401);
    });
    it('changes the password of a local account and clears the flag', async () => {
        const res = await request(app).post('/api/auth/me/password').set('Authorization', bearer(2, 'curator'))
            .send({ current: 'altes-passwort-1', next: 'neues-passwort-12' });
        expect(res.status).toBe(200);
        expect(mockRows[1].must_change_password).toBe(false);
    });
    it('refuses a wrong current password', async () => {
        const res = await request(app).post('/api/auth/me/password').set('Authorization', bearer(2, 'curator'))
            .send({ current: 'falsch', next: 'neues-passwort-12' });
        expect(res.status).toBe(403);
    });
});
