/**
 * Navigation helpers for post-login redirects.
 *
 * The `?next=` query parameter is attacker-controlled, so it is only honoured
 * when URL normalisation produces a same-origin absolute path; anything else
 * falls back to the supplied default (k332).
 */

/** Auth pages must never be a `next` target, or the redirect would loop. */
const AUTH_PATHS = new Set(['/login', '/forgot-password', '/reset-password']);

/** Sentinel origin used only to normalise a path; it is never navigated to. */
const NEXT_BASE_URL = 'http://mars.invalid';

/** ASCII control characters and whitespace are stripped by URL parsing. */
const UNSAFE_CHARS = /[\u0000-\u0020\u007f]/;

/**
 * Return a safe same-origin path built from `raw`, otherwise `fallback`.
 *
 * Normalisation (dot segments, backslashes, encoded dot segments) happens
 * through `new URL`, then the result is accepted only when all of these hold:
 * it is a `/`-rooted path, URL parsing keeps the sentinel origin, the resolved
 * pathname does not start with `//` or `/\`, it carries no whitespace/control
 * characters, and it is not an auth page (loop prevention).
 */
export function safeNextPath(raw: string | null, fallback: string): string {
  if (raw === null) return fallback;

  const candidate = raw.trim();
  if (!candidate.startsWith('/')) return fallback;
  if (UNSAFE_CHARS.test(candidate)) return fallback;

  let target: URL;
  try {
    target = new URL(candidate, NEXT_BASE_URL);
  } catch {
    return fallback;
  }

  // A different origin means the value resolved to `//host`, `/\host` or a
  // full scheme, i.e. it would leave the portal.
  if (target.origin !== NEXT_BASE_URL) return fallback;
  // A normalised path may still begin with `//` (e.g. `/..//host`); never hand
  // a protocol-relative string to the router.
  if (target.pathname.startsWith('//') || target.pathname.startsWith('/\\')) return fallback;

  const pathname = target.pathname.replace(/\/+$/, '') || '/';
  if (AUTH_PATHS.has(pathname.toLowerCase())) return fallback;

  return `${target.pathname}${target.search}${target.hash}`;
}
