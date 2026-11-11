'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { Project } from '../../types/project';
import { fetchProjects, fetchArchivedProjects, softDeleteProject, restoreProject } from '../../services/projectService';

export default function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [activeTab, setActiveTab] = useState<'active' | 'archived'>('active');
  const [loading, setLoading] = useState<boolean>(true);
  const [deleteModalId, setDeleteModalId] = useState<string | null>(null);

  useEffect(() => {
    loadProjects();
  }, [activeTab]);

  const loadProjects = async () => {
    setLoading(true);
    try {
      if (activeTab === 'active') {
        const data = await fetchProjects();
        setProjects(data.filter((p) => !p.isArchived));
      } else {
        const data = await fetchArchivedProjects();
        setProjects(data);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await softDeleteProject(id);
      setDeleteModalId(null);
      loadProjects();
    } catch (err) {
      console.error(err);
    }
  };

  const handleRestore = async (id: string) => {
    try {
      await restoreProject(id);
      loadProjects();
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="p-8 max-w-7xl mx-auto font-sans" style={{ backgroundColor: '#F5F7FF', minHeight: '100vh' }}>
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-light text-slate-900">Projects</h1>
          <p className="text-sm font-mono text-slate-500 mt-1">Organize and manage multiple initiatives effectively</p>
        </div>
        <Link
          href="/projects/new"
          className="px-5 py-2.5 rounded-lg text-white font-medium text-sm transition"
          style={{ backgroundColor: '#08086F' }}
        >
          + New Project
        </Link>
      </div>

      {/* Tabs */}
      <div className="flex gap-4 mb-6 border-b border-slate-200 pb-2">
        <button
          onClick={() => setActiveTab('active')}
          className={`pb-2 px-3 text-sm font-medium ${
            activeTab === 'active' ? 'border-b-2 text-[#08086F] border-[#08086F]' : 'text-slate-500'
          }`}
        >
          Active Projects
        </button>
        <button
          onClick={() => setActiveTab('archived')}
          className={`pb-2 px-3 text-sm font-medium ${
            activeTab === 'archived' ? 'border-b-2 text-[#08086F] border-[#08086F]' : 'text-slate-500'
          }`}
        >
          Archived Folder
        </button>
      </div>

      {/* Projects List / Grid */}
      {loading ? (
        <div className="py-12 text-center text-slate-500">Loading projects...</div>
      ) : projects.length === 0 ? (
        <div className="py-12 text-center text-slate-500 border border-dashed rounded-xl bg-white">
          No projects found in this section.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {projects.map((project) => (
            <div
              key={project.id}
              className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 flex flex-col justify-between"
            >
              <div>
                <div className="flex justify-between items-start mb-3">
                  <span
                    className={`px-3 py-1 rounded-full text-xs font-mono font-medium ${
                      project.status === 'Completed'
                        ? 'bg-[#7FCBA7] text-[#009951]'
                        : project.status === 'On Hold'
                        ? 'bg-amber-100 text-amber-800'
                        : 'bg-blue-100 text-blue-800'
                    }`}
                  >
                    {project.status}
                  </span>
                  <span className="text-xs font-mono text-slate-400">
                    Updated: {new Date(project.updatedAt).toLocaleDateString()}
                  </span>
                </div>

                <Link href={`/projects/${project.id}`}>
                  <h2 className="text-xl font-semibold text-slate-900 hover:text-[#08086F] transition">
                    {project.name}
                  </h2>
                </Link>
                <p className="text-sm text-slate-600 mt-2 line-clamp-2">{project.description}</p>
              </div>

              <div className="mt-6 pt-4 border-t border-slate-100 flex justify-between items-center">
                <Link
                  href={`/projects/${project.id}`}
                  className="text-xs font-mono font-semibold text-[#08086F] hover:underline"
                >
                  View Details &rarr;
                </Link>

                <div className="flex gap-2">
                  {activeTab === 'archived' ? (
                    <button
                      onClick={() => handleRestore(project.id)}
                      className="px-3 py-1 text-xs rounded bg-emerald-50 text-emerald-700 hover:bg-emerald-100 font-medium"
                    >
                      Restore
                    </button>
                  ) : (
                    <>
                      <Link
                        href={`/projects/${project.id}/edit`}
                        className="px-3 py-1 text-xs rounded border border-slate-300 hover:bg-slate-50 font-medium"
                      >
                        Edit
                      </Link>
                      <button
                        onClick={() => setDeleteModalId(project.id)}
                        className="px-3 py-1 text-xs rounded bg-red-600 text-white hover:bg-red-700 font-medium"
                      >
                        Delete
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteModalId && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-[#001630] text-white p-6 rounded-2xl max-w-md w-full shadow-2xl">
            <h3 className="text-xl font-serif italic mb-2">Move to Archived Folder?</h3>
            <p className="text-sm text-slate-300 mb-6">
              This project will be soft-deleted and moved to the Archived folder. You can restore it within 30 days.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setDeleteModalId(null)}
                className="px-4 py-2 text-sm rounded-md border border-slate-600 text-slate-200 hover:bg-slate-800"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDelete(deleteModalId)}
                className="px-4 py-2 text-sm rounded-md bg-red-600 text-white font-medium hover:bg-red-700"
              >
                Confirm Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}