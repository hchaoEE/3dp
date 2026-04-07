import type { ThermalParams, ThermalLayerResult } from '@chip3d/sdk';

/**
 * Steady-state heat conduction solver using finite difference method (Gauss-Seidel).
 * Solves the 2D Laplace/Poisson equation per layer with inter-layer coupling.
 *
 * -k * (d²T/dx² + d²T/dy²) = q  (power density)
 * Boundary: convection at top/bottom surfaces, adiabatic at edges (simplified).
 */
export function solveSteadyState(params: ThermalParams): ThermalLayerResult[] {
  const {
    gridNx,
    gridNy,
    layers,
    powerMap,
    boundary,
    tsvThermalCoupling,
    maxIterations = 1000,
    tolerance = 0.01,
  } = params;

  const numLayers = layers.length;
  const grids: Float64Array[] = [];
  const powerGrids: Float64Array[] = [];

  for (let l = 0; l < numLayers; l++) {
    grids.push(new Float64Array(gridNx * gridNy).fill(boundary.ambientTemp));
    powerGrids.push(new Float64Array(gridNx * gridNy));
  }

  for (const entry of powerMap) {
    const layerIdx = layers.findIndex((l) => l.dieId === entry.dieId);
    if (layerIdx < 0) continue;

    const layer = layers[layerIdx];
    const dx = layer.width / gridNx;
    const dy = layer.height / gridNy;

    const x0 = Math.max(0, Math.floor(entry.region.x / dx));
    const y0 = Math.max(0, Math.floor(entry.region.y / dy));
    const x1 = Math.min(gridNx - 1, Math.floor((entry.region.x + entry.region.width) / dx));
    const y1 = Math.min(gridNy - 1, Math.floor((entry.region.y + entry.region.height) / dy));

    const regionArea = entry.region.width * entry.region.height;
    const powerDensity = regionArea > 0 ? entry.power / regionArea : 0;

    for (let iy = y0; iy <= y1; iy++) {
      for (let ix = x0; ix <= x1; ix++) {
        powerGrids[layerIdx][iy * gridNx + ix] += powerDensity;
      }
    }
  }

  for (let iter = 0; iter < maxIterations; iter++) {
    let maxDelta = 0;

    for (let l = 0; l < numLayers; l++) {
      const layer = layers[l];
      const k = layer.thermalConductivity;
      const thickness = layer.thickness;
      const dx = layer.width / gridNx;
      const dy = layer.height / gridNy;
      const grid = grids[l];
      const power = powerGrids[l];

      const isTop = l === numLayers - 1;
      const isBottom = l === 0;

      const hTop = isTop ? boundary.convectionTop : 0;
      const hBottom = isBottom ? boundary.convectionBottom : 0;

      const kzUp = l < numLayers - 1
        ? getInterLayerConductivity(layers[l], layers[l + 1], tsvThermalCoupling)
        : 0;
      const kzDown = l > 0
        ? getInterLayerConductivity(layers[l - 1], layers[l], tsvThermalCoupling)
        : 0;

      for (let iy = 1; iy < gridNy - 1; iy++) {
        for (let ix = 1; ix < gridNx - 1; ix++) {
          const idx = iy * gridNx + ix;

          const Txp = grid[idx + 1];
          const Txm = grid[idx - 1];
          const Typ = grid[(iy + 1) * gridNx + ix];
          const Tym = grid[(iy - 1) * gridNx + ix];

          let lateralSum = k * ((Txp + Txm) / (dx * dx) + (Typ + Tym) / (dy * dy));
          let denom = k * (2 / (dx * dx) + 2 / (dy * dy));

          if (kzUp > 0 && l < numLayers - 1) {
            const Tup = grids[l + 1][idx];
            lateralSum += kzUp * Tup / (thickness * thickness);
            denom += kzUp / (thickness * thickness);
          }
          if (kzDown > 0 && l > 0) {
            const Tdown = grids[l - 1][idx];
            lateralSum += kzDown * Tdown / (thickness * thickness);
            denom += kzDown / (thickness * thickness);
          }

          if (hTop > 0) {
            lateralSum += hTop * boundary.ambientTemp / thickness;
            denom += hTop / thickness;
          }
          if (hBottom > 0) {
            lateralSum += hBottom * boundary.ambientTemp / thickness;
            denom += hBottom / thickness;
          }

          const source = power[idx] / thickness;
          const newT = denom > 0 ? (lateralSum + source) / denom : boundary.ambientTemp;
          const delta = Math.abs(newT - grid[idx]);
          if (delta > maxDelta) maxDelta = delta;
          grid[idx] = newT;
        }
      }

      applyEdgeBoundary(grid, gridNx, gridNy);
    }

    if (maxDelta < tolerance) break;
  }

  return layers.map((layer, l) => ({
    dieId: layer.dieId,
    tier: layer.tier,
    temperatures: Array.from(grids[l]),
    gridNx,
    gridNy,
  }));
}

function getInterLayerConductivity(
  _lower: { thermalConductivity: number },
  _upper: { thermalConductivity: number },
  coupling?: { enabled: boolean; tsvConductivity: number; hbConductivity: number } | null,
): number {
  if (coupling?.enabled) {
    return (coupling.tsvConductivity + coupling.hbConductivity) / 2;
  }
  return (_lower.thermalConductivity + _upper.thermalConductivity) / 2;
}

function applyEdgeBoundary(grid: Float64Array, nx: number, ny: number) {
  for (let ix = 0; ix < nx; ix++) {
    grid[ix] = grid[nx + ix];
    grid[(ny - 1) * nx + ix] = grid[(ny - 2) * nx + ix];
  }
  for (let iy = 0; iy < ny; iy++) {
    grid[iy * nx] = grid[iy * nx + 1];
    grid[iy * nx + nx - 1] = grid[iy * nx + nx - 2];
  }
}
