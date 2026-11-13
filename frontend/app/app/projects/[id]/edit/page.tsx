'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ProjectStatus } from '@/types/project';
import { fetchProject, updateProject } from '@/services/projectService';

export default function EditProjectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const router = useRouter();
  const [projectId, setProjectId] = useState<string>('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [budget, setBudget] = useState('');
  const [status, setStatus] = useState<ProjectStatus>('Active');
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    Promise.resolve(params).then((resolvedParams) => {
      setProjectId(resolvedParams.id);
    });
  }, [params]);

  useEffect(() => {
    if (!projectId) return;
    let cancelled = false;

    const load = async () => {
      try {
        const current = await fetchProject(projectId);
        if (cancelled) return;
        setErrorMessage(null);
        setName(current.name);
        setDescription(current.description);
        setStartDate(current.startDate || '');
        setEndDate(current.endDate || '');
        setBudget(current.budget?.toString() ?? '');
        setStatus(current.status);
      } catch (err) {
        console.error(err);
        if (!cancelled) {
          setErrorMessage(err instanceof Error ? err.message : 'Unable to load project.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      await updateProject(projectId, {
        name,
        description,
        startDate,
        endDate,
        budget: Number(budget),
        status,
      });
      router.push('/projects');
    } catch (err) {
      console.error(err);
      setErrorMessage(err instanceof Error ? err.message : 'Failed to update project.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading) {
    return <div className="p-8 text-center text-slate-500">Loading project details...</div>;
  }

  if (errorMessage && !name) {
    return (
      <main className="p-8 text-center text-slate-700" role="alert">
        <p>{errorMessage}</p>
        <Link href="/projects" className="mt-3 inline-block text-[#08086F] underline">
          Back to Projects
        </Link>
      </main>
    );
  }

  return (
    <div className="p-8 max-w-3xl mx-auto font-sans" style={{ minHeight: '100vh', backgroundColor: '#F5F7FF' }}>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-light text-slate-900">Edit Project</h1>
          <p className="text-sm font-mono text-slate-500 mt-1">Update timeline, status, or details</p>
        </div>
        <Link href="/projects" className="text-sm font-mono text-slate-600 hover:underline">
          &larr; Cancel
        </Link>
      </div>

      <form onSubmit={handleSubmit} className="bg-white p-8 rounded-2xl shadow-sm border border-slate-200 space-y-6">
        {errorMessage && (
          <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800" role="alert">
            {errorMessage}
          </p>
        )}
        <div>
          <label className="block text-xs font-mono font-semibold uppercase text-slate-700 mb-2">Project Name</label>
          <input
            type="text"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full px-4 py-2.5 rounded-lg border border-slate-300 text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#08086F]"
          />
        </div>

        <div>
          <label className="block text-xs font-mono font-semibold uppercase text-slate-700 mb-2">Description</label>
          <textarea
            required
            rows={4}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="w-full px-4 py-2.5 rounded-lg border border-slate-300 text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#08086F]"
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="block text-xs font-mono font-semibold uppercase text-slate-700 mb-2">Start Date</label>
            <input
              type="date"
              required
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full px-4 py-2.5 rounded-lg border border-slate-300 text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#08086F]"
            />
          </div>

          <div>
            <label className="block text-xs font-mono font-semibold uppercase text-slate-700 mb-2">End Date</label>
            <input
              type="date"
              required
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full px-4 py-2.5 rounded-lg border border-slate-300 text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#08086F]"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="block text-xs font-mono font-semibold uppercase text-slate-700 mb-2">Budget ($)</label>
            <input
              type="number"
              required
              min="0"
              value={budget}
              onChange={(e) => setBudget(e.target.value)}
              className="w-full px-4 py-2.5 rounded-lg border border-slate-300 text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#08086F]"
            />
          </div>

          <div>
            <label className="block text-xs font-mono font-semibold uppercase text-slate-700 mb-2">Status</label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as ProjectStatus)}
              className="w-full px-4 py-2.5 rounded-lg border border-slate-300 text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#08086F]"
            >
              <option value="Active">Active</option>
              <option value="On Hold">On Hold</option>
              <option value="Completed">Completed</option>
            </select>
          </div>
        </div>

        <div className="pt-4 flex justify-end gap-4 border-t border-slate-100">
          <Link
            href="/projects"
            className="px-5 py-2.5 rounded-lg border border-slate-300 text-slate-700 font-medium text-sm hover:bg-slate-50 transition"
          >
            Cancel
          </Link>
          <button
            type="submit"
            disabled={isSubmitting}
            className="px-6 py-2.5 rounded-lg text-white font-medium text-sm transition"
            style={{ backgroundColor: '#08086F' }}
          >
            {isSubmitting ? 'Saving...' : 'Update Project'}
          </button>
        </div>
      </form>
    </div>
  );
}
