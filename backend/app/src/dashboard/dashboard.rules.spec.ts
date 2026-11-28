import {
  allowedStatusChanges,
  calendarMonth,
  compareDeadlines,
  compareTeamWorkload,
  milestoneHealth,
  NOTIFICATION_ITEM_CAP,
  projectHealth,
  takeTop,
  taskHealth,
  TEAM_WORKLOAD_CAP,
  UPCOMING_DEADLINE_CAP,
  WORKER_COMPLETED_TASK_CAP,
  WORKER_OPEN_TASK_CAP,
} from './dashboard.rules.js';
import type { HealthStatus, UpcomingDeadline } from './dashboard.types.js';

const TODAY = '2026-11-25';

function deadline(
  id: string,
  type: UpcomingDeadline['type'],
  title: string,
  date: string,
): UpcomingDeadline {
  return {
    type,
    id,
    title,
    projectId: 'project-1',
    projectName: 'Riverside Warehouse',
    date,
    isOverdue: false,
    healthStatus: 'GREEN',
  };
}

describe('task health', () => {
  it('is RED for an incomplete task past its due date', () => {
    expect(taskHealth('2026-11-24', 'PENDING', TODAY)).toBe('RED');
    expect(taskHealth('2026-11-24', 'IN_PROGRESS', TODAY)).toBe('RED');
  });

  it('is YELLOW from today through today + 3, inclusive', () => {
    expect(taskHealth(TODAY, 'PENDING', TODAY)).toBe('YELLOW');
    expect(taskHealth('2026-11-28', 'PENDING', TODAY)).toBe('YELLOW');
    expect(taskHealth(TODAY, 'IN_PROGRESS', TODAY)).toBe('YELLOW');
  });

  it('is GREEN from today + 4 onward', () => {
    expect(taskHealth('2026-11-29', 'PENDING', TODAY)).toBe('GREEN');
  });

  it('is GREEN for every completed task', () => {
    expect(taskHealth('2026-11-01', 'COMPLETED', TODAY)).toBe('GREEN');
    expect(taskHealth(TODAY, 'COMPLETED', TODAY)).toBe('GREEN');
    expect(taskHealth('2026-11-20', 'COMPLETED', TODAY)).toBe('GREEN');
  });
});

describe('milestone health', () => {
  it('is RED for an incomplete milestone past its target date', () => {
    expect(milestoneHealth('2026-11-24', false, TODAY)).toBe('RED');
  });

  it('is YELLOW from today through today + 3, inclusive', () => {
    expect(milestoneHealth(TODAY, false, TODAY)).toBe('YELLOW');
    expect(milestoneHealth('2026-11-27', false, TODAY)).toBe('YELLOW');
    expect(milestoneHealth('2026-11-28', false, TODAY)).toBe('YELLOW');
  });

  it('is GREEN after today + 3, or when the milestone is complete', () => {
    expect(milestoneHealth('2026-11-29', false, TODAY)).toBe('GREEN');
    expect(milestoneHealth('2026-11-01', true, TODAY)).toBe('GREEN');
    expect(milestoneHealth(TODAY, true, TODAY)).toBe('GREEN');
  });
});

describe('project health', () => {
  it('is GREEN for a project with no items', () => {
    expect(projectHealth([])).toBe('GREEN');
    expect(projectHealth(['GREEN', 'GREEN'])).toBe('GREEN');
  });

  it('is YELLOW when the worst item is due soon', () => {
    expect(projectHealth(['GREEN', 'YELLOW'])).toBe('YELLOW');
    expect(projectHealth(['YELLOW', 'GREEN', 'YELLOW'])).toBe('YELLOW');
  });

  it('lets RED win over YELLOW', () => {
    const health: HealthStatus[] = ['YELLOW', 'RED', 'GREEN'];
    expect(projectHealth(health)).toBe('RED');
    expect(projectHealth(['RED'])).toBe('RED');
  });
});

describe('calendar month', () => {
  it('returns the first and last day of November 2026', () => {
    expect(calendarMonth('2026-11-15')).toEqual({
      month: '2026-11',
      firstDay: '2026-11-01',
      lastDay: '2026-11-30',
    });
  });

  it('returns the first and last day of June 2026', () => {
    expect(calendarMonth('2026-06-30')).toEqual({
      month: '2026-06',
      firstDay: '2026-06-01',
      lastDay: '2026-06-30',
    });
  });

  it('handles the February 2028 leap day', () => {
    expect(calendarMonth('2028-02-10')).toEqual({
      month: '2028-02',
      firstDay: '2028-02-01',
      lastDay: '2028-02-29',
    });
  });

  it('handles a non-leap February', () => {
    expect(calendarMonth('2026-02-10')).toEqual({
      month: '2026-02',
      firstDay: '2026-02-01',
      lastDay: '2026-02-28',
    });
  });
});

describe('deadline sort', () => {
  it('sorts by date, then TASK before MILESTONE, then title, then id', () => {
    const items = [
      deadline('milestone-1', 'MILESTONE', 'Alpha', '2026-11-26'),
      deadline('task-zulu', 'TASK', 'Zulu', '2026-11-26'),
      deadline('task-alpha', 'TASK', 'Alpha', '2026-11-26'),
      deadline('task-early', 'TASK', 'Early', '2026-11-25'),
    ];

    const sorted = [...items].sort(compareDeadlines);

    expect(sorted.map((item) => item.id)).toEqual([
      'task-early',
      'task-alpha',
      'task-zulu',
      'milestone-1',
    ]);
  });

  it('uses the id to break a title tie', () => {
    const items = [
      deadline('task-b', 'TASK', 'Same', '2026-11-26'),
      deadline('task-a', 'TASK', 'Same', '2026-11-26'),
    ];

    const sorted = [...items].sort(compareDeadlines);

    expect(sorted.map((item) => item.id)).toEqual(['task-a', 'task-b']);
  });
});

describe('team workload sort', () => {
  it('sorts overdue desc, open desc, then name asc', () => {
    const rows = [
      { userId: 'u1', name: 'Alice', openTasks: 2, overdueTasks: 0 },
      { userId: 'u2', name: 'Bob', openTasks: 5, overdueTasks: 1 },
      { userId: 'u3', name: 'Cara', openTasks: 5, overdueTasks: 0 },
      { userId: 'u4', name: 'Dan', openTasks: 5, overdueTasks: 0 },
      { userId: 'u5', name: 'Eve', openTasks: 9, overdueTasks: 0 },
    ];

    const sorted = [...rows].sort(compareTeamWorkload);

    expect(sorted.map((row) => row.userId)).toEqual([
      'u2',
      'u5',
      'u3',
      'u4',
      'u1',
    ]);
  });
});

describe('caps', () => {
  const items = Array.from({ length: 60 }, (_, index) => index);

  it('caps each dashboard list at its contract limit', () => {
    expect(takeTop(items, NOTIFICATION_ITEM_CAP)).toHaveLength(5);
    expect(takeTop(items, UPCOMING_DEADLINE_CAP)).toHaveLength(20);
    expect(takeTop(items, TEAM_WORKLOAD_CAP)).toHaveLength(20);
    expect(takeTop(items, WORKER_OPEN_TASK_CAP)).toHaveLength(50);
    expect(takeTop(items, WORKER_COMPLETED_TASK_CAP)).toHaveLength(20);
  });
});

describe('allowed status changes', () => {
  it('follows the one-step-forward task machine', () => {
    expect(allowedStatusChanges('PENDING')).toEqual(['IN_PROGRESS']);
    expect(allowedStatusChanges('IN_PROGRESS')).toEqual(['COMPLETED']);
    expect(allowedStatusChanges('COMPLETED')).toEqual([]);
  });
});
