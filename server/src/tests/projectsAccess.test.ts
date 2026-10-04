import request from 'supertest';
import jwt from 'jsonwebtoken';
import { PrismaClient } from '@prisma/client';
import { app } from '../index';

const prisma = new PrismaClient();
const JWT_SECRET = process.env.JWT_SECRET || 'supersecret_dev_key';
const SUFFIX = `pa-test-${Date.now()}`;
const EMAILS = ['owner', 'guest', 'stranger'].map((who) => `${SUFFIX}-${who}@hsbi.de`);

let tokens: Record<'owner' | 'guest' | 'stranger', string>;
let projectId: number;
let invitedExhibitionId: number;

const tokenFor = (userId: number) => jwt.sign({ userId, role: 'curator' }, JWT_SECRET, { expiresIn: '1h' });
const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

beforeAll(async () => {
    const [owner, guest, stranger] = await Promise.all(EMAILS.map((email) => prisma.user.create({ data: { email, role: 'curator' } })));
    tokens = { owner: tokenFor(owner.id), guest: tokenFor(guest.id), stranger: tokenFor(stranger.id) };
    const project = await prisma.project.create({ data: { name: 'PA Test', slug: SUFFIX, ownerId: owner.id } });
    projectId = project.id;
    const invited = await prisma.exhibition.create({ data: { title: 'Eingeladen', slug: `${SUFFIX}-a`, room_id: 1, projectId } });
    await prisma.exhibition.create({ data: { title: 'Nicht eingeladen', slug: `${SUFFIX}-b`, room_id: 1, projectId } });
    invitedExhibitionId = invited.id;
    await prisma.exhibitionCollaborator.create({ data: { exhibitionId: invited.id, userId: guest.id, invitedById: owner.id } });
});

afterAll(async () => {
    await prisma.project.deleteMany({ where: { slug: SUFFIX } });
    await prisma.user.deleteMany({ where: { email: { in: EMAILS } } });
    await prisma.$disconnect();
});

describe('projects visible to collaborators', () => {
    it('lists the project for a collaborator, with only the invited exhibition', async () => {
        const res = await request(app).get('/projects').set(auth(tokens.guest));
        expect(res.status).toBe(200);
        const project = res.body.find((p: { id: number }) => p.id === projectId);
        expect(project.exhibitions.map((e: { id: number }) => e.id)).toEqual([invitedExhibitionId]);
    });

    it('opens it by slug for the collaborator, not for strangers', async () => {
        const guest = await request(app).get(`/projects/${SUFFIX}`).set(auth(tokens.guest));
        expect(guest.status).toBe(200);
        expect(guest.body.exhibitions).toHaveLength(1);
        expect((await request(app).get(`/projects/${SUFFIX}`).set(auth(tokens.stranger))).status).toBe(404);
        const listed = await request(app).get('/projects').set(auth(tokens.stranger));
        expect(listed.body.some((p: { id: number }) => p.id === projectId)).toBe(false);
    });

    it('shows the owner every exhibition', async () => {
        const res = await request(app).get(`/projects/${projectId}`).set(auth(tokens.owner));
        expect(res.body.exhibitions).toHaveLength(2);
    });

    it('still lets only the owner change or delete the project', async () => {
        expect((await request(app).put(`/projects/${projectId}`).set(auth(tokens.guest)).send({ name: 'x' })).status).toBe(404);
        expect((await request(app).delete(`/projects/${projectId}`).set(auth(tokens.guest))).status).toBe(404);
    });
});
