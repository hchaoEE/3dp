import type {
  PartitionResult,
  DieSpec,
  HbRules,
  HbPlan,
  HbArray,
  Violation,
  Rect,
} from '@chip3d/sdk';

export function planHb(
  partitionResult: PartitionResult,
  dies: DieSpec[],
  hbRules: HbRules,
): HbPlan {
  const diePairs = extractDiePairs(partitionResult);
  const arrays: HbArray[] = [];
  const violations: Violation[] = [];

  for (const [fromDie, toDie, netCount] of diePairs) {
    const from = dies.find((d) => d.id === fromDie)!;
    const to = dies.find((d) => d.id === toDie)!;
    const overlapW = Math.min(from.width, to.width);
    const overlapH = Math.min(from.height, to.height);

    const channelCount = netCount;
    const padPerRow = Math.max(1, Math.floor(Math.sqrt(channelCount)));
    const padRows = Math.ceil(channelCount / padPerRow);

    const arrayWidth = padPerRow * hbRules.pitch;
    const arrayHeight = padRows * hbRules.pitch;

    const maxWidth = overlapW - 2 * hbRules.keepout;
    const maxHeight = overlapH - 2 * hbRules.keepout;

    const region: Rect = {
      x: hbRules.keepout + (maxWidth - Math.min(arrayWidth, maxWidth)) / 2,
      y: hbRules.keepout + (maxHeight - Math.min(arrayHeight, maxHeight)) / 2,
      width: Math.min(arrayWidth, maxWidth),
      height: Math.min(arrayHeight, maxHeight),
    };

    const dieArea = overlapW * overlapH;
    const density = (channelCount * hbRules.pitch * hbRules.pitch) / dieArea;

    if (density > hbRules.maxDensity) {
      violations.push({
        type: 'density_violation',
        severity: 'error',
        message: `HB density ${(density * 100).toFixed(1)}% exceeds max ${(hbRules.maxDensity * 100).toFixed(1)}% between ${fromDie} and ${toDie}`,
        dieId: fromDie,
      });
    }

    arrays.push({
      id: `hb-${fromDie}-${toDie}`,
      region,
      fromDie,
      toDie,
      pitch: hbRules.pitch,
      channelCount,
    });
  }

  return { arrays, rules: hbRules, violations };
}

function extractDiePairs(partitionResult: PartitionResult): Array<[string, string, number]> {
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
