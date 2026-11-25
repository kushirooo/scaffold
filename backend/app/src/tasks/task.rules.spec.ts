import {
  isMilestoneComplete,
  isTaskOverdue,
  isValidTransition,
  milestoneCompletionPercent,
  nextTaskStatus,
} from './task.rules.js';

describe('task rules', () => {
  it('marks a task overdue only when it is past and not completed', () => {
    expect(isTaskOverdue('2026-11-24', 'PENDING', '2026-11-25')).toBe(true);
    expect(isTaskOverdue('2026-11-25', 'PENDING', '2026-11-25')).toBe(false);
    expect(isTaskOverdue('2026-11-24', 'COMPLETED', '2026-11-25')).toBe(
      false,
    );
  });

  it('uses floor for the milestone percent', () => {
    expect(milestoneCompletionPercent(0, 0)).toBe(0);
    expect(milestoneCompletionPercent(3, 5)).toBe(60);
    expect(milestoneCompletionPercent(199, 200)).toBe(99);
    expect(milestoneCompletionPercent(5, 5)).toBe(100);
  });

  it('marks a milestone complete only from the counts', () => {
    expect(isMilestoneComplete(0, 0)).toBe(false);
    expect(isMilestoneComplete(4, 5)).toBe(false);
    expect(isMilestoneComplete(5, 5)).toBe(true);
  });

  it('allows only one step forward', () => {
    expect(nextTaskStatus('PENDING')).toBe('IN_PROGRESS');
    expect(nextTaskStatus('IN_PROGRESS')).toBe('COMPLETED');
    expect(nextTaskStatus('COMPLETED')).toBeNull();

    expect(isValidTransition('PENDING', 'IN_PROGRESS')).toBe(true);
    expect(isValidTransition('PENDING', 'COMPLETED')).toBe(false);
    expect(isValidTransition('IN_PROGRESS', 'COMPLETED')).toBe(true);
    expect(isValidTransition('IN_PROGRESS', 'PENDING')).toBe(false);
    expect(isValidTransition('COMPLETED', 'IN_PROGRESS')).toBe(false);
  });
});
