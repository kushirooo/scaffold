import {
  addDays,
  isDateBefore,
  toDateOnly,
  todayInTimeZone,
} from './date.js';

describe('date helpers', () => {
  it('uses the APP_TIMEZONE calendar day, not UTC', () => {
    expect(
      todayInTimeZone(
        'Asia/Kuala_Lumpur',
        new Date('2026-11-25T15:59:59.000Z'),
      ),
    ).toBe('2026-11-25');
    expect(
      todayInTimeZone(
        'Asia/Kuala_Lumpur',
        new Date('2026-11-25T16:00:00.000Z'),
      ),
    ).toBe('2026-11-26');
  });

  it('converts a date column to a date-only string', () => {
    expect(toDateOnly(new Date('2026-11-25T00:00:00.000Z'))).toBe(
      '2026-11-25',
    );
  });

  it('compares date-only strings', () => {
    expect(isDateBefore('2026-11-24', '2026-11-25')).toBe(true);
    expect(isDateBefore('2026-11-25', '2026-11-25')).toBe(false);
    expect(isDateBefore('2026-11-26', '2026-11-25')).toBe(false);
  });

  it('adds calendar days across month and year boundaries', () => {
    expect(addDays('2026-11-25', 3)).toBe('2026-11-28');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-11-01', -1)).toBe('2026-10-31');
  });
});
