import { PrismaClient } from '@prisma/client';
import type { StepSpec, StepContext } from '@chip3d/sdk';
import { PluginRegistry } from '@chip3d/eda-plugins';
import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';

const execAsync = promisify(exec);
const prisma = new PrismaClient();
const ARTIFACTS_DIR = process.env.ARTIFACTS_DIR || path.join(process.cwd(), '..', '..', 'data', 'artifacts');

export async function runPluginStep(
  stepRunId: string,
  stepSpec: StepSpec,
  projectId: string,
  runId: string,
): Promise<void> {
  const outputDir = path.join(ARTIFACTS_DIR, projectId, runId, stepSpec.id);
  fs.mkdirSync(outputDir, { recursive: true });

  const registry = PluginRegistry.getInstance();
  const plugin = registry.get(stepSpec.tool || stepSpec.type);

  if (!plugin) {
    throw new Error(`Plugin not found: ${stepSpec.tool || stepSpec.type}`);
  }

  const ctx: StepContext = {
    stepId: stepSpec.id,
    stepType: stepSpec.type,
    params: stepSpec.params,
    inputs: [],
    outputDir,
    resources: stepSpec.resources,
    projectId,
    runId,
  };

  const plan = await plugin.run(ctx);

  await addLog(stepRunId, 'info', `Executing: ${plan.command} ${plan.args.join(' ')}`);

  try {
    const cmd = `${plan.command} ${plan.args.join(' ')}`;
    const { stdout, stderr } = await execAsync(cmd, {
      cwd: plan.workDir || outputDir,
      env: { ...process.env, ...plan.env },
      timeout: stepSpec.resources.timeoutMs || 300000,
    });

    if (stdout) await addLog(stepRunId, 'info', stdout.slice(0, 10000));
    if (stderr) await addLog(stepRunId, 'warn', stderr.slice(0, 5000));
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    await addLog(stepRunId, 'error', `Command failed: ${message}`);
    throw err;
  }

  const outputFiles = fs.existsSync(outputDir) ? fs.readdirSync(outputDir) : [];
  for (const file of outputFiles) {
    const filePath = path.join(outputDir, file);
    const stat = fs.statSync(filePath);
    if (!stat.isFile()) continue;

    const relativePath = path.relative(
      process.env.ARTIFACTS_DIR || path.join(process.cwd(), '..', '..', 'data', 'artifacts'),
      filePath,
    );

    await prisma.artifact.create({
      data: {
        stepRunId,
        name: file,
        type: inferArtifactType(file),
        path: relativePath,
        size: stat.size,
      },
    });
  }
}

async function addLog(stepRunId: string, level: string, message: string) {
  await prisma.logEvent.create({
    data: { stepRunId, level, message },
  });
}

function inferArtifactType(filename: string): string {
  if (filename.endsWith('.def')) return 'def';
  if (filename.endsWith('.spef')) return 'spef';
  if (filename.endsWith('.v') || filename.endsWith('.sv')) return 'netlist';
  if (filename.includes('report')) return 'report';
  return 'generic';
}
