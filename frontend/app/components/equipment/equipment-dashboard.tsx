'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { ApiError } from '@/lib/api';
import AssignEquipmentDialog from '@/components/equipment/assign-equipment-dialog';
import AssignmentHistoryDialog from '@/components/equipment/assignment-history-dialog';
import EquipmentStatusDialog, {
  type EquipmentStatusTarget,
} from '@/components/equipment/equipment-status-dialog';
import {
  assignEquipment,
  createEquipment,
  fetchEquipment,
  updateEquipment,
  updateEquipmentStatus,
} from '@/services/equipmentService';
import type {
  CreateEquipmentAssignmentInput,
  CreateEquipmentInput,
  Equipment,
  EquipmentInventory,
  EquipmentStatus,
} from '@/types/equipment';

const ALL_STATUSES = 'ALL';
const ALL_TYPES = 'ALL';

type StatusFilter = EquipmentStatus | typeof ALL_STATUSES;

const STATUS_OPTIONS: { value: EquipmentStatus; label: string }[] = [
  { value: 'AVAILABLE', label: 'Available' },
  { value: 'IN_USE', label: 'In Use' },
  { value: 'MAINTENANCE', label: 'Maintenance' },
];

const INPUT_CLASS =
  'h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-brand-navy focus:ring-2 focus:ring-brand-navy/10';
const LABEL_CLASS =
  'mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-600';

function Icon({
  name,
  className = 'h-5 w-5',
}: {
  name: 'box' | 'search' | 'plus' | 'edit' | 'pin' | 'calendar' | 'alert' | 'close';
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

  const paths = {
    box: (
      <>
        <path d="m12 3 8 4.5v9L12 21l-8-4.5v-9L12 3Z" />
        <path d="m4.3 7.7 7.7 4.4 7.7-4.4M12 12.1V21M8 5.2l8 4.5" />
      </>
    ),
    search: (
      <>
        <circle cx="10.8" cy="10.8" r="6.8" />
        <path d="m16 16 4.5 4.5" />
      </>
    ),
    plus: <path d="M12 5v14M5 12h14" />,
    edit: (
      <>
        <path d="m14.5 5.5 4 4M4 20l4.2-.8L19 8.4a2.8 2.8 0 0 0-4-4L4.2 15.2 4 20Z" />
      </>
    ),
    pin: (
      <>
        <path d="M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 1 1 14 0Z" />
        <circle cx="12" cy="10" r="2.2" />
      </>
    ),
    calendar: (
      <>
        <rect x="3.5" y="5" width="17" height="16" rx="2" />
        <path d="M7.5 3v4M16.5 3v4M3.5 10h17" />
      </>
    ),
    alert: (
      <>
        <path d="M12 3 22 20H2L12 3Z" />
        <path d="M12 9v5M12 17.2h.01" />
      </>
    ),
    close: <path d="m6 6 12 12M18 6 6 18" />,
  };

  return <svg {...common}>{paths[name]}</svg>;
}

function statusLabel(status: EquipmentStatus): string {
  return STATUS_OPTIONS.find((option) => option.value === status)?.label ?? status;
}

function statusClasses(status: EquipmentStatus): string {
  if (status === 'AVAILABLE') return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  if (status === 'IN_USE') return 'border-blue-200 bg-blue-50 text-blue-700';
  return 'border-violet-200 bg-violet-50 text-violet-700';
}

function formatDate(value: string | null | undefined): string {
  if (!value) return '—';
  const date = new Date(`${value.slice(0, 10)}T00:00:00`);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof ApiError) return error.message || fallback;
  return error instanceof Error && error.message ? error.message : fallback;
}

function getInventoryLoadError(error: unknown): string {
  if (error instanceof ApiError && error.status === 404) {
    return 'The Equipment API is not available in the current backend yet. The backend needs the US07 equipment routes before this inventory can load.';
  }
  return getErrorMessage(error, 'Unable to load the equipment inventory.');
}

function StatCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: 'blue' | 'green' | 'amber' | 'purple';
}) {
  const tones = {
    blue: 'bg-blue-50 text-blue-700',
    green: 'bg-emerald-50 text-emerald-700',
    amber: 'bg-amber-50 text-amber-700',
    purple: 'bg-violet-50 text-violet-700',
  };

  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-slate-500">{label}</p>
          <p className="mt-2 text-3xl font-bold tracking-tight text-[#142b50]">{value}</p>
        </div>
        <div className={`flex h-11 w-11 items-center justify-center rounded-full ${tones[tone]}`}>
          <Icon name="box" className="h-5 w-5" />
        </div>
      </div>
    </article>
  );
}

function EquipmentFormDialog({
  equipment,
  submitting,
  error,
  onClose,
  onSave,
}: {
  equipment: Equipment | null;
  submitting: boolean;
  error: string | null;
  onClose: () => void;
  onSave: (input: CreateEquipmentInput) => Promise<void>;
}) {
  const [name, setName] = useState(equipment?.name ?? '');
  const [type, setType] = useState(equipment?.type ?? '');
  const [location, setLocation] = useState(equipment?.location ?? '');
  const [validationError, setValidationError] = useState<string | null>(null);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setValidationError(null);

    const input = {
      name: name.trim(),
      type: type.trim(),
      location: location.trim(),
    };

    if (!input.name || !input.type || !input.location) {
      setValidationError('Complete all required fields before saving.');
      return;
    }

    await onSave(input);
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
        aria-labelledby="equipment-dialog-title"
        aria-modal="true"
        className="w-full max-w-xl rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl sm:p-8"
        role="dialog"
      >
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <h2 id="equipment-dialog-title" className="text-xl font-semibold text-slate-900">
              {equipment ? 'Edit Equipment' : 'Add Equipment'}
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              {equipment
                ? 'Update the equipment name, type or storage location.'
                : 'Register an individual equipment item in the company inventory.'}
            </p>
          </div>
          <button
            type="button"
            aria-label="Close equipment form"
            disabled={submitting}
            onClick={onClose}
            className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 disabled:opacity-50"
          >
            <Icon name="close" className="h-5 w-5" />
          </button>
        </div>

        {(error || validationError) && (
          <div
            className="mb-5 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800"
            role="alert"
          >
            {validationError ?? error}
          </div>
        )}

        <form className="space-y-5" onSubmit={(event) => void handleSubmit(event)}>
          <div>
            <label className={LABEL_CLASS} htmlFor="equipment-name">
              Equipment Name <span className="text-red-600">*</span>
            </label>
            <input
              id="equipment-name"
              className={INPUT_CLASS}
              type="text"
              autoFocus
              required
              maxLength={150}
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="e.g. Bosch GBH 2-28"
            />
            <p className="mt-1 text-right text-xs text-slate-400">{name.length}/150</p>
          </div>

          <div>
            <label className={LABEL_CLASS} htmlFor="equipment-type">
              Equipment Type <span className="text-red-600">*</span>
            </label>
            <input
              id="equipment-type"
              className={INPUT_CLASS}
              type="text"
              required
              maxLength={100}
              value={type}
              onChange={(event) => setType(event.target.value)}
              placeholder="e.g. Rotary Hammer"
            />
            <p className="mt-1 text-right text-xs text-slate-400">{type.length}/100</p>
          </div>

          <div>
            <label className={LABEL_CLASS} htmlFor="equipment-location">
              Storage Location <span className="text-red-600">*</span>
            </label>
            <input
              id="equipment-location"
              className={INPUT_CLASS}
              type="text"
              required
              maxLength={150}
              value={location}
              onChange={(event) => setLocation(event.target.value)}
              placeholder="e.g. Yard A or Store Room A"
            />
            <p className="mt-1 text-right text-xs text-slate-400">{location.length}/150</p>
          </div>

          <div className="flex flex-col-reverse gap-3 border-t border-slate-100 pt-5 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="rounded-lg border border-slate-300 px-5 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="rounded-lg bg-brand-navy px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-navy-raised disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitting ? 'Saving…' : equipment ? 'Save Changes' : 'Add Equipment'}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

export default function EquipmentDashboard() {
  const [inventory, setInventory] = useState<EquipmentInventory>({ items: [], summary: [] });
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>(ALL_STATUSES);
  const [typeFilter, setTypeFilter] = useState<string>(ALL_TYPES);
  const [search, setSearch] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);

  const [dialogEquipment, setDialogEquipment] = useState<Equipment | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [assignEquipmentItem, setAssignEquipmentItem] = useState<Equipment | null>(null);
  const [assignmentHistoryItem, setAssignmentHistoryItem] = useState<Equipment | null>(null);
  const [assignSubmitting, setAssignSubmitting] = useState(false);
  const [assignError, setAssignError] = useState<string | null>(null);
  const [statusEquipmentItem, setStatusEquipmentItem] = useState<Equipment | null>(null);
  const [statusSubmitting, setStatusSubmitting] = useState(false);
  const [statusError, setStatusError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const loadInventory = async () => {
      try {
        const result = await fetchEquipment({
          status: statusFilter === ALL_STATUSES ? undefined : statusFilter,
          type: typeFilter === ALL_TYPES ? undefined : typeFilter,
        });

        if (cancelled) return;
        setInventory(result);
        setLoadError(null);
      } catch (error) {
        if (cancelled) return;
        console.error('Unable to load equipment inventory:', error);
        setInventory({ items: [], summary: [] });
        setLoadError(getInventoryLoadError(error));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void loadInventory();

    return () => {
      cancelled = true;
    };
  }, [statusFilter, typeFilter, refreshKey]);

  const totals = useMemo(
    () =>
      inventory.summary.reduce(
        (result, item) => ({
          total: result.total + item.total,
          available: result.available + item.available,
          inUse: result.inUse + item.inUse,
          maintenance: result.maintenance + item.maintenance,
        }),
        { total: 0, available: 0, inUse: 0, maintenance: 0 },
      ),
    [inventory.summary],
  );

  const typeOptions = useMemo(
    () => inventory.summary.map((item) => item.type).sort((a, b) => a.localeCompare(b)),
    [inventory.summary],
  );

  const filteredItems = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return inventory.items;

    return inventory.items.filter((item) => {
      const assignmentText = item.currentAssignment
        ? `${item.currentAssignment.projectName} ${item.currentAssignment.checkedOutByName}`
        : '';
      return `${item.name} ${item.type} ${item.location} ${assignmentText}`
        .toLowerCase()
        .includes(query);
    });
  }, [inventory.items, search]);

  const hasFilters = search.trim() !== '' || statusFilter !== ALL_STATUSES || typeFilter !== ALL_TYPES;

  const openCreateDialog = () => {
    setDialogEquipment(null);
    setFormError(null);
    setSuccessMessage(null);
    setDialogOpen(true);
  };

  const openEditDialog = (equipment: Equipment) => {
    setDialogEquipment(equipment);
    setFormError(null);
    setSuccessMessage(null);
    setDialogOpen(true);
  };

  const closeDialog = () => {
    if (submitting) return;
    setDialogOpen(false);
    setDialogEquipment(null);
    setFormError(null);
  };

  const handleSave = async (input: CreateEquipmentInput) => {
    setSubmitting(true);
    setFormError(null);
    setSuccessMessage(null);

    try {
      const result = dialogEquipment
        ? await updateEquipment(dialogEquipment.id, input)
        : await createEquipment(input);

      setDialogOpen(false);
      setDialogEquipment(null);
      setSuccessMessage(result.message);
      setLoading(true);
      setRefreshKey((current) => current + 1);
    } catch (error) {
      console.error('Unable to save equipment:', error);
      setFormError(getErrorMessage(error, 'Unable to save equipment.'));
    } finally {
      setSubmitting(false);
    }
  };

  const openAssignDialog = (equipment: Equipment) => {
    setAssignError(null);
    setAssignEquipmentItem(equipment);
  };

  const handleAssign = async (input: CreateEquipmentAssignmentInput) => {
    if (!assignEquipmentItem) return;
    setAssignSubmitting(true);
    setAssignError(null);
    try {
      const result = await assignEquipment(assignEquipmentItem.id, input);
      setAssignEquipmentItem(null);
      setSuccessMessage(result.message);
      setLoading(true);
      setRefreshKey((current) => current + 1);
    } catch (error) {
      console.error('Unable to assign equipment:', error);
      setAssignError(getErrorMessage(error, 'Unable to assign equipment.'));
    } finally {
      setAssignSubmitting(false);
    }
  };

  const openStatusDialog = (equipment: Equipment) => {
    setStatusError(null);
    setStatusEquipmentItem(equipment);
  };

  const handleStatusChange = async (status: EquipmentStatusTarget) => {
    if (!statusEquipmentItem) return;
    setStatusSubmitting(true);
    setStatusError(null);

    try {
      const result = await updateEquipmentStatus(statusEquipmentItem.id, status);
      setStatusEquipmentItem(null);
      setSuccessMessage(result.message);
      setLoading(true);
      setRefreshKey((current) => current + 1);
    } catch (error) {
      console.error('Unable to update equipment status:', error);
      setStatusError(getErrorMessage(error, 'Unable to update equipment status.'));
    } finally {
      setStatusSubmitting(false);
    }
  };

  const resetFilters = () => {
    setLoading(true);
    setSearch('');
    setStatusFilter(ALL_STATUSES);
    setTypeFilter(ALL_TYPES);
  };

  return (
    <main className="mx-auto min-h-screen max-w-7xl bg-canvas p-6 font-sans md:p-8">
      <header className="mb-7 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-[#58779d]">
            Project Manager / Equipment
          </p>
          <h1 className="text-3xl font-semibold tracking-tight text-slate-900">
            Equipment Management
          </h1>
          <p className="mt-2 text-sm text-slate-500">
            Manage company equipment, availability and inventory records.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Link href="/dashboard" className="text-sm font-medium text-slate-600 transition hover:text-brand-navy">
            Back to Dashboard
          </Link>
          <button
            type="button"
            onClick={openCreateDialog}
            className="inline-flex items-center gap-2 rounded-lg bg-brand-navy px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-navy-raised"
          >
            <Icon name="plus" className="h-4 w-4" />
            Add Equipment
          </button>
        </div>
      </header>

      {successMessage && (
        <div className="mb-5 flex items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800" role="status">
          <span>{successMessage}</span>
          <button
            type="button"
            aria-label="Dismiss success message"
            onClick={() => setSuccessMessage(null)}
            className="rounded p-1 hover:bg-emerald-100"
          >
            <Icon name="close" className="h-4 w-4" />
          </button>
        </div>
      )}

      <section aria-label="Equipment inventory summary" className="mb-7 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Total Equipment" value={totals.total} tone="blue" />
        <StatCard label="Available" value={totals.available} tone="green" />
        <StatCard label="In Use" value={totals.inUse} tone="amber" />
        <StatCard label="Maintenance" value={totals.maintenance} tone="purple" />
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-4 border-b border-slate-200 p-5 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Equipment Inventory</h2>
            <p className="mt-1 text-sm text-slate-500">
              {loading ? 'Loading equipment…' : `${filteredItems.length} equipment ${filteredItems.length === 1 ? 'item' : 'items'} match your filters.`}
            </p>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
            <label className="relative block min-w-0 sm:w-64">
              <span className="sr-only">Search equipment</span>
              <Icon name="search" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search equipment…"
                className="h-10 w-full rounded-full border border-slate-200 bg-white pl-9 pr-4 text-sm text-slate-700 outline-none transition placeholder:text-slate-400 focus:border-brand-navy"
              />
            </label>

            <label>
              <span className="sr-only">Filter by status</span>
              <select
                value={statusFilter}
                onChange={(event) => {
                  setLoading(true);
                  setStatusFilter(event.target.value as StatusFilter);
                }}
                className="h-10 w-full rounded-full border border-slate-200 bg-white px-4 text-sm text-slate-700 outline-none focus:border-brand-navy sm:w-40"
              >
                <option value={ALL_STATUSES}>All statuses</option>
                {STATUS_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </label>

            <label>
              <span className="sr-only">Filter by equipment type</span>
              <select
                value={typeFilter}
                onChange={(event) => {
                  setLoading(true);
                  setTypeFilter(event.target.value);
                }}
                className="h-10 w-full rounded-full border border-slate-200 bg-white px-4 text-sm text-slate-700 outline-none focus:border-brand-navy sm:w-48"
              >
                <option value={ALL_TYPES}>All equipment types</option>
                {typeOptions.map((type) => (
                  <option key={type} value={type}>{type}</option>
                ))}
              </select>
            </label>

            {hasFilters && (
              <button
                type="button"
                onClick={resetFilters}
                className="h-10 rounded-full border border-slate-200 px-4 text-sm font-medium text-slate-600 transition hover:bg-slate-50"
              >
                Reset
              </button>
            )}
          </div>
        </div>

        {loadError && (
          <div className="m-5 rounded-xl border border-red-200 bg-red-50 p-4" role="alert">
            <p className="text-sm font-semibold text-red-900">Unable to load equipment inventory</p>
            <p className="mt-1 text-sm text-red-800">{loadError}</p>
            <button
              type="button"
              onClick={() => {
                setLoading(true);
                setRefreshKey((value) => value + 1);
              }}
              className="mt-3 rounded-lg border border-red-300 bg-white px-3 py-1.5 text-xs font-semibold text-red-800 transition hover:bg-red-100"
            >
              Try again
            </button>
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] border-collapse text-left">
            <thead className="bg-slate-50 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-5 py-4">Equipment</th>
                <th className="px-5 py-4">Type</th>
                <th className="px-5 py-4">Location</th>
                <th className="px-5 py-4">Current Assignment</th>
                <th className="px-5 py-4">Expected Return</th>
                <th className="px-5 py-4">Status</th>
                <th className="px-5 py-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-5 py-14 text-center text-sm text-slate-500">
                    Loading equipment inventory…
                  </td>
                </tr>
              ) : filteredItems.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-5 py-14 text-center">
                    <div className="mx-auto flex max-w-md flex-col items-center">
                      <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-500">
                        <Icon name="box" className="h-6 w-6" />
                      </div>
                      <p className="text-sm font-semibold text-slate-700">
                        {loadError ? 'Equipment data is unavailable' : 'No equipment found'}
                      </p>
                      <p className="mt-1 text-sm text-slate-500">
                        {loadError
                          ? 'Check that the US07 equipment endpoints are running in the backend.'
                          : hasFilters
                            ? 'Try changing your search or filters.'
                            : 'Add your first equipment item to start building the inventory.'}
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredItems.map((item) => (
                  <tr key={item.id} className="transition hover:bg-slate-50/70">
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-50 text-blue-700">
                          <Icon name="box" className="h-5 w-5" />
                        </div>
                        <div className="min-w-0">
                          <p className="font-semibold text-slate-900">{item.name}</p>
                          <p className="mt-0.5 text-xs text-slate-400">{item.id}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-4 text-sm text-slate-600">{item.type}</td>
                    <td className="px-5 py-4">
                      <span className="inline-flex items-center gap-1.5 text-sm text-slate-600">
                        <Icon name="pin" className="h-4 w-4 text-slate-400" />
                        {item.location}
                      </span>
                    </td>
                    <td className="px-5 py-4">
                      {item.currentAssignment ? (
                        <div>
                          <p className="text-sm font-medium text-slate-800">{item.currentAssignment.projectName}</p>
                          <p className="mt-0.5 text-xs text-slate-500">{item.currentAssignment.checkedOutByName}</p>
                        </div>
                      ) : (
                        <span className="text-sm text-slate-400">Not assigned</span>
                      )}
                    </td>
                    <td className="px-5 py-4">
                      {item.currentAssignment?.expectedReturnDate ? (
                        <div>
                          <span className="inline-flex items-center gap-1.5 text-sm text-slate-600">
                            <Icon name="calendar" className="h-4 w-4 text-slate-400" />
                            {formatDate(item.currentAssignment.expectedReturnDate)}
                          </span>
                          {item.isOverdue && (
                            <p className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-red-600">
                              <Icon name="alert" className="h-3.5 w-3.5" />
                              Overdue return
                            </p>
                          )}
                        </div>
                      ) : (
                        <span className="text-sm text-slate-400">—</span>
                      )}
                    </td>
                    <td className="px-5 py-4">
                      <span className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium ${statusClasses(item.status)}`}>
                        <span className="mr-1.5 h-1.5 w-1.5 rounded-full bg-current" />
                        {statusLabel(item.status)}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-right">
                      <div className="inline-flex items-center justify-end gap-1.5">
                        {item.status === 'AVAILABLE' && (
                          <button
                            type="button"
                            onClick={() => openAssignDialog(item)}
                            className="rounded-lg border border-brand-navy/20 px-3 py-2 text-xs font-semibold text-brand-navy transition hover:bg-blue-50"
                          >
                            Assign
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => setAssignmentHistoryItem(item)}
                          className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 transition hover:bg-slate-50"
                        >
                          History
                        </button>
                        <button
                          type="button"
                          onClick={() => openStatusDialog(item)}
                          className="rounded-lg border border-amber-200 px-3 py-2 text-xs font-semibold text-amber-800 transition hover:bg-amber-50"
                        >
                          {item.status === 'IN_USE'
                            ? 'Return Equipment'
                            : item.status === 'AVAILABLE'
                              ? 'Mark Maintenance'
                              : 'Set Available'}
                        </button>
                        <button
                          type="button"
                          onClick={() => openEditDialog(item)}
                          aria-label={`Edit ${item.name}`}
                          title="Edit equipment"
                          className="rounded-lg p-2 text-slate-500 transition hover:bg-slate-100 hover:text-brand-navy"
                        >
                          <Icon name="edit" className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {dialogOpen && (
        <EquipmentFormDialog
          equipment={dialogEquipment}
          submitting={submitting}
          error={formError}
          onClose={closeDialog}
          onSave={handleSave}
        />
      )}

      {assignEquipmentItem && (
        <AssignEquipmentDialog
          equipment={assignEquipmentItem}
          submitting={assignSubmitting}
          submitError={assignError}
          onClose={() => {
            if (!assignSubmitting) setAssignEquipmentItem(null);
          }}
          onAssign={handleAssign}
        />
      )}

      {assignmentHistoryItem && (
        <AssignmentHistoryDialog
          equipmentId={assignmentHistoryItem.id}
          equipmentName={assignmentHistoryItem.name}
          onClose={() => setAssignmentHistoryItem(null)}
        />
      )}

      {statusEquipmentItem && (
        <EquipmentStatusDialog
          equipment={statusEquipmentItem}
          submitting={statusSubmitting}
          error={statusError}
          onClose={() => {
            if (!statusSubmitting) setStatusEquipmentItem(null);
          }}
          onConfirm={handleStatusChange}
        />
      )}
    </main>
  );
}
