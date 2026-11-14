import assert from 'node:assert/strict';
import { test } from 'node:test';
import { safeNextPath } from './navigation.ts';

const FALLBACK = '/dashboard';

test('keeps safe same-origin paths', () => {
  assert.equal(safeNextPath('/projects', FALLBACK), '/projects');
  assert.equal(safeNextPath('/projects/new?x=1', FALLBACK), '/projects/new?x=1');
});

test('falls back for rejected values', () => {
  const rejected = [
    null,
    '',
    '//evil.com',
    '/\\evil.com',
    'https://evil.com',
    'javascript:alert(1)',
    '/login',
    '/login/',
    '/login?next=/x',
    '/login/../login',
    '/%2e%2e/login',
    '/..//evil.com',
    '/%2e%2e//evil.com',
    '/forgot-password',
    '/reset-password',
    '/\t/evil.com',
  ];

  for (const raw of rejected) {
    assert.equal(safeNextPath(raw, FALLBACK), FALLBACK, `expected fallback for ${JSON.stringify(raw)}`);
  }
});

test('returns the normalised path, search and hash', () => {
  assert.equal(
    safeNextPath('/projects/../projects?tab=active#top', FALLBACK),
    '/projects?tab=active#top',
  );
});
