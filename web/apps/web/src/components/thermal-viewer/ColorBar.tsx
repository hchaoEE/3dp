'use client';

import { useThermalStore } from '@/store/thermal-store';
import { temperatureToHex } from './colormap';

export function ColorBar() {
  const { colorRange } = useThermalStore();
  const steps = 20;
  const stepSize = (colorRange.max - colorRange.min) / steps;

  return (
    <div className="bg-gray-900/90 rounded-lg px-3 py-2 inline-flex items-center gap-1">
      <span className="text-xs text-white mr-1">{colorRange.min.toFixed(0)}°C</span>
      <div className="flex h-4">
        {Array.from({ length: steps }, (_, i) => {
          const temp = colorRange.min + stepSize * (i + 0.5);
          return (
            <div
              key={i}
              className="w-3 h-4"
              style={{ backgroundColor: temperatureToHex(temp, colorRange.min, colorRange.max) }}
            />
          );
        })}
      </div>
      <span className="text-xs text-white ml-1">{colorRange.max.toFixed(0)}°C</span>
    </div>
  );
}
