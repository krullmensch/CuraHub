import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'path';
import { authRouter } from './routes/auth';
import { uploadRouter } from './routes/upload';
import { artworksRouter } from './routes/artworks';
import { instancesRouter } from './routes/instances';
import { assetsRouter } from './routes/assets';
import { projectsRouter } from './routes/projects';
import { versionsRouter } from './routes/versions';
import { wallsRouter } from './routes/walls';
import { restrictionsRouter } from './routes/restrictions';
import { exhibitionsRouter } from './routes/exhibitions';
import { publicRouter } from './routes/public';
import { adminRouter } from './routes/admin';

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Serve uploaded files statically
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

app.use('/auth', authRouter);
app.use('/upload', uploadRouter);
app.use('/assets', assetsRouter);
app.use('/artworks', artworksRouter);
app.use('/instances', instancesRouter);
app.use('/projects', projectsRouter);
app.use('/', versionsRouter); // Mounted at root since routes are /exhibitions/:id/versions
app.use('/walls', wallsRouter);
app.use('/restrictions', restrictionsRouter);
app.use('/exhibitions', exhibitionsRouter);
app.use('/admin', adminRouter);
app.use('/public', publicRouter);

app.get('/', (req, res) => {
  res.send('CuraHub API Phase 5');
});

if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

export { app };
