'use client';

import { create } from 'zustand';
import type {
  DieSpec,
  ModuleSpec,
  ModuleAssignment,
  ModulePlacement,
  TsvArray,
  HbArray,
  Violation,
  FloorplanResult,
  PartitionResult,
  TsvPlan,
  HbPlan,
  DefData,
  FlowExecutionState,
  FlowStep,
} from '@chip3d/sdk';

export interface FpEditorState {
  dies: DieSpec[];
  modules: ModuleSpec[];
  partition: PartitionResult | null;
  floorplan: FloorplanResult | null;
  tsvPlan: TsvPlan | null;
  hbPlan: HbPlan | null;
  violations: Violation[];

  // DEF data for each die
  defData: Record<string, DefData>;
  // Flow execution state
  flowState: FlowExecutionState;

  selectedModuleId: string | null;
  selectedTsvId: string | null;
  selectedHbId: string | null;
  hoveredModuleId: string | null;
  hoveredDieId: string | null;

  visibleLayers: {
    dies: boolean;
    modules: boolean;
    tsv: boolean;
    hb: boolean;
    violations: boolean;
    labels: boolean;
  };

  isDirty: boolean;
  isRerunning: boolean;

  setData: (data: {
    dies: DieSpec[];
    modules: ModuleSpec[];
    partition: PartitionResult;
    floorplan: FloorplanResult;
    tsvPlan: TsvPlan;
    hbPlan: HbPlan;
  }) => void;

  // DEF data methods
  setDefData: (dieId: string, data: DefData) => void;
  clearDefData: () => void;

  // Flow execution methods
  setFlowState: (state: FlowExecutionState) => void;
  updateFlowStatus: (dieName: string, step: FlowStep, status: FlowExecutionState['bottomDie']['status'], progress: number, message?: string) => void;

  selectModule: (id: string | null) => void;
  selectTsv: (id: string | null) => void;
  selectHb: (id: string | null) => void;
  hoverModule: (id: string | null) => void;
  hoverDie: (id: string | null) => void;
  toggleLayer: (layer: keyof FpEditorState['visibleLayers']) => void;

  moveModuleToDie: (moduleId: string, newDieId: string) => void;
  moveModulePosition: (moduleId: string, dieId: string, x: number, y: number) => void;
  updateTsvRegion: (tsvId: string, x: number, y: number, w: number, h: number) => void;
  updateHbRegion: (hbId: string, x: number, y: number, w: number, h: number) => void;

  markDirty: () => void;
  markClean: () => void;
  setRerunning: (v: boolean) => void;

  getEditedParams: () => Record<string, unknown>;
}

const initialFlowState: FlowExecutionState = {
  bottomDie: { step: 'synth', dieName: 'bottom_die', status: 'idle', progress: 0 },
  topDie: { step: 'synth', dieName: 'top_die', status: 'idle', progress: 0 },
  isRunning: false,
  currentStep: null,
};

export const useFpStore = create<FpEditorState>((set, get) => ({
  dies: [],
  modules: [],
  partition: null,
  floorplan: null,
  tsvPlan: null,
  hbPlan: null,
  violations: [],

  defData: {},
  flowState: initialFlowState,

  selectedModuleId: null,
  selectedTsvId: null,
  selectedHbId: null,
  hoveredModuleId: null,
  hoveredDieId: null,

  visibleLayers: {
    dies: true,
    modules: true,
    tsv: true,
    hb: true,
    violations: true,
    labels: true,
  },

  isDirty: false,
  isRerunning: false,

  setData: (data) => set({
    dies: data.dies,
    modules: data.modules,
    partition: data.partition,
    floorplan: data.floorplan,
    tsvPlan: data.tsvPlan,
    hbPlan: data.hbPlan,
    violations: [
      ...(data.tsvPlan?.violations || []),
      ...(data.hbPlan?.violations || []),
    ],
    isDirty: false,
  }),

  setDefData: (dieId, data) => set((state) => ({
    defData: { ...state.defData, [dieId]: data },
  })),

  clearDefData: () => set({ defData: {} }),

  setFlowState: (flowState) => set({ flowState }),

  updateFlowStatus: (dieName, step, status, progress, message) => set((state) => ({
    flowState: {
      ...state.flowState,
      [dieName === 'bottom_die' ? 'bottomDie' : 'topDie']: {
        step,
        dieName,
        status,
        progress,
        message,
      },
    },
  })),

  selectModule: (id) => set({ selectedModuleId: id, selectedTsvId: null, selectedHbId: null }),
  selectTsv: (id) => set({ selectedTsvId: id, selectedModuleId: null, selectedHbId: null }),
  selectHb: (id) => set({ selectedHbId: id, selectedModuleId: null, selectedTsvId: null }),
  hoverModule: (id) => set({ hoveredModuleId: id }),
  hoverDie: (id) => set({ hoveredDieId: id }),
  toggleLayer: (layer) =>
    set((s) => ({
      visibleLayers: { ...s.visibleLayers, [layer]: !s.visibleLayers[layer] },
    })),

  moveModuleToDie: (moduleId, newDieId) => {
    const state = get();
    if (!state.partition || !state.floorplan) return;

    const newAssignments = state.partition.assignments.map((a) =>
      a.moduleId === moduleId ? { ...a, dieId: newDieId } : a,
    );

    const oldDieId = state.partition.assignments.find((a) => a.moduleId === moduleId)?.dieId;
    const newFloorplan = { ...state.floorplan, dies: state.floorplan.dies.map((d) => ({ ...d, modules: [...d.modules] })) };

    if (oldDieId) {
      const oldDie = newFloorplan.dies.find((d) => d.dieId === oldDieId);
      if (oldDie) {
        oldDie.modules = oldDie.modules.filter((m) => m.moduleId !== moduleId);
      }
    }

    const targetDie = newFloorplan.dies.find((d) => d.dieId === newDieId);
    const mod = state.modules.find((m) => m.id === moduleId);
    if (targetDie && mod) {
      targetDie.modules.push({
        moduleId,
        x: 0,
        y: 0,
        width: mod.width,
        height: mod.height,
        orientation: 'N',
      });
    }

    set({
      partition: {
        ...state.partition,
        assignments: newAssignments,
      },
      floorplan: newFloorplan,
      isDirty: true,
    });
  },

  moveModulePosition: (moduleId, dieId, x, y) => {
    const state = get();
    if (!state.floorplan) return;

    const newFloorplan = {
      ...state.floorplan,
      dies: state.floorplan.dies.map((d) => {
        if (d.dieId !== dieId) return d;
        return {
          ...d,
          modules: d.modules.map((m) =>
            m.moduleId === moduleId ? { ...m, x, y } : m,
          ),
        };
      }),
    };

    set({ floorplan: newFloorplan, isDirty: true });
  },

  updateTsvRegion: (tsvId, x, y, w, h) => {
    const state = get();
    if (!state.tsvPlan) return;

    set({
      tsvPlan: {
        ...state.tsvPlan,
        arrays: state.tsvPlan.arrays.map((a) =>
          a.id === tsvId ? { ...a, region: { x, y, width: w, height: h } } : a,
        ),
      },
      isDirty: true,
    });
  },

  updateHbRegion: (hbId, x, y, w, h) => {
    const state = get();
    if (!state.hbPlan) return;

    set({
      hbPlan: {
        ...state.hbPlan,
        arrays: state.hbPlan.arrays.map((a) =>
          a.id === hbId ? { ...a, region: { x, y, width: w, height: h } } : a,
        ),
      },
      isDirty: true,
    });
  },

  markDirty: () => set({ isDirty: true }),
  markClean: () => set({ isDirty: false }),
  setRerunning: (v) => set({ isRerunning: v }),

  getEditedParams: () => {
    const state = get();
    return {
      initialPartition: state.partition?.assignments,
      initialFloorplan: state.floorplan,
      tsvRegions: state.tsvPlan?.arrays.map((a) => ({ id: a.id, region: a.region })),
      hbRegions: state.hbPlan?.arrays.map((a) => ({ id: a.id, region: a.region })),
    };
  },
}));
