import type {
  FpParams,
  PartitionResult,
  FloorplanResult,
  TsvPlan,
  HbPlan,
} from '@chip3d/sdk';
import { partition } from './partition.js';
import { planTsv } from './tsv-planner.js';
import { planHb } from './hb-planner.js';
import { floorplanDie } from './die-floorplan.js';

export interface FpResult {
  partition: PartitionResult;
  floorplan: FloorplanResult;
  tsvPlan: TsvPlan;
  hbPlan: HbPlan;
  report: string;
}

export async function runFp(params: FpParams): Promise<FpResult> {
  const partResult = partition(params);

  const tsvPlan = planTsv(partResult, params.dies, params.tsvRules);
  const hbPlan = planHb(partResult, params.dies, params.hbRules);

  let assignments = partResult.assignments;
  if (params.initialPartition) {
    const override = new Map(params.initialPartition.map((a) => [a.moduleId, a.dieId]));
    assignments = assignments.map((a) => ({
      moduleId: a.moduleId,
      dieId: override.get(a.moduleId) ?? a.dieId,
    }));
  }

  const floorplan = floorplanDie(assignments, params.modules, params.dies);
  if (params.initialFloorplan) {
    for (const dieFloor of floorplan.dies) {
      const initDie = params.initialFloorplan.dies.find((d) => d.dieId === dieFloor.dieId);
      if (!initDie) continue;
      for (const placement of dieFloor.modules) {
        const initMod = initDie.modules.find((m) => m.moduleId === placement.moduleId);
        if (initMod) {
          placement.x = initMod.x;
          placement.y = initMod.y;
          placement.width = initMod.width;
          placement.height = initMod.height;
          placement.orientation = initMod.orientation;
        }
      }
    }
  }

  const report = generateReport(partResult, floorplan, tsvPlan, hbPlan, params);

  return { partition: partResult, floorplan, tsvPlan, hbPlan, report };
}

function generateReport(
  part: PartitionResult,
  floor: FloorplanResult,
  tsv: TsvPlan,
  hb: HbPlan,
  params: FpParams,
): string {
  const lines: string[] = [
    '# 3D Floorplan Report',
    '',
    '## Partition Summary',
    `- Stacking: **${params.stackingMode || 'face_to_back'}**`,
    `- Strategy: ${params.partitionStrategy}`,
    `- Dies: ${params.dies.length}`,
    `- Modules: ${params.modules.length}`,
    `- Cross-die nets: ${part.crossDieNets.length}`,
    '',
    '### Die Utilization',
  ];

  for (const die of params.dies) {
    const util = part.stats.dieUtilization[die.id] ?? 0;
    lines.push(`- **${die.name}** (tier ${die.tier}): ${(util * 100).toFixed(1)}%`);
  }

  lines.push('', '### Cost Breakdown');
  const cb = part.stats.costBreakdown;
  lines.push(
    `| Metric | Value | Weight |`,
    `|--------|-------|--------|`,
    `| Area Balance | ${cb.areaBalance.toFixed(4)} | ${params.costWeights.areaBalance} |`,
    `| Inter-die Comm | ${cb.interDieCommunication.toFixed(4)} | ${params.costWeights.interDieCommunication} |`,
    `| TSV Density Violation | ${cb.tsvDensityViolation.toFixed(4)} | ${params.costWeights.tsvDensity} |`,
    `| HB Density Violation | ${cb.hbDensityViolation.toFixed(4)} | ${params.costWeights.hbDensity} |`,
    `| Congestion | ${cb.congestion.toFixed(4)} | ${params.costWeights.congestion} |`,
    `| Thermal Balance | ${cb.thermalBalance.toFixed(4)} | ${params.costWeights.thermalBalance} |`,
    `| **Total** | **${cb.total.toFixed(4)}** | |`,
  );

  lines.push('', '## TSV Plan');
  lines.push(`- Arrays: ${tsv.arrays.length}`);
  lines.push(`- Total TSVs: ${tsv.arrays.reduce((s, a) => s + a.count, 0)}`);
  if (tsv.violations.length > 0) {
    lines.push('', '### TSV Violations');
    for (const v of tsv.violations) {
      lines.push(`- [${v.severity}] ${v.message}`);
    }
  }

  lines.push('', '## HB Plan');
  lines.push(`- Arrays: ${hb.arrays.length}`);
  lines.push(`- Total channels: ${hb.arrays.reduce((s, a) => s + a.channelCount, 0)}`);
  if (hb.violations.length > 0) {
    lines.push('', '### HB Violations');
    for (const v of hb.violations) {
      lines.push(`- [${v.severity}] ${v.message}`);
    }
  }

  lines.push('', '## Floorplan');
  for (const dieFloor of floor.dies) {
    lines.push(`### Die: ${dieFloor.dieId}`);
    lines.push(`- Modules placed: ${dieFloor.modules.length}`);
  }

  return lines.join('\n');
}
