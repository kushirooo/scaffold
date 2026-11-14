'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { Project } from '../../types/project';
import {
  fetchProjects,
  fetchArchivedProjects,
  archiveProject,
  restoreProject,
} from '../../services/projectService';
import {
  RESTORE_WINDOW_DAYS,
  isRestoreExpired,
  restoreDeadline,
  restoreStatusLabel,
} from '../../lib/projects';

const CARD_TITLE = 'text-xl font-semibold text-slate-900';
const TAB_ACTIVE = 'pb-2 px-3 text-sm font-medium border-b-2 text-brand-navy border-brand-navy';
const TAB_INACTIVE = 'pb-2 px-3 text-sm font-medium text-slate-500';

export default function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [activeTab, setActiveTab] = useState<'active' | 'archived'>('active');
  const [loading, setLoading] = useState<boolean>(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [deleteModalId, setDeleteModalId] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setErrorMessage(null);
      try {
        const data = activeTab === 'active'
          ? await fetchProjects()
          : await fetchArchivedProjects();
        if (!cancelled) {
          setProjects(activeTab === 'active' ? data.filter((p) => !p.isArchived) : data);
        }
      } catch (err) {
        console.error(err);
        if (!cancelled) {
          setErrorMessage(err instanceof Error ? err.message : 'Unable to load projects.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [activeTab, refreshKey]);

  const handleDelete = async (id: string) => {
    try {
      await archiveProject(id);
      setDeleteModalId(null);
      setLoading(true);
      setRefreshKey((key) => key + 1);
    } catch (err) {
      console.error(err);
      setErrorMessage(err instanceof Error ? err.message : 'Unable to archive this project.');
    }
  };

  const handleRestore = async (id: string) => {
    try {
      await restoreProject(id);
      setLoading(true);
      setRefreshKey((key) => key + 1);
    } catch (err) {
      console.error(err);
      setErrorMessage(err instanceof Error ? err.message : 'Unable to restore this project.');
    }
  };

  return (
    <div className="p-8 max-w-7xl mx-auto font-sans min-h-screen bg-canvas">
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-light text-slate-900">Projects</h1>
          <p className="text-sm font-mono text-slate-500 mt-1">Organize and manage multiple initiatives effectively</p>
        </div>
        <Link
          href="/projects/new"
          className="px-5 py-2.5 rounded-lg bg-brand-navy hover:bg-brand-navy-raised text-white font-medium text-sm transition"
        >
          + New Project
        </Link>
      </div>

      {/* Tabs */}
      <div className="flex gap-4 mb-6 border-b border-slate-200 pb-2">
        <button
          onClick={() => {
            setLoading(true);
            setActiveTab('active');
          }}
          className={activeTab === 'active' ? TAB_ACTIVE : TAB_INACTIVE}
        >
          Active Projects
        </button>
        <button
          onClick={() => {
            setLoading(true);
            setActiveTab('archived');
          }}
          className={activeTab === 'archived' ? TAB_ACTIVE : TAB_INACTIVE}
        >
          Archived Folder
        </button>
      </div>

      {/* Projects List / Grid */}
      {errorMessage ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800" role="alert">
          {errorMessage}
          <button
            type="button"
            onClick={() => {
              setLoading(true);
              setRefreshKey((key) => key + 1);
            }}
            className="ml-3 font-semibold underline"
          >
            Retry
          </button>
        </div>
      ) : loading ? (
        <div className="py-12 text-center text-slate-500">Loading projects...</div>
      ) : projects.length === 0 ? (
        <div className="py-12 text-center text-slate-500 border border-dashed rounded-xl bg-white">
          {activeTab === 'archived'
            ? 'No archived projects. Projects stay restorable here for 30 days.'
            : 'No projects found in this section.'}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {projects.map((project) => {
            const isArchivedTab = activeTab === 'archived';
            const deadline = restoreDeadline(project.archivedAt);
            const expired = isRestoreExpired(project.archivedAt);
            const canRestore = deadline !== null && !expired;

            return (
              <div
                key={project.id}
                className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 flex flex-col justify-between"
              >
                <div>
                  <div className="flex justify-between items-start mb-3">
                    <span
                      className={`px-3 py-1 rounded-full text-xs font-mono font-medium ${
                        project.status === 'Completed'
                          ? 'bg-status-completed-bg text-status-completed-dot'
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

                  {/* Archived projects are not readable through GET /projects/:id, so
                      the archived card must not link anywhere that would 404. */}
                  {isArchivedTab ? (
                    <h2 className={CARD_TITLE}>{project.name}</h2>
                  ) : (
                    <Link href={`/projects/${project.id}`}>
                      <h2 className={`${CARD_TITLE} hover:text-brand-navy transition`}>
                        {project.name}
                      </h2>
                    </Link>
                  )}
                  <p className="text-sm text-slate-600 mt-2 line-clamp-2">{project.description}</p>
                </div>

                {isArchivedTab ? (
                  <div className="mt-6 pt-4 border-t border-slate-100 flex justify-between items-center gap-3">
                    <p className={`text-xs font-mono ${canRestore ? 'text-slate-500' : 'text-danger-text'}`}>
                      {restoreStatusLabel(project.archivedAt)}
                    </p>
                    <button
                      type="button"
                      onClick={() => void handleRestore(project.id)}
                      disabled={!canRestore}
                      className="px-3 py-1 text-xs rounded bg-emerald-50 text-emerald-700 hover:bg-emerald-100 font-medium disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-emerald-50"
                    >
                      {!canRestore ? (deadline === null ? 'Restore unavailable' : 'Restore expired') : 'Restore'}
                    </button>
                  </div>
                ) : (
                  <div className="mt-6 pt-4 border-t border-slate-100 flex justify-between items-center">
                    <Link
                      href={`/projects/${project.id}`}
                      className="text-xs font-mono font-semibold text-brand-navy hover:underline"
                    >
                      View Details &rarr;
                    </Link>

                    <div className="flex gap-2">
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
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteModalId && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-dark-surface text-white p-6 rounded-2xl max-w-md w-full shadow-2xl">
            <h3 className="text-xl font-serif italic mb-2">Move to Archived Folder?</h3>
            <p className="text-sm text-slate-300 mb-6">
              This project will be soft-deleted and moved to the Archived folder. You can restore it
              within {RESTORE_WINDOW_DAYS} days.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setDeleteModalId(null)}
                className="px-4 py-2 text-sm rounded-md border border-slate-600 text-slate-200 hover:bg-slate-800"
              >
                Cancel
              </button>
              <button
                onClick={() => void handleDelete(deleteModalId)}
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
