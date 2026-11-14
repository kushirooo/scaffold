'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ProjectStatus } from '@/types/project';
import { createProject } from '@/services/projectService';
import { toProjectApiError, type ProjectApiError } from '@/lib/projects';

export default function CreateProjectPage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [budget, setBudget] = useState('');
  const [status, setStatus] = useState<ProjectStatus>('Active');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<ProjectApiError | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setFormError(null);

    try {
      await createProject({
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
      setFormError(toProjectApiError(err, 'Failed to create project.'));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="p-8 max-w-3xl mx-auto font-sans min-h-screen bg-canvas">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-light text-slate-900">Create New Project</h1>
          <p className="text-sm font-mono text-slate-500 mt-1">Set up project timeline, budget, and details</p>
        </div>
        <Link href="/projects" className="text-sm font-mono text-slate-600 hover:underline">
          &larr; Back to Projects
        </Link>
      </div>

      <form onSubmit={handleSubmit} className="bg-white p-8 rounded-2xl shadow-sm border border-slate-200 space-y-6">
        {formError && (
          <div className="rounded-lg border border-danger/40 bg-danger-subtle p-3 text-sm text-danger-text" role="alert">
            {formError.details.length > 0 ? (
              <ul className="list-disc space-y-1 pl-5">
                {formError.details.map((detail, index) => (
                  <li key={`${index}-${detail}`}>{detail}</li>
                ))}
              </ul>
            ) : (
              <p>{formError.message}</p>
            )}
          </div>
        )}
        <div>
          <label className="block text-xs font-mono font-semibold uppercase text-slate-700 mb-2">Project Name</label>
          <input
            type="text"
            required
            placeholder="e.g., Enterprise Portal Migration"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full px-4 py-2.5 rounded-lg border border-slate-300 text-slate-900 focus:outline-none focus:ring-2 focus:ring-brand-navy"
          />
        </div>

        <div>
          <label className="block text-xs font-mono font-semibold uppercase text-slate-700 mb-2">Description</label>
          <textarea
            required
            rows={4}
            placeholder="Describe objectives and scope..."
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="w-full px-4 py-2.5 rounded-lg border border-slate-300 text-slate-900 focus:outline-none focus:ring-2 focus:ring-brand-navy"
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
              className="w-full px-4 py-2.5 rounded-lg border border-slate-300 text-slate-900 focus:outline-none focus:ring-2 focus:ring-brand-navy"
            />
          </div>

          <div>
            <label className="block text-xs font-mono font-semibold uppercase text-slate-700 mb-2">End Date</label>
            <input
              type="date"
              required
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full px-4 py-2.5 rounded-lg border border-slate-300 text-slate-900 focus:outline-none focus:ring-2 focus:ring-brand-navy"
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
              step="0.01"
              value={budget}
              onChange={(e) => setBudget(e.target.value)}
              className="w-full px-4 py-2.5 rounded-lg border border-slate-300 text-slate-900 focus:outline-none focus:ring-2 focus:ring-brand-navy"
            />
          </div>

          <div>
            <label className="block text-xs font-mono font-semibold uppercase text-slate-700 mb-2">Initial Status</label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as ProjectStatus)}
              className="w-full px-4 py-2.5 rounded-lg border border-slate-300 text-slate-900 focus:outline-none focus:ring-2 focus:ring-brand-navy"
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
            className="px-6 py-2.5 rounded-lg bg-brand-navy hover:bg-brand-navy-raised text-white font-medium text-sm transition disabled:opacity-60"
          >
            {isSubmitting ? 'Saving...' : 'Save Project'}
          </button>
        </div>
      </form>
    </div>
  );
}
