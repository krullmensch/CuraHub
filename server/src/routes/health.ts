import { Router } from 'express';

/** Unauthenticated liveness + DB check for the compose healthcheck. */
export function createHealthRouter(ping: () => Promise<unknown>): Router {
    const router = Router();
    router.get('/', async (_req, res) => {
        try {
            await ping();
            res.json({ ok: true });
        } catch {
            res.status(503).json({ ok: false });
        }
    });
    return router;
}
