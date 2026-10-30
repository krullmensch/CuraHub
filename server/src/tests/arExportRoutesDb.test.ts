import fs from 'fs';
import os from 'os';
import path from 'path';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { PrismaClient } from '@prisma/client';
import { app } from '../index';
import { setArDirForTests } from '../lib/arExportFiles';
import { signArJobToken } from '../lib/arExportToken';
import * as jobs from '../lib/arExportJobs';

// Needs a database (test stack), like the other DB-backed route suites.
const prisma = new PrismaClient();
const JWT_SECRET = process.env.JWT_SECRET || 'supersecret_dev_key';
const SUFFIX = `arx-test-${Date.now()}`;
const EMAIL = `${SUFFIX}@hsbi.de`;
const SLUG = `${SUFFIX}-ex`;

let tmp: string;
let userToken: string;
let userId: number;
let exhibitionId: number;
let published: number;
let draft: number;

const auth = () => ({ Authorization: `Bearer ${userToken}` });
const jobAuth = (versionId: number) => ({ Authorization: `Bearer ${signArJobToken(versionId, 'job-1')}` });

beforeAll(async () => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ar-routes-'));
    setArDirForTests(tmp);
    fs.writeFileSync(path.join(tmp, 'v1.glb'), 'glb-0123456789');
    fs.writeFileSync(path.join(tmp, 'v1.usdz'), 'usdz-0123456789');

    const user = await prisma.user.create({ data: { email: EMAIL, role: 'curator' } });
    userId = user.id;
    userToken = jwt.sign({ userId, role: 'curator' }, JWT_SECRET, { expiresIn: '1h' });
    const project = await prisma.project.create({ data: { name: 'AR Test', slug: SUFFIX, ownerId: userId } });
    const exhibition = await prisma.exhibition.create({
        data: { title: 'AR Test', slug: SLUG, room_id: 1, projectId: project.id },
    });
    exhibitionId = exhibition.id;
    const v1 = await prisma.exhibitionVersion.create({
        data: { exhibition_id: exhibitionId, created_by_user_id: userId, comment: 'pub', is_published: true, published_at: new Date() },
    });
    const v2 = await prisma.exhibitionVersion.create({
        data: { exhibition_id: exhibitionId, created_by_user_id: userId, comment: 'draft', parent_version_id: v1.id },
    });
    published = v1.id;
    draft = v2.id;
});

afterAll(async () => {
    await prisma.project.deleteMany({ where: { slug: SUFFIX } });
    await prisma.user.deleteMany({ where: { email: EMAIL } });
    await prisma.$disconnect();
    fs.rmSync(tmp, { recursive: true, force: true });
    jest.restoreAllMocks();
});

const setExport = (versionId: number, data: { status: string; glb_file?: string | null; usdz_file?: string | null }) =>
    prisma.arExport.upsert({
        where: { versionId },
        create: { versionId, glb_size: 14, usdz_size: 15, ...data },
        update: { glb_size: 14, usdz_size: 15, glb_file: null, usdz_file: null, ...data },
    });

describe('job token routes', () => {
    it('serves the scene of exactly the token version', async () => {
        const ok = await request(app).get(`/api/ar-export/${draft}/scene`).set(jobAuth(draft));
        expect(ok.status).toBe(200);
        expect(ok.body.version.id).toBe(draft);
        expect(ok.body.exhibition.slug).toBe(SLUG);
        const wrong = await request(app).get(`/api/ar-export/${published}/scene`).set(jobAuth(draft));
        expect(wrong.status).toBe(403);
    });
    it('refuses an upload with a bad token', async () => {
        const res = await request(app).post(`/api/ar-export/${published}/files`).set('Authorization', 'Bearer bad');
        expect(res.status).toBe(403);
    });
});

describe('public AR files', () => {
    it('404 for an unpublished version', async () => {
        await setExport(draft, { status: 'done', glb_file: 'v1.glb', usdz_file: 'v1.usdz' });
        await prisma.exhibitionVersion.update({ where: { id: published }, data: { is_published: false } });
        expect((await request(app).get(`/api/public/ar/${SLUG}.usdz`)).status).toBe(404);
        await prisma.exhibitionVersion.update({ where: { id: published }, data: { is_published: true } });
        await prisma.arExport.deleteMany({ where: { versionId: draft } });
    });
    it('404 while the export is not done', async () => {
        await setExport(published, { status: 'running' });
        expect((await request(app).get(`/api/public/ar/${SLUG}.glb`)).status).toBe(404);
    });
    it('serves a done export with MIME type, immutable cache and ranges', async () => {
        await setExport(published, { status: 'done', glb_file: 'v1.glb', usdz_file: 'v1.usdz' });
        const full = await request(app).get(`/api/public/ar/${SLUG}.usdz?v=v1`);
        expect(full.status).toBe(200);
        expect(full.headers['content-type']).toContain('model/vnd.usdz+zip');
        expect(full.headers['cache-control']).toContain('immutable');
        expect(full.headers['accept-ranges']).toBe('bytes');
        const part = await request(app).get(`/api/public/ar/${SLUG}.glb`).set('Range', 'bytes=0-9');
        expect(part.status).toBe(206);
        expect(part.headers['content-type']).toContain('model/gltf-binary');
    });
    it('is only immutable for the versioned URL of the current file', async () => {
        await setExport(published, { status: 'done', glb_file: 'v1.glb', usdz_file: 'v1.usdz' });
        const bare = await request(app).get(`/api/public/ar/${SLUG}.glb`);
        expect(bare.status).toBe(200);
        expect(bare.headers['cache-control']).toBe('no-cache');
        const stale = await request(app).get(`/api/public/ar/${SLUG}.glb?v=old`);
        expect(stale.headers['cache-control']).toBe('no-cache');
    });
    it('adds the ar block to the public payload', async () => {
        const res = await request(app).get(`/api/public/exhibition/${SLUG}`);
        expect(res.status).toBe(200);
        expect(res.body.ar).toEqual({
            status: 'done',
            glbUrl: `/api/public/ar/${SLUG}.glb?v=v1`,
            usdzUrl: `/api/public/ar/${SLUG}.usdz?v=v1`,
        });
        await setExport(published, { status: 'failed' });
        expect((await request(app).get(`/api/public/exhibition/${SLUG}`)).body.ar).toEqual({ status: 'none' });
    });
});

describe('editor routes', () => {
    it('reports none, then the row', async () => {
        await prisma.arExport.deleteMany({ where: { versionId: published } });
        const none = await request(app).get(`/api/exhibitions/${exhibitionId}/versions/${published}/ar-export`).set(auth());
        expect(none.body).toEqual({ status: 'none' });
        await setExport(published, { status: 'done', glb_file: 'v1.glb', usdz_file: 'v1.usdz' });
        const done = await request(app).get(`/api/exhibitions/${exhibitionId}/versions/${published}/ar-export`).set(auth());
        expect(done.body).toMatchObject({ status: 'done', glbSize: 14, usdzSize: 15, skipped: 0, queuePosition: null });
    });
    it('needs a login', async () => {
        expect((await request(app).get(`/api/exhibitions/${exhibitionId}/versions/${published}/ar-export`)).status).toBe(401);
    });
    it('downloads as attachment named after the exhibition', async () => {
        const res = await request(app).get(`/api/exhibitions/${exhibitionId}/versions/${published}/ar-export/glb`).set(auth());
        expect(res.status).toBe(200);
        expect(res.headers['content-disposition']).toContain(`${SLUG}.glb`);
    });
    it('POST enqueues a published version (202) and refuses an unpublished one (400)', async () => {
        const spy = jest.spyOn(jobs, 'enqueueArExport').mockResolvedValue();
        const ok = await request(app).post(`/api/exhibitions/${exhibitionId}/versions/${published}/ar-export`).set(auth());
        expect(ok.status).toBe(202);
        expect(spy).toHaveBeenCalledWith(published);
        const bad = await request(app).post(`/api/exhibitions/${exhibitionId}/versions/${draft}/ar-export`).set(auth());
        expect(bad.status).toBe(400);
        expect(bad.body).toEqual({ error: 'Version ist nicht veröffentlicht.' });
        expect(spy).toHaveBeenCalledTimes(1);
    });
});

describe('publish hook', () => {
    it('publishing a version calls onVersionPublished', async () => {
        const spy = jest.spyOn(jobs, 'onVersionPublished').mockResolvedValue();
        const res = await request(app).patch(`/api/exhibitions/${exhibitionId}/versions/${draft}/publish`).set(auth());
        expect(res.status).toBe(200);
        expect(spy).toHaveBeenCalledWith(exhibitionId, draft);
    });
});

describe('deleting an exhibition', () => {
    it('removes the AR files with it (admin route)', async () => {
        const admin = await prisma.user.create({ data: { email: `${SUFFIX}-admin@hsbi.de`, role: 'admin' } });
        try {
            const adminToken = jwt.sign({ userId: admin.id, role: 'admin' }, JWT_SECRET, { expiresIn: '1h' });
            const project = await prisma.project.findFirstOrThrow({ where: { slug: SUFFIX } });
            const doomed = await prisma.exhibition.create({
                data: { title: 'Doomed', slug: `${SLUG}-doomed`, room_id: 1, projectId: project.id },
            });
            const version = await prisma.exhibitionVersion.create({
                data: { exhibition_id: doomed.id, created_by_user_id: userId, comment: 'x', is_published: true, published_at: new Date() },
            });
            fs.writeFileSync(path.join(tmp, 'doomed.glb'), 'x');
            fs.writeFileSync(path.join(tmp, 'doomed.usdz'), 'x');
            await setExport(version.id, { status: 'done', glb_file: 'doomed.glb', usdz_file: 'doomed.usdz' });

            const res = await request(app).delete(`/api/admin/exhibitions/${doomed.id}`).set('Authorization', `Bearer ${adminToken}`);
            expect(res.status).toBe(200);
            expect(fs.existsSync(path.join(tmp, 'doomed.glb'))).toBe(false);
            expect(fs.existsSync(path.join(tmp, 'doomed.usdz'))).toBe(false);
        } finally {
            await prisma.user.deleteMany({ where: { id: admin.id } });
        }
    });
});
