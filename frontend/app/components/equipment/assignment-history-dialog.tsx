'use client';

import { useEffect, useState } from 'react';
import { ApiError } from '@/lib/api';
import { fetchEquipmentAssignmentHistory } from '@/services/equipmentService';
import type { EquipmentAssignment } from '@/types/equipment';

type AssignmentHistoryDialogProps = {
  equipmentId: string;
  equipmentName: string;
  onClose: () => void;
};

function formatDate(value: string | null | undefined): string {
  if (!value) return '—';
  const date = new Date(`${value.slice(0, 10)}T00:00:00`);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function formatTimestamp(value: string | null): string {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' });
}

function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  return error instanceof Error ? error.message : 'Unable to load assignment history.';
}

export default function AssignmentHistoryDialog({
  equipmentId,
  equipmentName,
  onClose,
}: AssignmentHistoryDialogProps) {
  const [assignments, setAssignments] = useState<EquipmentAssignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const loadHistory = async () => {
      setLoading(true);
      setError(null);
      try {
        const result = await fetchEquipmentAssignmentHistory(equipmentId);
        if (!cancelled) setAssignments(result);
      } catch (loadError) {
        if (!cancelled) setError(errorMessage(loadError));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void loadHistory();
    return () => {
      cancelled = true;
    };
  }, [equipmentId]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        aria-labelledby="equipment-history-dialog-title"
        aria-modal="true"
        className="w-full max-w-3xl rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl sm:p-8"
        role="dialog"
      >
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">Equipment records</p>
            <h2 id="equipment-history-dialog-title" className="mt-1 text-xl font-semibold text-slate-900">
              Assignment History
            </h2>
            <p className="mt-1 text-sm text-slate-500">{equipmentName}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close assignment history"
            className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
              <path d="m6 6 12 12M18 6 6 18" />
            </svg>
          </button>
        </div>

        {loading ? (
          <div className="py-14 text-center text-sm text-slate-500">Loading assignment history…</div>
        ) : error ? (
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800" role="alert">
            {error}
          </div>
        ) : assignments.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-5 py-12 text-center">
            <p className="text-sm font-semibold text-slate-700">No assignment history yet</p>
            <p className="mt-1 text-sm text-slate-500">Assignments for this equipment will appear here.</p>
          </div>
        ) : (
          <div className="max-h-[60vh] overflow-auto rounded-xl border border-slate-200">
            <table className="w-full min-w-[620px] text-left text-sm">
              <thead className="sticky top-0 bg-slate-50 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">Project</th>
                  <th className="px-4 py-3">Checked Out By</th>
                  <th className="px-4 py-3">Checkout Date</th>
                  <th className="px-4 py-3">Expected Return</th>
                  <th className="px-4 py-3">Returned</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {assignments.map((assignment) => (
                  <tr key={assignment.id}>
                    <td className="px-4 py-4 font-medium text-slate-800">{assignment.projectName}</td>
                    <td className="px-4 py-4 text-slate-600">{assignment.checkedOutByName}</td>
                    <td className="px-4 py-4 whitespace-nowrap text-slate-600">{formatDate(assignment.checkoutDate)}</td>
                    <td className="px-4 py-4 whitespace-nowrap text-slate-600">{formatDate(assignment.expectedReturnDate)}</td>
                    <td className="px-4 py-4 whitespace-nowrap">
                      {assignment.returnedAt ? (
                        <span className="text-slate-600">{formatTimestamp(assignment.returnedAt)}</span>
                      ) : (
                        <span className="inline-flex rounded-full bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700">Current</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="mt-6 flex justify-end border-t border-slate-100 pt-5">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-300 px-5 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
          >
            Close
          </button>
        </div>
      </section>
    </div>
  );
}
