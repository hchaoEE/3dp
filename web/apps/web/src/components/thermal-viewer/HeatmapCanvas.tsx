'use client';

import { useRef, useEffect, useState, useCallback } from 'react';
import { useThermalStore } from '@/store/thermal-store';
import { temperatureToColor } from './colormap';
import type { ThermalLayerResult, DieSpec } from '@chip3d/sdk';

interface Props {
  layer: ThermalLayerResult;
  die: DieSpec;
  width?: number;
  height?: number;
}

export function HeatmapCanvas({ layer, die, width = 500, height = 500 }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { colorRange, threshold } = useThermalStore();
  const [hoverInfo, setHoverInfo] = useState<{ x: number; y: number; temp: number } | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { gridNx, gridNy, temperatures } = layer;
    const cellW = width / gridNx;
    const cellH = height / gridNy;

    ctx.clearRect(0, 0, width, height);

    for (let iy = 0; iy < gridNy; iy++) {
      for (let ix = 0; ix < gridNx; ix++) {
        const temp = temperatures[iy * gridNx + ix];
        const [r, g, b] = temperatureToColor(temp, colorRange.min, colorRange.max);

        ctx.fillStyle = `rgb(${Math.round(r * 255)},${Math.round(g * 255)},${Math.round(b * 255)})`;
        ctx.fillRect(ix * cellW, iy * cellH, cellW + 0.5, cellH + 0.5);

        if (temp > threshold) {
          ctx.strokeStyle = 'rgba(255,0,0,0.8)';
          ctx.lineWidth = 1;
          ctx.strokeRect(ix * cellW, iy * cellH, cellW, cellH);
        }
      }
    }
  }, [layer, width, height, colorRange, threshold]);

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;

      const { gridNx, gridNy, temperatures } = layer;
      const cellW = width / gridNx;
      const cellH = height / gridNy;

      const ix = Math.floor(mx / cellW);
      const iy = Math.floor(my / cellH);

      if (ix >= 0 && ix < gridNx && iy >= 0 && iy < gridNy) {
        const dx = die.width / gridNx;
        const dy = die.height / gridNy;
        setHoverInfo({
          x: (ix + 0.5) * dx,
          y: (iy + 0.5) * dy,
          temp: temperatures[iy * gridNx + ix],
        });
      } else {
        setHoverInfo(null);
      }
    },
    [layer, die, width, height],
  );

  return (
    <div className="relative inline-block">
      <canvas
        ref={canvasRef}
        width={width}
        height={height}
        onMouseMove={handleMouseMove}
        onMouseLeave={() => setHoverInfo(null)}
        className="border border-gray-600 rounded"
      />
      {hoverInfo && (
        <div className="absolute top-2 left-2 bg-gray-900/90 text-white text-xs px-2 py-1 rounded pointer-events-none">
          ({hoverInfo.x.toFixed(1)}, {hoverInfo.y.toFixed(1)}) — {hoverInfo.temp.toFixed(2)}°C
        </div>
      )}
    </div>
  );
}
