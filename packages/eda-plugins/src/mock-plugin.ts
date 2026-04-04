import type {
  PluginInterface,
  PluginManifest,
  StepContext,
  ExecutionPlan,
} from '@chip3d/sdk';
import fs from 'fs';
import path from 'path';

/**
 * Mock plugin that generates sample outputs for non-self-developed steps
 * (synth, place, cts, route). Used for validating the flow orchestration,
 * dependency resolution, artifact archiving, and UI display.
 */
export class MockPlugin implements PluginInterface {
  manifest: PluginManifest = {
    name: 'mock',
    version: '0.1.0',
    description: 'Mock plugin for testing flow orchestration',
    supportedSteps: ['synth', 'place', 'cts', 'route'],
    paramsSchema: {},
    outputTypes: ['def', 'report', 'netlist', 'generic'],
  };

  async run(ctx: StepContext): Promise<ExecutionPlan> {
    fs.mkdirSync(ctx.outputDir, { recursive: true });

    const outputs = this.generateMockOutputs(ctx);
    for (const [filename, content] of Object.entries(outputs)) {
      fs.writeFileSync(path.join(ctx.outputDir, filename), content, 'utf-8');
    }

    return {
      command: 'echo',
      args: [`Mock ${ctx.stepType} step completed`],
      env: {},
      workDir: ctx.outputDir,
      resources: ctx.resources,
    };
  }

  private generateMockOutputs(ctx: StepContext): Record<string, string> {
    switch (ctx.stepType) {
      case 'synth':
        return {
          'synth_result.v': this.mockNetlist(ctx),
          'synth_report.txt': this.mockReport(ctx, 'Synthesis'),
        };
      case 'place':
        return {
          'placement.def': this.mockDef(ctx, 'placement'),
          'place_report.txt': this.mockReport(ctx, 'Placement'),
        };
      case 'cts':
        return {
          'cts.def': this.mockDef(ctx, 'cts'),
          'cts_report.txt': this.mockReport(ctx, 'CTS'),
        };
      case 'route':
        return {
          'routed.def': this.mockDef(ctx, 'routed'),
          'route.spef': this.mockSpef(ctx),
          'route_report.txt': this.mockReport(ctx, 'Routing'),
        };
      default:
        return {
          'output.txt': `Mock output for ${ctx.stepType}`,
        };
    }
  }

  private mockNetlist(ctx: StepContext): string {
    return [
      `// Mock synthesized netlist`,
      `// Step: ${ctx.stepId}`,
      `// Generated at: ${new Date().toISOString()}`,
      `module top (input clk, input rst, output [7:0] data_out);`,
      `  wire [7:0] internal;`,
      `  assign data_out = internal;`,
      `endmodule`,
    ].join('\n');
  }

  private mockDef(ctx: StepContext, stage: string): string {
    return [
      `# Mock DEF file - ${stage}`,
      `# Step: ${ctx.stepId}`,
      `# Generated at: ${new Date().toISOString()}`,
      `VERSION 5.8 ;`,
      `DESIGN top ;`,
      `UNITS DISTANCE MICRONS 1000 ;`,
      `DIEAREA ( 0 0 ) ( 1000000 1000000 ) ;`,
      `END DESIGN`,
    ].join('\n');
  }

  private mockSpef(ctx: StepContext): string {
    return [
      `*SPEF "IEEE 1481-1998"`,
      `*DESIGN "top"`,
      `*DATE "${new Date().toISOString()}"`,
      `*VENDOR "Chip3D Mock"`,
      `*T_UNIT 1 NS`,
      `*C_UNIT 1 PF`,
      `*R_UNIT 1 OHM`,
    ].join('\n');
  }

  private mockReport(ctx: StepContext, stage: string): string {
    return [
      `=== ${stage} Report ===`,
      `Step: ${ctx.stepId}`,
      `Project: ${ctx.projectId}`,
      `Run: ${ctx.runId}`,
      `Time: ${new Date().toISOString()}`,
      `Status: PASS (mock)`,
      ``,
      `--- Statistics ---`,
      `Cells: 1024`,
      `Nets: 2048`,
      `Area: 500000 um²`,
      `WNS: -0.05 ns`,
      `TNS: -1.2 ns`,
    ].join('\n');
  }
}
