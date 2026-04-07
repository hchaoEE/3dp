/** Thermal simulation data structures */

export interface ThermalParams {
  /** Grid resolution per die layer (nx * ny) */
  gridNx: number;
  gridNy: number;
  /** Die/tier stack info (physical dimensions, material) */
  layers: ThermalLayer[];
  /** Power map: module-level power density input */
  powerMap: PowerMapEntry[];
  /** Boundary conditions */
  boundary: BoundaryConditions;
  /** TSV/HB thermal coupling (optional, for enhanced accuracy) */
  tsvThermalCoupling?: TsvThermalCoupling;
  /** Max iterations for solver */
  maxIterations?: number;
  /** Convergence tolerance */
  tolerance?: number;
}

export interface ThermalLayer {
  dieId: string;
  tier: number;
  thickness: number;
  thermalConductivity: number;
  /** Width/height of the die (physical) */
  width: number;
  height: number;
}

export interface PowerMapEntry {
  moduleId: string;
  dieId: string;
  power: number;
  region: { x: number; y: number; width: number; height: number };
}

export interface BoundaryConditions {
  /** Ambient temperature in Celsius */
  ambientTemp: number;
  /** Convection coefficient at top surface (W/m²·K) */
  convectionTop: number;
  /** Convection coefficient at bottom surface (W/m²·K) */
  convectionBottom: number;
}

export interface TsvThermalCoupling {
  enabled: boolean;
  /** Effective thermal conductivity of TSV arrays (W/m·K) */
  tsvConductivity: number;
  /** Effective thermal conductivity of HB arrays (W/m·K) */
  hbConductivity: number;
}

// --- Thermal results ---

export interface ThermalResult {
  layers: ThermalLayerResult[];
  hotspots: Hotspot[];
  stats: ThermalStats;
}

export interface ThermalLayerResult {
  dieId: string;
  tier: number;
  /** Flattened temperature grid [row-major], size = gridNx * gridNy */
  temperatures: number[];
  gridNx: number;
  gridNy: number;
}

export interface Hotspot {
  dieId: string;
  tier: number;
  x: number;
  y: number;
  temperature: number;
  moduleId?: string;
}

export interface ThermalStats {
  perDie: DieThermalStats[];
  globalMax: number;
  globalMin: number;
  globalAvg: number;
}

export interface DieThermalStats {
  dieId: string;
  maxTemp: number;
  minTemp: number;
  avgTemp: number;
}
