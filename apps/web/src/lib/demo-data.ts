import type {
  DieSpec,
  ModuleSpec,
  NetSpec,
  FpParams,
  ThermalParams,
  FlowSpec,
} from '@chip3d/sdk';

export const demoDies: DieSpec[] = [
  { id: 'die-bottom', name: 'Bottom Die', tier: 0, width: 500, height: 400, techConstraints: {} },
  { id: 'die-top', name: 'Top Die', tier: 1, width: 500, height: 400, techConstraints: {} },
];

export const demoModules: ModuleSpec[] = [
  { id: 'cpu-core', name: 'CPU Core', area: 40000, width: 200, height: 200, power: 5.0 },
  { id: 'gpu', name: 'GPU', area: 30000, width: 200, height: 150, power: 4.0 },
  { id: 'mem-ctrl', name: 'Memory Controller', area: 15000, width: 150, height: 100, power: 1.5 },
  { id: 'io-block', name: 'IO Block', area: 10000, width: 100, height: 100, power: 0.8, lockedToDie: 'die-bottom' },
  { id: 'pll', name: 'PLL', area: 5000, width: 70, height: 70, power: 0.3 },
  { id: 'cache-l2', name: 'L2 Cache', area: 25000, width: 250, height: 100, power: 2.0 },
  { id: 'noc', name: 'NoC Router', area: 8000, width: 100, height: 80, power: 1.0, group: 'noc-group' },
  { id: 'noc-2', name: 'NoC Router 2', area: 8000, width: 100, height: 80, power: 1.0, group: 'noc-group' },
];

export const demoNets: NetSpec[] = [
  { id: 'n1', name: 'cpu-gpu', pins: [{ moduleId: 'cpu-core', pinName: 'out' }, { moduleId: 'gpu', pinName: 'in' }], weight: 10 },
  { id: 'n2', name: 'cpu-mem', pins: [{ moduleId: 'cpu-core', pinName: 'mem' }, { moduleId: 'mem-ctrl', pinName: 'in' }], weight: 8 },
  { id: 'n3', name: 'gpu-mem', pins: [{ moduleId: 'gpu', pinName: 'mem' }, { moduleId: 'mem-ctrl', pinName: 'gpu' }], weight: 6 },
  { id: 'n4', name: 'cpu-cache', pins: [{ moduleId: 'cpu-core', pinName: 'cache' }, { moduleId: 'cache-l2', pinName: 'in' }], weight: 12 },
  { id: 'n5', name: 'cpu-io', pins: [{ moduleId: 'cpu-core', pinName: 'io' }, { moduleId: 'io-block', pinName: 'in' }], weight: 3 },
  { id: 'n6', name: 'pll-cpu', pins: [{ moduleId: 'pll', pinName: 'clk' }, { moduleId: 'cpu-core', pinName: 'clk' }], weight: 5 },
  { id: 'n7', name: 'noc-cpu', pins: [{ moduleId: 'noc', pinName: 'port0' }, { moduleId: 'cpu-core', pinName: 'noc' }], weight: 7 },
  { id: 'n8', name: 'noc-gpu', pins: [{ moduleId: 'noc', pinName: 'port1' }, { moduleId: 'gpu', pinName: 'noc' }], weight: 7 },
  { id: 'n9', name: 'noc2-mem', pins: [{ moduleId: 'noc-2', pinName: 'port0' }, { moduleId: 'mem-ctrl', pinName: 'noc' }], weight: 6 },
  { id: 'n10', name: 'noc-noc2', pins: [{ moduleId: 'noc', pinName: 'link' }, { moduleId: 'noc-2', pinName: 'link' }], weight: 9 },
];

export const demoFpParams: FpParams = {
  dies: demoDies,
  modules: demoModules,
  nets: demoNets,
  tsvRules: { pitch: 10, keepout: 20, maxDensity: 0.15 },
  hbRules: { pitch: 5, keepout: 10, maxDensity: 0.25 },
  partitionStrategy: 'simulated_annealing',
  costWeights: {
    areaBalance: 2.0,
    interDieCommunication: 3.0,
    tsvDensity: 1.0,
    hbDensity: 1.0,
    congestion: 1.5,
    thermalBalance: 2.0,
  },
  constraints: {
    moduleGroups: [{ groupId: 'noc-group', moduleIds: ['noc', 'noc-2'] }],
    lockedModules: [{ moduleId: 'io-block', dieId: 'die-bottom' }],
  },
};

export const demoFlowSpec: FlowSpec = {
  id: 'demo-flow',
  name: 'Demo 3D Chip Flow',
  description: 'Full flow: FP → Thermal → Synth → Place → CTS → Route',
  steps: [
    {
      id: 'fp-step',
      type: 'fp',
      impl: 'core',
      inputs: [],
      params: demoFpParams as any,
      resources: { cpu: 2, memoryMb: 4096, timeoutMs: 60000 },
      outputs: [
        { name: 'partition.json', type: 'partition' },
        { name: 'floorplan.json', type: 'floorplan' },
        { name: 'tsv_plan.json', type: 'tsv_plan' },
        { name: 'hb_plan.json', type: 'hb_plan' },
        { name: 'fp_report.md', type: 'fp_report' },
      ],
      dependsOn: [],
    },
    {
      id: 'thermal-step',
      type: 'thermal',
      impl: 'core',
      inputs: [{ name: 'floorplan', source: 'artifact', ref: 'fp-step:floorplan.json' }],
      params: {},
      resources: { cpu: 2, memoryMb: 4096, timeoutMs: 60000 },
      outputs: [
        { name: 'thermal_result.json', type: 'thermal_field' },
        { name: 'thermal_report.md', type: 'thermal_report' },
      ],
      dependsOn: ['fp-step'],
    },
    {
      id: 'synth-step',
      type: 'synth',
      impl: 'plugin',
      tool: 'mock',
      inputs: [],
      params: {},
      resources: { cpu: 1, memoryMb: 2048, timeoutMs: 120000 },
      outputs: [{ name: 'synth_result.v', type: 'netlist' }],
      dependsOn: [],
    },
    {
      id: 'place-step',
      type: 'place',
      impl: 'plugin',
      tool: 'mock',
      inputs: [{ name: 'netlist', source: 'artifact', ref: 'synth-step:synth_result.v' }],
      params: {},
      resources: { cpu: 2, memoryMb: 4096, timeoutMs: 120000 },
      outputs: [{ name: 'placement.def', type: 'def' }],
      dependsOn: ['synth-step'],
    },
    {
      id: 'cts-step',
      type: 'cts',
      impl: 'plugin',
      tool: 'mock',
      inputs: [{ name: 'placement', source: 'artifact', ref: 'place-step:placement.def' }],
      params: {},
      resources: { cpu: 2, memoryMb: 4096, timeoutMs: 120000 },
      outputs: [{ name: 'cts.def', type: 'def' }],
      dependsOn: ['place-step'],
    },
    {
      id: 'route-step',
      type: 'route',
      impl: 'plugin',
      tool: 'mock',
      inputs: [{ name: 'cts', source: 'artifact', ref: 'cts-step:cts.def' }],
      params: {},
      resources: { cpu: 4, memoryMb: 8192, timeoutMs: 300000 },
      outputs: [
        { name: 'routed.def', type: 'def' },
        { name: 'route.spef', type: 'spef' },
      ],
      dependsOn: ['cts-step'],
    },
  ],
};
