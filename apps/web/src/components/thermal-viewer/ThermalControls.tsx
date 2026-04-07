'use client';

import { useThermalStore } from '@/store/thermal-store';

export function ThermalControls() {
  const {
    result,
    selectedLayerIdx,
    selectLayer,
    colorRange,
    setColorRange,
    threshold,
    setThreshold,
    viewMode,
    setViewMode,
    visibleLayers,
    toggleLayer,
  } = useThermalStore();

  if (!result) return null;

  const layers: Array<{ key: keyof typeof visibleLayers; label: string }> = [
    { key: 'temperature', label: 'Temperature' },
    { key: 'moduleOutline', label: 'Modules' },
    { key: 'hotspots', label: 'Hotspots' },
  ];

  return (
    <div className="bg-gray-900/95 text-white rounded-lg shadow-xl p-4 text-sm">
      <h4 className="font-semibold mb-3">Thermal Controls</h4>

      <div className="mb-3">
        <label className="text-xs text-gray-400">View Mode</label>
        <div className="flex gap-2 mt-1">
          <button
            onClick={() => setViewMode('3d')}
            className={`px-3 py-1 rounded text-xs ${viewMode === '3d' ? 'bg-blue-600' : 'bg-gray-700'}`}
          >
            3D
          </button>
          <button
            onClick={() => setViewMode('2d')}
            className={`px-3 py-1 rounded text-xs ${viewMode === '2d' ? 'bg-blue-600' : 'bg-gray-700'}`}
          >
            2D Slice
          </button>
        </div>
      </div>

      {viewMode === '2d' && (
        <div className="mb-3">
          <label className="text-xs text-gray-400">Die/Tier Layer</label>
          <select
            value={selectedLayerIdx}
            onChange={(e) => selectLayer(Number(e.target.value))}
            className="w-full mt-1 bg-gray-800 text-white rounded px-2 py-1 text-xs"
          >
            {result.layers.map((l, i) => (
              <option key={i} value={i}>
                {l.dieId} (tier {l.tier})
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="mb-3">
        <label className="text-xs text-gray-400">Color Range (°C)</label>
        <div className="flex gap-2 mt-1">
          <input
            type="number"
            value={colorRange.min}
            onChange={(e) => setColorRange(Number(e.target.value), colorRange.max)}
            className="w-16 bg-gray-800 text-white rounded px-2 py-1 text-xs"
          />
          <span className="text-gray-500">—</span>
          <input
            type="number"
            value={colorRange.max}
            onChange={(e) => setColorRange(colorRange.min, Number(e.target.value))}
            className="w-16 bg-gray-800 text-white rounded px-2 py-1 text-xs"
          />
        </div>
      </div>

      <div className="mb-3">
        <label className="text-xs text-gray-400">Violation Threshold (°C)</label>
        <input
          type="range"
          min={colorRange.min}
          max={colorRange.max}
          step={0.5}
          value={threshold}
          onChange={(e) => setThreshold(Number(e.target.value))}
          className="w-full mt-1"
        />
        <div className="text-xs text-right text-gray-400">{threshold.toFixed(1)}°C</div>
      </div>

      <div className="mb-3">
        <label className="text-xs text-gray-400">Layers</label>
        <div className="space-y-1 mt-1">
          {layers.map(({ key, label }) => (
            <label key={key} className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={visibleLayers[key]}
                onChange={() => toggleLayer(key)}
                className="rounded"
              />
              <span className="text-xs">{label}</span>
            </label>
          ))}
        </div>
      </div>
    </div>
  );
}
