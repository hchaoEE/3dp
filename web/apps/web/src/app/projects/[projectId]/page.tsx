'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/api';
import { demoFlowSpec } from '@/lib/demo-data';

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-gray-600',
  running: 'bg-blue-600 animate-pulse',
  completed: 'bg-green-600',
  failed: 'bg-red-600',
  cancelled: 'bg-yellow-600',
};

export default function ProjectDetailPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const [project, setProject] = useState<any>(null);
  const [flows, setFlows] = useState<any[]>([]);
  const [runs, setRuns] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const [p, f, r] = await Promise.all([
        api.projects.get(projectId),
        api.flows.list(projectId),
        api.runs.list(projectId),
      ]);
      setProject(p);
      setFlows(f);
      setRuns(r);
    } catch (err) {
      console.error(err);
    }
    setLoading(false);
  }, [projectId]);

  useEffect(() => { load(); }, [load]);

  const createDemoFlow = async () => {
    await api.flows.create(projectId, {
      name: demoFlowSpec.name,
      description: demoFlowSpec.description,
      spec: demoFlowSpec,
    });
    load();
  };

  const submitRun = async (flowId: string) => {
    await api.runs.create(projectId, { flowId });
    load();
  };

  if (loading) return <div className="p-8 text-gray-500">Loading...</div>;
  if (!project) return <div className="p-8 text-red-400">Project not found</div>;

  return (
    <div className="max-w-6xl mx-auto p-8">
      <div className="mb-6">
        <Link href="/" className="text-blue-400 hover:text-blue-300 text-sm">← Projects</Link>
      </div>

      <h1 className="text-3xl font-bold mb-2">{project.name}</h1>
      {project.description && <p className="text-gray-400 mb-6">{project.description}</p>}

      <div className="flex gap-4 mb-6">
        <Link
          href={`/projects/${projectId}/fp`}
          className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg text-sm"
        >
          3D FP Editor (Demo)
        </Link>
        <Link
          href={`/projects/${projectId}/thermal`}
          className="bg-orange-600 hover:bg-orange-700 text-white px-4 py-2 rounded-lg text-sm"
        >
          Thermal Viewer (Demo)
        </Link>
      </div>

      {/* Flows */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold">Flows</h2>
          <button
            onClick={createDemoFlow}
            className="bg-green-600 hover:bg-green-700 text-white px-3 py-1.5 rounded text-sm"
          >
            + Create Demo Flow
          </button>
        </div>

        {flows.length === 0 ? (
          <p className="text-gray-500 text-sm">No flows yet. Create a demo flow to get started.</p>
        ) : (
          <div className="space-y-3">
            {flows.map((flow) => (
              <div key={flow.id} className="bg-gray-900 border border-gray-800 rounded-lg p-4 flex items-center justify-between">
                <div>
                  <h3 className="font-medium">{flow.name}</h3>
                  <p className="text-gray-500 text-xs">{flow.description}</p>
                  <p className="text-gray-600 text-xs mt-1">
                    Steps: {(flow.spec as any)?.steps?.length || 0}
                  </p>
                </div>
                <button
                  onClick={() => submitRun(flow.id)}
                  className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-1.5 rounded text-sm"
                >
                  Run
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Runs */}
      <div>
        <h2 className="text-xl font-semibold mb-4">Runs</h2>
        {runs.length === 0 ? (
          <p className="text-gray-500 text-sm">No runs yet.</p>
        ) : (
          <div className="space-y-3">
            {runs.map((run) => (
              <Link
                key={run.id}
                href={`/projects/${projectId}/runs/${run.id}`}
                className="block bg-gray-900 border border-gray-800 rounded-lg p-4 hover:border-blue-600 transition-colors"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className={`w-2.5 h-2.5 rounded-full ${STATUS_COLORS[run.status] || 'bg-gray-500'}`} />
                    <div>
                      <span className="font-medium">Run {run.id.slice(0, 8)}</span>
                      <span className="text-gray-500 text-sm ml-2">{run.status}</span>
                    </div>
                  </div>
                  <div className="text-gray-500 text-xs">
                    {new Date(run.createdAt).toLocaleString()}
                  </div>
                </div>
                {run.stepRuns && (
                  <div className="flex gap-1 mt-2">
                    {run.stepRuns.map((sr: any) => (
                      <span
                        key={sr.id}
                        className={`text-xs px-2 py-0.5 rounded ${STATUS_COLORS[sr.status] || 'bg-gray-700'} text-white`}
                      >
                        {sr.stepType}
                      </span>
                    ))}
                  </div>
                )}
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
