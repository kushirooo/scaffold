import { readFileSync } from 'node:fs';

/**
 * SecLists `10k-most-common.txt`, pinned at upstream commit
 * 913b327317496d062bcc7cace524aaad8a693be2 and bundled verbatim in
 * `src/auth/data/`. Attribution, licence and checksums are recorded in
 * `docs/third-party-notices.md`.
 */
const BLOCKLIST_FILE_URL = new URL(
  './data/10k-most-common.txt',
  import.meta.url,
);

function loadBlocklist(): ReadonlySet<string> {
  const contents = readFileSync(BLOCKLIST_FILE_URL, 'utf8');
  // The committed corpus is 10001 LF-terminated ASCII entries; dropping the
  // empty tail keeps the set to exactly the entries the file lists.
  return new Set(contents.split('\n').filter((entry) => entry.length > 0));
}

/** Loaded once at module initialisation, as decided in ADR 0003. */
export const PASSWORD_BLOCKLIST: ReadonlySet<string> = loadBlocklist();

/**
 * Exact match against the bundled corpus, after the policy's NFKC
 * normalisation and lowercasing. The argument must already be NFKC-normalised
 * (use `normalisePassword` from `password-policy.ts`).
 */
export function isBlocklistedPassword(normalisedPassword: string): boolean {
  return PASSWORD_BLOCKLIST.has(normalisedPassword.toLowerCase());
}
