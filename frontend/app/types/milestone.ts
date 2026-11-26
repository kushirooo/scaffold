/**
 * UI types and enum labels for US06 – Milestone Management & Tracking
 * Mirrors Sprint2_API_Contract.md §§ 2, 3.2, 3.4, 8, 12.2.
 */

export type HealthStatus = 'RED' | 'YELLOW' | 'GREEN';

export const HEALTH_STATUS_LABELS: Record<HealthStatus, string> = {
  RED: 'Urgent',
  YELLOW: 'Attention needed',
  GREEN: 'On track',
};

export interface Milestone {
  id: string;
  projectId: string;
  name: string;
  description: string | null;
  targetDate: string;
  completionPercent: number;
  completedTasks: number;
  totalTasks: number;
  isCompleted: boolean;
  isOverdue: boolean;
  createdAt: string;
  updatedAt: string;
}

/** `POST /projects/:projectId/milestones` request body (§8.1). */
export interface CreateMilestoneInput {
  name: string;
  description?: string;
  targetDate: string;
}

/** `PATCH /milestones/:milestoneId` request body (§8.2). Never includes completion fields. */
export interface UpdateMilestoneInput {
  name?: string;
  description?: string | null;
  targetDate?: string;
}