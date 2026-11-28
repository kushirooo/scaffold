export {
  isMilestoneComplete,
  milestoneCompletionPercent,
} from '../tasks/task.rules.js';

/**
 * `isCompleted` is false and `targetDate < today`. A milestone due today is
 * not overdue, and a completed milestone is never overdue.
 */
export function isMilestoneOverdue(
  targetDate: string,
  isCompleted: boolean,
  today: string,
): boolean {
  return !isCompleted && targetDate < today;
}
