/** Counts of the tasks linked to one milestone (computed, never stored). */
export interface MilestoneTaskCounts {
  totalTasks: number;
  completedTasks: number;
}

/** Contract §12.2. Computed fields come from the linked, non-deleted tasks. */
export interface MilestoneResponse {
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
