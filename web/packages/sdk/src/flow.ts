export type StepType = 'fp' | 'thermal' | 'synth' | 'place' | 'cts' | 'route';
export type StepImpl = 'core' | 'plugin';

export interface StepSpec {
  id: string;
  type: StepType;
  impl: StepImpl;
  tool?: string;
  inputs: StepInput[];
  params: Record<string, unknown>;
  resources: ResourceSpec;
  outputs: OutputDecl[];
  dependsOn: string[];
}

export interface StepInput {
  name: string;
  source: 'artifact' | 'project';
  ref: string;
}

export interface OutputDecl {
  name: string;
  type: ArtifactType;
}

export type ArtifactType =
  | 'partition'
  | 'floorplan'
  | 'tsv_plan'
  | 'hb_plan'
  | 'fp_report'
  | 'thermal_field'
  | 'heatmap'
  | 'thermal_report'
  | 'def'
  | 'spef'
  | 'netlist'
  | 'report'
  | 'generic';

export interface ResourceSpec {
  cpu?: number;
  memoryMb?: number;
  timeoutMs?: number;
}

export interface FlowSpec {
  id: string;
  name: string;
  description?: string;
  steps: StepSpec[];
}

export type RunStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
export type StepRunStatus = 'pending' | 'queued' | 'running' | 'completed' | 'failed' | 'skipped';
