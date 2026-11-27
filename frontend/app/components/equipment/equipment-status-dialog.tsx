'use client';

import { useState, type FormEvent } from 'react';
import type { Equipment, EquipmentStatus } from '@/types/equipment';

export type EquipmentStatusTarget = Exclude<EquipmentStatus, 'IN_USE'>;

interface EquipmentStatusDialogProps {
  equipment: Equipment;
  submitting: boolean;
  error: string | null;
  onClose: () => void;
  onConfirm: (status: EquipmentStatusTarget) => Promise<void>;
}

const STATUS_DETAILS: Record<EquipmentStatusTarget, { label: string; description: string }> = {
  AVAILABLE: {
    label: 'Available',
    description: 'The equipment is ready to be assigned to another project.',
  },
  MAINTENANCE: {
    label: 'Maintenance',
    description: 'The equipment needs repair or servicing and cannot be assigned.',
  },
};

function getAllowedTargets(status: EquipmentStatus): EquipmentStatusTarget[] {
  if (status === 'IN_USE') return ['AVAILABLE', 'MAINTENANCE'];
  if (status === 'AVAILABLE') return ['MAINTENANCE'];
  return ['AVAILABLE'];
}

function getStatusLabel(status: EquipmentStatus): string {
  if (status === 'IN_USE') return 'In Use';
  if (status === 'MAINTENANCE') return 'Maintenance';
  return 'Available';
}

function getStatusClasses(status: EquipmentStatus): string {
  if (status === 'IN_USE') return 'border-blue-200 bg-blue-50 text-blue-700';
  if (status === 'MAINTENANCE') return 'border-violet-200 bg-violet-50 text-violet-700';
  return 'border-emerald-200 bg-emerald-50 text-emerald-700';
}

export default function EquipmentStatusDialog({
  equipment,
  submitting,
  error,
  onClose,
  onConfirm,
}: EquipmentStatusDialogProps) {
  const allowedTargets = getAllowedTargets(equipment.status);
  const [selectedStatus, setSelectedStatus] = useState<EquipmentStatusTarget>(
    equipment.status === 'AVAILABLE' ? 'MAINTENANCE' : 'AVAILABLE',
  );

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting || !allowedTargets.includes(selectedStatus)) return;
    await onConfirm(selectedStatus);
  };

  const isReturning = equipment.status === 'IN_USE';
  const confirmLabel = submitting
    ? 'Updating…'
    : isReturning
      ? 'Confirm Return'
      : selectedStatus === 'MAINTENANCE'
        ? 'Mark Maintenance'
        : 'Set Available';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !submitting) onClose();
      }}
    >
      <section
        aria-labelledby="equipment-status-dialog-title"
        aria-modal="true"
        className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl sm:p-8"
        role="dialog"
      >
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Equipment status
            </p>
            <h2 id="equipment-status-dialog-title" className="mt-1 text-xl font-semibold text-slate-900">
              {isReturning ? 'Return Equipment' : 'Change Equipment Status'}
            </h2>
            <p className="mt-1 text-sm text-slate-600">{equipment.name}</p>
          </div>
          <button
            type="button"
            aria-label="Close status dialog"
            disabled={submitting}
            onClick={onClose}
            className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="m6 6 12 12M18 6 6 18" />
            </svg>
          </button>
        </div>

        <div className="mb-5 flex flex-wrap items-center gap-2 rounded-xl bg-slate-50 p-3">
          <span className="text-xs font-medium uppercase tracking-wide text-slate-500">Current status</span>
          <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${getStatusClasses(equipment.status)}`}>
            {getStatusLabel(equipment.status)}
          </span>
          {equipment.currentAssignment && (
            <span className="w-full text-xs text-slate-600 sm:w-auto">
              Assigned to {equipment.currentAssignment.projectName}
            </span>
          )}
        </div>

        {error && (
          <div className="mb-5 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800" role="alert">
            {error}
          </div>
        )}

        <form className="space-y-5" onSubmit={(event) => void handleSubmit(event)}>
          <fieldset disabled={submitting}>
            <legend className="mb-3 text-sm font-semibold text-slate-900">
              {isReturning ? 'Choose the equipment’s new status' : 'Select the new status'}
            </legend>
            <div className="space-y-3">
              {allowedTargets.map((target) => {
                const selected = selectedStatus === target;
                const details = STATUS_DETAILS[target];
                return (
                  <label
                    key={target}
                    className={`flex cursor-pointer items-start gap-3 rounded-xl border p-4 transition ${
                      selected
                        ? 'border-brand-navy bg-blue-50/60 ring-1 ring-brand-navy/20'
                        : 'border-slate-200 bg-white hover:border-slate-300'
                    } ${submitting ? 'cursor-not-allowed opacity-70' : ''}`}
                  >
                    <input
                      type="radio"
                      name="equipment-status"
                      value={target}
                      checked={selected}
                      onChange={() => setSelectedStatus(target)}
                      className="mt-1 h-4 w-4 accent-[#142b50]"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${getStatusClasses(target)}`}>
                          {details.label}
                        </span>
                        {target === 'AVAILABLE' && (
                          <span className="text-xs font-medium text-slate-500">Ready for use</span>
                        )}
                      </span>
                      <span className="mt-2 block text-sm text-slate-600">{details.description}</span>
                    </span>
                  </label>
                );
              })}
            </div>
          </fieldset>

          {isReturning && (
            <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900">
              Confirming this action closes the current equipment assignment. The backend records the return time and the Project Manager who processed the return.
            </p>
          )}

          <div className="flex flex-col-reverse gap-3 border-t border-slate-100 pt-5 sm:flex-row sm:justify-end">
            <button
              type="button"
              disabled={submitting}
              onClick={onClose}
              className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || !allowedTargets.includes(selectedStatus)}
              className="rounded-lg bg-brand-navy px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-navy-raised disabled:cursor-not-allowed disabled:opacity-60"
            >
              {confirmLabel}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
