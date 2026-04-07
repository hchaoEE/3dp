/**
 * Flow runner - executes flow/run.py and monitors progress
 */

import type { FlowStep, FlowStatus, DefData } from '@chip3d/sdk';

export interface FlowRunnerOptions {
  mode?: 'parallel' | 'sequential';
  die?: 'bottom' | 'top' | 'both';
  timeout?: number;
  onProgress?: (dieName: string, step: FlowStep, progress: number, message?: string) => void;
  onComplete?: (dieName: string, success: boolean) => void;
  onError?: (dieName: string, error: string) => void;
}

export interface FlowRunnerResult {
  success: boolean;
  exitCode: number;
  output: string;
}

// Map flow targets to steps
const TARGET_TO_STEP: Record<string, FlowStep> = {
  'synth': 'synth',
  'do-2_1_floorplan': 'floorplan',
  'do-2_2_floorplan_io': 'floorplan',
  'do-2_3_floorplan_tdms': 'floorplan',
  'do-2_4_floorplan_macro': 'floorplan',
  'do-2_5_floorplan_tapcell': 'floorplan',
  'do-2_6_floorplan_pdn': 'floorplan',
  'do-2_floorplan': 'floorplan',
  'do-3_1_place_gp_skip_io': 'place_before_3_2',
  'do-3_2_place_iop': 'place_3_2',
  'do-3_3_place_gp': 'place_after_3_2',
  'do-3_4_place_resized': 'place_after_3_2',
  'do-3_5_place_dp': 'place_after_3_2',
  'do-3_place': 'place_after_3_2',
  'do-3_place.sdc': 'place_after_3_2',
  'do-4_1_cts': 'cts',
  'do-4_cts': 'cts',
  'do-5_1_grt': 'route',
  'do-5_2_fillcell': 'route',
  'do-5_route': 'route',
  'do-5_route.sdc': 'route',
  'do-6_1_fill': 'finish',
  'do-6_1_fill.sdc': 'finish',
  'do-6_final.sdc': 'finish',
  'do-6_report': 'finish',
  'do-gds': 'finish',
  'elapsed': 'finish',
};

// Step order for progress calculation
const STEP_ORDER: FlowStep[] = [
  'synth',
  'floorplan',
  'place_before_3_2',
  'place_3_2',
  'place_after_3_2',
  'cts',
  'route',
  'finish',
];

/**
 * Calculate progress percentage based on current step
 */
function calculateProgress(step: FlowStep): number {
  const index = STEP_ORDER.indexOf(step);
  if (index === -1) return 0;
  return Math.round((index / STEP_ORDER.length) * 100);
}

/**
 * Parse flow output to extract current step
 */
function parseFlowOutput(line: string): { dieName?: string; target?: string; step?: FlowStep } {
  // Match patterns like "[bottom_die] Starting full flow..." or "[bottom_die] Failed at do-2_1_floorplan"
  const dieMatch = line.match(/\[(bottom_die|top_die)\]/);
  if (!dieMatch) return {};

  const dieName = dieMatch[1];

  // Match target completion
  const targetMatch = line.match(/do-([\w_]+)/);
  if (targetMatch) {
    const target = `do-${targetMatch[1]}`;
    const step = TARGET_TO_STEP[target];
    return { dieName, target, step };
  }

  return { dieName };
}

/**
 * Run the flow using the API endpoint
 */
export async function runFlow(options: FlowRunnerOptions = {}): Promise<FlowRunnerResult> {
  const { mode = 'parallel', die = 'both', timeout = 600 } = options;

  try {
    const response = await fetch('/api/flow/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode, die, timeout }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Flow execution failed: ${error}`);
    }

    const result = await response.json();
    return {
      success: result.success,
      exitCode: result.exitCode,
      output: result.output,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      exitCode: -1,
      output: message,
    };
  }
}

/**
 * Get the path to the DEF file for a specific die and step
 */
export function getDefFilePath(dieName: string, step: FlowStep): string {
  const basePath = `/api/flow/results/180_180/${dieName}/withoutcluster`;

  switch (step) {
    case 'floorplan':
      return `${basePath}/2_6_floorplan_pdn.def`;
    case 'place_before_3_2':
    case 'place_3_2':
      return `${basePath}/3_2_place_iop.def`;
    case 'place_after_3_2':
      return `${basePath}/3_place.def`;
    case 'cts':
      return `${basePath}/4_cts.def`;
    case 'route':
      return `${basePath}/5_route.def`;
    case 'finish':
      return `${basePath}/6_final.def`;
    default:
      return `${basePath}/2_1_floorplan.def`;
  }
}

/**
 * Load DEF file for a specific die
 */
export async function loadDefFile(dieName: string, step: FlowStep): Promise<DefData | null> {
  try {
    const defPath = getDefFilePath(dieName, step);
    const response = await fetch(defPath);

    if (!response.ok) {
      console.warn(`DEF file not found: ${defPath}`);
      return null;
    }

    const content = await response.text();

    // Import parser dynamically to avoid issues
    const { parseDef } = await import('./def-parser');
    return parseDef(content);
  } catch (error) {
    console.error(`Failed to load DEF for ${dieName}:`, error);
    return null;
  }
}

/**
 * Check if flow results exist for a die
 */
export async function checkFlowResults(dieName: string): Promise<boolean> {
  try {
    const response = await fetch(`/api/flow/results/180_180/${dieName}/withoutcluster/2_1_floorplan.def`, {
      method: 'HEAD',
    });
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Get flow status for both dies
 */
export async function getFlowStatus(): Promise<{ bottomDie: boolean; topDie: boolean }> {
  const [bottomDie, topDie] = await Promise.all([
    checkFlowResults('bottom_die'),
    checkFlowResults('top_die'),
  ]);
  return { bottomDie, topDie };
}

export { TARGET_TO_STEP, STEP_ORDER, calculateProgress, parseFlowOutput };
