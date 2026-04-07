import { Router } from 'express';
import { prisma } from '../db.js';

export const projectsRouter = Router();

projectsRouter.get('/', async (_req, res) => {
  const projects = await prisma.project.findMany({
    orderBy: { updatedAt: 'desc' },
  });
  res.json(projects);
});

projectsRouter.get('/:id', async (req, res) => {
  const project = await prisma.project.findUnique({
    where: { id: req.params.id },
    include: { designs: true, flows: true },
  });
  if (!project) return res.status(404).json({ error: 'Project not found' });
  res.json(project);
});

projectsRouter.post('/', async (req, res) => {
  const { name, description } = req.body;
  const project = await prisma.project.create({
    data: { name, description },
  });
  res.status(201).json(project);
});

projectsRouter.put('/:id', async (req, res) => {
  const { name, description } = req.body;
  const project = await prisma.project.update({
    where: { id: req.params.id },
    data: { name, description },
  });
  res.json(project);
});

projectsRouter.delete('/:id', async (req, res) => {
  await prisma.project.delete({ where: { id: req.params.id } });
  res.status(204).end();
});
