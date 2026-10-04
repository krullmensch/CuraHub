import request from 'supertest';
import jwt from 'jsonwebtoken';
import { PrismaClient } from '@prisma/client';
import { app } from '../index';

const prisma = new PrismaClient();
const JWT_SECRET = process.env.JWT_SECRET || 'supersecret_dev_key';
const SUFFIX = `wd-test-${Date.now()}`;
const EMAIL = `${SUFFIX}@hsbi.de`;

let token: string;
let versionId: number;
const auth = () => ({ Authorization: `Bearer ${token}` });
const wall = (label: string, extra: Record<string, unknown> = {}) => ({ versionId, label, position_x: 1, ...extra });

beforeAll(async () => {
    const user = await prisma.user.create({ data: { email: EMAIL, role: 'curator' } });
    token = jwt.sign({ userId: user.id, role: 'curator' }, JWT_SECRET, { expiresIn: '1h' });
    const project = await prisma.project.create({ data: { name: 'WD', slug: SUFFIX, ownerId: user.id } });
    const exhibition = await prisma.exhibition.create({ data: { title: 'WD', slug: SUFFIX, room_id: 1, projectId: project.id } });
    const version = await prisma.exhibitionVersion.create({ data: { exhibition_id: exhibition.id, created_by_user_id: user.id } });
    versionId = version.id;
});

afterAll(async () => {
    await prisma.project.deleteMany({ where: { slug: SUFFIX } });
    await prisma.user.deleteMany({ where: { email: EMAIL } });
    await prisma.$disconnect();
});

describe('default walls', () => {
    it('creates a default wall once, even when two tabs save it at the same time', async () => {
        const responses = await Promise.all([1, 2, 3].map(() =>
            request(app).post('/walls').set(auth()).send(wall('Wall A', { isDefault: true }))));
        expect(responses.map((r) => r.status).sort()).toEqual([200, 200, 201]);
        expect(new Set(responses.map((r) => r.body.id)).size).toBe(1);
        expect(responses[0].body).not.toHaveProperty('isDefault');
        expect(await prisma.modularWall.count({ where: { versionId, label: 'Wall A' } })).toBe(1);
    });

    it('still creates walls of the same name that are no defaults', async () => {
        const res = await request(app).post('/walls').set(auth()).send(wall('Wall A'));
        expect(res.status).toBe(201);
        expect(await prisma.modularWall.count({ where: { versionId, label: 'Wall A' } })).toBe(2);
    });
});
