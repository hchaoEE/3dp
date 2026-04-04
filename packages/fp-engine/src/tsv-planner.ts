import type {
  PartitionResult,
  DieSpec,
  TsvRules,
  TsvPlan,
  TsvArray,
  Violation,
  Rect,
} from '@chip3d/sdk';

export function planTsv(
  partitionResult: PartitionResult,
  dies: DieSpec[],
  tsvRules: TsvRules,
): TsvPlan {
  const diePairs = extractDiePairs(partitionResult, dies);
  const arrays: TsvArray[] = [];
  const violations: Violation[] = [];

  for (const [fromDie, toDie, netCount] of diePairs) {
    const from = dies.find((d) => d.id === fromDie)!;
    const to = dies.find((d) => d.id === toDie)!;
    const overlapW = Math.min(from.width, to.width);
    const overlapH = Math.min(from.height, to.height);

    const tsvCount = netCount;
    const tsvPerRow = Math.max(1, Math.floor(Math.sqrt(tsvCount)));
    const tsvRows = Math.ceil(tsvCount / tsvPerRow);

    const arrayWidth = tsvPerRow * tsvRules.pitch;
    const arrayHeight = tsvRows * tsvRules.pitch;

    const maxWidth = overlapW - 2 * tsvRules.keepout;
    const maxHeight = overlapH - 2 * tsvRules.keepout;

    const region: Rect = {
      x: tsvRules.keepout + (maxWidth - Math.min(arrayWidth, maxWidth)) / 2,
      y: tsvRules.keepout + (maxHeight - Math.min(arrayHeight, maxHeight)) / 2,
      width: Math.min(arrayWidth, maxWidth),
      height: Math.min(arrayHeight, maxHeight),
    };

    const dieArea = overlapW * overlapH;
    const density = (tsvCount * tsvRules.pitch * tsvRules.pitch) / dieArea;

    if (density > tsvRules.maxDensity) {
      violations.push({
        type: 'density_violation',
        severity: 'error',
        message: `TSV density ${(density * 100).toFixed(1)}% exceeds max ${(tsvRules.maxDensity * 100).toFixed(1)}% between ${fromDie} and ${toDie}`,
        dieId: fromDie,
      });
    }

    if (arrayWidth > maxWidth || arrayHeight > maxHeight) {
      violations.push({
        type: 'area_overflow',
        severity: 'warning',
        message: `TSV array truncated to fit die overlap between ${fromDie} and ${toDie}`,
        location: region,
        dieId: fromDie,
      });
    }

    arrays.push({
      id: `tsv-${fromDie}-${toDie}`,
      region,
      fromDie,
      toDie,
      count: tsvCount,
      signalGroup: 'auto',
    });
  }

  return { arrays, rules: tsvRules, violations };
}

function extractDiePairs(
  partitionResult: PartitionResult,
  dies: DieSpec[],
): Array<[string, string, number]> {
  const pairCount = new Map<string, number>();
  for (const net of partitionResult.crossDieNets) {
    const sorted = [...net.dies].sort();
    for (let i = 0; i < sorted.length; i++) {
      for (let j = i + 1; j < sorted.length; j++) {
        const key = `${sorted[i]}|${sorted[j]}`;
        pairCount.set(key, (pairCount.get(key) || 0) + 1);
      }
    }
  }

  return [...pairCount.entries()].map(([key, count]) => {
    const [a, b] = key.split('|');
    return [a, b, count];
  });
}
