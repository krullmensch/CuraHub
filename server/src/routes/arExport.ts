import { NextFunction, Request, Response, Router } from 'express';
import multer from 'multer';
import { PrismaClient } from '@prisma/client';
import { authenticate, exhibitionAccessFilter } from '../lib/middleware';
import { verifyArJobToken } from '../lib/arExportToken';
import { AR_ERR_TOO_BIG, arExportQueuePosition, enqueueArExport, failArJob, receiveArFiles } from '../lib/arExportJobs';
import { arDir, arFilePath } from '../lib/arExportFiles';
import { buildPublicScenePayload } from '../lib/publicScene';

const prisma = new PrismaClient();

/** Pages of the headless export job: `/api/ar-export/…`, authorised by a one-job token (never `authenticate`). */
export const arExportJobRouter = Router();

/** Editor side: `/exhibitions/:eid/versions/:vid/ar-export…`, mounted next to versionsRouter. */
export const arExportEditorRouter = Router();

const MAX_FILE = 200 * 1024 ** 2;
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_FILE, files: 2 } })
    .fields([{ name: 'glb', maxCount: 1 }, { name: 'usdz', maxCount: 1 }]);

interface JobRequest extends Request { arJob?: { versionId: number; jobId: string } }

function jobToken(req: JobRequest, res: Response, next: NextFunction) {
    const header = req.headers.authorization;
    if (typeof header !== 'string' || !header.startsWith('Bearer ')) {
        return res.status(403).json({ error: 'Kein gültiges Token.' });
    }
    const versionId = parseInt(req.params.vid, 10);
    if (isNaN(versionId)) return res.status(400).json({ error: 'Invalid ID' });
    const verified = verifyArJobToken(header.slice('Bearer '.length), versionId);
    if (!verified) return res.status(403).json({ error: 'Kein gültiges Token.' });
    req.arJob = { versionId, jobId: verified.jobId };
    next();
}

// GET /api/ar-export/:vid/scene — what a visitor of that version would get
arExportJobRouter.get('/:vid/scene', jobToken, async (req: JobRequest, res) => {
    try {
        const scene = await buildPublicScenePayload(prisma, req.arJob!.versionId);
        if (!scene) return res.status(404).json({ error: 'Version nicht gefunden.' });
        res.json(scene);
    } catch (err) {
        console.error('Error loading AR export scene:', err);
        res.status(500).json({ error: 'Failed to load scene' });
    }
});

// POST /api/ar-export/:vid/files — glb + usdz (+ skipped) from the export page
arExportJobRouter.post('/:vid/files', jobToken, (req: JobRequest, res) => {
    const { versionId, jobId } = req.arJob!;
    upload(req, res, async (err?: unknown) => {
        if (err) {
            if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
                failArJob(versionId, jobId, AR_ERR_TOO_BIG);
                return res.status(413).json({ error: AR_ERR_TOO_BIG });
            }
            return res.status(400).json({ error: 'Ungültiger Upload.' });
        }
        try {
            const files = req.files as Record<string, Express.Multer.File[]> | undefined;
            const glb = files?.glb?.[0]?.buffer;
            const usdz = files?.usdz?.[0]?.buffer;
            if (!glb || !usdz) return res.status(400).json({ error: 'GLB und USDZ erforderlich.' });
            const skippedRaw = parseInt(String(req.body?.skipped ?? '0'), 10);
            const skipped = Number.isFinite(skippedRaw) && skippedRaw > 0 ? skippedRaw : 0;
            const result = await receiveArFiles(versionId, jobId, { glb, usdz, skipped });
            if (result === 'stale') return res.status(409).json({ error: 'stale' });
            res.status(204).end();
        } catch (e) {
            console.error('Error receiving AR files:', e);
            res.status(500).json({ error: 'Failed to store AR files' });
        }
    });
});

// --- Editor routes ---

async function accessibleVersion(req: Request, res: Response) {
    const exhibitionId = parseInt(req.params.exhibitionId, 10);
    const versionId = parseInt(req.params.versionId, 10);
    if (isNaN(exhibitionId) || isNaN(versionId)) {
        res.status(400).json({ error: 'Invalid ID' });
        return null;
    }
    const isAdmin = req.user!.role === 'admin';
    const exhibition = await prisma.exhibition.findFirst({
        where: { id: exhibitionId, ...exhibitionAccessFilter(req.user!.userId, isAdmin) },
    });
    if (!exhibition) {
        res.status(404).json({ error: 'Exhibition not found' });
        return null;
    }
    const version = await prisma.exhibitionVersion.findFirst({
        where: { id: versionId, exhibition_id: exhibitionId },
        include: { arExport: true },
    });
    if (!version) {
        res.status(404).json({ error: 'Version not found' });
        return null;
    }
    return { exhibition, version };
}

const BASE = '/exhibitions/:exhibitionId/versions/:versionId/ar-export';

arExportEditorRouter.get(BASE, authenticate, async (req: Request, res) => {
    try {
        const found = await accessibleVersion(req, res);
        if (!found) return;
        const row = found.version.arExport;
        if (!row) return res.json({ status: 'none' });
        res.json({
            status: row.status,
            glbSize: row.glb_size,
            usdzSize: row.usdz_size,
            skipped: row.skipped,
            error: row.error,
            finishedAt: row.finished_at,
            queuePosition: arExportQueuePosition(row.versionId),
        });
    } catch (e) {
        console.error('Failed to load AR export:', e);
        res.status(500).json({ error: 'Failed to load AR export' });
    }
});

arExportEditorRouter.post(BASE, authenticate, async (req: Request, res) => {
    try {
        const found = await accessibleVersion(req, res);
        if (!found) return;
        if (!found.version.is_published) {
            return res.status(400).json({ error: 'Version ist nicht veröffentlicht.' });
        }
        await enqueueArExport(found.version.id);
        res.status(202).json({ success: true });
    } catch (e) {
        console.error('Failed to start AR export:', e);
        res.status(500).json({ error: 'Failed to start AR export' });
    }
});

const FORMATS = { glb: 'model/gltf-binary', usdz: 'model/vnd.usdz+zip' } as const;

arExportEditorRouter.get(`${BASE}/:format`, authenticate, async (req: Request, res) => {
    try {
        const format = req.params.format;
        if (format !== 'glb' && format !== 'usdz') return res.status(404).json({ error: 'Format unbekannt.' });
        const found = await accessibleVersion(req, res);
        if (!found) return;
        const row = found.version.arExport;
        const name = row?.status === 'done' ? (format === 'glb' ? row.glb_file : row.usdz_file) : null;
        if (!name) return res.status(404).json({ error: 'Kein AR-Export vorhanden.' });
        arFilePath(name);
        res.attachment(`${found.exhibition.slug}.${format}`);
        res.setHeader('Content-Type', FORMATS[format]);
        res.sendFile(name, { root: arDir() }, (err) => {
            if (err && !res.headersSent) res.status(404).json({ error: 'Kein AR-Export vorhanden.' });
        });
    } catch (e) {
        console.error('Failed to download AR export:', e);
        res.status(500).json({ error: 'Failed to download AR export' });
    }
});
