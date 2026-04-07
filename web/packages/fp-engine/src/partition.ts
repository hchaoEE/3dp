import type {
  FpParams,
  ModuleAssignment,
  PartitionResult,
  CrossDieNet,
  CostBreakdown,
} from '@chip3d/sdk';
import { computeCost } from './cost.js';

export function partition(params: FpParams): PartitionResult {
  const { partitionStrategy } = params;

  let assignments: ModuleAssignment[];

  switch (partitionStrategy) {
    case 'fm':
      assignments = fmPartition(params);
      break;
    case 'simulated_annealing':
      assignments = saPartition(params);
      break;
    case 'greedy':
    default:
      assignments = greedyPartition(params);
      break;
  }

  const assignMap = new Map(assignments.map((a) => [a.moduleId, a.dieId]));
  const crossDieNets = computeCrossDieNets(params, assignMap);
  const costBreakdown = computeCost(
    assignments, params.modules, params.dies, params.nets,
    params.tsvRules, params.hbRules, params.costWeights,
  );

  const dieUtilization: Record<string, number> = {};
  for (const die of params.dies) {
    const usedArea = assignments
      .filter((a) => a.dieId === die.id)
      .reduce((sum, a) => {
        const mod = params.modules.find((m) => m.id === a.moduleId);
        return sum + (mod?.area || 0);
      }, 0);
    dieUtilization[die.id] = (die.width * die.height) > 0 ? usedArea / (die.width * die.height) : 0;
  }

  return {
    assignments,
    crossDieNets,
    stats: {
      dieUtilization,
      crossDieNetCount: crossDieNets.length,
      totalCrossDiePins: crossDieNets.reduce((s, n) => s + n.pinCount, 0),
      costBreakdown,
    },
  };
}

function greedyPartition(params: FpParams): ModuleAssignment[] {
  const { modules, dies, constraints } = params;
  const assignments: ModuleAssignment[] = [];
  const dieArea = new Map(dies.map((d) => [d.id, 0]));

  const lockedSet = new Map<string, string>();
  for (const lock of constraints.lockedModules || []) {
    lockedSet.set(lock.moduleId, lock.dieId);
  }
  for (const mod of modules) {
    if (mod.lockedToDie) lockedSet.set(mod.id, mod.lockedToDie);
  }

  const groupMap = new Map<string, string>();
  for (const group of constraints.moduleGroups || []) {
    for (const mId of group.moduleIds) {
      groupMap.set(mId, group.groupId);
    }
  }
  for (const mod of modules) {
    if (mod.group) groupMap.set(mod.id, mod.group);
  }

  const groupDieMap = new Map<string, string>();

  const sorted = [...modules].sort((a, b) => b.area - a.area);

  for (const mod of sorted) {
    if (lockedSet.has(mod.id)) {
      const dieId = lockedSet.get(mod.id)!;
      assignments.push({ moduleId: mod.id, dieId });
      dieArea.set(dieId, (dieArea.get(dieId) || 0) + mod.area);
      const gId = groupMap.get(mod.id);
      if (gId && !groupDieMap.has(gId)) groupDieMap.set(gId, dieId);
      continue;
    }

    const gId = groupMap.get(mod.id);
    if (gId && groupDieMap.has(gId)) {
      const dieId = groupDieMap.get(gId)!;
      assignments.push({ moduleId: mod.id, dieId });
      dieArea.set(dieId, (dieArea.get(dieId) || 0) + mod.area);
      continue;
    }

    let bestDie = dies[0].id;
    let bestScore = Infinity;

    for (const die of dies) {
      const currentArea = dieArea.get(die.id) || 0;
      const totalArea = die.width * die.height;
      const limit = constraints.dieAreaLimits?.[die.id] ?? totalArea;

      if (currentArea + mod.area > limit) continue;

      const utilization = (currentArea + mod.area) / totalArea;
      const balanceScore = utilization;
      if (balanceScore < bestScore) {
        bestScore = balanceScore;
        bestDie = die.id;
      }
    }

    assignments.push({ moduleId: mod.id, dieId: bestDie });
    dieArea.set(bestDie, (dieArea.get(bestDie) || 0) + mod.area);

    if (gId && !groupDieMap.has(gId)) {
      groupDieMap.set(gId, bestDie);
    }
  }

  return assignments;
}

function fmPartition(params: FpParams): ModuleAssignment[] {
  let assignments = greedyPartition(params);
  const { modules, dies, nets, constraints, costWeights, tsvRules, hbRules } = params;

  if (dies.length !== 2) return assignments;

  const lockedSet = new Set<string>();
  for (const lock of constraints.lockedModules || []) lockedSet.add(lock.moduleId);
  for (const mod of modules) {
    if (mod.lockedToDie) lockedSet.add(mod.id);
  }

  const groupMap = new Map<string, string>();
  for (const group of constraints.moduleGroups || []) {
    for (const mId of group.moduleIds) groupMap.set(mId, group.groupId);
  }

  let bestCost = computeCost(
    assignments, modules, dies, nets, tsvRules, hbRules, costWeights,
  ).total;

  const maxPasses = 10;
  for (let pass = 0; pass < maxPasses; pass++) {
    let improved = false;
    const locked = new Set(lockedSet);

    for (const mod of modules) {
      if (locked.has(mod.id)) continue;

      const current = assignments.find((a) => a.moduleId === mod.id);
      if (!current) continue;

      const otherDie = dies.find((d) => d.id !== current.dieId);
      if (!otherDie) continue;

      const trial = assignments.map((a) =>
        a.moduleId === mod.id ? { moduleId: mod.id, dieId: otherDie.id } : a,
      );

      const trialCost = computeCost(
        trial, modules, dies, nets, tsvRules, hbRules, costWeights,
      ).total;

      if (trialCost < bestCost) {
        assignments = trial;
        bestCost = trialCost;
        improved = true;
        locked.add(mod.id);
      }
    }

    if (!improved) break;
  }

  return assignments;
}

function saPartition(params: FpParams): ModuleAssignment[] {
  let assignments = greedyPartition(params);
  const { modules, dies, nets, constraints, costWeights, tsvRules, hbRules } = params;

  const lockedSet = new Set<string>();
  for (const lock of constraints.lockedModules || []) lockedSet.add(lock.moduleId);
  for (const mod of modules) {
    if (mod.lockedToDie) lockedSet.add(mod.id);
  }

  const movable = modules.filter((m) => !lockedSet.has(m.id));
  if (movable.length === 0) return assignments;

  let currentCost = computeCost(
    assignments, modules, dies, nets, tsvRules, hbRules, costWeights,
  ).total;

  let temp = 1.0;
  const coolingRate = 0.95;
  const iterations = Math.min(movable.length * 50, 5000);

  for (let i = 0; i < iterations; i++) {
    const modIdx = Math.floor(Math.random() * movable.length);
    const mod = movable[modIdx];
    const current = assignments.find((a) => a.moduleId === mod.id);
    if (!current) continue;

    const otherDies = dies.filter((d) => d.id !== current.dieId);
    if (otherDies.length === 0) continue;
    const newDie = otherDies[Math.floor(Math.random() * otherDies.length)];

    const trial = assignments.map((a) =>
      a.moduleId === mod.id ? { moduleId: mod.id, dieId: newDie.id } : a,
    );

    const trialCost = computeCost(
      trial, modules, dies, nets, tsvRules, hbRules, costWeights,
    ).total;

    const delta = trialCost - currentCost;
    if (delta < 0 || Math.random() < Math.exp(-delta / temp)) {
      assignments = trial;
      currentCost = trialCost;
    }

    temp *= coolingRate;
  }

  return assignments;
}

function computeCrossDieNets(
  params: FpParams,
  assignMap: Map<string, string>,
): CrossDieNet[] {
  const result: CrossDieNet[] = [];
  for (const net of params.nets) {
    const dieSet = new Set<string>();
    let pinCount = 0;
    for (const pin of net.pins) {
      const die = assignMap.get(pin.moduleId);
      if (die) {
        dieSet.add(die);
        pinCount++;
      }
    }
    if (dieSet.size > 1) {
      result.push({
        netId: net.id,
        dies: [...dieSet],
        pinCount,
      });
    }
  }
  return result;
}
