# US01 Portal Verification — Activity-safe session restore, `?next`, guard retry, root placeholder

| Field | Value |
|---|---|
| Task | `task-1` (STAB-US01, reopened) |
| Owner | `implementer` |
| Date | 2026-11-15 (Asia/Kuala_Lumpur) |
| Environment | Agent sandbox; Node v26.13.0, npm 12.2.2; Next.js 16.4.5 |
| Revision | `main` @ `2a33e5c` + task-1 working-tree changes (Lead owns the commit) |
| Verdict | PASS — lint/tests/build; runtime behaviour `DEFERRED (Lead Playwright re-smoke)` |

## Root cause fixed after the first smoke

Next 16 `cacheComponents` keeps hidden routes in a React `<Activity>`. After login, the hidden `/projects` tree was re-shown with preserved `SessionProvider` state = `unauthenticated`; on re-show child `AuthGuard` effects run before the provider effect, so the guard's redirect effect read that stale status and bounced `/projects` → `/login?next` → `/projects` (7 `/auth/me` requests, smoke FAIL). Fix: `SessionProvider` clears preserved state on every effect (re)start and owns the 401 redirect, issuing it only from its own fresh 401 response; `AuthGuard` no longer redirects. State reset and fetch start are deferred one microtask so StrictMode's synchronous setup/cleanup/setup cycle cancels the first schedule — one request per attempt.

## Files changed

| File | Change |
|---|---|
| `components/session-provider.tsx` | Resets preserved state on every effect (re)start; fresh 401 → `/login?next=`; non-401 / 200-without-user → retryable error; one request per attempt |
| `components/auth-guard.tsx` | No redirect effect (and no unused router/effect imports); loading + error/retry panels; unauthenticated → neutral "Redirecting…"; children only when authenticated with a user |
| `lib/navigation.ts` | Normalises via `new URL(candidate, 'http://mars.invalid')`; rejects origin changes and auth paths after normalisation; returns normalised path+search+hash |
| `lib/navigation.test.mjs` (new) | `node:test` coverage: safe paths; `//evil.com`, `/\evil.com`, schemes, `/login*`, `/login/../login`, `/%2e%2e/login`, `/forgot-password`, `/reset-password`, tab injection |
| `app/login/page.tsx` | Honours validated `?next`; removed `router.refresh()` (it re-ran the outgoing login effect) |
| `app/dashboard/layout.tsx`, `app/projects/layout.tsx` | `SessionProvider` mounted once above `AuthGuard` |
| `app/dashboard/page.tsx` | User from `useSession()`; projects/notifications error UI retained |
| `app/page.tsx` | Public static placeholder, no `/auth/me`, no redirect |
| `services/projectService.ts` | Duplicate `fetchCurrentUser()` removed; `authService.ts` owns `/auth/me` |
| `frontend/app/package.json` | Added only `"test": "node --test lib/navigation.test.mjs"` |
| `.github/workflows/ci.yml` | Web job: `Unit tests` step (`npm test`) |

## Commands run (from `frontend/app`)

| # | Command | Exit | Result |
|---|---|---|---|
| 1 | `npm run lint` | 0 | no warnings or errors |
| 2 | `npm test` | 0 | `tests 3`, `pass 3`, `fail 0` (`node --test lib/navigation.test.mjs`) |
| 3 | `npm run build` | 0 | compiled; TypeScript clean; 13/13 pages; `/` static (`○ /`) |

## Acceptance criteria and stabilisation requirements

| Item | How covered | Evidence |
|---|---|---|
| US01 AC1-4 | Login/logout UI unchanged; guard 401 → `/login?next=`; login validates `?next` | Commands 1-3; `DEFERRED (Lead Playwright re-smoke)` |
| Exactly one `/auth/me` per guarded navigation | Provider issues one request per attempt; guards/dashboard consume context. The login page keeps one deliberate public-page probe — that is not a guarded navigation, and `SessionProvider` is no longer claimed as the only caller | Command 2 (guard logic); `DEFERRED (Lead smoke: count=1 after login-with-next)` |
| 401-only redirect, retry on other failures | Provider maps 401 → unauthenticated + redirect; network/5xx/200-without-user → error panel + Try again | `DEFERRED (Lead smoke)` |
| Validated `?next` | `safeNextPath` normalises dot segments/backslashes/encoded forms, then rejects origin changes and auth pages | Command 2 (3 valid + 16 rejected cases); `DEFERRED (Lead smoke)` |
| Public root placeholder | `/` static, no auth call, no redirect, Sign-in link | Command 3 (`○ /`); `DEFERRED (Lead smoke)` |

Behaviour remains proven by the Lead's Playwright smoke; no frontend test runner beyond Node's built-in `node:test` was added.
