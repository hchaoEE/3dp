'use client';

import dynamic from 'next/dynamic';
import { useEffect, useState, useCallback } from 'react';
import { useFpStore } from '@/store/fp-store';
import { demoFpParams, demoDies, demoModules } from '@/lib/demo-data';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import type { FlowStep, DefData } from '@chip3d/sdk';

const FpEditor3D = dynamic(
  () => import('@/components/fp-editor/FpEditor3D').then((m) => m.FpEditor3D),
  { ssr: false },
);

// Die specifications matching flow/config.mk
const flowDies = [
  {
    id: 'bottom_die',
    name: 'Bottom Die',
    tier: 0,
    width: 1200,
    height: 1000,
    faceDirection: 'up' as const,
  },
  {
    id: 'top_die',
    name: 'Top Die',
    tier: 1,
    width: 1200,
    height: 1000,
    faceDirection: 'down' as const,
  },
];

export default function FpEditorPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const {
    setData,
    isDirty,
    getEditedParams,
    defData,
    setDefData,
    clearDefData,
    flowState,
    setFlowState,
    updateFlowStatus,
    dies,
  } = useFpStore();

  const [isLoading, setIsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'demo' | 'def'>('demo');
  const [defLoadError, setDefLoadError] = useState<string | null>(null);

  // Load demo data on mount
  useEffect(() => {
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

  // Load DEF files for both dies
  const loadDefFiles = useCallback(async () => {
    setIsLoading(true);
    setDefLoadError(null);
    clearDefData();

    try {
      // Import flow runner dynamically
      const { loadDefFile, checkFlowResults } = await import('@/lib/flow-runner');

      // Check if flow results exist
      const [bottomExists, topExists] = await Promise.all([
        checkFlowResults('bottom_die'),
        checkFlowResults('top_die'),
      ]);

      if (!bottomExists && !topExists) {
        setDefLoadError('No flow results found. Please run the flow first.');
        setIsLoading(false);
        return;
      }

      // Set flow dies
      setData({
        dies: flowDies,
        modules: [],
        partition: { assignments: [], crossDieNets: [], stats: { dieUtilization: {}, crossDieNetCount: 0, totalCrossDiePins: 0, costBreakdown: { areaBalance: 0, interDieCommunication: 0, tsvDensityViolation: 0, hbDensityViolation: 0, congestion: 0, thermalBalance: 0, total: 0 } } },
        floorplan: { dies: [] },
        tsvPlan: { arrays: [], rules: { pitch: 10, keepout: 20, maxDensity: 0.15 }, violations: [] },
        hbPlan: { arrays: [], rules: { pitch: 5, keepout: 10, maxDensity: 0.25 }, violations: [] },
      });

      // Load DEF files
      const results = await Promise.allSettled([
        bottomExists ? loadDefFile('bottom_die', 'floorplan') : Promise.resolve(null),
        topExists ? loadDefFile('top_die', 'floorplan') : Promise.resolve(null),
      ]);

      if (results[0].status === 'fulfilled' && results[0].value) {
        setDefData('bottom_die', results[0].value);
      }

      if (results[1].status === 'fulfilled' && results[1].value) {
        setDefData('top_die', results[1].value);
      }

      setActiveTab('def');
    } catch (err) {
      console.error('Failed to load DEF files:', err);
      setDefLoadError(err instanceof Error ? err.message : 'Failed to load DEF files');
    } finally {
      setIsLoading(false);
    }
  }, [setDefData, clearDefData, setData]);

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

  // Get DEF stats for display
  const getDefStats = (dieId: string) => {
    const data = defData[dieId];
    if (!data) return null;
    return {
      dieArea: `${data.dieArea.width.toFixed(0)} x ${data.dieArea.height.toFixed(0)} µm`,
      macros: data.macros.length,
      bondingPins: data.bondingPins.length,
    };
  };

  return (
    <div className="flex flex-col h-[calc(100vh-60px)]">
      {/* Header */}
      <div className="bg-gray-900 border-b border-gray-800 px-6 py-2 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href={`/projects/${projectId}`} className="text-blue-400 hover:text-blue-300 text-sm">
            ← Back
          </Link>
          <h2 className="text-lg font-semibold">3D Floorplan Editor</h2>
          {isDirty && <span className="text-yellow-400 text-sm">(modified)</span>}
        </div>

        <div className="flex items-center gap-4">
          {/* Tab Switcher */}
          <div className="flex bg-gray-800 rounded-lg p-1">
            <button
              onClick={() => setActiveTab('demo')}
              className={`px-3 py-1 rounded text-sm transition-colors ${
                activeTab === 'demo'
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              Demo Data
            </button>
            <button
              onClick={() => loadDefFiles()}
              disabled={isLoading}
              className={`px-3 py-1 rounded text-sm transition-colors ${
                activeTab === 'def'
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-400 hover:text-white'
              } ${isLoading ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              {isLoading ? 'Loading...' : 'DEF View'}
            </button>
          </div>

          {isDirty && activeTab === 'demo' && (
            <button
              onClick={handleRerun}
              className="bg-green-600 hover:bg-green-700 text-white px-4 py-1.5 rounded text-sm"
            >
              Re-run FP
            </button>
          )}
        </div>
      </div>

      {/* DEF Stats Panel */}
      {activeTab === 'def' && (
        <div className="bg-gray-800 border-b border-gray-700 px-6 py-2">
          <div className="flex items-center gap-8">
            <h3 className="text-sm font-medium text-gray-300">DEF Data:</h3>
            {flowDies.map((die) => {
              const stats = getDefStats(die.id);
              return (
                <div key={die.id} className="flex items-center gap-2 text-sm">
                  <span className="text-gray-400">{die.name}:</span>
                  {stats ? (
                    <span className="text-green-400">
                      {stats.dieArea} | {stats.macros} macros | {stats.bondingPins} bonding pins
                    </span>
                  ) : (
                    <span className="text-gray-500">No data</span>
                  )}
                </div>
              );
            })}
          </div>
          {defLoadError && (
            <div className="mt-2 text-red-400 text-sm">
              Error: {defLoadError}
            </div>
          )}
        </div>
      )}

      {/* 3D Editor */}
      <div className="flex-1">
        <FpEditor3D />
      </div>
    </div>
  );
}
