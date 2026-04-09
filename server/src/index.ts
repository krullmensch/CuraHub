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
import { projectsRouter } from './routes/projects';
import { versionsRouter } from './routes/versions';
import { wallsRouter } from './routes/walls';
import { exhibitionsRouter } from './routes/exhibitions';
import { publicRouter } from './routes/public';
import { adminRouter } from './routes/admin';

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Serve uploaded files statically
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));
app.use('/api/uploads', express.static(path.join(__dirname, '../uploads')));

// --- Helper for dual mounting ---
const mount = (p: string, router: any) => {
    app.use(p, router);
    app.use(`/api${p}`, router);
};

// --- API Routes ---
mount('/auth', authRouter);
mount('/upload', uploadRouter);
mount('/assets', assetsRouter);
mount('/artworks', artworksRouter);
mount('/instances', instancesRouter);
mount('/projects', projectsRouter);
mount('/walls', wallsRouter);
mount('/exhibitions', exhibitionsRouter);
mount('/admin', adminRouter);
mount('/public', publicRouter);

// Versions router handles /exhibitions/:id/versions
app.use('/', versionsRouter);
app.use('/api', versionsRouter);

// --- Production Frontend Serving ---
if (process.env.NODE_ENV === 'production') {
    const possiblePaths = [
        path.resolve(__dirname, '../../dist'),
        path.resolve(__dirname, '../../../dist'),
        path.join(process.cwd(), '../dist'),
        path.join(process.cwd(), 'dist')
    ];
    const frontendPath = possiblePaths.find(p => fs.existsSync(path.join(p, 'index.html'))) || possiblePaths[0];
    
    console.log(`Serving frontend from: ${frontendPath}`);
    app.use(express.static(frontendPath));

    // Catch-all for SPA: serve index.html for any request that isn't an API or Upload
    app.get('*', (req, res, next) => {
        const skip = ['/api', '/uploads', '/auth', '/upload', '/assets', '/artworks', '/instances', '/projects', '/walls', '/exhibitions', '/admin', '/public'];
        if (skip.some(p => req.path.startsWith(p))) {
            return next();
        }
        res.sendFile(path.join(frontendPath, 'index.html'));
    });
}

// --- Default Route & 404 ---
app.get('/', (req, res) => {
    res.send('CuraHub API Phase 5');
});

// JSON 404 for API paths
app.use(['/api', '/auth', '/public', '/admin'], (req, res) => {
    res.status(404).json({ error: 'Endpoint not found' });
});

if (process.env.NODE_ENV !== 'test') {
    app.listen(PORT, () => {
        console.log(`Server running on http://localhost:${PORT}`);
    });
}

export { app };
