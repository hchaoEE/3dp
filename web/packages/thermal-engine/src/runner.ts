import type {
  ThermalParams,
  ThermalResult,
  ThermalLayerResult,
  Hotspot,
  ThermalStats,
  DieThermalStats,
} from '@chip3d/sdk';
import { solveSteadyState } from './solver.js';

export async function runThermal(params: ThermalParams): Promise<ThermalResult> {
  const layerResults = solveSteadyState(params);

  const stats = computeStats(layerResults, params);
  const hotspots = findHotspots(layerResults, params, 10);

  return { layers: layerResults, hotspots, stats };
}

function computeStats(layers: ThermalLayerResult[], params: ThermalParams): ThermalStats {
  let globalMax = -Infinity;
  let globalMin = Infinity;
  let globalSum = 0;
  let globalCount = 0;

  const perDie: DieThermalStats[] = [];

  for (const layer of layers) {
    let dieMax = -Infinity;
    let dieMin = Infinity;
    let dieSum = 0;

    for (const t of layer.temperatures) {
      if (t > dieMax) dieMax = t;
      if (t < dieMin) dieMin = t;
      dieSum += t;
    }

    if (dieMax > globalMax) globalMax = dieMax;
    if (dieMin < globalMin) globalMin = dieMin;
    globalSum += dieSum;
    globalCount += layer.temperatures.length;

    perDie.push({
      dieId: layer.dieId,
      maxTemp: dieMax,
      minTemp: dieMin,
      avgTemp: layer.temperatures.length > 0 ? dieSum / layer.temperatures.length : 0,
    });
  }

  return {
    perDie,
    globalMax: globalMax === -Infinity ? 0 : globalMax,
    globalMin: globalMin === Infinity ? 0 : globalMin,
    globalAvg: globalCount > 0 ? globalSum / globalCount : 0,
  };
}

function findHotspots(
  layers: ThermalLayerResult[],
  params: ThermalParams,
  topN: number,
): Hotspot[] {
  const all: Hotspot[] = [];

  for (const layer of layers) {
    const layerSpec = params.layers.find((l) => l.dieId === layer.dieId);
    if (!layerSpec) continue;

    const dx = layerSpec.width / layer.gridNx;
    const dy = layerSpec.height / layer.gridNy;

    for (let iy = 0; iy < layer.gridNy; iy++) {
      for (let ix = 0; ix < layer.gridNx; ix++) {
        const temp = layer.temperatures[iy * layer.gridNx + ix];
        all.push({
          dieId: layer.dieId,
          tier: layer.tier,
          x: (ix + 0.5) * dx,
          y: (iy + 0.5) * dy,
          temperature: temp,
          moduleId: findModuleAt(params, layer.dieId, (ix + 0.5) * dx, (iy + 0.5) * dy),
        });
      }
    }
  }

  all.sort((a, b) => b.temperature - a.temperature);
  return all.slice(0, topN);
}

function findModuleAt(
  params: ThermalParams,
  dieId: string,
  x: number,
  y: number,
): string | undefined {
  for (const pm of params.powerMap) {
    if (pm.dieId !== dieId) continue;
    const r = pm.region;
    if (x >= r.x && x <= r.x + r.width && y >= r.y && y <= r.y + r.height) {
      return pm.moduleId;
    }
  }
  return undefined;
}
