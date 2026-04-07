'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/api';

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-gray-600',
  queued: 'bg-gray-500',
  running: 'bg-blue-600 animate-pulse',
  completed: 'bg-green-600',
  failed: 'bg-red-600',
  skipped: 'bg-yellow-600',
};

export default function RunDetailPage() {
  const { projectId, runId } = useParams<{ projectId: string; runId: string }>();
  const [run, setRun] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [expandedStep, setExpandedStep] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await api.runs.get(projectId, runId);
      setRun(data);
    } catch (err) {
      console.error(err);
    }
    setLoading(false);
  }, [projectId, runId]);

  useEffect(() => {
    load();
    const interval = setInterval(load, 3000);
    return () => clearInterval(interval);
  }, [load]);

  if (loading) return <div className="p-8 text-gray-500">Loading...</div>;
  if (!run) return <div className="p-8 text-red-400">Run not found</div>;

  return (
    <div className="max-w-6xl mx-auto p-8">
      <div className="mb-6">
        <Link href={`/projects/${projectId}`} className="text-blue-400 hover:text-blue-300 text-sm">
          ← Back to Project
        </Link>
      </div>

      <div className="flex items-center gap-4 mb-6">
        <span className={`w-3 h-3 rounded-full ${STATUS_COLORS[run.status] || 'bg-gray-500'}`} />
        <h1 className="text-2xl font-bold">Run {run.id.slice(0, 8)}</h1>
        <span className="text-gray-400">{run.status}</span>
      </div>

      <div className="grid grid-cols-3 gap-4 mb-8 text-sm">
        <div className="bg-gray-900 rounded-lg p-3">
          <span className="text-gray-500">Created</span>
          <div>{new Date(run.createdAt).toLocaleString()}</div>
        </div>
        {run.startedAt && (
          <div className="bg-gray-900 rounded-lg p-3">
            <span className="text-gray-500">Started</span>
            <div>{new Date(run.startedAt).toLocaleString()}</div>
          </div>
        )}
        {run.endedAt && (
          <div className="bg-gray-900 rounded-lg p-3">
            <span className="text-gray-500">Ended</span>
            <div>{new Date(run.endedAt).toLocaleString()}</div>
          </div>
        )}
      </div>

      <h2 className="text-xl font-semibold mb-4">Steps</h2>
      <div className="space-y-3">
        {run.stepRuns?.map((sr: any) => (
          <div key={sr.id} className="bg-gray-900 border border-gray-800 rounded-lg">
            <div
              className="p-4 cursor-pointer flex items-center justify-between"
              onClick={() => setExpandedStep(expandedStep === sr.id ? null : sr.id)}
            >
              <div className="flex items-center gap-3">
                <span className={`w-2.5 h-2.5 rounded-full ${STATUS_COLORS[sr.status] || 'bg-gray-500'}`} />
                <span className="font-medium">{sr.stepId}</span>
                <span className="text-gray-500 text-sm">({sr.stepType} / {sr.impl})</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-gray-500 text-sm">{sr.status}</span>
                <span className="text-gray-600">{expandedStep === sr.id ? '▲' : '▼'}</span>
              </div>
            </div>

            {expandedStep === sr.id && (
              <div className="border-t border-gray-800 p-4 space-y-4">
                {sr.error && (
                  <div className="bg-red-900/30 border border-red-800 rounded p-3 text-red-300 text-sm">
                    {sr.error}
                  </div>
                )}

                {sr.artifacts?.length > 0 && (
                  <div>
                    <h4 className="text-sm font-semibold text-gray-300 mb-2">Artifacts</h4>
                    <div className="space-y-1">
                      {sr.artifacts.map((art: any) => (
                        <div key={art.id} className="flex items-center justify-between bg-gray-800 rounded px-3 py-2 text-sm">
                          <div>
                            <span className="font-medium">{art.name}</span>
                            <span className="text-gray-500 ml-2">({art.type})</span>
                          </div>
                          <div className="text-gray-500 text-xs">
                            {art.size ? `${(art.size / 1024).toFixed(1)} KB` : ''}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {sr.logs?.length > 0 && (
                  <div>
                    <h4 className="text-sm font-semibold text-gray-300 mb-2">Logs</h4>
                    <div className="bg-gray-800 rounded p-3 max-h-60 overflow-y-auto font-mono text-xs">
                      {sr.logs.map((log: any) => (
                        <div key={log.id} className={`py-0.5 ${log.level === 'error' ? 'text-red-400' : log.level === 'warn' ? 'text-yellow-400' : 'text-gray-300'}`}>
                          <span className="text-gray-600">[{new Date(log.timestamp).toLocaleTimeString()}]</span>{' '}
                          <span className="text-gray-500">[{log.level}]</span> {log.message}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
