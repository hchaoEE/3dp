import type {
  ModuleSpec,
  DieSpec,
  NetSpec,
  ModuleAssignment,
  CostWeights,
  CostBreakdown,
  TsvRules,
  HbRules,
} from '@chip3d/sdk';

export function computeCost(
  assignments: ModuleAssignment[],
  modules: ModuleSpec[],
  dies: DieSpec[],
  nets: NetSpec[],
  tsvRules: TsvRules,
  hbRules: HbRules,
  weights: CostWeights,
): CostBreakdown {
  const moduleMap = new Map(modules.map((m) => [m.id, m]));
  const assignMap = new Map(assignments.map((a) => [a.moduleId, a.dieId]));

  const areaBalance = computeAreaBalance(assignments, moduleMap, dies);
  const interDieCommunication = computeInterDieCommunication(assignments, nets, assignMap);
  const tsvDensityViolation = computeTsvDensityViolation(assignments, nets, assignMap, dies, tsvRules);
  const hbDensityViolation = computeHbDensityViolation(assignments, nets, assignMap, dies, hbRules);
  const congestion = computeCongestion(assignments, nets, assignMap);
  const thermalBalance = computeThermalBalance(assignments, moduleMap, dies, assignMap);

  const total =
    weights.areaBalance * areaBalance +
    weights.interDieCommunication * interDieCommunication +
    weights.tsvDensity * tsvDensityViolation +
    weights.hbDensity * hbDensityViolation +
    weights.congestion * congestion +
    weights.thermalBalance * thermalBalance;

  return {
    areaBalance,
    interDieCommunication,
    tsvDensityViolation,
    hbDensityViolation,
    congestion,
    thermalBalance,
    total,
  };
}

function computeAreaBalance(
  assignments: ModuleAssignment[],
  moduleMap: Map<string, ModuleSpec>,
  dies: DieSpec[],
): number {
  const dieArea = new Map<string, number>();
  for (const die of dies) {
    dieArea.set(die.id, 0);
  }

  for (const assign of assignments) {
    const mod = moduleMap.get(assign.moduleId);
    if (!mod) continue;
    dieArea.set(assign.dieId, (dieArea.get(assign.dieId) || 0) + mod.area);
  }

  const utilizations: number[] = [];
  for (const die of dies) {
    const used = dieArea.get(die.id) || 0;
    const total = die.width * die.height;
    utilizations.push(total > 0 ? used / total : 0);
  }

  if (utilizations.length < 2) return 0;

  const avg = utilizations.reduce((a, b) => a + b, 0) / utilizations.length;
  const variance = utilizations.reduce((s, u) => s + (u - avg) ** 2, 0) / utilizations.length;
  return Math.sqrt(variance);
}

function computeInterDieCommunication(
  _assignments: ModuleAssignment[],
  nets: NetSpec[],
  assignMap: Map<string, string>,
): number {
  let crossDieCost = 0;
  for (const net of nets) {
    const dieSet = new Set<string>();
    for (const pin of net.pins) {
      const die = assignMap.get(pin.moduleId);
      if (die) dieSet.add(die);
    }
    if (dieSet.size > 1) {
      crossDieCost += net.weight * (dieSet.size - 1);
    }
  }
  return crossDieCost;
}

function computeTsvDensityViolation(
  _assignments: ModuleAssignment[],
  nets: NetSpec[],
  assignMap: Map<string, string>,
  dies: DieSpec[],
  tsvRules: TsvRules,
): number {
  let crossNets = 0;
  for (const net of nets) {
    const dieSet = new Set<string>();
    for (const pin of net.pins) {
      const die = assignMap.get(pin.moduleId);
      if (die) dieSet.add(die);
    }
    if (dieSet.size > 1) crossNets++;
  }

  const minDieArea = Math.min(...dies.map((d) => d.width * d.height));
  const tsvArea = tsvRules.pitch * tsvRules.pitch;
  const maxTsvs = minDieArea > 0 ? (minDieArea * tsvRules.maxDensity) / tsvArea : Infinity;

  return crossNets > maxTsvs ? (crossNets - maxTsvs) / Math.max(maxTsvs, 1) : 0;
}

function computeHbDensityViolation(
  _assignments: ModuleAssignment[],
  nets: NetSpec[],
  assignMap: Map<string, string>,
  dies: DieSpec[],
  hbRules: HbRules,
): number {
  let crossNets = 0;
  for (const net of nets) {
    const dieSet = new Set<string>();
    for (const pin of net.pins) {
      const die = assignMap.get(pin.moduleId);
      if (die) dieSet.add(die);
    }
    if (dieSet.size > 1) crossNets++;
  }

  const minDieArea = Math.min(...dies.map((d) => d.width * d.height));
  const hbArea = hbRules.pitch * hbRules.pitch;
  const maxHbs = minDieArea > 0 ? (minDieArea * hbRules.maxDensity) / hbArea : Infinity;

  return crossNets > maxHbs ? (crossNets - maxHbs) / Math.max(maxHbs, 1) : 0;
}

function computeCongestion(
  _assignments: ModuleAssignment[],
  nets: NetSpec[],
  assignMap: Map<string, string>,
): number {
  const diePairCount = new Map<string, number>();
  for (const net of nets) {
    const diesInNet = new Set<string>();
    for (const pin of net.pins) {
      const die = assignMap.get(pin.moduleId);
      if (die) diesInNet.add(die);
    }
    const sorted = [...diesInNet].sort();
    for (let i = 0; i < sorted.length; i++) {
      for (let j = i + 1; j < sorted.length; j++) {
        const key = `${sorted[i]}-${sorted[j]}`;
        diePairCount.set(key, (diePairCount.get(key) || 0) + net.weight);
      }
    }
  }

  const counts = [...diePairCount.values()];
  if (counts.length === 0) return 0;
  const max = Math.max(...counts);
  const avg = counts.reduce((a, b) => a + b, 0) / counts.length;
  return avg > 0 ? max / avg - 1 : 0;
}

function computeThermalBalance(
  assignments: ModuleAssignment[],
  moduleMap: Map<string, ModuleSpec>,
  dies: DieSpec[],
  assignMap: Map<string, string>,
): number {
  const diePower = new Map<string, number>();
  for (const die of dies) {
    diePower.set(die.id, 0);
  }

  for (const assign of assignments) {
    const mod = moduleMap.get(assign.moduleId);
    if (!mod) continue;
    diePower.set(assign.dieId, (diePower.get(assign.dieId) || 0) + mod.power);
  }

  const powers = [...diePower.values()];
  if (powers.length < 2) return 0;

  const avg = powers.reduce((a, b) => a + b, 0) / powers.length;
  if (avg === 0) return 0;
  const variance = powers.reduce((s, p) => s + (p - avg) ** 2, 0) / powers.length;
  return Math.sqrt(variance) / avg;
}
