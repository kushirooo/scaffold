'use client';

import React, { useState, useEffect, useMemo, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Project } from '../../types/project';
import {
  fetchProject,
  fetchArchivedProjects,
  archiveProject,
  restoreProject,
  fetchProjects,
} from '../../services/projectService';
import {
  RESTORE_WINDOW_DAYS,
  isRestoreExpired,
  restoreDeadline,
  restoreStatusLabel,
} from '../../lib/projects';

const CARD_TITLE = 'text-xl font-semibold text-slate-900';

const ALL_STATUSES = 'All statuses';
const SELECT_CLASS =
  'h-9 rounded-lg border border-slate-200 bg-white px-3 text-xs text-slate-600 outline-none focus:border-[#58779d]';

type ViewMode = 'cards' | 'table';
type SortKey = 'updated-desc' | 'updated-asc' | 'name-asc';

type IconName = 'refresh' | 'clipboard' | 'search' | 'list' | 'grid';

function Icon({
  name,
  className = 'h-4 w-4',
}: {
  name: IconName;
  className?: string;
}) {
  const common = {
    className,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true as const,
  };
  const paths: Record<IconName, ReactNode> = {
    refresh: (
      <>
        <path d="M20 7v5h-5M4 17v-5h5" />
        <path d="M5.5 9A7 7 0 0 1 18 6l2 2M4 16l2 2a7 7 0 0 0 12.5-3" />
      </>
    ),
    clipboard: (
      <>
        <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
        <rect x="8" y="2" width="8" height="4" rx="1" />
      </>
    ),
    search: (
      <>
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-4-4" />
      </>
    ),
    list: (
      <>
        <path d="M8 6h13M8 12h13M8 18h13" />
        <path d="M3 6h.01M3 12h.01M3 18h.01" />
      </>
    ),
    grid: (
      <>
        <rect x="3" y="3" width="7" height="7" rx="1" />
        <rect x="14" y="3" width="7" height="7" rx="1" />
        <rect x="3" y="14" width="7" height="7" rx="1" />
        <rect x="14" y="14" width="7" height="7" rx="1" />
      </>
    ),
  };
  return <svg {...common}>{paths[name]}</svg>;
}

function statusClasses(status: string) {
  if (status === 'Completed') return 'bg-status-completed-bg text-status-completed-dot';
  if (status === 'On Hold') return 'bg-amber-100 text-amber-800';
  return 'bg-blue-100 text-blue-800';
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString();
}

export default function ProjectsPage() {
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>([]);
  const [activeTab, setActiveTab] = useState<'active' | 'archived'>('active');
  const [loading, setLoading] = useState<boolean>(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [deleteModalId, setDeleteModalId] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<Project['status'] | typeof ALL_STATUSES>(
    ALL_STATUSES,
  );
  const [sortKey, setSortKey] = useState<SortKey>('updated-desc');
  const [viewMode, setViewMode] = useState<ViewMode>('cards');

  const isArchivedTab = activeTab === 'archived';

  const activeProj = projects.filter((p) => !p.isArchived).length;
  const inactiveProj = projects.filter((p) => p.status == 'On Hold').length;
  const completedProj = projects.filter((p) => p.status == 'Completed').length;

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

  // Status options come from the loaded data, so nothing here is hardcoded.
  const statusOptions = useMemo(
    () => Array.from(new Set(projects.map((p) => p.status))).sort(),
    [projects],
  );
  // If the selected status no longer exists (tab switch / refresh), fall back to "all".
  const effectiveStatus =
    statusFilter !== ALL_STATUSES && statusOptions.includes(statusFilter)
      ? statusFilter
      : ALL_STATUSES;
  const hasFilters = query.trim() !== '' || effectiveStatus !== ALL_STATUSES;

  const filteredProjects = useMemo(() => {
    const q = query.trim().toLowerCase();
    const matches = projects.filter((p) => {
      const matchesQuery =
        !q || `${p.name} ${p.description ?? ''} ${p.id}`.toLowerCase().includes(q);
      const matchesStatus = effectiveStatus === ALL_STATUSES || p.status === effectiveStatus;
      return matchesQuery && matchesStatus;
    });
    return [...matches].sort((a, b) => {
      if (sortKey === 'name-asc') return a.name.localeCompare(b.name);
      const diff = new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime();
      return sortKey === 'updated-asc' ? diff : -diff;
    });
  }, [projects, query, effectiveStatus, sortKey]);

  const clearFilters = () => {
    setQuery('');
    setStatusFilter(ALL_STATUSES);
  };

  const switchTab = (tab: 'active' | 'archived') => {
    if (tab === activeTab) return; // same tab: the load effect would not re-run, so don't start loading
    setLoading(true);
    setStatusFilter(ALL_STATUSES);
    setActiveTab(tab);
  };

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

  const getRestoreState = (project: Project) => {
    const deadline = restoreDeadline(project.archivedAt);
    const canRestore = deadline !== null && !isRestoreExpired(project.archivedAt);
    return { deadline, canRestore };
  };

  const renderRestoreButton = (project: Project) => {
    const { deadline, canRestore } = getRestoreState(project);
    return (
      <button
        type="button"
        onClick={() => void handleRestore(project.id)}
        disabled={!canRestore}
        className="px-3 py-1 text-xs rounded bg-emerald-50 text-emerald-700 hover:bg-emerald-100 font-medium disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-emerald-50"
      >
        {!canRestore ? (deadline === null ? 'Restore unavailable' : 'Restore expired') : 'Restore'}
      </button>
    );
  };

  const renderEditDelete = (project: Project) => (
    <>
      <Link
        href={`/projects/${project.id}/edit`}
        className="px-3 py-1 text-xs rounded border text-slate-500 border-slate-300 hover:bg-slate-50 font-medium"
      >
        Edit
      </Link>
      <button
        type="button"
        onClick={() => setDeleteModalId(project.id)}
        className="px-3 py-1 text-xs rounded bg-red-600 text-white hover:bg-red-700 font-medium"
      >
        Delete
      </button>
    </>
  );

  const renderCard = (project: Project) => {
    const { canRestore } = getRestoreState(project);
    return (
      <div
        key={project.id}
        className="group relative bg-white p-6 rounded-2xl shad1-sm hover:shadow-md transition-shadow flex flex-col justify-between hover:-translate-y-1"
      >
        <div>
          <div className="flex justify-between items-start mb-3">
            <span className={`px-3 py-1 rounded-full text-xs font-mono font-medium ${statusClasses(project.status)}`}>
              {project.status}
            </span>
            <span className="text-xs font-mono text-slate-400">
              Updated: {formatDate(project.updatedAt)}
            </span>
          </div>

          {/* Archived projects are not readable through GET /projects/:id, so
              the archived card must not link anywhere that would 404. */}
          {isArchivedTab ? (
            <h2 className={CARD_TITLE}>{project.name}</h2>
          ) : (
            <Link
              href={`/projects/${project.id}`}
              // Stretched link: the ::after layer covers the whole card (it is `relative`),
              // so clicking anywhere on the card opens the project.
              className="after:absolute after:inset-0 after:rounded-2xl focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-brand-navy"
            >
              <h2 className={`${CARD_TITLE} group-hover:text-brand-navy transition`}>
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
            {renderRestoreButton(project)}
          </div>
        ) : (
          <div className="mt-6 pt-4 border-t border-slate-100 flex justify-between items-center">
            {/* Visual cue only: the title link above already makes the card clickable,
                so this isn't a second link to tab through. */}
            <span
              aria-hidden="true"
              className="text-xs font-mono font-semibold text-brand-navy group-hover:underline"
            >
              View Details &rarr;
            </span>

            {/* relative z-10 lifts these above the card-wide link layer */}
            <div className="relative z-10 flex gap-2">{renderEditDelete(project)}</div>
          </div>
        )}
      </div>
    );
  };

  const renderRow = (project: Project) => {
    const { canRestore } = getRestoreState(project);
    return (
      <tr
        key={project.id}
        onClick={isArchivedTab ? undefined : () => router.push(`/projects/${project.id}`)}
        className={`transition hover:bg-slate-50/70 ${isArchivedTab ? '' : 'cursor-pointer'}`}
      >
        <td className="px-5 py-3.5">
          {isArchivedTab ? (
            <p className="max-w-[340px] truncate text-sm font-semibold text-slate-900">{project.name}</p>
          ) : (
            <Link
              href={`/projects/${project.id}`}
              onClick={(e) => e.stopPropagation()}
              className="block max-w-[340px] truncate text-sm font-semibold text-slate-900 hover:text-brand-navy"
            >
              {project.name}
            </Link>
          )}
          <p className="mt-0.5 max-w-[340px] truncate text-xs text-slate-500">{project.description}</p>
        </td>
        <td className="px-4 py-3.5">
          <span className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-mono font-medium ${statusClasses(project.status)}`}>
            {project.status}
          </span>
        </td>
        <td className="px-4 py-3.5 text-xs text-slate-500">{formatDate(project.updatedAt)}</td>
        {isArchivedTab ? (
          <td className="px-4 py-3.5">
            <p className={`text-xs font-mono ${canRestore ? 'text-slate-500' : 'text-danger-text'}`}>
              {restoreStatusLabel(project.archivedAt)}
            </p>
          </td>
        ) : null}
        <td className="px-5 py-3.5" onClick={(e) => e.stopPropagation()}>
          <div className="flex items-center justify-end gap-2">
            {isArchivedTab ? renderRestoreButton(project) : renderEditDelete(project)}
          </div>
        </td>
      </tr>
    );
  };

  return (
    <div className="min-h-screen bg-canvas text-slate-800">
      <main className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-7 sm:py-8 lg:px-9">
        <header className="mb-6 flex flex-col justify-between gap-4 xl:flex-row xl:items-end">
          <div>
            <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.18em] text-[#54708f]">
              Project Manager / Projects
            </p>
            <h1 className="text-2xl font-bold tracking-tight text-[#142b50] sm:text-[28px]">
              Project Management
            </h1>
            <p className="mt-1.5 max-w-2xl text-sm text-slate-500">
              Manage projects across RAF Consult.
            </p>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setLoading(true);
                  setRefreshKey((key) => key + 1);
                }}
                disabled={loading}
                className="inline-flex items-center gap-2 rounded-lg  bg-white px-3.5 py-2.5 text-xs font-semibold text-slate-600 shadow-sm transition hover:bg-slate-50 disabled:opacity-50 hover:-translate-y-1"

              >
                {loading ? 'Refreshing…' : 'Refresh'}
              </button>

              <Link
                href="/projects/new"
                className="inline-flex items-center gap-2 rounded-lg bg-brand-navy px-4 py-2.5 text-xs font-semibold text-white shadow-sm transition hover:bg-brand-navy-raised hover:-translate-y-1"
              >
                + New Project
              </Link>
            </div>
          </div>
        </header>

        {/* Tabs */}
        <div className="mb-5 flex w-fit items-center gap-1 rounded-xl border border-slate-200 bg-white p-1">
          <button
            type="button"
            onClick={() => switchTab('active')}
            aria-current={activeTab === 'active' ? 'page' : undefined}
            className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-semibold transition ${activeTab === 'active' ? 'bg-[#eaf0f8] text-[#18365f]' : 'text-slate-500 hover:bg-slate-50'}`}
          >
            Active Projects
          </button>
          <button
            type="button"
            onClick={() => switchTab('archived')}
            aria-current={activeTab === 'archived' ? 'page' : undefined}
            className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-semibold transition ${activeTab === 'archived' ? 'bg-[#eaf0f8] text-[#18365f]' : 'text-slate-500 hover:bg-slate-50'}`}
          >
            Archived Folder
          </button>
        </div>

        <section className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard label="Total Project" value={projects.length} />
          <StatCard label="Active projects" value={activeProj} tone="purple" />
          <StatCard label="On hold projects" value={inactiveProj} tone="amber" />
          <StatCard label="Completed projects" value={completedProj} tone="green" />
        </section>

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
        ) : (
          <>
            {/* Search / filter / view toolbar */}
            <section className="mb-5 flex flex-col gap-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm shadow-slate-900/[0.025] sm:p-5 xl:flex-row xl:items-center xl:justify-between">
              <div>
                <h2 className="text-sm font-bold text-slate-900">
                  {isArchivedTab ? 'Archived projects' : 'Active projects'}
                </h2>
                <p className="mt-1 text-xs text-slate-500">
                  {filteredProjects.length}{' '}
                  {filteredProjects.length === 1 ? 'project' : 'projects'}{' '}
                  {hasFilters ? 'match the current filters' : 'in this section'}
                </p>
              </div>

              <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
                <div className="relative min-w-0 sm:w-56">
                  <Icon
                    name="search"
                    className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
                  />
                  <input
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Search name, description or ID"
                    aria-label="Search projects"
                    className="h-9 w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 text-xs outline-none transition placeholder:text-slate-400 focus:border-[#58779d] focus:ring-2 focus:ring-blue-100"
                  />
                </div>

                <select
                  value={effectiveStatus}
                  onChange={(event) =>
                    setStatusFilter(event.target.value as Project['status'] | typeof ALL_STATUSES)
                  }
                  aria-label="Filter by status"
                  className={SELECT_CLASS}
                >
                  <option>{ALL_STATUSES}</option>
                  {statusOptions.map((status) => (
                    <option key={status}>{status}</option>
                  ))}
                </select>

                <select
                  value={sortKey}
                  onChange={(event) => setSortKey(event.target.value as SortKey)}
                  aria-label="Sort projects"
                  className={SELECT_CLASS}
                >
                  <option value="updated-desc">Recently updated</option>
                  <option value="updated-asc">Oldest updated</option>
                  <option value="name-asc">Name A–Z</option>
                </select>

                <div className="flex w-fit items-center rounded-lg border border-slate-200 p-0.5">
                  <button
                    type="button"
                    onClick={() => setViewMode('table')}
                    aria-label="List view"
                    aria-pressed={viewMode === 'table'}
                    className={`rounded-xl p-1.5 ${viewMode === 'table' ? 'bg-[#eaf0f8] text-[#18365f]' : 'text-slate-400 hover:text-slate-700'}`}
                  >
                    <Icon name="list" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setViewMode('cards')}
                    aria-label="Tile view"
                    aria-pressed={viewMode === 'cards'}
                    className={`rounded-xl p-1.5 ${viewMode === 'cards' ? 'bg-[#eaf0f8] text-[#18365f]' : 'text-slate-400 hover:text-slate-700'}`}
                  >
                    <Icon name="grid" />
                  </button>
                </div>
              </div>
            </section>

            {/* Projects list / grid */}
            {loading ? (
              <div className="flex min-h-[260px] flex-col items-center justify-center gap-3 text-slate-400">
                <span className="h-7 w-7 animate-spin rounded-full border-2 border-slate-200 border-t-[#18365f]" />
                <p className="text-xs">Loading projects…</p>
              </div>
            ) : projects.length === 0 ? (
              <div className="py-12 text-center text-slate-500 border border-dashed rounded-xl bg-white">
                {isArchivedTab
                  ? 'No archived projects. Projects stay restorable here for 30 days.'
                  : 'No projects found in this section.'}
              </div>
            ) : filteredProjects.length === 0 ? (
              <div className="flex min-h-[220px] flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-white px-5 text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-400">
                  <Icon name="search" className="h-5 w-5" />
                </div>
                <h3 className="mt-3 text-sm font-semibold text-slate-800">No projects found</h3>
                <p className="mt-1 max-w-sm text-xs text-slate-500">
                  Nothing matches your search or filters. Try different keywords or clear the filters.
                </p>
                <button
                  type="button"
                  onClick={clearFilters}
                  className="mt-4 rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                >
                  Clear filters
                </button>
              </div>
            ) : viewMode === 'cards' ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {filteredProjects.map(renderCard)}
              </div>
            ) : (
              <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm shadow-slate-900/[0.025]">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[720px] border-collapse text-left">
                    <thead>
                      <tr className="bg-[#f8fafc] text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">
                        <th className="px-5 py-3.5">Project</th>
                        <th className="px-4 py-3.5">Status</th>
                        <th className="px-4 py-3.5">Updated</th>
                        {isArchivedTab ? <th className="px-4 py-3.5">Restore window</th> : null}
                        <th className="px-5 py-3.5 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filteredProjects.map(renderRow)}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}
      </main>

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

function StatCard({
  label,
  value,
  tone = 'blue',
}: {
  label: string;
  value: number;
  tone?: 'blue' | 'green' | 'amber' | 'purple';
}) {
  const tones = {
    blue: 'bg-blue-50 text-blue-700',
    green: 'bg-emerald-50 text-emerald-700',
    amber: 'bg-amber-50 text-amber-700',
    purple: 'bg-violet-50 text-violet-700',
  };
  return (
    <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm shadow-slate-900/[0.02]">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium text-slate-500">{label}</p>
          <p className="mt-2 text-[27px] font-bold tracking-tight text-[#142b50]">{value}</p>
        </div>
        <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${tones[tone]}`}>
          <Icon name="clipboard" className="h-5 w-5" />
        </div>
      </div>
    </article>
  );
}
