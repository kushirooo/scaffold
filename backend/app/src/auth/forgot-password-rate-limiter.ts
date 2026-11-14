import { Injectable } from '@nestjs/common';

/**
 * Forgot-password anti-enumeration gates: a per-email sliding window and the
 * response-time floor shared by every branch of `PasswordRecoveryService`.
 *
 * Both gates are in-memory and dependency-free (no new package): the endpoint
 * only has to stop an attacker from email-bombing one address or timing the
 * known/unknown difference, and a process-local window is enough for that.
 */

/** Attempts allowed per normalised email in one window (kept ≥ the e2e usage). */
export const FORGOT_PASSWORD_RATE_LIMIT = 5;

/** Sliding-window length: 15 minutes, matching the RESET link lifetime. */
export const FORGOT_PASSWORD_RATE_WINDOW_MS = 15 * 60 * 1000;

/**
 * Hard cap on tracked addresses. Expired buckets are swept periodically; the
 * cap additionally means a flood of *distinct* addresses cannot grow the map
 * without bound. Under such a flood the oldest bucket (not the most recent
 * attacker) is evicted first.
 */
export const FORGOT_PASSWORD_RATE_MAX_TRACKED_EMAILS = 10_000;

/**
 * Minimum forgot-password response duration. Unknown and inactive addresses
 * return before any token/send work; the floor keeps them indistinguishable
 * from a known address at the HTTP layer. Provider SMTP latency can exceed the
 * floor on a real send (documented in `docs/qa/verification-us19.md`).
 */
export const FORGOT_PASSWORD_MIN_RESPONSE_MS = 500;

/** Outcome of recording one forgot-password attempt. */
export type ForgotPasswordRateLimitDecision = 'allowed' | 'limited';

/**
 * In-memory sliding-window limiter keyed by the normalised (trimmed,
 * lower-cased) email address.
 *
 * `record` is synchronous: Node's single-threaded event loop cannot interleave
 * another request between the check and the insert, so concurrent requests
 * cannot exceed the limit.
 */
@Injectable()
export class ForgotPasswordRateLimiter {
  private readonly buckets = new Map<string, number[]>();
  private nextSweepAt = 0;

  /**
   * Records an attempt for `normalisedEmail` and reports whether it may
   * proceed. Over-limit attempts keep the existing window and add no hit.
   */
  record(normalisedEmail: string): ForgotPasswordRateLimitDecision {
    const now = Date.now();
    this.sweepExpired(now);

    const hits = (this.buckets.get(normalisedEmail) ?? []).filter(
      (at) => now - at < FORGOT_PASSWORD_RATE_WINDOW_MS,
    );

    if (hits.length >= FORGOT_PASSWORD_RATE_LIMIT) {
      this.touch(normalisedEmail, hits);
      return 'limited';
    }

    hits.push(now);
    this.touch(normalisedEmail, hits);
    this.evictOverflow();
    return 'allowed';
  }

  /** Number of tracked addresses; bounded by the cap above. */
  get trackedEmailCount(): number {
    return this.buckets.size;
  }

  private touch(normalisedEmail: string, hits: number[]): void {
    // Delete + set keeps Map insertion order equal to recency, so overflow
    // eviction can drop the oldest bucket in O(1).
    this.buckets.delete(normalisedEmail);
    this.buckets.set(normalisedEmail, hits);
  }

  /** Drops buckets with no hit inside the current window; at most once per window. */
  private sweepExpired(now: number): void {
    if (now < this.nextSweepAt) return;

    for (const [email, hits] of this.buckets) {
      const fresh = hits.filter(
        (at) => now - at < FORGOT_PASSWORD_RATE_WINDOW_MS,
      );
      if (fresh.length === 0) {
        this.buckets.delete(email);
      } else if (fresh.length !== hits.length) {
        this.buckets.set(email, fresh);
      }
    }

    this.nextSweepAt = now + FORGOT_PASSWORD_RATE_WINDOW_MS;
  }

  private evictOverflow(): void {
    while (this.buckets.size > FORGOT_PASSWORD_RATE_MAX_TRACKED_EMAILS) {
      const oldest = this.buckets.keys().next().value;
      if (typeof oldest !== 'string') return;
      this.buckets.delete(oldest);
    }
  }
}

/**
 * Milliseconds still owed to the minimum response duration. Exported so the
 * service and its tests agree on the floor without duplicating the constant.
 */
export function forgotPasswordResponseFloorMs(
  startedAt: number,
  now: number = Date.now(),
): number {
  return Math.max(0, FORGOT_PASSWORD_MIN_RESPONSE_MS - (now - startedAt));
}

/**
 * Sleeps for the remaining floor time; a no-op once the floor has elapsed.
 * Called from the service's `finally`, so known, unknown and failed paths all
 * observe the same minimum duration.
 */
export async function waitForForgotPasswordResponseFloor(
  startedAt: number,
): Promise<void> {
  const remaining = forgotPasswordResponseFloorMs(startedAt);
  if (remaining <= 0) return;

  await new Promise<void>((resolve) => {
    setTimeout(resolve, remaining);
  });
}
