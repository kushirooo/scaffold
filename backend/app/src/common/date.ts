/**
 * Date-only helpers for the Sprint 2 rules. The database stores `date` columns,
 * so every comparison uses `YYYY-MM-DD` strings and the `APP_TIMEZONE` day.
 */

/** The current calendar date in `timeZone`, as `YYYY-MM-DD`. */
export function todayInTimeZone(
  timeZone: string,
  now: Date = new Date(),
): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);

  const part = (type: string): string | undefined =>
    parts.find((item) => item.type === type)?.value;

  const year = part('year');
  const month = part('month');
  const day = part('day');

  if (!year || !month || !day) {
    throw new Error(`Unable to resolve today in time zone "${timeZone}"`);
  }

  return `${year}-${month}-${day}`;
}

/** A `@db.Date` value (UTC midnight) as `YYYY-MM-DD`. */
export function toDateOnly(value: Date): string {
  return value.toISOString().slice(0, 10);
}

/** True when date `left` is before date `right`. Both are `YYYY-MM-DD`. */
export function isDateBefore(left: string, right: string): boolean {
  return left < right;
}

/** Add calendar days to a `YYYY-MM-DD` string. */
export function addDays(dateOnly: string, days: number): string {
  const date = new Date(`${dateOnly}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return toDateOnly(date);
}
