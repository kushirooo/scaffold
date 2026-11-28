import test from 'node:test';
import assert from 'node:assert/strict';
import {
  computeDashboardMetrics,
  getDashboardProjectHref,
  getDashboardTaskHref,
  getDeadlineItemHref,
  sortDashboardProjects,
  sortUpcomingDeadlines,
} from './dashboard.ts';

test('computeDashboardMetrics aggregates role-scoped dashboard sections accurately', () => {
  const metrics = computeDashboardMetrics({
    activeProjects: [
      {
        id: 'proj-1',
        name: 'Riverside Warehouse',
        healthStatus: 'RED',
        totalTasks: 10,
        completedTasks: 7,
        overdueTasks: 1,
        overdueMilestones: 0,
      },
      {
        id: 'proj-2',
        name: 'Metro Bridge',
        healthStatus: 'GREEN',
        totalTasks: 10,
        completedTasks: 3,
        overdueTasks: 0,
        overdueMilestones: 0,
      },
    ],
    myTasks: [
      {
        id: 'task-1',
        title: 'Order rebar',
        projectId: 'proj-1',
        projectName: 'Riverside Warehouse',
        dueDate: '2026-11-19',
        status: 'IN_PROGRESS',
        priority: 'URGENT',
        isOverdue: true,
        healthStatus: 'RED',
      },
    ],
    upcomingDeadlines: [
      {
        type: 'TASK',
        id: 'task-1',
        title: 'Order rebar',
        projectId: 'proj-1',
        projectName: 'Riverside Warehouse',
        date: '2026-11-19',
        isOverdue: true,
        healthStatus: 'RED',
      },
    ],
  });

  assert.equal(metrics.activeProjectsCount, 2);
  assert.equal(metrics.totalTasks, 20);
  assert.equal(metrics.completedTasks, 10);
  assert.equal(metrics.completionPercent, 50);
  assert.equal(metrics.overdueItemsCount, 1);
  assert.equal(metrics.urgentProjectsCount, 1);
  assert.equal(metrics.myOpenTasksCount, 1);
  assert.equal(metrics.upcomingDeadlinesCount, 1);
});

test('getDashboardProjectHref enforces role access rules (§4 & §6.3)', () => {
  assert.equal(getDashboardProjectHref('proj-1', 'PROJECT_MANAGER'), '/projects/proj-1');
  assert.equal(getDashboardProjectHref('proj-1', 'WORKER'), '/projects/proj-1');
  assert.equal(getDashboardProjectHref('proj-1', 'ADMIN'), null);
});

test('getDeadlineItemHref and getDashboardTaskHref build valid task and milestone routes', () => {
  assert.equal(
    getDeadlineItemHref({
      type: 'TASK',
      id: 'task-1',
      title: 'Order rebar',
      projectId: 'proj-1',
      projectName: 'Riverside Warehouse',
      date: '2026-11-19',
      isOverdue: true,
      healthStatus: 'RED',
    }),
    '/projects/proj-1/tasks/task-1',
  );

  assert.equal(
    getDeadlineItemHref({
      type: 'MILESTONE',
      id: 'ms-1',
      title: 'Foundation complete',
      projectId: 'proj-1',
      projectName: 'Riverside Warehouse',
      date: '2026-11-24',
      isOverdue: false,
      healthStatus: 'YELLOW',
    }),
    '/projects/proj-1',
  );

  assert.equal(
    getDashboardTaskHref({
      id: 'task-2',
      title: 'Pour concrete',
      projectId: 'proj-1',
      projectName: 'Riverside Warehouse',
      dueDate: '2026-11-25',
      status: 'PENDING',
      priority: 'HIGH',
      isOverdue: false,
      healthStatus: 'YELLOW',
    }),
    '/projects/proj-1/tasks/task-2',
  );
});

test('sortUpcomingDeadlines and sortDashboardProjects place urgent/overdue items first', () => {
  const sortedDeadlines = sortUpcomingDeadlines([
    {
      type: 'MILESTONE',
      id: 'ms-1',
      title: 'Foundation complete',
      projectId: 'proj-1',
      projectName: 'Riverside Warehouse',
      date: '2026-11-24',
      isOverdue: false,
      healthStatus: 'YELLOW',
    },
    {
      type: 'TASK',
      id: 'task-1',
      title: 'Order rebar',
      projectId: 'proj-1',
      projectName: 'Riverside Warehouse',
      date: '2026-11-19',
      isOverdue: true,
      healthStatus: 'RED',
    },
  ]);

  assert.equal(sortedDeadlines[0].id, 'task-1');
  assert.equal(sortedDeadlines[1].id, 'ms-1');

  const sortedProjects = sortDashboardProjects([
    {
      id: 'p-green',
      name: 'Alpha Site',
      healthStatus: 'GREEN',
      totalTasks: 5,
      completedTasks: 5,
      overdueTasks: 0,
      overdueMilestones: 0,
    },
    {
      id: 'p-red',
      name: 'Zeta Site',
      healthStatus: 'RED',
      totalTasks: 5,
      completedTasks: 2,
      overdueTasks: 1,
      overdueMilestones: 0,
    },
  ]);

  assert.equal(sortedProjects[0].id, 'p-red');
  assert.equal(sortedProjects[1].id, 'p-green');
});