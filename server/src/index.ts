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

// Mount all routes to the apiRouter
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
apiRouter.use('/', versionsRouter); // Mounted at root of apiRouter

// Mount the apiRouter at both /api and / for compatibility
app.use('/api', apiRouter);
app.use('/', apiRouter);

// Serve frontend static files in production
if (process.env.NODE_ENV === 'production') {
  const possiblePaths = [
    path.resolve(__dirname, '../../dist'),      // Relative to dist/src/
    path.resolve(__dirname, '../../../dist'),     // Relative to dist/ (if nested deeper)
    path.join(process.cwd(), '../dist'),         // Relative to server/ folder
    path.join(process.cwd(), 'dist')             // If run from root
  ];
  
  const frontendPath = possiblePaths.find(p => fs.existsSync(path.join(p, 'index.html'))) || possiblePaths[0];
  console.log(`Serving frontend from: ${frontendPath}`);
  
  app.use(express.static(frontendPath));
  
  // SPA Fallback: for any GET request that isn't an API call or a static file, serve index.html
  const apiBasePaths = ['api', 'uploads', 'auth', 'upload', 'assets', 'artworks', 'instances', 'projects', 'walls', 'exhibitions', 'admin', 'public'];
  
  app.get('*', (req, res, next) => {
    // Check if the request starts with any of our API paths
    const firstSegment = req.path.split('/')[1];
    if (apiBasePaths.includes(firstSegment)) {
      return next(); // Pass to 404 handler below
    }
    // Otherwise, it's a frontend route, serve index.html
    res.sendFile(path.join(frontendPath, 'index.html'));
  });
}

// 404 Handler for API routes (returns JSON)
app.use((req, res) => {
  if (req.accepts('json') || req.path.startsWith('/api')) {
    res.status(404).json({ error: 'Endpoint not found' });
  } else {
    res.status(404).send('Not found');
  }
});

if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

export { app };
