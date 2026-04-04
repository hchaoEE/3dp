import { PrismaClient } from '@prisma/client';
import type { StepSpec } from '@chip3d/sdk';
import { runFp } from '@chip3d/fp-engine';
import { runThermal } from '@chip3d/thermal-engine';
import fs from 'fs';
import path from 'path';

const prisma = new PrismaClient();
const ARTIFACTS_DIR = process.env.ARTIFACTS_DIR || path.join(process.cwd(), '..', '..', 'data', 'artifacts');

export async function runCoreStep(
  stepRunId: string,
  stepSpec: StepSpec,
  projectId: string,
  runId: string,
): Promise<void> {
  const outputDir = path.join(ARTIFACTS_DIR, projectId, runId, stepSpec.id);
  fs.mkdirSync(outputDir, { recursive: true });

  const stepRun = await prisma.stepRun.findUnique({ where: { id: stepRunId } });
  const params = (stepRun?.params ?? stepSpec.params) as Record<string, unknown>;

  if (stepSpec.type === 'fp') {
    const result = await runFp(params as any);

    await writeArtifact(stepRunId, outputDir, 'partition.json', 'partition', result.partition);
    await writeArtifact(stepRunId, outputDir, 'floorplan.json', 'floorplan', result.floorplan);
    await writeArtifact(stepRunId, outputDir, 'tsv_plan.json', 'tsv_plan', result.tsvPlan);
    await writeArtifact(stepRunId, outputDir, 'hb_plan.json', 'hb_plan', result.hbPlan);
    await writeArtifact(stepRunId, outputDir, 'fp_report.md', 'fp_report', result.report);
  } else if (stepSpec.type === 'thermal') {
    const result = await runThermal(params as any);

    await writeArtifact(stepRunId, outputDir, 'thermal_result.json', 'thermal_field', result);
    await writeArtifact(stepRunId, outputDir, 'thermal_report.md', 'thermal_report', generateThermalReport(result));
  } else {
    throw new Error(`Unknown core step type: ${stepSpec.type}`);
  }
}

async function writeArtifact(
  stepRunId: string,
  outputDir: string,
  fileName: string,
  type: string,
  data: unknown,
): Promise<void> {
  const filePath = path.join(outputDir, fileName);
  const content = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
  fs.writeFileSync(filePath, content, 'utf-8');

  const relativePath = path.relative(
    process.env.ARTIFACTS_DIR || path.join(process.cwd(), '..', '..', 'data', 'artifacts'),
    filePath,
  );

  await prisma.artifact.create({
    data: {
      stepRunId,
      name: fileName,
      type,
      path: relativePath,
      size: Buffer.byteLength(content),
    },
  });
}

function generateThermalReport(result: any): string {
  const lines = [
    '# Thermal Simulation Report',
    '',
    `## Global Statistics`,
    `- Max Temperature: ${result.stats?.globalMax?.toFixed(2) ?? 'N/A'} °C`,
    `- Min Temperature: ${result.stats?.globalMin?.toFixed(2) ?? 'N/A'} °C`,
    `- Avg Temperature: ${result.stats?.globalAvg?.toFixed(2) ?? 'N/A'} °C`,
    '',
    '## Hotspots',
    '',
  ];

  if (result.hotspots) {
    for (const hs of result.hotspots) {
      lines.push(
        `- Die: ${hs.dieId}, Position: (${hs.x.toFixed(1)}, ${hs.y.toFixed(1)}), Temp: ${hs.temperature.toFixed(2)} °C${hs.moduleId ? `, Module: ${hs.moduleId}` : ''}`,
      );
    }
  }

  return lines.join('\n');
}
