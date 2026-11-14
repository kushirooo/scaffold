# STAB-US01 portal review — adversarial findings

Working tree: `2a33e5c` + uncommitted task-1 changes (9 modified / 3 new, read from `git status --short` plus the files themselves), not `git diff` alone. `npm run lint` re-run: exit 0. `npm run build` not re-run (implementer evidence accepted; Lead verifies).

- MEDIUM — `docs/qa/verification-us01-portal.md:34-36` — security-critical `safeNextPath` has no committed test: the 15-case proof is a one-off inline `node` run, `frontend/app/package.json` has no `test` script, so nothing fails if the logic breaks (§6/§10 require a test for new behaviour). — Commit the cases as `frontend/app/lib/navigation.test.ts` run via `node --test` (Node built-in, no new dependency), or record an explicit Lead waiver in the card.
- LOW — `frontend/app/lib/navigation.ts:35-38` — validation runs before URL normalisation, so `AUTH_PATHS` is exact-match bypassable: `next=/login/../login`, `/./login`, `/%2e/login` pass and then resolve back to `/login` (authenticated user kept on the login page's spinner/form instead of the app), and `/%2e%2e//evil.com`, `/..//evil.com` pass and resolve to a different same-origin path. `//evil.com`, `/\evil.com`, encoded-slash, scheme, tab/control-char and `/login/` variants are correctly rejected, and every survivor is same-origin (verified against `new URL` and Next's `isExternalURL`/`completeHardNavigation`), so this is not an open redirect. — Resolve with `new URL(candidate, window.location.origin)`, require the resolved origin to match, reject pathnames starting `//` or equal to an auth path, and navigate the normalised `pathname+search+hash`.
- LOW — `frontend/app/app/login/page.tsx:26` — genuine second `GET /auth/me` in production on a signed-out deep link: the guard's `/auth/me` 401 → `/login?next=…` → the login page probes `/auth/me` again (two sequential 401s per visit); `docs/qa/verification-us01-portal.md:46` overstates that `SessionProvider` is "the only caller". — Accept/record the extra probe explicitly, or skip it when the page was reached with a guard-supplied `?next` and let that 401 drive the form.
- LOW — `frontend/app/components/session-provider.tsx:55-59` + `frontend/app/components/auth-guard.tsx:60-66` — a `200 /auth/me` with a missing/invalid `user` (contract drift, proxy or cached body) still sets `authenticated`; the guard's `!user` fallback then renders "Redirecting to sign in…" forever because the redirect effect only fires for `unauthenticated` and no retry is offered. — Treat a falsy `user` in the provider's `then` as an error (or `unauthenticated`), or redirect on `!user` as well.

Verdict: PASS WITH CHANGES

## Delta re-review — Activity redirect fix, `?next` normalisation, unit test

Delta read from the new working tree (untracked provider/helper/test included): `npm test` 3/3 pass, `npm run lint` exit 0. The 401 redirect now has a single source (the provider's fresh, non-cancelled 401 catch); `cancelled` is checked before every state write and before the redirect; the microtask deferral cancels StrictMode's first schedule, so one request per attempt; no double-redirect path found. Mutation check: removing the origin check, the auth-path check or the normalisation makes the tests red; removing the `//`-pathname guard does not (LOW below).

- MEDIUM — `frontend/app/components/session-provider.tsx:44-49` — the reset to `loading` runs in the effect body, i.e. after `<Activity>` re-shows and paints the preserved route tree (`cacheComponents` keeps hidden state), so one visible frame can still render the previous session's guarded content (preserved `authenticated` `user`/`fullName` plus dashboard data) before "Verifying session…", e.g. logout → login as a different user; the claimed "stale authenticated state does not flash guarded content" is not guaranteed. — Reset preserved state at hide time (effect cleanup) or in an isomorphic layout effect so the reveal render starts from `loading`; otherwise record explicit Lead acceptance and add logout → login-as-another-user to the re-smoke.
- LOW — `frontend/app/lib/navigation.test.mjs:12-33` — the `target.pathname.startsWith('//')` guard (`lib/navigation.ts:46`, the fix for the first-review `/..//evil.com` finding) is untested: deleting it keeps all 3 tests green, and the module then returns `//evil.com` for `/..//evil.com`, which Next resolves as external and hard-navigates off-origin. — Add `/..//evil.com` and `/%2e%2e/%2e%2e//evil.com` to the rejected list (mutation-verified: green without the guard, red with them).

Prior findings dispositioned: dot-segment/`AUTH_PATHS` bypass fixed + tested; login-page `/auth/me` probe documented as a deliberate public-page check (not a guard duplicate); authenticated-with-null-user dead-end fixed; committed `node:test` + `npm test` + CI step added; no `any`/`@ts-ignore`, no new dependency, generic login error intact, scope unchanged.

Delta verdict: PASS WITH CHANGES

## Resolution

- LOW resolved: `frontend/app/lib/navigation.test.mjs:25-26` now pins the `//`-pathname branch with `/..//evil.com` and `/%2e%2e//evil.com`; mutation-verified — removing `lib/navigation.ts:46` now fails `falls back for rejected values` (previously all 3 tests stayed green).
- MEDIUM accepted: Lead decision 15 Nov 2026 (kanban `k332` comment) accepts the residual one-frame `<Activity>` flash; no code change.
- All prior findings dispositioned; re-verified `npm test` 3/3, `npm run lint` exit 0; reviewer made no source changes.

Final verdict: PASS
