import type {
  CreateMilestoneInput,
  HealthStatus,
  Milestone,
  UpdateMilestoneInput,
} from '@/types/milestone';
import { getTodayKualaLumpur } from '@/lib/tasks';

/**
 * Add `days` calendar days to a YYYY-MM-DD date string using UTC calendar arithmetic
 * so timezone offsets never shift the calendar day.
 */
export function addCalendarDays(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  const year = String(dt.getUTCFullYear()).padStart(4, '0');
  const month = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const day = String(dt.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Health status (D4) for a Milestone (§3.4):
 * - RED: Milestone is overdue (`isOverdue` or `!isCompleted && targetDate < today`)
 * - YELLOW: Milestone is not completed and `today <= targetDate <= today + 3`
 * - GREEN: All other cases (including completed milestones)
 */
export function getMilestoneHealthStatus(
  milestone: Pick<Milestone, 'targetDate' | 'isCompleted' | 'isOverdue'>,
  now: Date = new Date(),
): HealthStatus {
  if (milestone.isCompleted) return 'GREEN';

  const today = getTodayKualaLumpur(now);
  if (milestone.isOverdue || milestone.targetDate < today) {
    return 'RED';
  }

  const dueSoonCutoff = addCalendarDays(today, 3);
  if (milestone.targetDate >= today && milestone.targetDate <= dueSoonCutoff) {
    return 'YELLOW';
  }

  return 'GREEN';
}

export interface ProjectMilestoneSummary {
  totalMilestones: number;
  completedMilestones: number;
  onTrackMilestones: number;
  overdueMilestones: number;
  overallCompletionPercent: number;
  summaryText: string;
}

/**
 * Project-level milestone summary for the US06 header banner:
 * e.g. "75% complete (3 of 4 milestones on track)"
 * - "on track" = milestones that are not overdue (`!isOverdue`, i.e., completed or not yet past targetDate)
 * - overallCompletionPercent = `floor(100 * completedMilestones / totalMilestones)` (or 0 if none)
 */
export function computeProjectMilestoneSummary(
  milestones: readonly Pick<
    Milestone,
    'isCompleted' | 'isOverdue' | 'targetDate' | 'completionPercent'
  >[],
  now: Date = new Date(),
): ProjectMilestoneSummary {
  const totalMilestones = milestones.length;
  if (totalMilestones === 0) {
    return {
      totalMilestones: 0,
      completedMilestones: 0,
      onTrackMilestones: 0,
      overdueMilestones: 0,
      overallCompletionPercent: 0,
      summaryText: '0% complete (0 of 0 milestones on track)',
    };
  }

  const today = getTodayKualaLumpur(now);
  let completedMilestones = 0;
  let overdueMilestones = 0;

  for (const m of milestones) {
    if (m.isCompleted) {
      completedMilestones += 1;
    } else if (m.isOverdue || m.targetDate < today) {
      overdueMilestones += 1;
    }
  }

  const onTrackMilestones = totalMilestones - overdueMilestones;
  const overallCompletionPercent = Math.floor(
    (100 * completedMilestones) / totalMilestones,
  );

  return {
    totalMilestones,
    completedMilestones,
    onTrackMilestones,
    overdueMilestones,
    overallCompletionPercent,
    summaryText: `${overallCompletionPercent}% complete (${onTrackMilestones} of ${totalMilestones} milestones on track)`,
  };
}

export interface MilestoneFormValues {
  name: string;
  description: string;
  targetDate: string;
}

export function buildCreateMilestonePayload(
  values: MilestoneFormValues,
): CreateMilestoneInput {
  const trimmedName = values.name.trim();
  const trimmedDesc = values.description.trim();

  const payload: CreateMilestoneInput = {
    name: trimmedName,
    targetDate: values.targetDate,
  };

  if (trimmedDesc.length > 0) {
    payload.description = trimmedDesc;
  }

  return payload;
}

/**
 * Build a minimal PATCH body containing only changed fields (§8.2).
 */
export function buildUpdateMilestonePayload(
  existing: Milestone,
  values: MilestoneFormValues,
): UpdateMilestoneInput {
  const diff: UpdateMilestoneInput = {};

  const trimmedName = values.name.trim();
  if (trimmedName !== existing.name) {
    diff.name = trimmedName;
  }

  const trimmedDesc = values.description.trim();
  const existingDesc = existing.description ?? '';
  if (trimmedDesc !== existingDesc) {
    diff.description = trimmedDesc.length > 0 ? trimmedDesc : null;
  }

  if (values.targetDate !== existing.targetDate) {
    diff.targetDate = values.targetDate;
  }

  return diff;
}