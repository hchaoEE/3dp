import { Router } from 'express';
import { prisma } from '../db.js';
import path from 'path';
import fs from 'fs';

export const artifactsRouter = Router();

const ARTIFACTS_DIR = process.env.ARTIFACTS_DIR || path.join(process.cwd(), '..', '..', 'data', 'artifacts');

artifactsRouter.get('/step-runs/:stepRunId/artifacts', async (req, res) => {
  const artifacts = await prisma.artifact.findMany({
    where: { stepRunId: req.params.stepRunId },
  });
  res.json(artifacts);
});

artifactsRouter.get('/artifacts/:id', async (req, res) => {
  const artifact = await prisma.artifact.findUnique({
    where: { id: req.params.id },
  });
  if (!artifact) return res.status(404).json({ error: 'Artifact not found' });
  res.json(artifact);
});

artifactsRouter.get('/artifacts/:id/download', async (req, res) => {
  const artifact = await prisma.artifact.findUnique({
    where: { id: req.params.id },
  });
  if (!artifact) return res.status(404).json({ error: 'Artifact not found' });

  const fullPath = path.resolve(ARTIFACTS_DIR, artifact.path);
  if (!fs.existsSync(fullPath)) {
    return res.status(404).json({ error: 'Artifact file not found on disk' });
  }
  res.download(fullPath, artifact.name);
});

artifactsRouter.get('/artifacts/:id/content', async (req, res) => {
  const artifact = await prisma.artifact.findUnique({
    where: { id: req.params.id },
  });
  if (!artifact) return res.status(404).json({ error: 'Artifact not found' });

  const fullPath = path.resolve(ARTIFACTS_DIR, artifact.path);
  if (!fs.existsSync(fullPath)) {
    return res.status(404).json({ error: 'Artifact file not found on disk' });
  }

  const content = fs.readFileSync(fullPath, 'utf-8');
  const isJson = artifact.name.endsWith('.json');
  if (isJson) {
    try {
      res.json(JSON.parse(content));
    } catch {
      res.type('text/plain').send(content);
    }
  } else {
    res.type('text/plain').send(content);
  }
});
