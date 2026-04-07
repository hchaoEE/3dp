'use client';

import dynamic from 'next/dynamic';
import { useEffect } from 'react';
import { useFpStore } from '@/store/fp-store';
import { demoFpParams, demoDies, demoModules } from '@/lib/demo-data';
import { useParams } from 'next/navigation';
import Link from 'next/link';

const FpEditor3D = dynamic(
  () => import('@/components/fp-editor/FpEditor3D').then((m) => m.FpEditor3D),
  { ssr: false },
);

export default function FpEditorPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const { setData, isDirty, getEditedParams } = useFpStore();

  useEffect(() => {
    /* Run the FP engine client-side with demo data to populate the editor */
    async function loadDemoFp() {
      try {
        const { runFp } = await import('@chip3d/fp-engine');
        const result = await runFp(demoFpParams);
        setData({
          dies: demoDies,
          modules: demoModules,
          partition: result.partition,
          floorplan: result.floorplan,
          tsvPlan: result.tsvPlan,
          hbPlan: result.hbPlan,
        });
      } catch (err) {
        console.error('Failed to run FP engine:', err);
      }
    }
    loadDemoFp();
  }, [setData]);

  const handleRerun = async () => {
    const editedParams = getEditedParams();
    const mergedParams = { ...demoFpParams, ...editedParams };
    try {
      const { runFp } = await import('@chip3d/fp-engine');
      const result = await runFp(mergedParams as any);
      setData({
        dies: demoDies,
        modules: demoModules,
        partition: result.partition,
        floorplan: result.floorplan,
        tsvPlan: result.tsvPlan,
        hbPlan: result.hbPlan,
      });
    } catch (err) {
      console.error('Failed to rerun FP:', err);
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-60px)]">
      <div className="bg-gray-900 border-b border-gray-800 px-6 py-2 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href={`/projects/${projectId}`} className="text-blue-400 hover:text-blue-300 text-sm">
            ← Back
          </Link>
          <h2 className="text-lg font-semibold">3D Floorplan Editor</h2>
          {isDirty && <span className="text-yellow-400 text-sm">(modified)</span>}
        </div>
        <div className="flex gap-2">
          {isDirty && (
            <button
              onClick={handleRerun}
              className="bg-green-600 hover:bg-green-700 text-white px-4 py-1.5 rounded text-sm"
            >
              Re-run FP
            </button>
          )}
        </div>
      </div>
      <div className="flex-1">
        <FpEditor3D />
      </div>
    </div>
  );
}
