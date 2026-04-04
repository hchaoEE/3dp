'use client';

import { Canvas } from '@react-three/fiber';
import { OrbitControls, Grid, Environment } from '@react-three/drei';
import { useFpStore } from '@/store/fp-store';
import { DieLayer } from './DieLayer';
import { ModuleBlock } from './ModuleBlock';
import { TsvVisualization } from './TsvVisualization';
import { HbVisualization } from './HbVisualization';
import { ViolationOverlay } from './ViolationOverlay';
import { StatsPanel } from './StatsPanel';
import { LayerControls } from './LayerControls';

export function FpEditor3D() {
  const { dies, modules, floorplan, tsvPlan, hbPlan, violations } = useFpStore();

  const moduleMap = new Map(modules.map((m) => [m.id, m]));

  return (
    <div className="relative w-full h-full bg-gray-950">
      <Canvas
        camera={{ position: [8, 10, 8], fov: 50 }}
        style={{ width: '100%', height: '100%' }}
      >
        <ambientLight intensity={0.4} />
        <directionalLight position={[10, 15, 10]} intensity={0.8} />
        <pointLight position={[-5, 10, -5]} intensity={0.3} />

        <Grid
          args={[20, 20]}
          position={[0, -0.01, 0]}
          cellSize={1}
          cellColor="#333"
          sectionSize={5}
          sectionColor="#555"
          fadeDistance={30}
        />

        {dies.map((die, i) => (
          <DieLayer key={die.id} die={die} index={i} />
        ))}

        {floorplan?.dies.map((dieFloor) => {
          const die = dies.find((d) => d.id === dieFloor.dieId);
          if (!die) return null;
          return dieFloor.modules.map((placement, idx) => {
            const mod = moduleMap.get(placement.moduleId);
            if (!mod) return null;
            return (
              <ModuleBlock
                key={placement.moduleId}
                placement={placement}
                die={die}
                moduleSpec={mod}
                colorIndex={idx}
              />
            );
          });
        })}

        {tsvPlan?.arrays.map((arr) => (
          <TsvVisualization key={arr.id} tsvArray={arr} dies={dies} />
        ))}

        {hbPlan?.arrays.map((arr) => (
          <HbVisualization key={arr.id} hbArray={arr} dies={dies} />
        ))}

        <ViolationOverlay violations={violations} dies={dies} />

        <OrbitControls
          makeDefault
          enablePan
          enableZoom
          enableRotate
          minDistance={3}
          maxDistance={50}
        />
      </Canvas>

      <StatsPanel />
      <LayerControls />
    </div>
  );
}
