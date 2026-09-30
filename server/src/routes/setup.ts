import { Router, type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import type { Check } from '../lib/systemChecks';
import { completeSetupSchema, normalizePublicUrl } from '../lib/setupValidation';
import type { CompleteSetupInput } from '../lib/setupStore';
import { createRateLimit, clientIp } from '../lib/rateLimit';
import { loginRateLimit } from '../lib/loginRateLimit';
import {
    codesMatch, getSetupCode, getSetupState, issueSetupToken, setSetupState, verifySetupToken,
} from '../lib/setupState';

/** First-run wizard API (mounted at /setup and /api/setup). Every route but /status 404s once set up. */
export interface SetupRouterDeps {
    runChecks(req: Request): Promise<Check[]>;
    validateHSBI(username: string, password: string): Promise<boolean>;
    hashPassword(password: string): Promise<string>;
    completeSetup(input: CompleteSetupInput): Promise<void>;
}

const HSBI_REJECTED = 'HSBI hat die Anmeldedaten abgelehnt.';
const HSBI_UNREACHABLE = 'www.hsbi.de ist vom Server aus nicht erreichbar.';

const hsbiSchema = z.object({
    username: z.string().trim().min(1).max(100).refine((u) => !u.includes('@')),
    password: z.string().min(1).max(200),
});

async function checkHsbi(deps: SetupRouterDeps, username: string, password: string): Promise<string | null> {
    try {
        return (await deps.validateHSBI(username, password)) ? null : HSBI_REJECTED;
    } catch {
        return HSBI_UNREACHABLE;
    }
}

export function createSetupRouter(deps: SetupRouterDeps): Router {
    const router = Router();
    // 5 wrong codes per minute per IP; a correct code clears the bucket.
    const codeLimiter = createRateLimit(
        [{ windowMs: 60_000, max: 5, key: (ip) => `setup-code:${ip}` }],
        'Zu viele Versuche. Bitte eine Minute warten.',
    );

    router.get('/status', (_req, res) => {
        res.json({ complete: getSetupState()?.complete === true });
    });

    // Everything below exists only while the instance is not set up. Afterwards requests leave
    // the router: API calls end in the JSON 404, GET /setup reaches the SPA (which sends to /login).
    router.use((_req, _res, next) => {
        next(getSetupState()?.complete ? 'router' : undefined);
    });

    router.post('/verify-code', codeLimiter.middleware, (req, res) => {
        const code = typeof req.body?.code === 'string' ? req.body.code : '';
        const expected = getSetupCode();
        if (!expected || !codesMatch(code, expected)) {
            res.status(401).json({ error: 'Der Setup-Code ist falsch.' });
            return;
        }
        codeLimiter.clear(`setup-code:${clientIp(req)}`);
        res.json({ token: issueSetupToken() });
    });

    const requireSetupToken = (req: Request, res: Response, next: NextFunction) => {
        const token = req.headers.authorization?.split(' ')[1] ?? '';
        if (!verifySetupToken(token)) {
            res.status(401).json({ error: 'Setup-Sitzung abgelaufen. Bitte den Code erneut eingeben.' });
            return;
        }
        next();
    };

    router.get('/checks', requireSetupToken, async (req, res) => {
        const checks = await deps.runChecks(req);
        res.json({ checks, suggestedPublicUrl: `${req.protocol}://${req.get('host')}` });
    });

    router.post('/hsbi-check', requireSetupToken, loginRateLimit, async (req, res) => {
        const parsed = hsbiSchema.safeParse(req.body);
        if (!parsed.success) {
            res.status(400).json({ error: 'HSBI-Kennung (ohne @hsbi.de) und Passwort angeben.' });
            return;
        }
        const username = parsed.data.username.toLowerCase();
        const failure = await checkHsbi(deps, username, parsed.data.password);
        res.json(failure ? { ok: false, reason: failure } : { ok: true, email: `${username}@hsbi.de` });
    });

    router.post('/complete', requireSetupToken, async (req, res) => {
        const parsed = completeSetupSchema.safeParse(req.body);
        if (!parsed.success) {
            res.status(400).json({ error: 'Eingaben ungültig.', issues: parsed.error.issues.map((i) => i.message) });
            return;
        }
        const { localAdmin, hsbiAdmin } = parsed.data;
        const publicUrl = normalizePublicUrl(parsed.data.publicUrl)!;

        const checks = await deps.runChecks(req);
        if (checks.some((c) => c.status === 'fail')) {
            res.status(409).json({ error: 'Der Systemcheck meldet Fehler.', checks });
            return;
        }

        let hsbiEmail: string | null = null;
        if (hsbiAdmin) {
            const username = hsbiAdmin.username.toLowerCase();
            const failure = await checkHsbi(deps, username, hsbiAdmin.password);
            if (failure) {
                res.status(422).json({ error: failure });
                return;
            }
            hsbiEmail = `${username}@hsbi.de`;
        }

        await deps.completeSetup({
            publicUrl,
            localAdmin: { username: localAdmin.username, passwordHash: await deps.hashPassword(localAdmin.password) },
            hsbiEmail,
        });
        setSetupState({ complete: true, publicUrl });
        console.log(`[Setup] Abgeschlossen: ${publicUrl}, Notfall-Admin "${localAdmin.username}"${hsbiEmail ? `, HSBI-Admin ${hsbiEmail}` : ''}`);
        res.json({ ok: true });
    });

    return router;
}
