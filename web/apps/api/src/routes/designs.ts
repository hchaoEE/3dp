import { Router } from 'express';
import { prisma } from '../db.js';

export const designsRouter = Router({ mergeParams: true });

designsRouter.get('/', async (req, res) => {
  const designs = await prisma.design.findMany({
    where: { projectId: req.params.projectId },
    orderBy: { updatedAt: 'desc' },
  });
  res.json(designs);
});

designsRouter.get('/:id', async (req, res) => {
  const design = await prisma.design.findUnique({
    where: { id: req.params.id },
  });
  if (!design) return res.status(404).json({ error: 'Design not found' });
  res.json(design);
});

designsRouter.post('/', async (req, res) => {
  const { name, data } = req.body;
  const design = await prisma.design.create({
    data: { projectId: req.params.projectId, name, data: data || {} },
  });
  res.status(201).json(design);
});

designsRouter.put('/:id', async (req, res) => {
  const existing = await prisma.design.findUnique({ where: { id: req.params.id } });
  if (!existing) return res.status(404).json({ error: 'Design not found' });

  const design = await prisma.design.update({
    where: { id: req.params.id },
    data: {
      name: req.body.name ?? existing.name,
      data: req.body.data ?? existing.data,
      version: existing.version + 1,
    },
  });
  res.json(design);
});

designsRouter.delete('/:id', async (req, res) => {
  await prisma.design.delete({ where: { id: req.params.id } });
  res.status(204).end();
});
