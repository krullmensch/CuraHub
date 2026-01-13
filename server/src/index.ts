import express from 'express';
import cors from 'cors';
import path from 'path';
import { authRouter } from './routes/auth';
import { uploadRouter } from './routes/upload';
import { artworksRouter } from './routes/artworks';
import { instancesRouter } from './routes/instances';
import { assetsRouter } from './routes/assets';

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

app.get('/', (req, res) => {
  res.send('CuraHub API Phase 2');
});

if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

export { app };
