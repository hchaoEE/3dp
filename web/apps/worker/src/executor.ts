import { PrismaClient } from '@prisma/client';
import type { FlowSpec, StepSpec } from '@chip3d/sdk';
import { runCoreStep } from './core-runner.js';
import { runPluginStep } from './plugin-runner.js';

const prisma = new PrismaClient();

export async function executeRun(
  runId: string,
  projectId: string,
  rerunFromStep?: string,
): Promise<void> {
  await prisma.run.update({
    where: { id: runId },
    data: { status: 'running', startedAt: new Date() },
  });

  const run = await prisma.run.findUnique({
    where: { id: runId },
    include: {
      flow: true,
      stepRuns: { orderBy: { createdAt: 'asc' } },
    },
  });

  if (!run) throw new Error(`Run ${runId} not found`);

  const spec = run.flow.spec as unknown as FlowSpec;
  const stepOrder = topologicalSort(spec.steps);
  let shouldRun = !rerunFromStep;

  try {
    for (const stepId of stepOrder) {
      const stepRun = run.stepRuns.find((sr) => sr.stepId === stepId);
      if (!stepRun) continue;

      if (rerunFromStep && stepRun.id === rerunFromStep) {
        shouldRun = true;
      }
      if (!shouldRun) continue;

      const stepSpec = spec.steps.find((s) => s.id === stepId);
      if (!stepSpec) continue;

      await prisma.stepRun.update({
        where: { id: stepRun.id },
        data: { status: 'running', startedAt: new Date() },
      });

      await addLog(stepRun.id, 'info', `Starting step: ${stepSpec.type} (${stepSpec.impl})`);

      try {
        if (stepSpec.impl === 'core') {
          await runCoreStep(stepRun.id, stepSpec, projectId, runId);
        } else {
          await runPluginStep(stepRun.id, stepSpec, projectId, runId);
        }

        await prisma.stepRun.update({
          where: { id: stepRun.id },
          data: { status: 'completed', endedAt: new Date() },
        });
        await addLog(stepRun.id, 'info', `Step completed: ${stepSpec.type}`);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        await prisma.stepRun.update({
          where: { id: stepRun.id },
          data: { status: 'failed', endedAt: new Date(), error: message },
        });
        await addLog(stepRun.id, 'error', `Step failed: ${message}`);
        throw err;
      }
    }

    await prisma.run.update({
      where: { id: runId },
      data: { status: 'completed', endedAt: new Date() },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    await prisma.run.update({
      where: { id: runId },
      data: { status: 'failed', endedAt: new Date() },
    });
    console.error(`[Executor] Run ${runId} failed: ${message}`);
  }
}

async function addLog(stepRunId: string, level: string, message: string, data?: unknown) {
  await prisma.logEvent.create({
    data: { stepRunId, level, message, data: data as any },
  });
}

function topologicalSort(steps: StepSpec[]): string[] {
  const visited = new Set<string>();
  const result: string[] = [];
  const stepMap = new Map(steps.map((s) => [s.id, s]));

  function visit(id: string) {
    if (visited.has(id)) return;
    visited.add(id);
    const step = stepMap.get(id);
    if (step) {
      for (const dep of step.dependsOn) {
        visit(dep);
      }
    }
    result.push(id);
  }

  for (const step of steps) {
    visit(step.id);
  }

  return result;
}
