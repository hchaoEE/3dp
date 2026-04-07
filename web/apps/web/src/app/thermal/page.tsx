'use client';

import dynamic from 'next/dynamic';
import { useState, useCallback } from 'react';
import { useThermalStore } from '@/store/thermal-store';
import type { ThermalParams, ThermalResult, DieSpec } from '@chip3d/sdk';
import Link from 'next/link';

const ThermalViewer = dynamic(
  () => import('@/components/thermal-viewer/ThermalViewer').then((m) => m.ThermalViewer),
  { ssr: false },
);

const defaultDies: DieSpec[] = [
  { id: 'die-bottom', name: 'Bottom Die', tier: 0, width: 500, height: 400, faceDirection: 'up' },
  { id: 'die-top', name: 'Top Die', tier: 1, width: 500, height: 400, faceDirection: 'down' },
];

const defaultParams: ThermalParams = {
  gridNx: 50,
  gridNy: 40,
  layers: [
    { dieId: 'die-bottom', tier: 0, thickness: 0.1, thermalConductivity: 150, width: 500, height: 400 },
    { dieId: 'die-top', tier: 1, thickness: 0.1, thermalConductivity: 150, width: 500, height: 400 },
  ],
  powerMap: [
    { moduleId: 'cpu', dieId: 'die-bottom', power: 5.0, region: { x: 50, y: 50, width: 200, height: 200 } },
    { moduleId: 'gpu', dieId: 'die-top', power: 4.0, region: { x: 100, y: 80, width: 200, height: 150 } },
    { moduleId: 'mem', dieId: 'die-bottom', power: 1.5, region: { x: 300, y: 100, width: 150, height: 100 } },
    { moduleId: 'cache', dieId: 'die-top', power: 2.0, region: { x: 10, y: 250, width: 250, height: 100 } },
  ],
  boundary: {
    ambientTemp: 25,
    convectionTop: 5,
    convectionBottom: 20,
  },
  tsvThermalCoupling: {
    enabled: true,
    tsvConductivity: 400,
    hbConductivity: 200,
  },
  maxIterations: 800,
  tolerance: 0.05,
};

export default function ThermalStandalonePage() {
  const { setData, result } = useThermalStore();
  const [params, setParams] = useState(defaultParams);
  const [running, setRunning] = useState(false);
  const [summary, setSummary] = useState<ThermalResult | null>(null);
  const [elapsed, setElapsed] = useState<number | null>(null);

  const updateBoundary = (key: keyof typeof params.boundary, val: number) => {
    setParams((p) => ({ ...p, boundary: { ...p.boundary, [key]: val } }));
  };

  const updateCoupling = (key: string, val: any) => {
    setParams((p) => ({
      ...p,
      tsvThermalCoupling: { ...p.tsvThermalCoupling!, [key]: val },
    }));
  };

  const runSimulation = useCallback(async () => {
    setRunning(true);
    setSummary(null);
    const t0 = performance.now();
    try {
      const { runThermal } = await import('@chip3d/thermal-engine');
      const result = await runThermal(params);
      const elapsed = performance.now() - t0;
      setElapsed(elapsed);
      setSummary(result);
      setData(result, defaultDies);
    } catch (err) {
      console.error('Thermal simulation failed:', err);
    }
    setRunning(false);
  }, [params, setData]);

  return (
    <div className="flex flex-col h-[calc(100vh-60px)]">
      <div className="bg-gray-900 border-b border-gray-800 px-6 py-2 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/" className="text-blue-400 hover:text-blue-300 text-sm">← Home</Link>
          <h2 className="text-lg font-semibold">Thermal Simulation</h2>
          <span className="text-gray-500 text-xs">Face-to-Face 3D Stack</span>
        </div>
        <button
          onClick={runSimulation}
          disabled={running}
          className={`px-4 py-1.5 rounded text-sm font-medium ${running ? 'bg-gray-600 cursor-wait' : 'bg-green-600 hover:bg-green-700'} text-white`}
        >
          {running ? 'Simulating...' : 'Run Thermal Simulation'}
        </button>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Left: Parameters */}
        <div className="w-80 bg-gray-900 border-r border-gray-800 p-4 overflow-y-auto text-sm space-y-5">
          <Section title="Grid Resolution">
            <Row label="Nx"><NumInput value={params.gridNx} onChange={(v) => setParams((p) => ({ ...p, gridNx: v }))} /></Row>
            <Row label="Ny"><NumInput value={params.gridNy} onChange={(v) => setParams((p) => ({ ...p, gridNy: v }))} /></Row>
          </Section>

          <Section title="Boundary Conditions">
            <Row label="Ambient (°C)"><NumInput value={params.boundary.ambientTemp} onChange={(v) => updateBoundary('ambientTemp', v)} /></Row>
            <Row label="Conv. Top (W/m²K)"><NumInput value={params.boundary.convectionTop} onChange={(v) => updateBoundary('convectionTop', v)} /></Row>
            <Row label="Conv. Bottom (W/m²K)"><NumInput value={params.boundary.convectionBottom} onChange={(v) => updateBoundary('convectionBottom', v)} /></Row>
          </Section>

          <Section title="TSV/HB Thermal Coupling">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={params.tsvThermalCoupling?.enabled ?? false}
                onChange={(e) => updateCoupling('enabled', e.target.checked)}
              />
              <span>Enabled</span>
            </label>
            {params.tsvThermalCoupling?.enabled && (
              <>
                <Row label="TSV k (W/mK)"><NumInput value={params.tsvThermalCoupling!.tsvConductivity} onChange={(v) => updateCoupling('tsvConductivity', v)} /></Row>
                <Row label="HB k (W/mK)"><NumInput value={params.tsvThermalCoupling!.hbConductivity} onChange={(v) => updateCoupling('hbConductivity', v)} /></Row>
              </>
            )}
          </Section>

          <Section title="Solver">
            <Row label="Max Iterations"><NumInput value={params.maxIterations || 800} onChange={(v) => setParams((p) => ({ ...p, maxIterations: v }))} /></Row>
            <Row label="Tolerance"><NumInput value={params.tolerance || 0.05} onChange={(v) => setParams((p) => ({ ...p, tolerance: v }))} step={0.01} /></Row>
          </Section>

          <Section title="Power Sources">
            {params.powerMap.map((pm, i) => (
              <div key={i} className="bg-gray-800 rounded p-2 mb-2 text-xs">
                <div className="font-medium text-gray-300">{pm.moduleId} @ {pm.dieId}</div>
                <Row label="Power (W)">
                  <NumInput value={pm.power} onChange={(v) => {
                    setParams((p) => ({
                      ...p,
                      powerMap: p.powerMap.map((x, j) => j === i ? { ...x, power: v } : x),
                    }));
                  }} step={0.1} />
                </Row>
              </div>
            ))}
          </Section>

          {/* Result Summary */}
          {summary && (
            <Section title="Simulation Summary">
              <div className="bg-gray-800 rounded p-3 space-y-2">
                <div className="text-green-400 font-medium">Completed in {elapsed?.toFixed(0)}ms</div>
                <div className="grid grid-cols-2 gap-1 text-xs">
                  <span className="text-gray-400">Max Temp:</span>
                  <span className="text-red-400 font-bold">{summary.stats.globalMax.toFixed(2)}°C</span>
                  <span className="text-gray-400">Min Temp:</span>
                  <span className="text-blue-400 font-bold">{summary.stats.globalMin.toFixed(2)}°C</span>
                  <span className="text-gray-400">Avg Temp:</span>
                  <span className="font-bold">{summary.stats.globalAvg.toFixed(2)}°C</span>
                </div>

                <div className="border-t border-gray-700 pt-2 mt-2">
                  <div className="text-gray-400 text-xs mb-1">Per-die:</div>
                  {summary.stats.perDie.map((d) => (
                    <div key={d.dieId} className="text-xs mb-1">
                      <span className="font-medium">{d.dieId}</span>
                      <span className="text-gray-500 ml-1">
                        max={d.maxTemp.toFixed(1)}° min={d.minTemp.toFixed(1)}° avg={d.avgTemp.toFixed(1)}°
                      </span>
                    </div>
                  ))}
                </div>

                {summary.hotspots.length > 0 && (
                  <div className="border-t border-gray-700 pt-2 mt-2">
                    <div className="text-gray-400 text-xs mb-1">Top-5 Hotspots:</div>
                    {summary.hotspots.slice(0, 5).map((hs, i) => (
                      <div key={i} className="text-xs text-red-300">
                        #{i + 1} {hs.dieId} ({hs.x.toFixed(0)},{hs.y.toFixed(0)}) → {hs.temperature.toFixed(2)}°C
                        {hs.moduleId && <span className="text-gray-500"> [{hs.moduleId}]</span>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </Section>
          )}
        </div>

        {/* Right: Viewer */}
        <div className="flex-1">
          {result ? (
            <ThermalViewer />
          ) : (
            <div className="flex items-center justify-center h-full text-gray-600">
              <div className="text-center">
                <p className="text-lg mb-2">Configure parameters and click "Run Thermal Simulation"</p>
                <p className="text-sm">F2F stack: Bottom die (face up) + Top die (face down, flipped)</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h4 className="text-gray-300 font-semibold mb-2 text-xs uppercase tracking-wide">{title}</h4>
      <div className="space-y-1.5">{children}</div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-gray-400 text-xs">{label}</span>
      {children}
    </div>
  );
}

function NumInput({ value, onChange, step = 1 }: { value: number; onChange: (v: number) => void; step?: number }) {
  return (
    <input
      type="number"
      value={value}
      step={step}
      onChange={(e) => onChange(Number(e.target.value))}
      className="w-20 bg-gray-800 border border-gray-600 rounded px-2 py-0.5 text-xs text-white text-right"
    />
  );
}
