'use client';

import { useFpStore } from '@/store/fp-store';

export function StatsPanel() {
  const { partition, tsvPlan, hbPlan, violations, dies } = useFpStore();

  if (!partition) return null;

  const stats = partition.stats;

  return (
    <div className="absolute top-4 right-4 w-72 bg-gray-900/95 text-white rounded-lg shadow-xl p-4 text-sm overflow-y-auto max-h-[80vh]">
      <h3 className="text-lg font-bold mb-3">FP Statistics</h3>

      <div className="mb-4">
        <h4 className="font-semibold text-gray-300 mb-1">Die Utilization</h4>
        {dies.map((die) => {
          const util = (stats.dieUtilization[die.id] ?? 0) * 100;
          return (
            <div key={die.id} className="flex items-center gap-2 mb-1">
              <span className="w-20 truncate">{die.name}</span>
              <div className="flex-1 bg-gray-700 rounded-full h-2">
                <div
                  className="h-2 rounded-full"
                  style={{
                    width: `${Math.min(util, 100)}%`,
                    backgroundColor: util > 90 ? '#ef4444' : util > 70 ? '#f59e0b' : '#22c55e',
                  }}
                />
              </div>
              <span className="w-12 text-right">{util.toFixed(1)}%</span>
            </div>
          );
        })}
      </div>

      <div className="mb-4">
        <h4 className="font-semibold text-gray-300 mb-1">Cross-die</h4>
        <div className="grid grid-cols-2 gap-1 text-xs">
          <span>Nets:</span><span>{stats.crossDieNetCount}</span>
          <span>Pins:</span><span>{stats.totalCrossDiePins}</span>
        </div>
      </div>

      <div className="mb-4">
        <h4 className="font-semibold text-gray-300 mb-1">Cost Breakdown</h4>
        <div className="grid grid-cols-2 gap-1 text-xs">
          <span>Area Balance:</span><span>{stats.costBreakdown.areaBalance.toFixed(4)}</span>
          <span>Inter-die Comm:</span><span>{stats.costBreakdown.interDieCommunication.toFixed(4)}</span>
          <span>TSV Density:</span><span>{stats.costBreakdown.tsvDensityViolation.toFixed(4)}</span>
          <span>HB Density:</span><span>{stats.costBreakdown.hbDensityViolation.toFixed(4)}</span>
          <span>Congestion:</span><span>{stats.costBreakdown.congestion.toFixed(4)}</span>
          <span>Thermal Balance:</span><span>{stats.costBreakdown.thermalBalance.toFixed(4)}</span>
          <span className="font-bold">Total:</span>
          <span className="font-bold">{stats.costBreakdown.total.toFixed(4)}</span>
        </div>
      </div>

      {tsvPlan && (
        <div className="mb-4">
          <h4 className="font-semibold text-gray-300 mb-1">TSV</h4>
          <div className="text-xs">
            Arrays: {tsvPlan.arrays.length} | Total: {tsvPlan.arrays.reduce((s, a) => s + a.count, 0)}
          </div>
        </div>
      )}

      {hbPlan && (
        <div className="mb-4">
          <h4 className="font-semibold text-gray-300 mb-1">HB</h4>
          <div className="text-xs">
            Arrays: {hbPlan.arrays.length} | Channels: {hbPlan.arrays.reduce((s, a) => s + a.channelCount, 0)}
          </div>
        </div>
      )}

      {violations.length > 0 && (
        <div>
          <h4 className="font-semibold text-red-400 mb-1">Violations ({violations.length})</h4>
          {violations.slice(0, 5).map((v, i) => (
            <div key={i} className="text-xs text-red-300 mb-1">
              [{v.severity}] {v.message}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
