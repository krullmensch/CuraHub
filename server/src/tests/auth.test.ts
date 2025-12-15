import request from 'supertest';
import { app } from '../index';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

beforeAll(async () => {
  // Clear database before tests
  await prisma.user.deleteMany();
});

afterAll(async () => {
    await prisma.user.deleteMany();
    await prisma.$disconnect();
});

describe('Auth API (Phase 2)', () => {
    
    // T2.1
    it('T2.1: Registration with @hsbi.de email succeeds', async () => {
        const res = await request(app)
            .post('/auth/register')
            .send({
                email: 'test.curator@hsbi.de',
                password: 'SecurePass123!',
                role: 'curator'
            });
        
        expect([200, 201]).toContain(res.status);
        expect(res.body.email).toBe('test.curator@hsbi.de');
        expect(res.body).not.toHaveProperty('password');
        expect(res.body).not.toHaveProperty('password_hash');

        const user = await prisma.user.findUnique({ where: { email: 'test.curator@hsbi.de' } });
        expect(user).toBeTruthy();
        expect(user?.password_hash).not.toBe('SecurePass123!');
    });

    // T2.2
    it('T2.2: Registration with non-@hsbi.de email is rejected', async () => {
        const domains = ['user@gmail.com', 'user@yahoo.com', 'user@hsbi.com'];
        
        for (const email of domains) {
            const res = await request(app)
                .post('/auth/register')
                .send({
                    email,
                    password: 'SecurePass123!'
                });
            expect(res.status).toBe(400); 
            // Depending on implementation, might be 422, but code shows 400 for zod error
            const user = await prisma.user.findUnique({ where: { email } });
            expect(user).toBeNull();
        }
    });

    // T2.3
    it('T2.3: Duplicate email registration is prevented', async () => {
        // Ensure user exists from T2.1 or create new
        const email = 'duplicate@hsbi.de';
        await request(app).post('/auth/register').send({ email, password: 'SecurePass123!' });
        
        const res = await request(app)
            .post('/auth/register')
            .send({
                email,
                password: 'OtherPassword'
            });
        
        expect(res.status).toBe(400); // Code returns 400 for 'User already exists'
        
        const count = await prisma.user.count({ where: { email } });
        expect(count).toBe(1);
    });

    // T2.4
    it('T2.4: Login with valid credentials returns token', async () => {
        const email = 'login.test@hsbi.de';
        const password = 'TestPass123!';
        
        await request(app).post('/auth/register').send({ email, password });

        const res = await request(app)
            .post('/auth/login')
            .send({ email, password });
            
        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('token');
        expect(typeof res.body.token).toBe('string');
    });

    // T2.5
    it('T2.5: Login with incorrect password is rejected', async () => {
        const email = 'login.fail@hsbi.de';
        const password = 'CorrectPass';
        await request(app).post('/auth/register').send({ email, password });

        const res = await request(app)
            .post('/auth/login')
            .send({ email, password: 'WrongPassword' });

        expect(res.status).toBe(401);
        expect(res.body).not.toHaveProperty('token');
    });

    // T2.7
    it('T2.7: /auth/me returns user data with valid token', async () => {
        const email = 'me.test@hsbi.de';
        const password = 'SecurePass123!';
        await request(app).post('/auth/register').send({ email, password });
        
        const loginRes = await request(app).post('/auth/login').send({ email, password });
        const token = loginRes.body.token;

        const res = await request(app)
            .get('/auth/me')
            .set('Authorization', `Bearer ${token}`);
            
        expect(res.status).toBe(200);
        expect(res.body.email).toBe(email);
        expect(res.body).not.toHaveProperty('password');
    });

    // T2.8
    it('T2.8: /auth/me rejects requests without token', async () => {
        const res = await request(app).get('/auth/me');
        expect(res.status).toBe(401);
    });
});
