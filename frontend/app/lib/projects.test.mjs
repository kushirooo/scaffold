import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ApiError } from './api.ts';
import {
  RESTORE_WINDOW_DAYS,
  formatCurrency,
  isRestoreExpired,
  restoreDeadline,
  restoreStatusLabel,
  toProjectApiError,
} from './projects.ts';

const ARCHIVED_AT = '2026-11-15T00:00:00.000Z';
const DEADLINE = new Date('2026-12-15T00:00:00.000Z');

test('formats budgets as US dollars with exactly two decimal places', () => {
  assert.equal(formatCurrency(125000.5), '$125,000.50');
  assert.equal(formatCurrency(0), '$0.00');
  assert.equal(formatCurrency(99.9), '$99.90');
  assert.equal(formatCurrency(1234.5), '$1,234.50');
  // Inverted `maximumFractionDigits` (0) or a `.00`-only format fails above.
  assert.match(formatCurrency(125000.5), /\.\d{2}$/);
});

test('treats a non-finite budget as $0.00 rather than printing NaN', () => {
  assert.equal(formatCurrency(Number.NaN), '$0.00');
  assert.equal(formatCurrency(Number.POSITIVE_INFINITY), '$0.00');
});

test('restore deadline is archivedAt plus 30 days', () => {
  assert.equal(RESTORE_WINDOW_DAYS, 30);
  assert.deepEqual(restoreDeadline(ARCHIVED_AT), DEADLINE);
  assert.equal(restoreDeadline(null), null);
  assert.equal(restoreDeadline(undefined), null);
  assert.equal(restoreDeadline('not-a-date'), null);
});

test('restore window is still open at the deadline instant and closed 1ms after', () => {
  const oneMs = 1;
  // Boundary mirrors the API: `now > deadline` is the only refusal.
  assert.equal(isRestoreExpired(ARCHIVED_AT, DEADLINE), false);
  assert.equal(
    isRestoreExpired(ARCHIVED_AT, new Date(DEADLINE.getTime() - oneMs)),
    false,
  );
  assert.equal(
    isRestoreExpired(ARCHIVED_AT, new Date(DEADLINE.getTime() + oneMs)),
    true,
  );
  // No archive timestamp means no window to expire.
  assert.equal(isRestoreExpired(null), false);
});

test('archived card copy names the deadline, the expiry, or an honest fallback', () => {
  assert.equal(
    restoreStatusLabel(ARCHIVED_AT, new Date('2026-11-20T00:00:00.000Z')),
    'Restorable until 15 Dec 2026 UTC',
  );
  assert.equal(
    restoreStatusLabel(ARCHIVED_AT, new Date('2026-12-16T00:00:00.000Z')),
    'Restore window expired on 15 Dec 2026 UTC',
  );
  assert.equal(restoreStatusLabel(null), 'Restore deadline unavailable');
});

test('normalises a single API message with no validation details', () => {
  const failure = toProjectApiError(
    { message: 'At least one project field must be provided' },
    'Failed to update project.',
  );
  assert.deepEqual(failure, {
    message: 'At least one project field must be provided',
    details: [],
  });
});

test('keeps every validation message from a string[] message payload', () => {
  const failure = toProjectApiError(
    {
      message: [
        'name must be shorter than or equal to 200 characters',
        'budget must not be less than 0',
      ],
    },
    'Failed to create project.',
  );
  assert.deepEqual(failure.details, [
    'name must be shorter than or equal to 200 characters',
    'budget must not be less than 0',
  ]);
  assert.equal(
    failure.message,
    'name must be shorter than or equal to 200 characters budget must not be less than 0',
  );
});

test('prefers an ApiError-style details array and keeps its headline', () => {
  const failure = toProjectApiError(
    {
      message: 'Validation failed',
      details: ['startDate must be a valid ISO date'],
    },
    'Failed to update project.',
  );
  assert.deepEqual(failure, {
    message: 'Validation failed',
    details: ['startDate must be a valid ISO date'],
  });
});

test('keeps details and headline from a real ApiError', () => {
  const error = new ApiError('Validation failed', 400, 'VALIDATION_ERROR', ['a', 'b']);
  assert.deepEqual(toProjectApiError(error, 'Failed to update project.'), {
    message: 'Validation failed',
    details: ['a', 'b'],
  });
});

test('falls back for unknown failures instead of leaking a raw shape', () => {
  for (const value of [null, undefined, 'boom', 404, { status: 500 }]) {
    assert.deepEqual(toProjectApiError(value, 'Something went wrong.'), {
      message: 'Something went wrong.',
      details: [],
    });
  }
  // Inverted logic (fallback always used, or details dropped) fails above.
});
