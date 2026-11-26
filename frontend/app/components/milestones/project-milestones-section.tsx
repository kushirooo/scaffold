'use client';

import React, { useMemo, useState } from 'react';
import {
  CreateMilestoneInput,
  HEALTH_STATUS_LABELS,
  HealthStatus,
  Milestone,
} from '@/types/milestone';
import { createMilestone, updateMilestone } from '@/services/milestoneService';
import {
  buildCreateMilestonePayload,
  buildUpdateMilestonePayload,
  computeProjectMilestoneSummary,
  getMilestoneHealthStatus,
  MilestoneFormValues,
} from '@/lib/milestones';

interface ProjectMilestonesSectionProps {
  projectId: string;
  isProjectOwnerPM: boolean;
  milestones: Milestone[];
  loading: boolean;
  loadError: string | null;
  onRetry: () => void;
  onMilestonesChanged: () => void;
}

function healthBadgeClass(status: HealthStatus): string {
  if (status === 'RED') return 'bg-red-100 text-red-800 border-red-200';
  if (status === 'YELLOW') return 'bg-amber-100 text-amber-800 border-amber-200';
  return 'bg-emerald-100 text-emerald-800 border-emerald-200';
}

function healthDotClass(status: HealthStatus): string {
  if (status === 'RED') return 'bg-red-600';
  if (status === 'YELLOW') return 'bg-amber-500';
  return 'bg-emerald-600';
}

function progressBarClass(status: HealthStatus): string {
  if (status === 'RED') return 'bg-red-600';
  if (status === 'YELLOW') return 'bg-amber-500';
  return 'bg-emerald-600';
}

export default function ProjectMilestonesSection({
  projectId,
  isProjectOwnerPM,
  milestones,
  loading,
  loadError,
  onRetry,
  onMilestonesChanged,
}: ProjectMilestonesSectionProps) {
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [editingMilestone, setEditingMilestone] = useState<Milestone | null>(null);
  const [formValues, setFormValues] = useState<MilestoneFormValues>({
    name: '',
    description: '',
    targetDate: '',
  });
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState<boolean>(false);

  const summary = useMemo(
    () => computeProjectMilestoneSummary(milestones),
    [milestones],
  );

  const openCreateModal = () => {
    setEditingMilestone(null);
    setFormError(null);
    setFormValues({
      name: '',
      description: '',
      targetDate: '',
    });
    setIsModalOpen(true);
  };

  const openEditModal = (milestone: Milestone) => {
    setEditingMilestone(milestone);
    setFormError(null);
    setFormValues({
      name: milestone.name,
      description: milestone.description ?? '',
      targetDate: milestone.targetDate,
    });
    setIsModalOpen(true);
  };

  const closeModal = () => {
    if (submitting) return;
    setIsModalOpen(false);
    setEditingMilestone(null);
    setFormError(null);
  };

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isProjectOwnerPM || submitting) return;

    setFormError(null);
    const trimmedName = formValues.name.trim();

    if (!trimmedName) {
      setFormError('Milestone name is required.');
      return;
    }
    if (trimmedName.length > 150) {
      setFormError('Milestone name must be 150 characters or fewer.');
      return;
    }
    if (formValues.description.trim().length > 2000) {
      setFormError('Description must be 2000 characters or fewer.');
      return;
    }
    if (!formValues.targetDate) {
      setFormError('Enter a valid target date.');
      return;
    }

    setSubmitting(true);
    setFeedbackMessage(null);

    try {
      if (!editingMilestone) {
        const payload: CreateMilestoneInput = buildCreateMilestonePayload(formValues);
        const res = await createMilestone(projectId, payload);
        setFeedbackMessage(res.message);
      } else {
        const diff = buildUpdateMilestonePayload(editingMilestone, formValues);
        if (Object.keys(diff).length === 0) {
          setIsModalOpen(false);
          setEditingMilestone(null);
          return;
        }
        const res = await updateMilestone(editingMilestone.id, diff);
        setFeedbackMessage(res.message);
      }

      setIsModalOpen(false);
      setEditingMilestone(null);
      onMilestonesChanged();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Unable to save milestone.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="bg-white p-8 rounded-2xl border border-slate-200 shadow-sm mt-8">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h2 className="text-xl font-semibold text-slate-900">Project Milestones</h2>
          <p className="text-xs text-slate-500 mt-1">
            Timeline checkpoints with auto-computed task completion progress.
          </p>
        </div>

        {isProjectOwnerPM && (
          <button
            type="button"
            onClick={openCreateModal}
            className="self-start sm:self-auto px-4 py-2 rounded-lg bg-brand-navy hover:bg-brand-navy-raised text-white font-medium text-xs transition"
          >
            + Create Milestone
          </button>
        )}
      </div>

      {/* Project Summary Banner (US06 AC) */}
      {!loading && !loadError && milestones.length > 0 && (
        <div
          className="mb-6 p-4 rounded-xl bg-slate-50 border border-slate-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3"
          role="region"
          aria-label="Milestone summary"
        >
          <div>
            <p className="text-xs font-mono uppercase text-slate-500">Schedule Overview</p>
            <p className="text-base font-semibold text-slate-900 mt-0.5">
              {summary.summaryText}
            </p>
          </div>
          <div className="flex items-center gap-3 min-w-[200px]">
            <div className="flex-1 h-2.5 bg-slate-200 rounded-full overflow-hidden">
              <div
                className="h-full bg-brand-navy transition-all duration-300"
                style={{ width: `${summary.overallCompletionPercent}%` }}
              />
            </div>
            <span className="text-xs font-mono font-semibold text-slate-700">
              {summary.completedMilestones}/{summary.totalMilestones}
            </span>
          </div>
        </div>
      )}

      {feedbackMessage && (
        <div
          className="mb-4 p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm font-medium"
          role="status"
          aria-live="polite"
        >
          {feedbackMessage}
        </div>
      )}

      {loadError ? (
        <div
          className="p-4 rounded-xl border border-red-200 bg-red-50 text-sm text-red-800"
          role="alert"
        >
          {loadError}
          <button
            type="button"
            onClick={onRetry}
            className="ml-3 font-semibold underline"
          >
            Retry
          </button>
        </div>
      ) : loading ? (
        <p className="text-sm text-slate-500 py-6 text-center">Loading project milestones…</p>
      ) : milestones.length === 0 ? (
        <div className="py-10 text-center text-slate-500 border border-dashed border-slate-200 rounded-xl">
          <p className="text-sm">No milestones have been defined for this project yet.</p>
          {isProjectOwnerPM && (
            <p className="text-xs text-slate-400 mt-1">
              Click &ldquo;+ Create Milestone&rdquo; to set key project checkpoints.
            </p>
          )}
        </div>
      ) : (
        /* Project Timeline View */
        <ol className="relative border-l-2 border-slate-200 ml-3 space-y-6">
          {milestones.map((milestone) => {
            const health = getMilestoneHealthStatus(milestone);
            const isRed = health === 'RED';

            return (
              <li key={milestone.id} className="ml-6 relative">
                {/* Timeline node dot */}
                <span
                  aria-hidden="true"
                  className={`absolute -left-[31px] top-4 h-3.5 w-3.5 rounded-full ring-4 ring-white ${healthDotClass(health)}`}
                />

                <div
                  className={`p-5 rounded-xl border transition ${
                    isRed
                      ? 'bg-red-50/60 border-red-300'
                      : 'bg-white border-slate-200'
                  }`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-base font-semibold text-slate-900">
                          {milestone.name}
                        </h3>

                        <span
                          className={`inline-flex items-center gap-1.5 text-xs font-mono px-2.5 py-0.5 rounded-full border font-medium ${healthBadgeClass(health)}`}
                        >
                          <span
                            aria-hidden="true"
                            className={`h-1.5 w-1.5 rounded-full ${healthDotClass(health)}`}
                          />
                          {HEALTH_STATUS_LABELS[health]}
                        </span>

                        {isRed && (
                          <span className="text-[10px] font-mono font-bold uppercase px-2 py-0.5 rounded bg-red-100 text-red-800">
                            Overdue
                          </span>
                        )}

                        {milestone.isCompleted && (
                          <span className="text-[10px] font-mono font-bold uppercase px-2 py-0.5 rounded bg-emerald-100 text-emerald-800">
                            Completed
                          </span>
                        )}
                      </div>

                      {milestone.description && (
                        <p className="text-xs text-slate-600">{milestone.description}</p>
                      )}
                    </div>

                    <div className="flex items-center gap-3 shrink-0">
                      <div className="text-left sm:text-right">
                        <p className="text-[11px] font-mono uppercase text-slate-400">
                          Target Date
                        </p>
                        <p
                          className={`text-xs font-mono font-semibold ${
                            isRed ? 'text-red-700' : 'text-slate-800'
                          }`}
                        >
                          {milestone.targetDate}
                        </p>
                      </div>

                      {isProjectOwnerPM && (
                        <button
                          type="button"
                          onClick={() => openEditModal(milestone)}
                          className="px-3 py-1.5 text-xs rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 font-medium transition"
                        >
                          Edit
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Visual Progress Bar */}
                  <div className="mt-4">
                    <div className="flex items-center justify-between text-xs font-mono mb-1.5">
                      <span className="text-slate-600">
                        {milestone.completedTasks} of {milestone.totalTasks} tasks completed
                      </span>
                      <span
                        className={`font-semibold ${
                          isRed ? 'text-red-700' : 'text-slate-800'
                        }`}
                      >
                        {milestone.completionPercent}%
                      </span>
                    </div>
                    <div
                      className="w-full h-2.5 bg-slate-200 rounded-full overflow-hidden"
                      role="progressbar"
                      aria-valuenow={milestone.completionPercent}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-label={`${milestone.name} completion`}
                    >
                      <div
                        className={`h-full transition-all duration-300 ${progressBarClass(health)}`}
                        style={{ width: `${milestone.completionPercent}%` }}
                      />
                    </div>
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      )}

      {/* Create / Edit Milestone Modal (PM only) */}
      {isModalOpen && isProjectOwnerPM && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50"
          role="dialog"
          aria-modal="true"
          aria-labelledby="milestone-modal-title"
        >
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between mb-4">
              <h3 id="milestone-modal-title" className="text-lg font-semibold text-slate-900">
                {editingMilestone ? 'Edit Milestone' : 'Create New Milestone'}
              </h3>
              <button
                type="button"
                aria-label="Close milestone dialog"
                onClick={closeModal}
                disabled={submitting}
                className="text-slate-400 hover:text-slate-600 text-sm font-mono"
              >
                ✕
              </button>
            </div>

            {formError && (
              <div
                className="mb-4 p-3 rounded-lg border border-red-200 bg-red-50 text-xs text-red-800"
                role="alert"
              >
                {formError}
              </div>
            )}

            <form onSubmit={handleFormSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-mono font-semibold uppercase text-slate-700 mb-1">
                  Milestone Name <span className="text-red-600">*</span>
                </label>
                <input
                  type="text"
                  maxLength={150}
                  value={formValues.name}
                  onChange={(e) => setFormValues({ ...formValues, name: e.target.value })}
                  placeholder="e.g., Foundation complete"
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-slate-900 text-sm outline-none focus:border-brand-navy"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-mono font-semibold uppercase text-slate-700 mb-1">
                  Description
                </label>
                <textarea
                  rows={3}
                  maxLength={2000}
                  value={formValues.description}
                  onChange={(e) =>
                    setFormValues({ ...formValues, description: e.target.value })
                  }
                  placeholder="Optional scope or sign-off criteria..."
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-slate-900 text-sm outline-none focus:border-brand-navy"
                />
              </div>

              <div>
                <label className="block text-xs font-mono font-semibold uppercase text-slate-700 mb-1">
                  Target Date <span className="text-red-600">*</span>
                </label>
                <input
                  type="date"
                  value={formValues.targetDate}
                  onChange={(e) =>
                    setFormValues({ ...formValues, targetDate: e.target.value })
                  }
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-slate-900 text-sm outline-none focus:border-brand-navy"
                  required
                />
                <p className="text-[11px] text-slate-500 mt-1">
                  Completion % is calculated automatically from tasks linked to this milestone.
                </p>
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={closeModal}
                  disabled={submitting}
                  className="px-4 py-2 rounded-lg border border-slate-300 text-slate-700 text-xs font-medium hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2 rounded-lg bg-brand-navy hover:bg-brand-navy-raised text-white text-xs font-medium transition disabled:opacity-60"
                >
                  {submitting
                    ? 'Saving…'
                    : editingMilestone
                      ? 'Save Changes'
                      : 'Create Milestone'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  );
}