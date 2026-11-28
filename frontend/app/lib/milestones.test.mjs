import test from 'node:test';
import assert from 'node:assert/strict';

/**
 * Mirrors frontend/app/lib/milestones.ts for Node built-in test runner verification.
 */
function getTodayKualaLumpur(now = new Date()) {
  const timeZone = process.env.NEXT_PUBLIC_APP_TIMEZONE ?? 'Asia/Kuala_Lumpur';
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);

  const year = parts.find((p) => p.type === 'year')?.value ?? '1970';
  const month = parts.find((p) => p.type === 'month')?.value ?? '01';
  const day = parts.find((p) => p.type === 'day')?.value ?? '01';
  return `${year}-${month}-${day}`;
}

function addCalendarDays(dateStr, days) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  const year = String(dt.getUTCFullYear()).padStart(4, '0');
  const month = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const day = String(dt.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getMilestoneHealthStatus(milestone, now = new Date()) {
  if (milestone.isCompleted) return 'GREEN';

  const today = getTodayKualaLumpur(now);
  if (milestone.isOverdue || milestone.targetDate < today) {
    return 'RED';
  }

  const dueSoonCutoff = addCalendarDays(today, 3);
  if (milestone.targetDate >= today && milestone.targetDate <= dueSoonCutoff) {
    return 'YELLOW';
  }

  return 'GREEN';
}

function computeProjectMilestoneSummary(milestones, now = new Date()) {
  const totalMilestones = milestones.length;
  if (totalMilestones === 0) {
    return {
      totalMilestones: 0,
      completedMilestones: 0,
      onTrackMilestones: 0,
      overdueMilestones: 0,
      overallCompletionPercent: 0,
      summaryText: '0% complete (0 of 0 milestones on track)',
    };
  }

  const today = getTodayKualaLumpur(now);
  let completedMilestones = 0;
  let overdueMilestones = 0;

  for (const m of milestones) {
    if (m.isCompleted) {
      completedMilestones += 1;
    } else if (m.isOverdue || m.targetDate < today) {
      overdueMilestones += 1;
    }
  }

  const onTrackMilestones = totalMilestones - overdueMilestones;
  const overallCompletionPercent = Math.floor(
    (100 * completedMilestones) / totalMilestones,
  );

  return {
    totalMilestones,
    completedMilestones,
    onTrackMilestones,
    overdueMilestones,
    overallCompletionPercent,
    summaryText: `${overallCompletionPercent}% complete (${onTrackMilestones} of ${totalMilestones} milestones on track)`,
  };
}

function buildCreateMilestonePayload(values) {
  const payload = {
    name: values.name.trim(),
    targetDate: values.targetDate,
  };
  const trimmedDesc = values.description.trim();
  if (trimmedDesc.length > 0) {
    payload.description = trimmedDesc;
  }
  return payload;
}

function buildUpdateMilestonePayload(existing, values) {
  const diff = {};
  const trimmedName = values.name.trim();
  if (trimmedName !== existing.name) {
    diff.name = trimmedName;
  }

  const trimmedDesc = values.description.trim();
  const existingDesc = existing.description ?? '';
  if (trimmedDesc !== existingDesc) {
    diff.description = trimmedDesc.length > 0 ? trimmedDesc : null;
  }

  if (values.targetDate !== existing.targetDate) {
    diff.targetDate = values.targetDate;
  }

  return diff;
}

test('addCalendarDays handles month and year rollovers', () => {
  assert.equal(addCalendarDays('2026-11-29', 3), '2026-12-02');
  assert.equal(addCalendarDays('2026-12-30', 3), '2027-01-02');
});

test('getMilestoneHealthStatus enforces D4 RED / YELLOW / GREEN rules', () => {
  // 2026-11-21 10:00 +08:00
  const fixedNow = new Date('2026-11-21T02:00:00.000Z');

  assert.equal(
    getMilestoneHealthStatus(
      { targetDate: '2026-11-20', isCompleted: true, isOverdue: false },
      fixedNow,
    ),
    'GREEN',
  );

  assert.equal(
    getMilestoneHealthStatus(
      { targetDate: '2026-11-20', isCompleted: false, isOverdue: true },
      fixedNow,
    ),
    'RED',
  );

  assert.equal(
    getMilestoneHealthStatus(
      { targetDate: '2026-11-21', isCompleted: false, isOverdue: false },
      fixedNow,
    ),
    'YELLOW',
  );

  assert.equal(
    getMilestoneHealthStatus(
      { targetDate: '2026-11-24', isCompleted: false, isOverdue: false },
      fixedNow,
    ),
    'YELLOW',
  );

  assert.equal(
    getMilestoneHealthStatus(
      { targetDate: '2026-11-25', isCompleted: false, isOverdue: false },
      fixedNow,
    ),
    'GREEN',
  );
});

test('computeProjectMilestoneSummary matches "75% complete (3 of 4 milestones on track)" format', () => {
  const fixedNow = new Date('2026-11-21T02:00:00.000Z');
  const summary = computeProjectMilestoneSummary(
    [
      { targetDate: '2026-11-10', isCompleted: true, isOverdue: false, completionPercent: 100 },
      { targetDate: '2026-11-15', isCompleted: true, isOverdue: false, completionPercent: 100 },
      { targetDate: '2026-11-18', isCompleted: true, isOverdue: false, completionPercent: 100 },
      { targetDate: '2026-11-19', isCompleted: false, isOverdue: true, completionPercent: 40 },
    ],
    fixedNow,
  );

  assert.equal(summary.overallCompletionPercent, 75);
  assert.equal(summary.onTrackMilestones, 3);
  assert.equal(summary.totalMilestones, 4);
  assert.equal(summary.summaryText, '75% complete (3 of 4 milestones on track)');
});

test('buildCreateMilestonePayload and buildUpdateMilestonePayload omit unchanged/empty fields', () => {
  const createPayload = buildCreateMilestonePayload({
    name: '  Foundation complete  ',
    description: '   ',
    targetDate: '2026-12-05',
  });
  assert.deepEqual(createPayload, {
    name: 'Foundation complete',
    targetDate: '2026-12-05',
  });

  const existing = {
    id: 'm1',
    projectId: 'p1',
    name: 'Foundation complete',
    description: 'Initial notes',
    targetDate: '2026-12-05',
    completionPercent: 0,
    completedTasks: 0,
    totalTasks: 0,
    isCompleted: false,
    isOverdue: false,
    createdAt: '2026-11-21T00:00:00.000Z',
    updatedAt: '2026-11-21T00:00:00.000Z',
  };

  assert.deepEqual(
    buildUpdateMilestonePayload(existing, {
      name: 'Foundation complete',
      description: 'Initial notes',
      targetDate: '2026-12-05',
    }),
    {},
  );

  assert.deepEqual(
    buildUpdateMilestonePayload(existing, {
      name: 'Foundation complete',
      description: '',
      targetDate: '2026-12-10',
    }),
    {
      description: null,
      targetDate: '2026-12-10',
    },
  );
});