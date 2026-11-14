import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  classifyUserApiError,
  isAdminRole,
  mapUserRecord,
  mapUsersResponse,
  mergeUserRecord,
  normalizeRole,
  normalizeStatus,
  roleLabel,
  statusValue,
} from './user-admin.ts';

test('admin gate accepts the API enum and the UI label only', () => {
  for (const value of ['ADMIN', 'Admin', ' admin ', 'AdMiN']) {
    assert.equal(isAdminRole(value), true, `expected ${JSON.stringify(value)} to pass the gate`);
  }
  for (const value of ['PROJECT_MANAGER', 'Project Manager', 'WORKER', 'VIEWER', 'Administrator', 'SuperAdmin', '', null, undefined, 42]) {
    assert.equal(isAdminRole(value), false, `expected ${JSON.stringify(value)} to fail the gate`);
  }
});

test('role mapping tolerates labels, enum strings and separators, and rejects unknown values', () => {
  assert.equal(normalizeRole('Admin'), 'Admin');
  assert.equal(normalizeRole('ADMIN'), 'Admin');
  assert.equal(normalizeRole('PROJECT_MANAGER'), 'Project Manager');
  assert.equal(normalizeRole('project-manager'), 'Project Manager');
  assert.equal(normalizeRole('worker'), 'Worker');
  assert.equal(normalizeRole('VIEWER'), 'Viewer');
  assert.equal(normalizeRole('Administrator'), null);
  assert.equal(normalizeRole(undefined), null);
  assert.equal(roleLabel('PROJECT_MANAGER'), 'Project Manager');
  assert.equal(roleLabel('Admin'), 'Admin');
});

test('status mapping normalises labels, booleans and isActive', () => {
  assert.equal(normalizeStatus('Active'), 'Active');
  assert.equal(normalizeStatus('inactive'), 'Inactive');
  assert.equal(normalizeStatus('INACTIVE'), 'Inactive');
  assert.equal(normalizeStatus(false), 'Inactive');
  assert.equal(normalizeStatus(true), 'Active');
  assert.equal(normalizeStatus(undefined), 'Active');
  assert.equal(statusValue('Inactive'), 'inactive');
  assert.equal(statusValue('Active'), 'active');
});

test('maps a full API user to the UI record', () => {
  const record = mapUserRecord({
    id: '0f0b6a4e-0000-4000-8000-000000000001',
    name: 'Aisyah Rahman',
    email: 'aisyah@rafconsult.test',
    position: 'Engineer',
    yearsOfExperience: 4,
    role: 'PROJECT_MANAGER',
    status: 'Active',
    joinedAt: '2026-11-01T00:00:00.000Z',
    lastActiveAt: '2026-11-14T08:00:00.000Z',
  });

  assert.deepEqual(record, {
    id: '0f0b6a4e-0000-4000-8000-000000000001',
    name: 'Aisyah Rahman',
    email: 'aisyah@rafconsult.test',
    position: 'Engineer',
    yearsOfExperience: 4,
    role: 'Project Manager',
    status: 'Active',
    joinedAt: '2026-11-01T00:00:00.000Z',
    lastActiveAt: '2026-11-14T08:00:00.000Z',
  });
});

test('maps edge cases: null lastActiveAt, inactive account, legacy names', () => {
  const record = mapUserRecord({
    id: 'id-1',
    fullName: 'Legacy Name',
    email: 'legacy@rafconsult.test',
    role: 'Admin',
    isActive: false,
    yearsOfExperience: 'not-a-number',
    createdAt: '2026-11-02T00:00:00.000Z',
    lastActiveAt: null,
  });

  assert.equal(record.name, 'Legacy Name');
  assert.equal(record.position, 'Clerk / Admin');
  assert.equal(record.role, 'Admin');
  assert.equal(record.status, 'Inactive');
  assert.equal(record.yearsOfExperience, 0);
  assert.equal(record.lastActiveAt, null);
  assert.equal(record.joinedAt, '2026-11-02T00:00:00.000Z');
});

test('merges a mutation response without losing the displayed lastActiveAt', () => {
  const previous = {
    id: 'id-1',
    name: 'Old Name',
    email: 'user@rafconsult.test',
    position: 'Engineer',
    yearsOfExperience: 2,
    role: 'Worker',
    status: 'Active',
    joinedAt: '2026-11-01T00:00:00.000Z',
    lastActiveAt: '2026-11-14T08:00:00.000Z',
  };
  // PATCH responses omit the sessions include, so lastActiveAt is null there.
  const patched = mapUserRecord({
    id: 'id-1',
    name: 'New Name',
    email: 'user@rafconsult.test',
    position: 'Senior Engineer',
    yearsOfExperience: 5,
    role: 'PROJECT_MANAGER',
    status: 'Inactive',
    joinedAt: '2026-11-01T00:00:00.000Z',
    lastActiveAt: null,
  });

  const merged = mergeUserRecord(previous, patched);
  assert.equal(merged.lastActiveAt, '2026-11-14T08:00:00.000Z');
  assert.equal(merged.name, 'New Name');
  assert.equal(merged.role, 'Project Manager');
  assert.equal(merged.status, 'Inactive');
  assert.equal(merged.position, 'Senior Engineer');

  // A real timestamp from the response still wins.
  assert.equal(
    mergeUserRecord(previous, { ...patched, lastActiveAt: '2026-11-15T09:00:00.000Z' }).lastActiveAt,
    '2026-11-15T09:00:00.000Z',
  );
});

test('unwraps the users list from the API body, the bare array and a malformed body', () => {
  const apiUser = {
    id: 'id-1',
    name: 'One',
    email: 'one@rafconsult.test',
    role: 'Worker',
    status: 'Active',
    joinedAt: '2026-11-01T00:00:00.000Z',
    lastActiveAt: null,
  };

  assert.deepEqual(mapUsersResponse({ users: [apiUser] }).map((user) => user.id), ['id-1']);
  assert.deepEqual(mapUsersResponse([apiUser]).map((user) => user.id), ['id-1']);
  assert.deepEqual(mapUsersResponse({ users: 'nope' }), []);
  assert.deepEqual(mapUsersResponse(null), []);
});

test('classifies the error codes the UI acts on', () => {
  assert.deepEqual(classifyUserApiError({ status: 409, code: 'DUPLICATE_EMAIL', message: 'This email address is already registered.' }), {
    kind: 'duplicate-email',
    message: 'This email address is already registered.',
  });
  assert.deepEqual(classifyUserApiError({ status: 409, code: 'USER_INACTIVE', message: 'This account is inactive.' }), {
    kind: 'user-inactive',
    message: 'This account is inactive.',
  });
  assert.deepEqual(classifyUserApiError({ status: 409, code: 'USER_OWNS_PROJECTS', message: 'This user owns projects.' }), {
    kind: 'owns-projects',
    message: 'This user owns projects.',
  });
  assert.deepEqual(classifyUserApiError({ status: 502, code: 'WELCOME_EMAIL_FAILED', message: 'The welcome email could not be sent.' }), {
    kind: 'welcome-email-failed',
    message: 'The welcome email could not be sent.',
  });
});

test('classifies auth and unknown failures and supplies fallback messages', () => {
  assert.equal(classifyUserApiError({ status: 401, message: 'Authentication required' }).kind, 'unauthorized');
  assert.equal(classifyUserApiError({ status: 403, message: 'Administrator access required.' }).kind, 'forbidden');
  assert.equal(classifyUserApiError({ status: 404, message: 'User not found.' }).kind, 'not-found');
  assert.equal(classifyUserApiError({ status: 500 }).kind, 'generic');
  assert.equal(classifyUserApiError(null).kind, 'generic');

  assert.deepEqual(classifyUserApiError({ status: 409, code: 'USER_OWNS_PROJECTS' }), {
    kind: 'owns-projects',
    message: 'This user owns projects. Reassign or remove those projects before deleting the account.',
  });
  assert.deepEqual(classifyUserApiError({ status: 502 }), {
    kind: 'welcome-email-failed',
    message: 'The welcome email could not be sent. Please retry the resend.',
  });
  assert.equal(classifyUserApiError(undefined).message, 'Something went wrong. Please try again.');
});
