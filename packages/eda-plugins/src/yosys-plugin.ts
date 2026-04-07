import type {
  PluginInterface,
  PluginManifest,
  StepContext,
  ExecutionPlan,
} from '@chip3d/sdk';

/**
 * Yosys synthesis plugin.
 * Integrates the open-source Yosys synthesizer via container execution.
 * 
 * Expects a Verilog netlist as input, runs Yosys synthesis with ABC,
 * and outputs a gate-level netlist and synthesis report.
 */
export class YosysPlugin implements PluginInterface {
  manifest: PluginManifest = {
    name: 'yosys',
    version: '0.1.0',
    description: 'Yosys open-source synthesis (container-based)',
    supportedSteps: ['synth'],
    paramsSchema: {
      type: 'object',
      properties: {
        topModule: { type: 'string', description: 'Top module name' },
        target: {
          type: 'string',
          enum: ['generic', 'ice40', 'ecp5', 'xilinx'],
          default: 'generic',
          description: 'Synthesis target',
        },
        optimize: {
          type: 'string',
          enum: ['area', 'speed'],
          default: 'area',
          description: 'Optimization goal',
        },
      },
      required: ['topModule'],
    },
    outputTypes: ['netlist', 'report'],
    containerImage: 'hdlc/yosys:latest',
  };

  async run(ctx: StepContext): Promise<ExecutionPlan> {
    const params = ctx.params as {
      topModule?: string;
      target?: string;
      optimize?: string;
    };

    const topModule = params.topModule || 'top';
    const target = params.target || 'generic';
    const optimize = params.optimize || 'area';

    const inputFiles = ctx.inputs
      .filter((i) => i.path.endsWith('.v') || i.path.endsWith('.sv'))
      .map((i) => i.path);

    const synthCmd = target === 'generic'
      ? `synth -top ${topModule}`
      : `synth_${target} -top ${topModule}`;

    const yosysScript = [
      ...inputFiles.map((f) => `read_verilog ${f}`),
      `hierarchy -check -top ${topModule}`,
      `proc`,
      `opt`,
      synthCmd,
      optimize === 'area' ? 'abc -g gates' : 'abc -fast',
      `opt_clean`,
      `stat -top ${topModule}`,
      `write_verilog ${ctx.outputDir}/synth_result.v`,
      `tee -o ${ctx.outputDir}/synth_report.txt stat`,
    ].join('; ');

    return {
      command: 'yosys',
      args: ['-p', yosysScript],
      env: {},
      workDir: ctx.outputDir,
      containerImage: this.manifest.containerImage,
      mounts: [
        ...ctx.inputs.map((i) => ({
          hostPath: i.path,
          containerPath: i.path,
          readOnly: true,
        })),
        {
          hostPath: ctx.outputDir,
          containerPath: ctx.outputDir,
          readOnly: false,
        },
      ],
      resources: ctx.resources,
    };
  }
}
