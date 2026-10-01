import type { Request, Response, NextFunction } from 'express';
import { API_NAMESPACE_SEGMENTS, isFrontendExhibitionPath } from './apiNamespaces';
import { getSetupState } from './setupState';

/**
 * Until the first-run wizard is done, every API namespace answers 503 so nothing can be read
 * or written on an unsecured instance. The setup API, the health check and the frontend
 * (pages + static build files) stay reachable so /setup can render.
 */
export function setupGate(req: Request, res: Response, next: NextFunction): void {
    if (getSetupState()?.complete) return next();

    const segments = req.path.split('/').filter(Boolean);
    const first = (segments[0] === 'api' ? segments[1] : segments[0]) ?? '';
    if (first === 'setup' || first === 'health') return next();

    const blocked = () => {
        res.status(503).json({ error: 'setup_required' });
    };
    const isRead = req.method === 'GET' || req.method === 'HEAD';

    if (segments[0] === 'api') return blocked();
    // Static build output (e.g. /assets/index-abc.js) — but never uploaded files.
    if (isRead && req.path.includes('.') && first !== 'uploads') return next();
    if (API_NAMESPACE_SEGMENTS.has(first)) return blocked();
    if (first === 'exhibition' || first === 'exhibitions') {
        return isRead && isFrontendExhibitionPath(req.path) ? next() : blocked();
    }
    return isRead ? next() : blocked();
}
