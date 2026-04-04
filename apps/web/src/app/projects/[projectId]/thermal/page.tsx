'use client';

import dynamic from 'next/dynamic';
import { useEffect } from 'react';
import { useThermalStore } from '@/store/thermal-store';
import { demoFpParams, demoDies, demoModules } from '@/lib/demo-data';
import type { ThermalParams } from '@chip3d/sdk';
import { useParams } from 'next/navigation';
import Link from 'next/link';

const ThermalViewer = dynamic(
  () => import('@/components/thermal-viewer/ThermalViewer').then((m) => m.ThermalViewer),
  { ssr: false },
);

export default function ThermalPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const { setData } = useThermalStore();

  useEffect(() => {
    async function loadDemoThermal() {
      try {
        const { runFp } = await import('@chip3d/fp-engine');
        const fpResult = await runFp(demoFpParams);

        const powerMap = fpResult.floorplan.dies.flatMap((dieFloor) =>
          dieFloor.modules.map((placement) => {
            const mod = demoModules.find((m) => m.id === placement.moduleId);
            return {
              moduleId: placement.moduleId,
              dieId: dieFloor.dieId,
              power: mod?.power || 0,
              region: {
                x: placement.x,
                y: placement.y,
                width: placement.width,
                height: placement.height,
              },
            };
          }),
        );

        const thermalParams: ThermalParams = {
          gridNx: 50,
          gridNy: 40,
          layers: demoDies.map((die) => ({
            dieId: die.id,
            tier: die.tier,
            thickness: 0.1,
            thermalConductivity: 150,
            width: die.width,
            height: die.height,
          })),
          powerMap,
          boundary: {
            ambientTemp: 25,
            convectionTop: 10,
            convectionBottom: 50,
          },
          tsvThermalCoupling: {
            enabled: true,
            tsvConductivity: 400,
            hbConductivity: 200,
          },
          maxIterations: 500,
          tolerance: 0.1,
        };

        const { runThermal } = await import('@chip3d/thermal-engine');
        const thermalResult = await runThermal(thermalParams);

        setData(thermalResult, demoDies);
      } catch (err) {
        console.error('Failed to run thermal simulation:', err);
      }
    }
    loadDemoThermal();
  }, [setData]);

  return (
    <div className="flex flex-col h-[calc(100vh-60px)]">
      <div className="bg-gray-900 border-b border-gray-800 px-6 py-2 flex items-center gap-4">
        <Link href={`/projects/${projectId}`} className="text-blue-400 hover:text-blue-300 text-sm">
          ← Back
        </Link>
        <h2 className="text-lg font-semibold">Thermal Simulation Viewer</h2>
      </div>
      <div className="flex-1">
        <ThermalViewer />
      </div>
    </div>
  );
}
