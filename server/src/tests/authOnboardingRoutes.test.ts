// Route-level check that every auth response carries onboardingCompletedAt — with Prisma mocked,
// so it runs without a database (the DB-backed auth.test.ts needs MySQL).
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import request from 'supertest';

const mockUser = {
    id: 42,
    email: 'tour.test@hsbi.de',
    role: 'curator',
    password_hash: null as string | null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    onboarding_completed_at: new Date('2026-10-29T10:00:00.000Z') as Date | null,
};
const mockFindUnique = jest.fn(async () => mockUser);

jest.mock('@prisma/client', () => {
    const client = () => new Proxy({}, {
        get: (_t, model) => (model === 'user'
            ? { findUnique: mockFindUnique, updateMany: jest.fn(), create: jest.fn() }
            : new Proxy({}, { get: () => jest.fn() })),
    });
    return { PrismaClient: jest.fn(client) };
});

import { app } from '../index';
import { JWT_SECRET } from '../lib/jwtSecret';

afterEach(() => jest.restoreAllMocks());

describe('auth responses include onboardingCompletedAt', () => {
    it('GET /auth/me', async () => {
        const token = jwt.sign({ userId: 42, role: 'curator' }, JWT_SECRET);
        const res = await request(app).get('/auth/me').set('Authorization', `Bearer ${token}`);
        expect(res.status).toBe(200);
        expect(res.body.user).toEqual({ id: 42, email: 'tour.test@hsbi.de', role: 'curator', onboardingCompletedAt: '2026-10-29T10:00:00.000Z' });
    });

    it('POST /auth/login', async () => {
        jest.spyOn(global, 'fetch').mockImplementation(() => Promise.resolve(new Response('', { status: 200 })));
        const res = await request(app).post('/auth/login').send({ username: 'tour.test', password: 'pw' });
        expect(res.status).toBe(200);
        expect(res.body.user.onboardingCompletedAt).toBe('2026-10-29T10:00:00.000Z');
    });

    it('POST /auth/local-login', async () => {
        mockFindUnique.mockResolvedValueOnce({
            ...mockUser,
            email: 'notfall',
            role: 'admin',
            password_hash: await bcrypt.hash('sehr-geheim-123', 4),
            onboarding_completed_at: null,
        });
        const res = await request(app).post('/auth/local-login').send({ username: 'notfall', password: 'sehr-geheim-123' });
        expect(res.status).toBe(200);
        expect(res.body.user).toMatchObject({ email: 'notfall', onboardingCompletedAt: null });
    });
});
