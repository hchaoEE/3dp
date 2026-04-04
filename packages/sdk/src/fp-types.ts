/** 3D Floorplan data structures: partition, die, modules, TSV, HB */

export type StackingMode = 'face_to_face' | 'face_to_back';
export type FaceDirection = 'up' | 'down';

export interface DieSpec {
  id: string;
  name: string;
  tier: number;
  width: number;
  height: number;
  /** Face direction: 'up' = active side faces up, 'down' = flipped (F2F top die) */
  faceDirection: FaceDirection;
  techConstraints?: Record<string, unknown>;
}

export interface ModuleSpec {
  id: string;
  name: string;
  area: number;
  width: number;
  height: number;
  power: number;
  /** Which die this module is locked to (if any) */
  lockedToDie?: string;
  /** Group id - modules in the same group must be on the same die */
  group?: string;
}

export interface NetSpec {
  id: string;
  name: string;
  pins: NetPin[];
  weight: number;
}

export interface NetPin {
  moduleId: string;
  pinName: string;
}

// --- Partition result ---

export interface PartitionResult {
  assignments: ModuleAssignment[];
  crossDieNets: CrossDieNet[];
  stats: PartitionStats;
}

export interface ModuleAssignment {
  moduleId: string;
  dieId: string;
}

export interface CrossDieNet {
  netId: string;
  dies: string[];
  pinCount: number;
}

export interface PartitionStats {
  dieUtilization: Record<string, number>;
  crossDieNetCount: number;
  totalCrossDiePins: number;
  costBreakdown: CostBreakdown;
}

export interface CostBreakdown {
  areaBalance: number;
  interDieCommunication: number;
  tsvDensityViolation: number;
  hbDensityViolation: number;
  congestion: number;
  thermalBalance: number;
  total: number;
}

// --- Floorplan result (per-die) ---

export interface FloorplanResult {
  dies: DieFloorplan[];
}

export interface DieFloorplan {
  dieId: string;
  modules: ModulePlacement[];
}

export interface ModulePlacement {
  moduleId: string;
  x: number;
  y: number;
  width: number;
  height: number;
  orientation: 'N' | 'S' | 'E' | 'W' | 'FN' | 'FS' | 'FE' | 'FW';
}

// --- TSV plan ---

export interface TsvPlan {
  arrays: TsvArray[];
  rules: TsvRules;
  violations: Violation[];
}

export interface TsvArray {
  id: string;
  region: Rect;
  fromDie: string;
  toDie: string;
  count: number;
  signalGroup?: string;
}

export interface TsvRules {
  pitch: number;
  keepout: number;
  maxDensity: number;
}

// --- HB (Hybrid Bonding / µbump) plan ---

export interface HbPlan {
  arrays: HbArray[];
  rules: HbRules;
  violations: Violation[];
}

export interface HbArray {
  id: string;
  region: Rect;
  fromDie: string;
  toDie: string;
  pitch: number;
  channelCount: number;
}

export interface HbRules {
  pitch: number;
  keepout: number;
  maxDensity: number;
}

// --- Common ---

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Violation {
  type: 'area_overflow' | 'density_violation' | 'keepout_intrusion' | 'rule_violation';
  severity: 'error' | 'warning';
  message: string;
  location?: Rect;
  dieId?: string;
}

// --- FP step context/params ---

export interface FpParams {
  dies: DieSpec[];
  modules: ModuleSpec[];
  nets: NetSpec[];
  tsvRules: TsvRules;
  hbRules: HbRules;
  /** Stacking mode: face_to_face or face_to_back */
  stackingMode: StackingMode;
  partitionStrategy: 'greedy' | 'fm' | 'simulated_annealing';
  costWeights: CostWeights;
  constraints: FpConstraints;
  /** Optional: pre-existing partition to use as starting point */
  initialPartition?: ModuleAssignment[];
  /** Optional: pre-existing floorplan to use as starting point */
  initialFloorplan?: FloorplanResult;
}

export interface CostWeights {
  areaBalance: number;
  interDieCommunication: number;
  tsvDensity: number;
  hbDensity: number;
  congestion: number;
  thermalBalance: number;
}

export interface FpConstraints {
  maxCrossDieNets?: number;
  dieAreaLimits?: Record<string, number>;
  moduleGroups?: ModuleGroup[];
  lockedModules?: ModuleLock[];
}

export interface ModuleGroup {
  groupId: string;
  moduleIds: string[];
}

export interface ModuleLock {
  moduleId: string;
  dieId: string;
}
