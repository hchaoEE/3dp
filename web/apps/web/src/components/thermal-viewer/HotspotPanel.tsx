'use client';

import { useThermalStore } from '@/store/thermal-store';

export function HotspotPanel() {
  const { result, threshold } = useThermalStore();

  if (!result) return null;

  const { hotspots, stats } = result;
  const aboveThreshold = hotspots.filter((h) => h.temperature > threshold);

  return (
    <div className="bg-gray-900/95 text-white rounded-lg shadow-xl p-4 text-sm">
      <h3 className="text-lg font-bold mb-3">Hotspot Analysis</h3>

      <div className="mb-4">
        <h4 className="font-semibold text-gray-300 mb-1">Global Stats</h4>
        <div className="grid grid-cols-2 gap-1 text-xs">
          <span>Max:</span><span className="text-red-400">{stats.globalMax.toFixed(2)}°C</span>
          <span>Min:</span><span className="text-blue-400">{stats.globalMin.toFixed(2)}°C</span>
          <span>Avg:</span><span>{stats.globalAvg.toFixed(2)}°C</span>
        </div>
      </div>

      <div className="mb-4">
        <h4 className="font-semibold text-gray-300 mb-1">Per-die Stats</h4>
        {stats.perDie.map((d) => (
          <div key={d.dieId} className="mb-2">
            <div className="text-xs font-medium">{d.dieId}</div>
            <div className="grid grid-cols-3 gap-1 text-xs text-gray-400">
              <span>Max: {d.maxTemp.toFixed(1)}°C</span>
              <span>Min: {d.minTemp.toFixed(1)}°C</span>
              <span>Avg: {d.avgTemp.toFixed(1)}°C</span>
            </div>
          </div>
        ))}
      </div>

      <div>
        <h4 className="font-semibold text-gray-300 mb-1">
          Top Hotspots
          {aboveThreshold.length > 0 && (
            <span className="text-red-400 ml-1">({aboveThreshold.length} above {threshold}°C)</span>
          )}
        </h4>
        <div className="max-h-40 overflow-y-auto">
          {hotspots.slice(0, 10).map((hs, i) => (
            <div
              key={i}
              className={`text-xs py-1 border-b border-gray-800 ${hs.temperature > threshold ? 'text-red-400' : 'text-gray-300'}`}
            >
              #{i + 1} — {hs.dieId} ({hs.x.toFixed(1)}, {hs.y.toFixed(1)}):{' '}
              <span className="font-bold">{hs.temperature.toFixed(2)}°C</span>
              {hs.moduleId && <span className="text-gray-500 ml-1">({hs.moduleId})</span>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
