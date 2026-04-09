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

// --- API Routing ---
const apiRouter = express.Router();

apiRouter.use('/auth', authRouter);
apiRouter.use('/upload', uploadRouter);
apiRouter.use('/assets', assetsRouter);
apiRouter.use('/artworks', artworksRouter);
apiRouter.use('/instances', instancesRouter);
apiRouter.use('/projects', projectsRouter);
apiRouter.use('/walls', wallsRouter);
apiRouter.use('/exhibitions', exhibitionsRouter);
apiRouter.use('/admin', adminRouter);
apiRouter.use('/public', publicRouter);
apiRouter.use('/', versionsRouter);

// Mount API under /api (Main entry point for Frontend)
app.use('/api', apiRouter);

// Legacy support: also mount directly at root for paths that don't use /api
// but only for specific known routes to avoid catching frontend routes
app.use('/auth', authRouter);
app.use('/upload', uploadRouter);
app.use('/public', publicRouter);

// Serve frontend static files in production
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
  
  // SPA Fallback: ALL GET requests that haven't been handled by API/Static files
  // should serve index.html, EXCEPT those starting with /api or /uploads
  app.get(/^(?!\/(api|uploads)).*$/, (req, res) => {
    res.sendFile(path.join(frontendPath, 'index.html'));
  });
}

// 404 Handler for API
app.use('/api', (req, res) => {
  res.status(404).json({ error: 'API endpoint not found' });
});

if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

export { app };
