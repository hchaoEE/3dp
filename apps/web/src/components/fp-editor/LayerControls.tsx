'use client';

import { useFpStore } from '@/store/fp-store';

export function LayerControls() {
  const { visibleLayers, toggleLayer, isDirty, isRerunning } = useFpStore();

  const layers: Array<{ key: keyof typeof visibleLayers; label: string; color: string }> = [
    { key: 'dies', label: 'Dies', color: 'bg-blue-500' },
    { key: 'modules', label: 'Modules', color: 'bg-green-500' },
    { key: 'tsv', label: 'TSV', color: 'bg-orange-500' },
    { key: 'hb', label: 'HB', color: 'bg-cyan-500' },
    { key: 'violations', label: 'Violations', color: 'bg-red-500' },
    { key: 'labels', label: 'Labels', color: 'bg-gray-500' },
  ];

  return (
    <div className="absolute bottom-4 left-4 bg-gray-900/95 text-white rounded-lg shadow-xl p-3 text-sm">
      <h4 className="font-semibold mb-2">Layers</h4>
      <div className="space-y-1">
        {layers.map(({ key, label, color }) => (
          <label key={key} className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={visibleLayers[key]}
              onChange={() => toggleLayer(key)}
              className="rounded"
            />
            <span className={`w-3 h-3 rounded-sm ${color}`} />
            <span>{label}</span>
          </label>
        ))}
      </div>
      {isDirty && (
        <div className="mt-3 pt-2 border-t border-gray-700">
          <div className="text-yellow-400 text-xs mb-1">Unsaved changes</div>
        </div>
      )}
      {isRerunning && (
        <div className="mt-1 text-cyan-400 text-xs animate-pulse">Re-running FP...</div>
      )}
    </div>
  );
}
