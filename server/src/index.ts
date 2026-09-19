import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { authRouter } from './routes/auth';
import { uploadRouter } from './routes/upload';
import { artworksRouter } from './routes/artworks';
import { instancesRouter } from './routes/instances';
import { assetsRouter } from './routes/assets';
import { foldersRouter } from './routes/folders';
import { projectsRouter } from './routes/projects';
import { versionsRouter } from './routes/versions';
import { wallsRouter } from './routes/walls';
import { exhibitionsRouter } from './routes/exhibitions';
import { publicRouter } from './routes/public';
import { adminRouter } from './routes/admin';
import { resumeVideoJobs } from './lib/videoJobs';
import { capVideoRanges, isVideoPath } from './lib/videoRanges';

const app = express();
const PORT = process.env.PORT || 3000;

// --- CORS (SEC-07) ---
// If CORS_ORIGINS is set (comma-separated list), restrict to those origins.
// Otherwise keep the previous behaviour (reflects any origin via cors()).
const corsOrigins = (process.env.CORS_ORIGINS || '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
app.use(corsOrigins.length > 0 ? cors({ origin: corsOrigins }) : cors());

// --- Body size limits (SEC-07) ---
// Global limit is 2mb. Routes under /exhibitions/:id/versions (mounted with and
// without the /api prefix by versionsRouter, see routes/versions.ts) carry full
// scene snapshots and get a larger 10mb limit. Chosen by path so route order
// below is unaffected.
const VERSIONS_ROUTE_RE = /^\/(api\/)?exhibitions\/\d+\/versions(\/|$)/;

const jsonSmall = express.json({ limit: '2mb' });
const jsonLarge = express.json({ limit: '10mb' });
const urlencodedSmall = express.urlencoded({ limit: '2mb', extended: true });
const urlencodedLarge = express.urlencoded({ limit: '10mb', extended: true });

app.use((req, res, next) => {
    (VERSIONS_ROUTE_RE.test(req.path) ? jsonLarge : jsonSmall)(req, res, next);
});
app.use((req, res, next) => {
    (VERSIONS_ROUTE_RE.test(req.path) ? urlencodedLarge : urlencodedSmall)(req, res, next);
});

// Serve uploaded files statically.
// LOAD-06: cacheable but not immutable — pre-SEC-04 filenames were not
// guaranteed unique, so a filename could in principle be reused.
// Videos: short range responses and `private` (see lib/videoRanges.ts).
const uploadsCacheHeaders = (res: express.Response, filePath: string) => {
    res.setHeader('Cache-Control', isVideoPath(filePath) ? 'private, max-age=604800' : 'public, max-age=604800');
};
const uploadsDirPath = path.join(__dirname, '../uploads');
app.use('/uploads', capVideoRanges, express.static(uploadsDirPath, { setHeaders: uploadsCacheHeaders }));
app.use('/api/uploads', capVideoRanges, express.static(uploadsDirPath, { setHeaders: uploadsCacheHeaders }));

// --- API Routes (Direct) ---
app.use('/auth', authRouter);
app.use('/upload', uploadRouter);
app.use('/assets', assetsRouter);
app.use('/folders', foldersRouter);
app.use('/artworks', artworksRouter);
app.use('/instances', instancesRouter);
app.use('/projects', projectsRouter);
app.use('/walls', wallsRouter);
app.use('/exhibitions', exhibitionsRouter);
app.use('/admin', adminRouter);
app.use('/public', publicRouter);
app.use('/', versionsRouter);

// --- API Routes (With /api prefix) ---
app.use('/api/auth', authRouter);
app.use('/api/upload', uploadRouter);
app.use('/api/assets', assetsRouter);
app.use('/api/folders', foldersRouter);
app.use('/api/artworks', artworksRouter);
app.use('/api/instances', instancesRouter);
app.use('/api/projects', projectsRouter);
app.use('/api/walls', wallsRouter);
app.use('/api/exhibitions', exhibitionsRouter);
app.use('/api/admin', adminRouter);
app.use('/api/public', publicRouter);
app.use('/api', versionsRouter);

// --- Production Frontend Serving & SPA Fallback ---
if (process.env.NODE_ENV === 'production') {
    const possiblePaths = [
        path.resolve(__dirname, '../../dist'),
        path.resolve(__dirname, '../../../dist'),
        path.join(process.cwd(), '../dist'),
        path.join(process.cwd(), 'dist')
    ];
    const frontendPath = possiblePaths.find(p => fs.existsSync(path.join(p, 'index.html'))) || possiblePaths[0];

    console.log(`Serving frontend from: ${frontendPath}`);

    // Serve static files from the dist folder.
    // LOAD-06 cache headers:
    //  - index.html: no-cache (always revalidate so deploys are picked up)
    //  - hashed build output under /assets/: immutable, 1 year
    //  - everything else (models, videos, icons, …): 1 day + SWR week
    app.use(express.static(frontendPath, {
        setHeaders: (res, filePath) => {
            const rel = path.relative(frontendPath, filePath);
            if (rel === 'index.html') {
                res.setHeader('Cache-Control', 'no-cache');
            } else if (rel.split(path.sep)[0] === 'assets') {
                res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
            } else {
                res.setHeader('Cache-Control', 'public, max-age=86400, stale-while-revalidate=604800');
            }
        },
    }));

    // SPA Fallback Middleware (FUNC-02, instead of app.get('*'), more robust for Express 5).
    //
    // Everything reaching this point fell through every router and the static
    // handler above unhandled.
    //
    // FUNC-02 follow-up: the previous version gated on `req.accepts(['json','html'])
    // === 'html'`, which relies on the client sending an Accept header that prefers
    // html. Verified on the test server that this breaks real frontend pages for
    // clients sending `Accept: */*` — curl, most link-preview bots (Slack/WhatsApp/
    // Teams unfurling e.g. /exhibition/yol) and some crawlers — they got a JSON 404
    // instead of the page. Accept header is no longer used to decide html vs json;
    // instead we match the request path itself:
    //
    //  1. If the path's first segment is a known API namespace, this is always an
    //     unmatched API call -> fall through to the JSON 404 below.
    //  2. Else if the path starts with /exhibition or /exhibitions (which the
    //     exhibitionsRouter/versionsRouter ALSO mount API routes under, e.g.
    //     /exhibitions/:id/versions, /exhibitions/:id/poster), only serve html when
    //     the path matches one of the known frontend route patterns from
    //     src/App.tsx. Any other /exhibition(s)/... subpath is an unmatched API call
    //     that already fell through its router -> JSON 404.
    //  3. Else (any other path, including truly unknown ones) -> serve html so
    //     React Router's own catch-all ("*" -> 404 page) can render client-side.
    //
    // This makes every frontend URL return html regardless of Accept header, while
    // every unmatched API URL still returns the JSON 404.
    const API_NAMESPACE_SEGMENTS = new Set([
        'api', 'auth', 'upload', 'uploads', 'public', 'assets',
        'folders', 'artworks', 'instances', 'projects', 'walls', 'admin',
    ]);

    // Frontend route patterns, mirroring src/App.tsx <Route path="..."> entries
    // that live under /exhibition or /exhibitions (every other frontend route is
    // covered by the default "serve html" case below since it can't collide with
    // an API namespace segment).
    const EXHIBITION_FRONTEND_ROUTE_PATTERNS = [
        /^\/exhibitions$/,
        /^\/exhibition$/,
        /^\/exhibition\/[^/]+$/,           // /exhibition/:slug (public viewer)
        /^\/exhibition\/[^/]+\/assets$/,   // /exhibition/:projectSlug/assets
        /^\/exhibition\/[^/]+\/edit$/,     // /exhibition/:projectSlug/edit
    ];

    // Editor/admin-only frontend routes — excluded from search indexing.
    const NOINDEX_ROUTE_PATTERNS = [
        /^\/exhibition\/[^/]+\/edit$/,
        /^\/exhibition\/[^/]+\/assets$/,
        /^\/project$/,
        /^\/users$/,
    ];

    app.use((req, res, next) => {
        if ((req.method !== 'GET' && req.method !== 'HEAD') || req.path.includes('.')) {
            return next();
        }

        const firstSegment = req.path.split('/')[1] || '';
        if (API_NAMESPACE_SEGMENTS.has(firstSegment)) {
            return next();
        }

        if (firstSegment === 'exhibition' || firstSegment === 'exhibitions') {
            const matchesFrontendRoute = EXHIBITION_FRONTEND_ROUTE_PATTERNS.some((re) => re.test(req.path));
            if (!matchesFrontendRoute) {
                return next();
            }
        }

        res.setHeader('Cache-Control', 'no-cache');
        if (NOINDEX_ROUTE_PATTERNS.some((re) => re.test(req.path))) {
            res.setHeader('X-Robots-Tag', 'noindex');
        }
        return res.sendFile(path.join(frontendPath, 'index.html'));
    });
}

// --- Default Route ---
app.get('/', (req, res) => {
    res.send('CuraHub API Phase 5');
});

// JSON 404 for anything that reached this point unhandled (API paths without a
// matching route, and any non-GET or non-html-preferring request).
app.use((req, res) => {
    res.status(404).json({ error: 'Endpoint not found' });
});

if (process.env.NODE_ENV !== 'test') {
    app.listen(PORT, () => {
        console.log(`Server running on http://localhost:${PORT}`);
        // VID-03: continue video jobs interrupted by a restart.
        resumeVideoJobs().catch((err) => console.error('[VideoJobs] Resume failed:', err));
    });
}

export { app };
