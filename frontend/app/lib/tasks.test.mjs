import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildCreateTaskPayload,
  buildUpdateTaskPayload,
  getEarliestDueDate,
  getNextTaskStatus,
  getProjectDateBoundary,
  getTodayKualaLumpur,
  isDateBeforeToday,
} from './tasks.ts';

const baseTask = {
  id: 'task-1',
  projectId: 'proj-1',
  title: 'Pour foundation slab',
  description: 'Phase 1 concrete pour',
  dueDate: '2026-11-20',
  priority: 'HIGH',
  assigneeId: 'worker-1',
  assigneeName: 'Amina',
  assigneeIsMember: true,
  status: 'PENDING',
  milestoneId: 'ms-1',
  completedAt: null,
  createdBy: 'pm-1',
  isOverdue: true,
  createdAt: '2026-11-01T00:00:00.000Z',
  updatedAt: '2026-11-01T00:00:00.000Z',
};

test('buildCreateTaskPayload trims title and description and omits empty optional fields', () => {
  const payload = buildCreateTaskPayload({
    title: '  Install rebar  ',
    description: '   ',
    dueDate: '2026-12-01',
    priority: 'MEDIUM',
    assigneeId: 'worker-1',
    milestoneId: '',
  });

  assert.deepEqual(payload, {
    title: 'Install rebar',
    dueDate: '2026-12-01',
    priority: 'MEDIUM',
    assigneeId: 'worker-1',
  });
  assert.equal('description' in payload, false);
  assert.equal('milestoneId' in payload, false);
});

test('buildCreateTaskPayload includes trimmed description and milestoneId when present', () => {
  const payload = buildCreateTaskPayload({
    title: '  Install rebar  ',
    description: '  Grid B2  ',
    dueDate: '2026-12-01',
    priority: 'URGENT',
    assigneeId: 'worker-2',
    milestoneId: 'ms-2',
  });

  assert.deepEqual(payload, {
    title: 'Install rebar',
    description: 'Grid B2',
    dueDate: '2026-12-01',
    priority: 'URGENT',
    assigneeId: 'worker-2',
    milestoneId: 'ms-2',
  });
});

test('buildUpdateTaskPayload omits unchanged dueDate (Rule D7) and returns {} when nothing changed', () => {
  const unchanged = buildUpdateTaskPayload(baseTask, {
    title: 'Pour foundation slab',
    description: 'Phase 1 concrete pour',
    dueDate: '2026-11-20',
    priority: 'HIGH',
    assigneeId: 'worker-1',
    milestoneId: 'ms-1',
  });
  assert.deepEqual(unchanged, {});

  const editOverdueTitleOnly = buildUpdateTaskPayload(baseTask, {
    title: 'Pour foundation slab (North)',
    description: 'Phase 1 concrete pour',
    dueDate: '2026-11-20',
    priority: 'HIGH',
    assigneeId: 'worker-1',
    milestoneId: 'ms-1',
  });
  assert.deepEqual(editOverdueTitleOnly, {
    title: 'Pour foundation slab (North)',
  });
  assert.equal('dueDate' in editOverdueTitleOnly, false);
});

test('buildUpdateTaskPayload sets null when description or milestoneId is cleared and includes changed fields', () => {
  const clearedAndUpdated = buildUpdateTaskPayload(baseTask, {
    title: 'Updated slab task',
    description: '   ',
    dueDate: '2026-12-10',
    priority: 'URGENT',
    assigneeId: 'worker-2',
    milestoneId: '',
  });

  assert.deepEqual(clearedAndUpdated, {
    title: 'Updated slab task',
    description: null,
    dueDate: '2026-12-10',
    priority: 'URGENT',
    assigneeId: 'worker-2',
    milestoneId: null,
  });
});

test('getNextTaskStatus advances PENDING -> IN_PROGRESS -> COMPLETED -> null', () => {
  assert.equal(getNextTaskStatus('PENDING'), 'IN_PROGRESS');
  assert.equal(getNextTaskStatus('IN_PROGRESS'), 'COMPLETED');
  assert.equal(getNextTaskStatus('COMPLETED'), null);
});

test('getEarliestDueDate uses the later of today and the project start', () => {
  assert.equal(getEarliestDueDate('2026-11-26', '2026-11-01'), '2026-11-26');
  assert.equal(getEarliestDueDate('2026-11-26', '2026-12-01'), '2026-12-01');
  assert.equal(getEarliestDueDate('2026-11-26', '2026-11-26'), '2026-11-26');
});

test('getProjectDateBoundary accepts the project boundaries and rejects outside', () => {
  assert.equal(getProjectDateBoundary('2026-11-01', '2026-11-01', '2026-12-31'), null);
  assert.equal(getProjectDateBoundary('2026-12-31', '2026-11-01', '2026-12-31'), null);
  assert.equal(getProjectDateBoundary('2026-11-15', '2026-11-01', '2026-12-31'), null);
  assert.equal(
    getProjectDateBoundary('2026-10-31', '2026-11-01', '2026-12-31'),
    'BEFORE_START',
  );
  assert.equal(
    getProjectDateBoundary('2027-01-01', '2026-11-01', '2026-12-31'),
    'AFTER_END',
  );
});

test('getTodayKualaLumpur converts UTC boundaries at 16:00Z accurately', () => {
  assert.equal(
    getTodayKualaLumpur(new Date('2026-11-25T15:59:59.000Z')),
    '2026-11-25',
  );
  assert.equal(
    getTodayKualaLumpur(new Date('2026-11-25T16:00:00.000Z')),
    '2026-11-26',
  );
});

test('isDateBeforeToday compares calendar dates against fixed now values', () => {
  const fixedNow = new Date('2026-11-25T16:00:00.000Z'); // 2026-11-26 in Asia/Kuala_Lumpur
  assert.equal(isDateBeforeToday('2026-11-25', fixedNow), true);
  assert.equal(isDateBeforeToday('2026-11-26', fixedNow), false);
  assert.equal(isDateBeforeToday('2026-11-27', fixedNow), false);
});