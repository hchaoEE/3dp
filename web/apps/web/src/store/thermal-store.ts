'use client';

import { create } from 'zustand';
import type { ThermalResult, ThermalLayerResult, Hotspot, DieSpec } from '@chip3d/sdk';

export interface ThermalViewerState {
  result: ThermalResult | null;
  dies: DieSpec[];
  selectedLayerIdx: number;
  colorRange: { min: number; max: number };
  threshold: number;
  viewMode: '3d' | '2d';

  visibleLayers: {
    temperature: boolean;
    moduleOutline: boolean;
    tsv: boolean;
    hb: boolean;
    hotspots: boolean;
  };

  setData: (result: ThermalResult, dies: DieSpec[]) => void;
  selectLayer: (idx: number) => void;
  setColorRange: (min: number, max: number) => void;
  setThreshold: (t: number) => void;
  setViewMode: (m: '3d' | '2d') => void;
  toggleLayer: (layer: keyof ThermalViewerState['visibleLayers']) => void;
}

export const useThermalStore = create<ThermalViewerState>((set, get) => ({
  result: null,
  dies: [],
  selectedLayerIdx: 0,
  colorRange: { min: 25, max: 100 },
  threshold: 85,
  viewMode: '3d',

  visibleLayers: {
    temperature: true,
    moduleOutline: true,
    tsv: true,
    hb: true,
    hotspots: true,
  },

  setData: (result, dies) => {
    const min = result.stats.globalMin;
    const max = result.stats.globalMax;
    set({ result, dies, colorRange: { min, max } });
  },

  selectLayer: (idx) => set({ selectedLayerIdx: idx }),
  setColorRange: (min, max) => set({ colorRange: { min, max } }),
  setThreshold: (t) => set({ threshold: t }),
  setViewMode: (m) => set({ viewMode: m }),
  toggleLayer: (layer) =>
    set((s) => ({
      visibleLayers: { ...s.visibleLayers, [layer]: !s.visibleLayers[layer] },
    })),
}));
