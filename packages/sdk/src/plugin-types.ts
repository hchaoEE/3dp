/** Plugin system types for integrating external EDA tools */

import type { StepType, ResourceSpec } from './flow.js';

export interface PluginManifest {
  name: string;
  version: string;
  description?: string;
  supportedSteps: StepType[];
  paramsSchema: Record<string, unknown>;
  outputTypes: string[];
  defaultCommand?: string;
  containerImage?: string;
}

export interface StepContext {
  stepId: string;
  stepType: StepType;
  params: Record<string, unknown>;
  inputs: ResolvedInput[];
  outputDir: string;
  resources: ResourceSpec;
  projectId: string;
  runId: string;
}

export interface ResolvedInput {
  name: string;
  path: string;
  hash?: string;
}

export interface ExecutionPlan {
  command: string;
  args: string[];
  env: Record<string, string>;
  workDir: string;
  containerImage?: string;
  mounts?: MountSpec[];
  resources: ResourceSpec;
}

export interface MountSpec {
  hostPath: string;
  containerPath: string;
  readOnly: boolean;
}

export interface PluginInterface {
  manifest: PluginManifest;
  run(ctx: StepContext): Promise<ExecutionPlan>;
}
