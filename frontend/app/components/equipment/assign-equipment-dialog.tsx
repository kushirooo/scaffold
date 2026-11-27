'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { ApiError } from '@/lib/api';
import { fetchProjects } from '@/services/projectService';
import type { Project } from '@/types/project';
import type { CreateEquipmentAssignmentInput, Equipment } from '@/types/equipment';

type AssignEquipmentDialogProps = {
  equipment: Equipment;
  submitting: boolean;
  submitError: string | null;
  onClose: () => void;
  onAssign: (input: CreateEquipmentAssignmentInput) => Promise<void>;
};

const INPUT_CLASS =
  'h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-brand-navy focus:ring-2 focus:ring-brand-navy/10';
const LABEL_CLASS = 'mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-600';

function localDateString(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  return error instanceof Error ? error.message : 'Unable to load your projects.';
}

export default function AssignEquipmentDialog({
  equipment,
  submitting,
  submitError,
  onClose,
  onAssign,
}: AssignEquipmentDialogProps) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectsLoading, setProjectsLoading] = useState(true);
  const [projectsError, setProjectsError] = useState<string | null>(null);
  const [projectId, setProjectId] = useState('');
  const [checkoutDate, setCheckoutDate] = useState('');
  const [expectedReturnDate, setExpectedReturnDate] = useState('');
  const [validationError, setValidationError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const loadProjects = async () => {
      setProjectsLoading(true);
      setProjectsError(null);
      try {
        // Sprint 2 contract: GET /projects returns the PM's non-archived projects.
        const result = await fetchProjects();
        if (cancelled) return;
        const activeProjects = result.filter((project) => !project.isArchived);
        setProjects(activeProjects);
        setProjectId((current) => current || activeProjects[0]?.id || '');
      } catch (error) {
        if (!cancelled) setProjectsError(getMessage(error));
      } finally {
        if (!cancelled) setProjectsLoading(false);
      }
    };

    void loadProjects();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setValidationError(null);

    if (!projectId) {
      setValidationError('Select a project before assigning this equipment.');
      return;
    }

    const today = localDateString();
    if (checkoutDate && checkoutDate > today) {
      setValidationError('Checkout date cannot be after today.');
      return;
    }

    const effectiveCheckoutDate = checkoutDate || today;
    if (expectedReturnDate && expectedReturnDate < effectiveCheckoutDate) {
      setValidationError('Expected return date cannot be before the checkout date.');
      return;
    }

    const input: CreateEquipmentAssignmentInput = { projectId };
    // Leave checkoutDate omitted when blank so the backend applies APP_TIMEZONE's today.
    if (checkoutDate) input.checkoutDate = checkoutDate;
    if (expectedReturnDate) input.expectedReturnDate = expectedReturnDate;
    await onAssign(input);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !submitting) onClose();
      }}
    >
      <section
        aria-labelledby="assign-equipment-dialog-title"
        aria-modal="true"
        className="w-full max-w-xl rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl sm:p-8"
        role="dialog"
      >
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <h2 id="assign-equipment-dialog-title" className="text-xl font-semibold text-slate-900">
              Assign Equipment
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Assign <span className="font-semibold text-slate-700">{equipment.name}</span> to one of your projects.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            aria-label="Close assignment form"
            className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 disabled:opacity-50"
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
              <path d="m6 6 12 12M18 6 6 18" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label htmlFor="equipment-project" className={LABEL_CLASS}>Project <span className="text-red-500">*</span></label>
            <select
              id="equipment-project"
              required
              value={projectId}
              onChange={(event) => setProjectId(event.target.value)}
              disabled={projectsLoading || projects.length === 0 || submitting}
              className={INPUT_CLASS}
            >
              {projectsLoading ? <option value="">Loading your projects…</option> : null}
              {!projectsLoading && projects.length === 0 ? <option value="">No available projects</option> : null}
              {projects.map((project) => (
                <option key={project.id} value={project.id}>{project.name}</option>
              ))}
            </select>
            <p className="mt-1.5 text-xs text-slate-500">Only projects owned by you and not archived are listed.</p>
            {projectsError && <p className="mt-2 text-sm text-red-700" role="alert">{projectsError}</p>}
            {!projectsLoading && !projectsError && projects.length === 0 && (
              <p className="mt-2 text-sm text-amber-700">Create or activate a project before assigning equipment.</p>
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="equipment-checkout-date" className={LABEL_CLASS}>Checkout Date</label>
              <input
                id="equipment-checkout-date"
                type="date"
                value={checkoutDate}
                max={localDateString()}
                onChange={(event) => setCheckoutDate(event.target.value)}
                disabled={submitting}
                className={INPUT_CLASS}
              />
              <p className="mt-1.5 text-xs text-slate-500">Leave blank to use today.</p>
            </div>
            <div>
              <label htmlFor="equipment-return-date" className={LABEL_CLASS}>Expected Return Date</label>
              <input
                id="equipment-return-date"
                type="date"
                min={checkoutDate || localDateString()}
                value={expectedReturnDate}
                onChange={(event) => setExpectedReturnDate(event.target.value)}
                disabled={submitting}
                className={INPUT_CLASS}
              />
              <p className="mt-1.5 text-xs text-slate-500">Optional.</p>
            </div>
          </div>

          {(validationError || submitError) && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800" role="alert">
              {validationError || submitError}
            </div>
          )}

          <div className="flex flex-col-reverse gap-3 border-t border-slate-100 pt-5 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="rounded-lg border border-slate-300 px-5 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || projectsLoading || projects.length === 0 || Boolean(projectsError)}
              className="rounded-lg bg-brand-navy px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-navy-raised disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitting ? 'Assigning…' : 'Confirm Assignment'}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
