import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildMonthGrid,
  dashboardMetricCards,
  defaultSelectedDay,
  equipmentAttentionTotal,
  formatMonthLabel,
  getDashboardProjectHref,
  getDashboardTaskHref,
  getDeadlineItemHref,
  groupCalendarItems,
  nextTaskAction,
  sortDashboardProjects,
  sortTeamWorkload,
  sortUpcomingDeadlines,
  withAllNotificationsRead,
  withNotificationRead,
  workerTaskCounts,
} from './dashboard.ts';

const workerTask = (overrides = {}) => ({
  id: 'task-1',
  title: 'Order rebar',
  projectId: 'proj-1',
  projectName: 'Riverside Warehouse',
  dueDate: '2026-11-19',
  priority: 'URGENT',
  status: 'PENDING',
  isOverdue: true,
  healthStatus: 'RED',
  allowedStatusChanges: ['IN_PROGRESS'],
  completedAt: null,
  ...overrides,
});

const notification = (id, readAt = null) => ({
  id,
  type: 'PROJECT_ASSIGNED',
  title: 'You were assigned to a project',
  message: 'You were assigned as Member.',
  projectId: 'proj-1',
  projectName: 'Riverside Warehouse',
  readAt,
  createdAt: '2026-11-21T09:30:00.000Z',
});

test('dashboardMetricCards builds the Admin cards from the system overview', () => {
  const cards = dashboardMetricCards('ADMIN', {
    systemOverview: {
      users: {
        total: 12,
        active: 11,
        inactive: 1,
        byRole: { ADMIN: 1, PROJECT_MANAGER: 3, WORKER: 7, VIEWER: 1 },
      },
      projects: {
        total: 8,
        byStatus: { ACTIVE: 5, ON_HOLD: 1, COMPLETED: 1 },
        archived: 1,
      },
      budget: { nonArchived: 1250000, active: 900000, averagePerProject: 156250 },
      tasks: { total: 120, completed: 45, overdue: 7 },
      milestones: { total: 18, completed: 9, overdue: 2 },
    },
  });

  assert.deepEqual(
    cards.map((card) => card.label),
    ['Users', 'Projects', 'Budget', 'Overdue tasks'],
  );
  assert.equal(cards[0].value, 12);
  assert.equal(cards[2].value, 1250000);
  assert.equal(cards[2].format, 'currency');
  assert.equal(cards[3].value, 7);
  assert.equal(cards[3].tone, 'danger');
});

test('dashboardMetricCards builds PM cards and adds equipment only when present', () => {
  const base = {
    activeProjects: [
      {
        id: 'p1',
        name: 'Riverside',
        healthStatus: 'RED',
        totalTasks: 10,
        completedTasks: 7,
        overdueTasks: 1,
        overdueMilestones: 0,
      },
      {
        id: 'p2',
        name: 'Harbour',
        healthStatus: 'GREEN',
        totalTasks: 10,
        completedTasks: 3,
        overdueTasks: 0,
        overdueMilestones: 1,
      },
    ],
  };

  const withoutEquipment = dashboardMetricCards('PROJECT_MANAGER', base);
  assert.deepEqual(
    withoutEquipment.map((card) => card.label),
    ['Active projects', 'Task progress', 'Overdue items'],
  );
  assert.equal(withoutEquipment[1].value, '10/20 (50%)');
  assert.equal(withoutEquipment[2].value, 2);

  const withEquipment = dashboardMetricCards('PROJECT_MANAGER', {
    ...base,
    equipmentUsage: {
      inventory: { total: 25, available: 18, inUse: 5, maintenance: 2 },
      myProjects: { assigned: 4, overdue: 1, dueSoon: 2 },
      attention: [],
    },
  });
  assert.deepEqual(
    withEquipment.map((card) => card.label),
    ['Active projects', 'Task progress', 'Equipment attention', 'Overdue items'],
  );
  assert.equal(withEquipment[2].value, 1);
});

test('dashboardMetricCards builds Worker cards and none for Viewer', () => {
  const cards = dashboardMetricCards('WORKER', {
    myTasks: {
      PENDING: [workerTask(), workerTask({ id: 'task-2', isOverdue: false })],
      IN_PROGRESS: [workerTask({ id: 'task-3', status: 'IN_PROGRESS' })],
      COMPLETED: [workerTask({ id: 'task-4', status: 'COMPLETED', isOverdue: false })],
    },
  });

  assert.deepEqual(
    cards.map((card) => [card.label, card.value]),
    [
      ['Open tasks', 3],
      ['In progress', 1],
      ['Completed', 1],
      ['Overdue', 2],
    ],
  );
  assert.deepEqual(dashboardMetricCards('VIEWER', {}), []);
});

test('workerTaskCounts splits the groups and counts overdue open tasks', () => {
  const counts = workerTaskCounts({
    PENDING: [workerTask(), workerTask({ id: 'task-2', isOverdue: false })],
    IN_PROGRESS: [workerTask({ id: 'task-3', isOverdue: true })],
    COMPLETED: [workerTask({ id: 'task-4', status: 'COMPLETED', isOverdue: false })],
  });

  assert.deepEqual(counts, {
    pending: 2,
    inProgress: 1,
    completed: 1,
    overdue: 2,
    open: 3,
  });
  assert.deepEqual(workerTaskCounts(undefined), {
    pending: 0,
    inProgress: 0,
    completed: 0,
    overdue: 0,
    open: 0,
  });
});

test('nextTaskAction follows allowedStatusChanges and rejects completed tasks', () => {
  assert.deepEqual(nextTaskAction(workerTask()), {
    status: 'IN_PROGRESS',
    label: 'Start Task',
  });
  assert.deepEqual(
    nextTaskAction(
      workerTask({ status: 'IN_PROGRESS', allowedStatusChanges: ['COMPLETED'] }),
    ),
    { status: 'COMPLETED', label: 'Mark Completed' },
  );
  assert.equal(
    nextTaskAction(workerTask({ status: 'COMPLETED', allowedStatusChanges: [] })),
    null,
  );
  assert.equal(nextTaskAction(workerTask({ allowedStatusChanges: [] })), null);
});

test('notification helpers update one item or all items', () => {
  const summary = {
    unreadCount: 1,
    items: [notification('n1'), notification('n2', '2026-11-20T09:00:00.000Z')],
  };

  const one = withNotificationRead(summary, 'n1');
  assert.equal(one.unreadCount, 0);
  assert.notEqual(one.items[0].readAt, null);
  assert.equal(one.items[1].readAt, '2026-11-20T09:00:00.000Z');

  assert.equal(withNotificationRead(summary, 'missing'), summary);
  assert.equal(withNotificationRead(one, 'n1'), one);
  assert.equal(withNotificationRead(summary, 'n2'), summary);

  const all = withAllNotificationsRead(summary);
  assert.equal(all.unreadCount, 0);
  assert.notEqual(all.items[0].readAt, null);
  assert.notEqual(all.items[1].readAt, null);
});

test('equipmentAttentionTotal and sortTeamWorkload follow the contract order', () => {
  assert.equal(equipmentAttentionTotal(undefined), 0);
  assert.equal(
    equipmentAttentionTotal({
      inventory: { total: 1, available: 0, inUse: 1, maintenance: 0 },
      myProjects: { assigned: 1, overdue: 3, dueSoon: 0 },
      attention: [],
    }),
    3,
  );

  const sorted = sortTeamWorkload([
    { userId: 'u1', name: 'Zed', openTasks: 5, overdueTasks: 0 },
    { userId: 'u2', name: 'Amy', openTasks: 2, overdueTasks: 1 },
    { userId: 'u3', name: 'Bob', openTasks: 9, overdueTasks: 1 },
  ]);
  assert.deepEqual(
    sorted.map((item) => item.userId),
    ['u3', 'u2', 'u1'],
  );
});

test('formatMonthLabel renders the month and year', () => {
  assert.equal(formatMonthLabel('2026-11'), 'November 2026');
  assert.equal(formatMonthLabel('2028-02'), 'February 2028');
});

test('buildMonthGrid builds a Monday-first 42-cell grid', () => {
  const november = buildMonthGrid('2026-11', '2026-11-28');
  assert.equal(november.length, 42);
  assert.equal(november[0].date, '2026-10-26');
  assert.equal(november[0].inMonth, false);
  assert.equal(november.filter((day) => day.inMonth).length, 30);
  assert.equal(november.filter((day) => day.isToday).length, 1);
  assert.equal(november.find((day) => day.isToday)?.date, '2026-11-28');

  const june = buildMonthGrid('2026-06', '2026-06-15');
  assert.equal(june[0].date, '2026-06-01');
  assert.equal(june[0].inMonth, true);

  const february = buildMonthGrid('2028-02', '2028-02-10');
  assert.equal(february.filter((day) => day.inMonth).length, 29);
});

test('groupCalendarItems keeps item order and handles an empty month', () => {
  const groups = groupCalendarItems([
    { type: 'TASK', id: 't1', title: 'A', projectId: 'p', projectName: 'P', date: '2026-11-02', isOverdue: false, healthStatus: 'GREEN' },
    { type: 'MILESTONE', id: 'm1', title: 'B', projectId: 'p', projectName: 'P', date: '2026-11-02', isOverdue: false, healthStatus: 'YELLOW' },
    { type: 'TASK', id: 't2', title: 'C', projectId: 'p', projectName: 'P', date: '2026-11-03', isOverdue: false, healthStatus: 'GREEN' },
  ]);

  assert.deepEqual(groups['2026-11-02'].map((item) => item.id), ['t1', 'm1']);
  assert.deepEqual(groups['2026-11-03'].map((item) => item.id), ['t2']);
  assert.deepEqual(groupCalendarItems([]), {});
});

test('defaultSelectedDay selects today, or the first item, or day one', () => {
  const items = [
    { type: 'TASK', id: 't1', title: 'A', projectId: 'p', projectName: 'P', date: '2026-11-02', isOverdue: false, healthStatus: 'GREEN' },
    { type: 'TASK', id: 't2', title: 'B', projectId: 'p', projectName: 'P', date: '2026-11-01', isOverdue: false, healthStatus: 'GREEN' },
  ];

  assert.equal(defaultSelectedDay('2026-11', items, '2026-11-28'), '2026-11-28');
  assert.equal(defaultSelectedDay('2026-11', items, '2026-12-01'), '2026-11-01');
  assert.equal(defaultSelectedDay('2026-11', [], '2026-12-01'), '2026-11-01');
});

test('getDashboardProjectHref and the task and deadline hrefs are correct', () => {
  assert.equal(getDashboardProjectHref('proj-1', 'PROJECT_MANAGER'), '/projects/proj-1');
  assert.equal(getDashboardProjectHref('proj-1', 'WORKER'), '/projects/proj-1');
  assert.equal(getDashboardProjectHref('proj-1', 'ADMIN'), null);

  assert.equal(
    getDashboardTaskHref(workerTask()),
    '/projects/proj-1/tasks/task-1',
  );

  assert.equal(
    getDeadlineItemHref({
      type: 'TASK',
      id: 'task-1',
      title: 'A',
      projectId: 'proj-1',
      projectName: 'P',
      date: '2026-11-01',
      isOverdue: false,
      healthStatus: 'GREEN',
    }),
    '/projects/proj-1/tasks/task-1',
  );
  assert.equal(
    getDeadlineItemHref({
      type: 'MILESTONE',
      id: 'ms-1',
      title: 'B',
      projectId: 'proj-1',
      projectName: 'P',
      date: '2026-11-01',
      isOverdue: false,
      healthStatus: 'GREEN',
    }),
    '/projects/proj-1',
  );
});

test('sortUpcomingDeadlines and sortDashboardProjects put urgent items first', () => {
  const sortedDeadlines = sortUpcomingDeadlines([
    { type: 'MILESTONE', id: 'm1', title: 'B', projectId: 'p', projectName: 'P', date: '2026-11-24', isOverdue: false, healthStatus: 'YELLOW' },
    { type: 'TASK', id: 't1', title: 'A', projectId: 'p', projectName: 'P', date: '2026-11-24', isOverdue: false, healthStatus: 'GREEN' },
    { type: 'TASK', id: 't2', title: 'C', projectId: 'p', projectName: 'P', date: '2026-11-19', isOverdue: true, healthStatus: 'RED' },
  ]);
  assert.deepEqual(sortedDeadlines.map((item) => item.id), ['t2', 't1', 'm1']);

  const sortedProjects = sortDashboardProjects([
    { id: 'green', name: 'Alpha', healthStatus: 'GREEN', totalTasks: 1, completedTasks: 1, overdueTasks: 0, overdueMilestones: 0 },
    { id: 'red', name: 'Zeta', healthStatus: 'RED', totalTasks: 1, completedTasks: 0, overdueTasks: 1, overdueMilestones: 0 },
  ]);
  assert.deepEqual(sortedProjects.map((project) => project.id), ['red', 'green']);
});
