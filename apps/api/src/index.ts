import express from 'express';
import cors from 'cors';
import { projectsRouter } from './routes/projects.js';
import { designsRouter } from './routes/designs.js';
import { flowsRouter } from './routes/flows.js';
import { runsRouter } from './routes/runs.js';
import { artifactsRouter } from './routes/artifacts.js';
import { prisma } from './db.js';

const app = express();
const PORT = parseInt(process.env.PORT || '4000', 10);

app.use(cors());
app.use(express.json({ limit: '50mb' }));

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.use('/api/projects', projectsRouter);
app.use('/api/projects/:projectId/designs', designsRouter);
app.use('/api/projects/:projectId/flows', flowsRouter);
app.use('/api/projects/:projectId/runs', runsRouter);
app.use('/api', artifactsRouter);

app.use(((err, _req, res, _next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
}) as express.ErrorRequestHandler);

app.listen(PORT, () => {
  console.log(`[API] Chip3D API server running on http://localhost:${PORT}`);
});

process.on('SIGTERM', async () => {
  await prisma.$disconnect();
  process.exit(0);
});
