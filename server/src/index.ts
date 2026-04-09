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
app.use(express.json());

// Serve uploaded files statically
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));
app.use('/api/uploads', express.static(path.join(__dirname, '../uploads')));

// Helper to mount router at both root and /api
const mountRouter = (path: string, router: any) => {
  app.use(path, router);
  app.use(`/api${path}`, router);
};

// API Routes
mountRouter('/auth', authRouter);
mountRouter('/upload', uploadRouter);
mountRouter('/assets', assetsRouter);
mountRouter('/artworks', artworksRouter);
mountRouter('/instances', instancesRouter);
mountRouter('/projects', projectsRouter);
mountRouter('/walls', wallsRouter);
mountRouter('/exhibitions', exhibitionsRouter);
mountRouter('/admin', adminRouter);
mountRouter('/public', publicRouter);

// Special case for versionsRouter which is mounted at root/api root
app.use('/', versionsRouter);
app.use('/api', versionsRouter);

// Serve frontend static files in production
if (process.env.NODE_ENV === 'production') {
  // Try to find dist folder in different possible locations
  const possiblePaths = [
    path.resolve(__dirname, '../../dist'),      // Relative to src/
    path.resolve(__dirname, '../../../dist'),     // Relative to dist/src/
    path.join(process.cwd(), '../dist'),         // Relative to server/ folder
    path.join(process.cwd(), 'dist')             // If run from root
  ];
  
  const frontendPath = possiblePaths.find(p => fs.existsSync(path.join(p, 'index.html'))) || possiblePaths[0];
  
  console.log(`Serving frontend from: ${frontendPath}`);
  app.use(express.static(frontendPath));
  
  // Handle SPA routing: all other GET requests go to index.html
  // Exclude everything that starts with /api, /uploads, or any of our API base paths
  const apiPaths = ['api', 'uploads', 'auth', 'upload', 'assets', 'artworks', 'instances', 'projects', 'walls', 'exhibitions', 'admin', 'public'];
  const spaRegex = new RegExp(`^\\/(?!(${apiPaths.join('|')})).*$`);
  
  app.get(spaRegex, (req, res) => {
    res.sendFile(path.join(frontendPath, 'index.html'));
  });
}

app.get('/', (req, res) => {
  // This will only be reached if not in production or if the regex above didn't match (unlikely for /)
  res.send('CuraHub API Phase 5');
});

if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

export { app };
