import request from 'supertest';
import jwt from 'jsonwebtoken';
import { PrismaClient } from '@prisma/client';
import { app } from '../index';

const prisma = new PrismaClient();
const JWT_SECRET = process.env.JWT_SECRET || 'supersecret_dev_key';
const SUFFIX = `sf-test-${Date.now()}`;
const OWNER_EMAIL = `${SUFFIX}-owner@hsbi.de`;
const STRANGER_EMAIL = `${SUFFIX}-stranger@hsbi.de`;

let ownerId: number;
let ownerToken: string;
let strangerToken: string;
let exhibitionId: number;
let exhibitionSlug: string;
let versionId: number;

const tokenFor = (userId: number) => jwt.sign({ userId, role: 'curator' }, JWT_SECRET, { expiresIn: '1h' });
const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

beforeAll(async () => {
    const owner = await prisma.user.create({ data: { email: OWNER_EMAIL, role: 'curator' } });
    const stranger = await prisma.user.create({ data: { email: STRANGER_EMAIL, role: 'curator' } });
    ownerId = owner.id;
    ownerToken = tokenFor(owner.id);
    strangerToken = tokenFor(stranger.id);
    const project = await prisma.project.create({ data: { name: 'SF Test', slug: SUFFIX, ownerId: owner.id } });
    exhibitionSlug = `${SUFFIX}-ex`;
    const exhibition = await prisma.exhibition.create({
        data: { title: 'SF Test', slug: exhibitionSlug, room_id: 1, projectId: project.id },
    });
    exhibitionId = exhibition.id;
    const version = await prisma.exhibitionVersion.create({
        data: { exhibition_id: exhibition.id, created_by_user_id: owner.id, comment: 'root' },
    });
    versionId = version.id;
});

afterAll(async () => {
    // Project → exhibitions → versions → figures cascade
    await prisma.project.deleteMany({ where: { slug: SUFFIX } });
    await prisma.user.deleteMany({ where: { email: { in: [OWNER_EMAIL, STRANGER_EMAIL] } } });
    await prisma.$disconnect();
});

describe('scale figures API', () => {
    let figureId: number;

    it('creates a figure, private by default', async () => {
        const res = await request(app).post('/scale-figures').set(auth(ownerToken))
            .send({ versionId, position_x: 1.5, position_z: -2, rotation_y: 0.5 });
        expect(res.status).toBe(201);
        expect(res.body).toMatchObject({ versionId, position_x: 1.5, position_z: -2, rotation_y: 0.5, isPublic: false });
        figureId = res.body.id;
    });

    it('lists the figures of a version', async () => {
        const res = await request(app).get(`/scale-figures?versionId=${versionId}`).set(auth(ownerToken));
        expect(res.status).toBe(200);
        expect(res.body.map((f: { id: number }) => f.id)).toEqual([figureId]);
    });

    it('updates position and visibility', async () => {
        const res = await request(app).patch(`/scale-figures/${figureId}`).set(auth(ownerToken))
            .send({ position_x: 3, isPublic: true });
        expect(res.status).toBe(200);
        expect(res.body).toMatchObject({ position_x: 3, position_z: -2, isPublic: true });
    });

    it('rejects invalid input', async () => {
        const bad = await request(app).post('/scale-figures').set(auth(ownerToken))
            .send({ versionId, position_x: 'links', position_z: 0 });
        expect(bad.status).toBe(400);
        const far = await request(app).patch(`/scale-figures/${figureId}`).set(auth(ownerToken))
            .send({ position_z: 1e6 });
        expect(far.status).toBe(400);
    });

    it('hides figures from users without access', async () => {
        const list = await request(app).get(`/scale-figures?versionId=${versionId}`).set(auth(strangerToken));
        expect(list.status).toBe(404);
        const create = await request(app).post('/scale-figures').set(auth(strangerToken))
            .send({ versionId, position_x: 0, position_z: 0 });
        expect(create.status).toBe(404);
        const patch = await request(app).patch(`/scale-figures/${figureId}`).set(auth(strangerToken))
            .send({ position_x: 0 });
        expect(patch.status).toBe(404);
        const del = await request(app).delete(`/scale-figures/${figureId}`).set(auth(strangerToken));
        expect(del.status).toBe(404);
    });

    it('deletes a figure', async () => {
        const res = await request(app).delete(`/scale-figures/${figureId}`).set(auth(ownerToken));
        expect(res.status).toBe(200);
        expect(await prisma.scaleFigure.findUnique({ where: { id: figureId } })).toBeNull();
    });

    it('sets up a fixture exhibition', () => {
        expect(ownerId).toBeGreaterThan(0);
        expect(exhibitionId).toBeGreaterThan(0);
        expect(exhibitionSlug).toContain(SUFFIX);
    });
});
