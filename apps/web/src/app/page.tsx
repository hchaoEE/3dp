'use client';

import { useState, useEffect, useCallback } from 'react';
import { api } from '@/lib/api';
import Link from 'next/link';

export default function ProjectsPage() {
  const [projects, setProjects] = useState<any[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const data = await api.projects.list();
      setProjects(data);
    } catch {
      setProjects([]);
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleCreate = async () => {
    if (!newName.trim()) return;
    await api.projects.create({ name: newName, description: newDesc || undefined });
    setNewName('');
    setNewDesc('');
    setShowCreate(false);
    load();
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this project?')) return;
    await api.projects.delete(id);
    load();
  };

  return (
    <div className="max-w-5xl mx-auto p-8">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-3xl font-bold">Projects</h1>
        <button
          onClick={() => setShowCreate(true)}
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm transition-colors"
        >
          + New Project
        </button>
      </div>

      {showCreate && (
        <div className="bg-gray-900 border border-gray-700 rounded-lg p-4 mb-6">
          <h3 className="font-semibold mb-3">Create Project</h3>
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Project name"
            className="w-full bg-gray-800 border border-gray-600 rounded px-3 py-2 mb-2 text-sm"
          />
          <input
            type="text"
            value={newDesc}
            onChange={(e) => setNewDesc(e.target.value)}
            placeholder="Description (optional)"
            className="w-full bg-gray-800 border border-gray-600 rounded px-3 py-2 mb-3 text-sm"
          />
          <div className="flex gap-2">
            <button onClick={handleCreate} className="bg-blue-600 hover:bg-blue-700 px-4 py-1.5 rounded text-sm">
              Create
            </button>
            <button onClick={() => setShowCreate(false)} className="bg-gray-700 hover:bg-gray-600 px-4 py-1.5 rounded text-sm">
              Cancel
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="text-gray-500 text-center py-12">Loading...</div>
      ) : projects.length === 0 ? (
        <div className="text-gray-500 text-center py-12">
          <p className="text-lg mb-2">No projects yet</p>
          <p className="text-sm">Create a project to get started with 3D chip design</p>
        </div>
      ) : (
        <div className="grid gap-4">
          {projects.map((p) => (
            <Link
              key={p.id}
              href={`/projects/${p.id}`}
              className="block bg-gray-900 border border-gray-800 rounded-lg p-5 hover:border-blue-600 transition-colors"
            >
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-semibold">{p.name}</h3>
                  {p.description && <p className="text-gray-400 text-sm mt-1">{p.description}</p>}
                  <p className="text-gray-500 text-xs mt-2">
                    Updated: {new Date(p.updatedAt).toLocaleString()}
                  </p>
                </div>
                <button
                  onClick={(e) => { e.preventDefault(); handleDelete(p.id); }}
                  className="text-gray-500 hover:text-red-400 text-sm transition-colors"
                >
                  Delete
                </button>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
