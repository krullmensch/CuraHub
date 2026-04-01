import request from 'supertest';
import { app } from '../index';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const TEST_EMAILS = [
    'test.user@hsbi.de',
    'bad.user@hsbi.de',
    'repeat.user@hsbi.de',
    'me.test@hsbi.de',
];

async function cleanupTestUsers() {
    await prisma.user.deleteMany({
        where: { email: { in: TEST_EMAILS } },
    });
}

beforeAll(async () => {
    await cleanupTestUsers();
});

afterAll(async () => {
    await cleanupTestUsers();
    await prisma.$disconnect();
});

afterEach(() => {
    jest.restoreAllMocks();
});

// Helper: mock HSBI fetch to simulate successful login (empty response body)
function mockHSBISuccess() {
    jest.spyOn(global, 'fetch').mockImplementation(
        () => Promise.resolve(new Response('', { status: 200 }))
    );
}

// Helper: mock HSBI fetch to simulate failed login (HTML content in body)
function mockHSBIFailure() {
    jest.spyOn(global, 'fetch').mockImplementation(
        () => Promise.resolve(new Response('<html>Login failed</html>', { status: 200 }))
    );
}

describe('Auth API — HSBI Login', () => {

    it('Login with valid HSBI credentials succeeds and creates user', async () => {
        mockHSBISuccess();

        const res = await request(app)
            .post('/auth/login')
            .send({ username: 'test.user', password: 'hsbi-pass' });

        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('token');
        expect(res.body.user).toMatchObject({
            email: 'test.user@hsbi.de',
            role: 'user',
        });

        // Verify user was created in DB
        const user = await prisma.user.findUnique({ where: { email: 'test.user@hsbi.de' } });
        expect(user).toBeTruthy();
        expect(user?.role).toBe('user');
        expect(user?.password_hash).toBeNull();
    });

    it('Login with invalid HSBI credentials returns 401', async () => {
        mockHSBIFailure();

        const res = await request(app)
            .post('/auth/login')
            .send({ username: 'bad.user', password: 'wrong-pass' });

        expect(res.status).toBe(401);
        expect(res.body).not.toHaveProperty('token');

        // Verify no user was created
        const user = await prisma.user.findUnique({ where: { email: 'bad.user@hsbi.de' } });
        expect(user).toBeNull();
    });

    it('Second login returns same user (no duplicate)', async () => {
        mockHSBISuccess();

        const res1 = await request(app)
            .post('/auth/login')
            .send({ username: 'repeat.user', password: 'pass1' });
        expect(res1.status).toBe(200);
        const userId1 = res1.body.user.id;

        const res2 = await request(app)
            .post('/auth/login')
            .send({ username: 'repeat.user', password: 'pass2' });
        expect(res2.status).toBe(200);
        const userId2 = res2.body.user.id;

        expect(userId1).toBe(userId2);

        // Only one user in DB with this email
        const count = await prisma.user.count({ where: { email: 'repeat.user@hsbi.de' } });
        expect(count).toBe(1);
    });

    it('Login with empty username returns 400', async () => {
        const res = await request(app)
            .post('/auth/login')
            .send({ username: '', password: 'pass' });

        expect(res.status).toBe(400);
    });

    it('Login with empty password returns 400', async () => {
        const res = await request(app)
            .post('/auth/login')
            .send({ username: 'user', password: '' });

        expect(res.status).toBe(400);
    });

    it('/auth/me returns user data with valid token', async () => {
        mockHSBISuccess();

        const loginRes = await request(app)
            .post('/auth/login')
            .send({ username: 'me.test', password: 'pass' });
        const token = loginRes.body.token;

        const res = await request(app)
            .get('/auth/me')
            .set('Authorization', `Bearer ${token}`);

        expect(res.status).toBe(200);
        expect(res.body.email).toBe('me.test@hsbi.de');
        expect(res.body).not.toHaveProperty('password');
        expect(res.body).not.toHaveProperty('password_hash');
    });

    it('/auth/me rejects requests without token', async () => {
        const res = await request(app).get('/auth/me');
        expect(res.status).toBe(401);
    });

    it('/auth/me rejects requests with invalid token', async () => {
        const res = await request(app)
            .get('/auth/me')
            .set('Authorization', 'Bearer invalid-token-here');
        expect(res.status).toBe(401);
    });
});
