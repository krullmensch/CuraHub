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

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Serve uploaded files statically
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));
app.use('/api/uploads', express.static(path.join(__dirname, '../uploads')));

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
    
    // Serve static files from the dist folder
    app.use(express.static(frontendPath));

    // SPA Fallback Middleware (instead of app.get('*'))
    // This is more robust for Express 5
    app.use((req, res, next) => {
        // Only handle GET requests that don't have a file extension
        if (req.method === 'GET' && !req.path.includes('.')) {
            const skip = ['/api', '/uploads', '/auth', '/upload', '/assets', '/folders', '/artworks', '/instances', '/projects', '/walls', '/exhibitions', '/admin', '/public'];
            if (!skip.some(p => req.path.startsWith(p))) {
                return res.sendFile(path.join(frontendPath, 'index.html'));
            }
        }
        next();
    });
}

// --- Default Route ---
app.get('/', (req, res) => {
    res.send('CuraHub API Phase 5');
});

// JSON 404 for API paths
app.use(['/api', '/auth', '/upload', '/assets', '/folders', '/public', '/admin'], (req, res) => {
    res.status(404).json({ error: 'Endpoint not found' });
});

if (process.env.NODE_ENV !== 'test') {
    app.listen(PORT, () => {
        console.log(`Server running on http://localhost:${PORT}`);
    });
}

export { app };
