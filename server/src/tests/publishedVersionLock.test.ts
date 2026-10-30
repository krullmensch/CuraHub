import request from 'supertest';
import jwt from 'jsonwebtoken';
import { PrismaClient } from '@prisma/client';
import { app } from '../index';

const prisma = new PrismaClient();
const JWT_SECRET = process.env.JWT_SECRET || 'supersecret_dev_key';
const SUFFIX = `pvl-test-${Date.now()}`;
const OWNER_EMAIL = `${SUFFIX}-owner@hsbi.de`;

let ownerToken: string;
let exhibitionId: number;
let artworkId: number;

interface Fixture { versionId: number; instanceId: number; wallId: number; figureId: number }
let open: Fixture;
let locked: Fixture;

const auth = () => ({ Authorization: `Bearer ${ownerToken}` });
const LOCKED = { code: 'version_published' };

async function makeFixture(versionId: number): Promise<Fixture> {
    const wall = await prisma.modularWall.create({ data: { versionId, label: 'W' } });
    const instance = await prisma.artworkInstance.create({
        data: { artworkId, versionId, position_x: 1, position_y: 1, position_z: 1 },
    });
    const figure = await prisma.scaleFigure.create({ data: { versionId, position_x: 1, position_z: 1 } });
    return { versionId, instanceId: instance.id, wallId: wall.id, figureId: figure.id };
}

beforeAll(async () => {
    const owner = await prisma.user.create({ data: { email: OWNER_EMAIL, role: 'curator' } });
    ownerToken = jwt.sign({ userId: owner.id, role: 'curator' }, JWT_SECRET, { expiresIn: '1h' });
    const project = await prisma.project.create({ data: { name: 'PVL Test', slug: SUFFIX, ownerId: owner.id } });
    const exhibition = await prisma.exhibition.create({
        data: { title: 'PVL Test', slug: `${SUFFIX}-ex`, room_id: 1, projectId: project.id },
    });
    exhibitionId = exhibition.id;
    const artwork = await prisma.artwork.create({ data: { title: SUFFIX } });
    artworkId = artwork.id;
    const v1 = await prisma.exhibitionVersion.create({
        data: { exhibition_id: exhibition.id, created_by_user_id: owner.id, comment: 'open' },
    });
    const v2 = await prisma.exhibitionVersion.create({
        data: {
            exhibition_id: exhibition.id, created_by_user_id: owner.id, comment: 'locked',
            is_published: true, published_at: new Date(),
        },
    });
    open = await makeFixture(v1.id);
    locked = await makeFixture(v2.id);
});

afterAll(async () => {
    await prisma.project.deleteMany({ where: { slug: SUFFIX } });
    await prisma.artwork.deleteMany({ where: { id: artworkId } });
    await prisma.user.deleteMany({ where: { email: OWNER_EMAIL } });
    await prisma.$disconnect();
});

const newInstance = (versionId: number) => ({
    versionId, artworkId, position: { x: 0, y: 1, z: 0 }, rotation: { x: 0, y: 0, z: 0 },
});

describe('published version is read-only', () => {
    it('rejects POST of instances, walls and figures', async () => {
        const i = await request(app).post('/instances').set(auth()).send(newInstance(locked.versionId));
        const w = await request(app).post('/walls').set(auth()).send({ versionId: locked.versionId });
        const f = await request(app).post('/scale-figures').set(auth()).send({ versionId: locked.versionId, position_x: 0, position_z: 0 });
        for (const res of [i, w, f]) {
            expect(res.status).toBe(409);
            expect(res.body).toMatchObject(LOCKED);
        }
        expect(await prisma.artworkInstance.count({ where: { versionId: locked.versionId } })).toBe(1);
        expect(await prisma.modularWall.count({ where: { versionId: locked.versionId } })).toBe(1);
        expect(await prisma.scaleFigure.count({ where: { versionId: locked.versionId } })).toBe(1);
    });

    it('rejects PATCH and leaves the rows unchanged', async () => {
        const i = await request(app).patch(`/instances/${locked.instanceId}`).set(auth()).send({ position: { x: 9, y: 9, z: 9 } });
        const w = await request(app).patch(`/walls/${locked.wallId}`).set(auth()).send({ position_x: 9 });
        const f = await request(app).patch(`/scale-figures/${locked.figureId}`).set(auth()).send({ position_x: 9 });
        for (const res of [i, w, f]) {
            expect(res.status).toBe(409);
            expect(res.body).toMatchObject(LOCKED);
        }
        expect((await prisma.artworkInstance.findUnique({ where: { id: locked.instanceId } }))?.position_x).toBe(1);
        expect((await prisma.modularWall.findUnique({ where: { id: locked.wallId } }))?.position_x).toBe(0);
        expect((await prisma.scaleFigure.findUnique({ where: { id: locked.figureId } }))?.position_x).toBe(1);
    });

    it('rejects DELETE and keeps the rows', async () => {
        const i = await request(app).delete(`/instances/${locked.instanceId}`).set(auth());
        const w = await request(app).delete(`/walls/${locked.wallId}`).set(auth());
        const f = await request(app).delete(`/scale-figures/${locked.figureId}`).set(auth());
        for (const res of [i, w, f]) {
            expect(res.status).toBe(409);
            expect(res.body).toMatchObject(LOCKED);
        }
        expect(await prisma.artworkInstance.findUnique({ where: { id: locked.instanceId } })).not.toBeNull();
        expect(await prisma.modularWall.findUnique({ where: { id: locked.wallId } })).not.toBeNull();
        expect(await prisma.scaleFigure.findUnique({ where: { id: locked.figureId } })).not.toBeNull();
    });

    it('rejects PATCH wall-layout', async () => {
        const res = await request(app)
            .patch(`/exhibitions/${exhibitionId}/versions/${locked.versionId}/wall-layout`)
            .set(auth()).send({ hangingHeight: 1.6 });
        expect(res.status).toBe(409);
        expect(res.body).toMatchObject(LOCKED);
    });
});

describe('unpublished version stays writable', () => {
    it('accepts POST, PATCH and wall-layout', async () => {
        const i = await request(app).post('/instances').set(auth()).send(newInstance(open.versionId));
        const w = await request(app).post('/walls').set(auth()).send({ versionId: open.versionId });
        const f = await request(app).post('/scale-figures').set(auth()).send({ versionId: open.versionId, position_x: 0, position_z: 0 });
        expect(i.status).toBe(200);
        expect(w.status).toBe(201);
        expect(f.status).toBe(201);

        expect((await request(app).patch(`/instances/${open.instanceId}`).set(auth()).send({ position: { x: 2, y: 2, z: 2 } })).status).toBe(200);
        expect((await request(app).patch(`/walls/${open.wallId}`).set(auth()).send({ position_x: 2 })).status).toBe(200);
        expect((await request(app).patch(`/scale-figures/${open.figureId}`).set(auth()).send({ position_x: 2 })).status).toBe(200);
        const layout = await request(app)
            .patch(`/exhibitions/${exhibitionId}/versions/${open.versionId}/wall-layout`)
            .set(auth()).send({ hangingHeight: 1.6 });
        expect(layout.status).toBe(200);
    });

    it('accepts DELETE', async () => {
        expect((await request(app).delete(`/instances/${open.instanceId}`).set(auth())).status).toBe(200);
        expect((await request(app).delete(`/walls/${open.wallId}`).set(auth())).status).toBe(200);
        expect((await request(app).delete(`/scale-figures/${open.figureId}`).set(auth())).status).toBe(200);
    });
});

describe('versions list', () => {
    it('returns published_at for the published version only', async () => {
        const res = await request(app).get(`/exhibitions/${exhibitionId}/versions`).set(auth());
        expect(res.status).toBe(200);
        const byId = new Map<number, { published_at: string | null }>(res.body.map((v: { id: number; published_at: string | null }) => [v.id, v]));
        expect(typeof byId.get(locked.versionId)?.published_at).toBe('string');
        expect(byId.get(open.versionId)?.published_at).toBeNull();
    });
});

describe('working copy of a published version on a branch (I1)', () => {
    let branchPublishedId: number;

    beforeAll(async () => {
        const owner = await prisma.user.findFirstOrThrow({ where: { email: OWNER_EMAIL } });
        const v = await prisma.exhibitionVersion.create({
            data: {
                exhibition_id: exhibitionId, created_by_user_id: owner.id, comment: 'branch published',
                branch_name: `${SUFFIX}-b`, is_published: true, published_at: new Date(),
            },
        });
        branchPublishedId = v.id;
    });

    it('continuing the source version\'s branch is allowed', async () => {
        const res = await request(app).post(`/exhibitions/${exhibitionId}/versions`).set(auth()).send({
            comment: 'Arbeitskopie', branch_name: `${SUFFIX}-b`, sourceVersionId: branchPublishedId,
        });
        expect(res.status).toBe(201);
        const created = await prisma.exhibitionVersion.findUnique({ where: { id: res.body.id } });
        expect(created).toMatchObject({ branch_name: `${SUFFIX}-b`, parent_version_id: branchPublishedId, is_published: false });
    });

    it('starting a branch whose name is taken is still refused', async () => {
        const res = await request(app).post(`/exhibitions/${exhibitionId}/versions`).set(auth()).send({
            comment: 'Neuer Branch', branch_name: `${SUFFIX}-b`, sourceVersionId: open.versionId,
        });
        expect(res.status).toBe(400);
    });
});
