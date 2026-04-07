import { Router } from 'express';
import { prisma } from '../db.js';
import { runQueue } from '../queue.js';
import type { FlowSpec, StepSpec } from '@chip3d/sdk';

export const runsRouter = Router({ mergeParams: true });

runsRouter.get('/', async (req, res) => {
  const runs = await prisma.run.findMany({
    where: { projectId: req.params.projectId },
    orderBy: { createdAt: 'desc' },
    include: { stepRuns: { select: { id: true, stepId: true, status: true, stepType: true } } },
  });
  res.json(runs);
});

runsRouter.get('/:id', async (req, res) => {
  const run = await prisma.run.findUnique({
    where: { id: req.params.id },
    include: {
      stepRuns: {
        include: {
          artifacts: true,
          logs: { orderBy: { timestamp: 'desc' }, take: 100 },
        },
      },
    },
  });
  if (!run) return res.status(404).json({ error: 'Run not found' });
  res.json(run);
});

runsRouter.post('/', async (req, res) => {
  const { flowId, params } = req.body;

  const flow = await prisma.flow.findUnique({ where: { id: flowId } });
  if (!flow) return res.status(404).json({ error: 'Flow not found' });

  const spec = flow.spec as unknown as FlowSpec;
  const steps = spec.steps || [];

  const run = await prisma.run.create({
    data: {
      projectId: req.params.projectId,
      flowId,
      params,
      stepRuns: {
        create: steps.map((step: StepSpec) => ({
          stepId: step.id,
          stepType: step.type,
          impl: step.impl,
          tool: step.tool,
          params: step.params,
          inputs: step.inputs,
          status: 'pending',
        })),
      },
    },
    include: { stepRuns: true },
  });

  await runQueue.add('execute-run', { runId: run.id, projectId: req.params.projectId });

  res.status(201).json(run);
});

runsRouter.post('/:id/cancel', async (req, res) => {
  const run = await prisma.run.update({
    where: { id: req.params.id },
    data: { status: 'cancelled', endedAt: new Date() },
  });
  res.json(run);
});

/** FP edit writeback: update step params and re-queue */
runsRouter.post('/:runId/steps/:stepRunId/writeback', async (req, res) => {
  const { stepRunId } = req.params;
  const { params } = req.body;

  const stepRun = await prisma.stepRun.findUnique({ where: { id: stepRunId } });
  if (!stepRun) return res.status(404).json({ error: 'StepRun not found' });

  const updated = await prisma.stepRun.update({
    where: { id: stepRunId },
    data: {
      params,
      status: 'pending',
      startedAt: null,
      endedAt: null,
      error: null,
    },
  });

  const run = await prisma.run.update({
    where: { id: req.params.runId },
    data: { status: 'pending' },
  });

  await runQueue.add('execute-run', {
    runId: run.id,
    projectId: run.projectId,
    rerunFromStep: stepRunId,
  });

  res.json(updated);
});
