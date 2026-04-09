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

// API Routes
app.use('/api/auth', authRouter);
app.use('/api/upload', uploadRouter);
app.use('/api/assets', assetsRouter);
app.use('/api/artworks', artworksRouter);
app.use('/api/instances', instancesRouter);
app.use('/api/projects', projectsRouter);
app.use('/api/walls', wallsRouter);
app.use('/api/exhibitions', exhibitionsRouter);
app.use('/api/admin', adminRouter);
app.use('/api/public', publicRouter);
app.use('/api', versionsRouter); // Mounted at /api since routes are /exhibitions/:id/versions

// Legacy compatibility or direct hits (optional, but good for safety)
app.use('/auth', authRouter);
app.use('/upload', uploadRouter);

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
  // Exclude everything that starts with /api or /uploads or other static assets
  app.get(/^(?!\/(api|uploads|auth|upload)).*$/, (req, res) => {
    res.sendFile(path.join(frontendPath, 'index.html'));
  });
}

app.get('/', (req, res) => {
  res.send('CuraHub API Phase 5');
});

if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

export { app };
