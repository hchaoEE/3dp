import { Router } from 'express';
import { prisma } from '../db.js';

export const flowsRouter = Router({ mergeParams: true });

flowsRouter.get('/', async (req, res) => {
  const flows = await prisma.flow.findMany({
    where: { projectId: req.params.projectId },
    orderBy: { updatedAt: 'desc' },
  });
  res.json(flows);
});

flowsRouter.get('/:id', async (req, res) => {
  const flow = await prisma.flow.findUnique({
    where: { id: req.params.id },
  });
  if (!flow) return res.status(404).json({ error: 'Flow not found' });
  res.json(flow);
});

flowsRouter.post('/', async (req, res) => {
  const { name, description, spec } = req.body;
  const flow = await prisma.flow.create({
    data: {
      projectId: req.params.projectId,
      name,
      description,
      spec: spec || { steps: [] },
    },
  });
  res.status(201).json(flow);
});

flowsRouter.put('/:id', async (req, res) => {
  const { name, description, spec } = req.body;
  const flow = await prisma.flow.update({
    where: { id: req.params.id },
    data: { name, description, spec },
  });
  res.json(flow);
});

flowsRouter.delete('/:id', async (req, res) => {
  await prisma.flow.delete({ where: { id: req.params.id } });
  res.status(204).end();
});
