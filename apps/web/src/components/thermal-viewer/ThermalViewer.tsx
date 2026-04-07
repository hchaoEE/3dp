'use client';

import { Canvas } from '@react-three/fiber';
import { OrbitControls, Grid } from '@react-three/drei';
import { useThermalStore } from '@/store/thermal-store';
import { ThermalLayer3D } from './ThermalLayer3D';
import { HeatmapCanvas } from './HeatmapCanvas';
import { HotspotPanel } from './HotspotPanel';
import { ThermalControls } from './ThermalControls';
import { ColorBar } from './ColorBar';

export function ThermalViewer() {
  const { result, dies, viewMode, selectedLayerIdx } = useThermalStore();

  if (!result) {
    return (
      <div className="flex items-center justify-center h-full text-gray-500">
        No thermal simulation results to display
      </div>
    );
  }

  return (
    <div className="flex h-full bg-gray-950">
      {/* Main view */}
      <div className="flex-1 relative">
        {viewMode === '3d' ? (
          <Canvas camera={{ position: [8, 10, 8], fov: 50 }}>
            <ambientLight intensity={0.5} />
            <directionalLight position={[10, 15, 10]} intensity={0.6} />

            <Grid
              args={[20, 20]}
              position={[0, -0.01, 0]}
              cellSize={1}
              cellColor="#333"
              sectionSize={5}
              sectionColor="#555"
              fadeDistance={30}
            />

            {result.layers.map((layer) => {
              const die = dies.find((d) => d.id === layer.dieId);
              if (!die) return null;
              return <ThermalLayer3D key={layer.dieId} layer={layer} die={die} />;
            })}

            <OrbitControls makeDefault enablePan enableZoom enableRotate />
          </Canvas>
        ) : (
          <div className="flex items-center justify-center h-full p-4">
            {result.layers[selectedLayerIdx] && dies.length > 0 && (
              <div>
                <div className="text-white text-sm mb-2 text-center">
                  {result.layers[selectedLayerIdx].dieId} (tier {result.layers[selectedLayerIdx].tier})
                </div>
                <HeatmapCanvas
                  layer={result.layers[selectedLayerIdx]}
                  die={dies.find((d) => d.id === result.layers[selectedLayerIdx].dieId) || dies[0]}
                />
              </div>
            )}
          </div>
        )}

        <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2">
          <ColorBar />
        </div>
      </div>

      {/* Side panel */}
      <div className="w-80 overflow-y-auto p-4 space-y-4">
        <ThermalControls />
        <HotspotPanel />
      </div>
    </div>
  );
}
