import {
  isMilestoneComplete,
  isMilestoneOverdue,
  milestoneCompletionPercent,
} from './milestone.rules.js';

describe('milestone rules', () => {
  it('uses floor for the completion percent', () => {
    expect(milestoneCompletionPercent(0, 0)).toBe(0);
    expect(milestoneCompletionPercent(1, 3)).toBe(33);
    expect(milestoneCompletionPercent(3, 5)).toBe(60);
    expect(milestoneCompletionPercent(199, 200)).toBe(99);
    expect(milestoneCompletionPercent(5, 5)).toBe(100);
  });

  it('marks a milestone complete only from the counts', () => {
    expect(isMilestoneComplete(0, 0)).toBe(false);
    expect(isMilestoneComplete(1, 3)).toBe(false);
    expect(isMilestoneComplete(5, 5)).toBe(true);
  });

  it('marks a milestone overdue only when it is past and incomplete', () => {
    expect(isMilestoneOverdue('2026-11-24', false, '2026-11-25')).toBe(true);
    expect(isMilestoneOverdue('2026-11-25', false, '2026-11-25')).toBe(false);
    expect(isMilestoneOverdue('2026-11-24', true, '2026-11-25')).toBe(false);
  });
});
