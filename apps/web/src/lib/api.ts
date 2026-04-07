const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api';

async function fetchApi<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`API error ${res.status}: ${text}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

export const api = {
  projects: {
    list: () => fetchApi<any[]>('/projects'),
    get: (id: string) => fetchApi<any>(`/projects/${id}`),
    create: (data: { name: string; description?: string }) =>
      fetchApi<any>('/projects', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: string, data: { name?: string; description?: string }) =>
      fetchApi<any>(`/projects/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (id: string) =>
      fetchApi<void>(`/projects/${id}`, { method: 'DELETE' }),
  },

  flows: {
    list: (projectId: string) => fetchApi<any[]>(`/projects/${projectId}/flows`),
    get: (projectId: string, id: string) =>
      fetchApi<any>(`/projects/${projectId}/flows/${id}`),
    create: (projectId: string, data: { name: string; description?: string; spec: any }) =>
      fetchApi<any>(`/projects/${projectId}/flows`, { method: 'POST', body: JSON.stringify(data) }),
    update: (projectId: string, id: string, data: any) =>
      fetchApi<any>(`/projects/${projectId}/flows/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (projectId: string, id: string) =>
      fetchApi<void>(`/projects/${projectId}/flows/${id}`, { method: 'DELETE' }),
  },

  runs: {
    list: (projectId: string) => fetchApi<any[]>(`/projects/${projectId}/runs`),
    get: (projectId: string, id: string) =>
      fetchApi<any>(`/projects/${projectId}/runs/${id}`),
    create: (projectId: string, data: { flowId: string; params?: any }) =>
      fetchApi<any>(`/projects/${projectId}/runs`, { method: 'POST', body: JSON.stringify(data) }),
    cancel: (projectId: string, id: string) =>
      fetchApi<any>(`/projects/${projectId}/runs/${id}/cancel`, { method: 'POST' }),
    writeback: (projectId: string, runId: string, stepRunId: string, params: any) =>
      fetchApi<any>(`/projects/${projectId}/runs/${runId}/steps/${stepRunId}/writeback`, {
        method: 'POST',
        body: JSON.stringify({ params }),
      }),
  },

  artifacts: {
    list: (stepRunId: string) => fetchApi<any[]>(`/step-runs/${stepRunId}/artifacts`),
    get: (id: string) => fetchApi<any>(`/artifacts/${id}`),
    content: (id: string) => fetchApi<any>(`/artifacts/${id}/content`),
  },
};
