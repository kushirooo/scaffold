# AC → Evidence Matrix — MARS Sprint 1

| Field | Value |
|---|---|
| Owner | `qa-engineer` |
| Source ACs | `Product_Backlog.md` §4.1 (US01, US18, US19) and `SPRINT1_PLAN.md` §13.5 (landing) |
| Evidence rules | `SPRINT1_PLAN.md` §16.1–§16.5; [`strategy.md`](strategy.md) |
| Target contract | `SPRINT1_PLAN.md` §7 (US01), §8 (US18), §9 (US19), §12 (frontend), §15 (staging) |
| Baseline | 8 Nov 2026: 11/11 unit tests green — recorded in `SPRINT1_PLAN.md` §1.3. Not re-run in T3. |
| Last updated | 9 Nov 2026 (T3) — initial matrix |

**How to read this matrix.** Each row is one backlog AC (or one landing/security check). The `Status` cell uses the [status vocabulary](strategy.md#8-status-vocabulary-used-in-the-ac-matrix). On 9 Nov 2026 every row is `not yet implemented`: Phase 1 is the Prisma foundation, the Bearer implementation is pre-reconcile and is **not** the target contract, and the cookie/CSRF/email/reset work has not started. A row changes status only when the evidence named in it exists. DB-dependent cases are runnable locally via `npm run test:db` (T11, `raf_pms_test`); a case that only runs in CI is marked `DEFERRED (CI)` and becomes `PASS (CI)` only when the CI run is linked.

`[OPEN-1]` rows (US18 AC2, US19 AC3) are implemented **as the agreed deviation** — link instead of credentials; 12–128 length instead of character-class complexity. Evidence must say "met per agreed deviation, pending SM amendment"; the literal backlog text is **not** claimed until the Scrum Master amends it (`SPRINT1_PLAN.md` §4, §16.4).

---

## 1. US01 — Authentication and session

| AC | Test type | File / command | Evidence | Status |
|---|---|---|---|---|
| **US01 AC1** — Entering valid credentials grants access and redirects the user to their role-specific dashboard | Unit (role map) + e2e + staging smoke | `npm test` → `src/auth/role-dashboard.spec.ts`; `npm run test:e2e` → `test/auth.e2e-spec.ts`; `bash scripts/smoke-staging.sh` | Login `200` with `Set-Cookie: mars_at=…; HttpOnly; SameSite; Path=/`; body has `user.role` and `redirectTo`, **no token in body**; role map asserted for ADMIN/PROJECT_MANAGER/WORKER/VIEWER; staging smoke login PASS. Role-aware page rendering is Member 3's (`/dashboard`, D1/D12) | `not yet implemented` |
| **US01 AC2** — Invalid credentials show "invalid email or password" without saying which field failed | E2E | `npm run test:e2e` → `test/auth.e2e-spec.ts` (unknown email / wrong password / inactive account) | Three responses have the **identical** `401` body `{ "message": "Invalid email or password", "error": "Unauthorized", "statusCode": 401 }`; no field-specific message; inactive account not distinguishable | `not yet implemented` |
| **US01 AC3** — Logging out terminates the active session and returns the user to the login page | E2E + staging smoke | `npm run test:e2e` → `test/auth.e2e-spec.ts`; `bash scripts/smoke-staging.sh` | Logout `204`; `Set-Cookie` clears `mars_at` (`Max-Age=0`/past expiry); the pre-logout cookie gets `401` on `/auth/me`; `sessions.revoked_at` is set in the DB (e2e); smoke prints all three PASS lines | `not yet implemented` |
| **US01 AC4** — Unauthenticated users attempting to access protected routes are redirected to the login screen | E2E (API) + manual (frontend) | `npm run test:e2e` → `test/auth.e2e-spec.ts` (`/auth/me` no cookie); frontend manual via `frontend/app` | API: `401` with no session; frontend: protected-route guard redirects to `/login` on `401` per contract §12 (Member 3). Split evidence is stated, not merged | `not yet implemented` |

---

## 2. US18 — Welcome email on account creation

| AC | Test type | File / command | Evidence | Status |
|---|---|---|---|---|
| **US18 AC1** — Creating a user account triggers an automated welcome email to the user's address | Integration (seam) + staging | `npm run test:e2e` (memory inbox; account-created seam); staging: US02 create via browser | Exactly **one** email in the memory inbox for the created account, recipient = user email, no duplicate on retries; staging create → Resend/Mailtrap delivery screenshot (`docs/qa/evidence/…`) | `not yet implemented` |
| **US18 AC2** `[OPEN-1]` — The email contains initial login credentials and the login link (agreed deviation: **link only**, no credentials) | Unit (template) + manual | `npm test` (template spec); Mailtrap/Resend screenshot | Rendered body contains the activation/reset link (`/reset-password?token=…` or `/login` per §8), asserts **no password and no credential value**; HTML-escaping case for a `<script>`-bearing name; screenshot of the delivered email. Literal AC not claimable until SM amendment | `not yet implemented` |
| **US18 AC3** — If email sending fails, the system logs the error and notifies the admin while keeping the account created | Integration/e2e (failing sender) | `npm run test:e2e` (memory sender forced to throw) | Account row still exists after the failure; exactly one admin alert in the admin inbox; error logged with no secret/token; the create handler does not throw; response is still success | `not yet implemented` |

---

## 3. US19 — Password reset

| AC | Test type | File / command | Evidence | Status |
|---|---|---|---|---|
| **US19 AC1** — User can submit their email address on a "Forgot Password" page | E2E + manual (frontend) | `npm run test:e2e` → forgot-password spec; manual: Member 3 page | `POST /auth/forgot-password` → `204` for **known and unknown** email (no enumeration); one email only for a known active account; frontend page posts the email and shows the generic notice. Page itself is Member 3's | `not yet implemented` |
| **US19 AC2** — System sends a password reset link valid for 15 minutes | Unit (token service) + e2e (expiry) | `npm test` (token service/TTL); `npm run test:e2e` (expired token) | Token row arithmetic `expires_at − created_at = 900s` (or configured `RESET_TTL_SECONDS`); a token older than 15 min returns the generic `400`; DB row stores a **hash**, never the raw token | `not yet implemented` |
| **US19 AC3** `[OPEN-1]` — Opening the link lets the user set a new password meeting system complexity rules (agreed deviation: **12–128 Unicode code points**, NFKC, no character classes, blocklist) | Unit (policy matrix) | `npm test` → policy spec | Matrix: 11 reject · 12 accept · 128 accept · 129 reject · spaces accept · emoji accept · all-lowercase accept · blocklisted reject; NFKC-normalised input; no complexity-class rule. Evidence labels this "met per agreed deviation, pending SM amendment" | `not yet implemented` |
| **US19 AC4** — Using an expired or already-used reset link shows an error and prevents password changes | E2E | `npm run test:e2e` (expired, reused, unknown token) | Each case returns the same generic `400`; the old password still verifies afterwards and the attempted new password does not; token marked used and not reusable; no password/token in response | `not yet implemented` |

---

## 4. Landing shell (`/`)

Source: `SPRINT1_PLAN.md` §13.1–§13.5. Landing is the final window; not started.

| AC / check | Test type | File / command | Evidence | Status |
|---|---|---|---|---|
| **Landing 1 — Hero + primary CTA** — `/` shows eyebrow, h1, positioning, "Client portal" CTA → `/login`, secondary anchor `#expertise` | Build + manual | `npm run build` (`frontend/app`); browser | Build passes; `/` renders; CTA target resolves to `/login` (stub accepted per D12); `#expertise` scrolls; screenshot at 1440 px | `not yet implemented` |
| **Landing 2 — Section stubs + header** — expertise (Civil/Structural/Geotechnical), sectors (Residential/Education/Healthcare/Infrastructure), approach (01/02/03), wordmark/anchors; no footer | Manual + code review | Browser; review `frontend/app/app/page.tsx` + `components/marketing/*` | Sections render as stubs; copy limited to backlog facts (no invented counts/clients); screenshots; no footer | `not yet implemented` |
| **Landing 3 — MARS tokens only** — raw hex only in `@theme`; components use token utilities; fonts via `next/font`; dark-mode block and Geist removed; `color-scheme: light` | Static review | Review `app/globals.css`, `app/layout.tsx`; `grep` for hex outside `@theme` | `@theme` matches §13.3; no raw hex in components; no `prefers-color-scheme: dark`; token classes used; `color-scheme: light` | `not yet implemented` |
| **Landing 4 — Structure and landmarks** — one `h1`; `h2`/`h3` hierarchy; `header`/`main`/`section` with `aria-labelledby`; skip link to `#main` | Manual + code review + axe | axe DevTools run; keyboard/screen-reader spot check | One `h1`; heading order; landmarks present and labelled; skip link is first tab stop and reaches `#main`; axe screenshot, 0 serious/critical | `not yet implemented` |
| **Landing 5 — Focus, motion, targets** — 2 px navy focus ring with 2 px offset on every link/button; `prefers-reduced-motion` respected; CTAs ≥44 px, other targets ≥24 px | Manual | Browser keyboard pass; reduced-motion emulation | Focus visible on every interactive element; no motion or only opacity/transform under reduced motion; target sizes measured; screenshots | `not yet implemented` |
| **Landing 6 — Contrast** — navy on canvas 15.4:1; muted text 5.6:1; no white on pastel; WCAG 2.2 AA | Manual (axe + Lighthouse) | axe DevTools; Lighthouse report | 0 contrast violations; measured ratios match §13.5; no meaning carried by colour alone; report path recorded | `not yet implemented` |
| **Landing 7 — Responsive** — works at 320, 768, 1024, 1440, 1920 px; usable at 200% zoom | Manual | Browser at five widths + zoom | Screenshots at all five widths plus 200% zoom; no horizontal scroll at 320 px; no overlap/clipping; paths recorded under `docs/qa/evidence/` | `not yet implemented` |
| **Landing 8 — Lighthouse targets** — Accessibility 100, Performance ≥90, Best Practices ≥95, SEO ≥90 (targets, not gates) | Manual | Lighthouse (Chrome) | Lighthouse HTML/JSON saved and linked; numbers reported as measured (a miss is reported, not hidden); WCAG manual checks remain the gate | `not yet implemented` |
| **Landing 9 — Placeholder media** — inline SVG `aria-hidden`, adjacent text, aspect-ratio; no meaning by colour | Code review + manual | Review `PlaceholderMedia.tsx`; browser | `aria-hidden` on decorative media; adjacent text describes the card; layout stable; screenshot | `not yet implemented` |

---

## 5. Supporting checks (no backlog AC; required by plan §16.3)

These are security/correctness cases that support the ACs above or the "tokenVersion invalidation" row in plan §16.2. They are tracked here so they are not lost; a failure is a defect like any other.

| Check | Test type | File / command | Evidence | Status |
|---|---|---|---|---|
| Login validation: missing/malformed email, short password → `400` | E2E | `npm run test:e2e` | `400` for each malformed body; valid shape reaches the generic `401` path | `not yet implemented` |
| `/auth/me` with tampered/expired JWT → `401` | E2E | `npm run test:e2e` | Tampered signature and expired token both `401`; no stack/secret in body | `not yet implemented` |
| `tokenVersion` mismatch after bump → `401` | E2E | `npm run test:e2e` | Bump `token_version` → existing cookie `401`; re-login works with new `tv` | `not yet implemented` |
| CSRF: missing/wrong `X-MARS-CSRF` on any non-GET → `403`; present → passes | E2E + staging smoke | `npm run test:e2e`; `bash scripts/smoke-staging.sh` | `403 { "message": "Missing or invalid CSRF header" }`; same request with header proceeds; smoke prints CSRF PASS | `not yet implemented` |
| CORS: allowed origin gets exact `Access-Control-Allow-Origin` + `Allow-Credentials: true`; disallowed gets none | E2E + staging browser | `npm run test:e2e`; browser from Vercel origin | Headers asserted per origin; no `*` anywhere including errors; preflight allows `Content-Type`, `X-MARS-CSRF` | `not yet implemented` |
| Boot validation: `CORS_ORIGIN=*` rejected; `sameSite=none` without `secure` rejected | Unit/boot | `npm test` (env validation) + start once with bad env | Process refuses to start with the expected error; never asserts a running insecure config | `not yet implemented` |
| No password, token, or cookie value in responses or captured logs | E2E + code review | `npm run test:e2e`; log capture | Response bodies/logs scanned: no `passwordHash`, JWT, reset token, or cookie value; error paths redacted | `not yet implemented` |
| Reset token hashed at rest and single-use | E2E | `npm run test:e2e` | DB row stores hash ≠ raw token; consume marks used; second consume `400` | `not yet implemented` |
| Email HTML escaping | Unit | `npm test` | `<script>alert(1)</script>` name renders escaped in HTML body | `not yet implemented` |
| Invite token TTL 24 h; re-issue invalidates the previous invite | Unit + e2e | `npm test`; `npm run test:e2e` | `expires_at − created_at = 86400s`; old invite no longer works after re-issue | `not yet implemented` |
| `change-password`: wrong current `401`; success rotates cookie, old cookie `401` | E2E | `npm run test:e2e` | Wrong current → generic `401`; success → new cookie valid, old cookie `401`, all other sessions revoked, `token_version` bumped | `not yet implemented` |
| Staging cookie flags: `mars_at` is `HttpOnly`, `Secure`, `SameSite=None`, `Path=/`; no non-httpOnly auth cookie | Staging smoke + DevTools | `bash scripts/smoke-staging.sh`; browser DevTools | Response headers show the flags; DevTools shows no token in `localStorage`/response body; screenshot | `not yet implemented` |

---

## 6. Deferred register (environment-dependent)

These are the same checks above, grouped by environment dependency. Rule: they are not `PASS` until run in their destination ([strategy §3.1](strategy.md#31-local-database-availability-t9-onward), §12). The DB rows below were **closed locally in T11**; the AC rows themselves remain `not yet implemented` because the Phase-2+ features are not built.

| Group | Reason | Destination | Status |
|---|---|---|---|
| Migration apply, seed, real-Postgres repository/schema/seed suite | Was "no DB"; local PostgreSQL 18.6 now available | Local `raf_pms` / `raf_pms_test`; CI still to be wired | `PASS (local DB)` — `npm run test:db` 22/22, migration applied, seed verified; CI run pending ([verification-local-db.md](verification-local-db.md)) |
| HTTP e2e AC cases (US01, US18, US19) | Features still `not yet implemented`; current `test:e2e` is in-memory wiring only | CI e2e once implemented (Phase 2+) | `DEFERRED (features not implemented)` |
| Phase-2 DB assertions: `sessions.revoked_at`, `token_version`, reset-token hash/TTL/used, cookie/CSRF state | Phase-2 features not implemented | CI e2e | `DEFERRED (features not implemented)` |
| `scripts/smoke-staging.sh` (health/login/me/CSRF/logout) | No staging until Phase 5 | Railway staging | `DEFERRED (no staging)` |
| Emails (Mailtrap/Resend delivery + screenshots) | No email transport/staging | Mailtrap (dev), Resend (staging) | `DEFERRED (no staging)` |
| Landing build + responsive + axe + Lighthouse | Landing not started; final window | Local build; Vercel staging | `DEFERRED (no staging)` |
| Cross-site cookie/CORS behaviour in a real browser | Needs Vercel origin → Railway API | Staging browser | `DEFERRED (no staging)` |

**Tooling status (9 Nov 2026).** [`scripts/smoke-staging.sh`](../../scripts/smoke-staging.sh) exists, is executable, passes `bash -n`, and its control flow was self-checked against a local stub API (24/24 checks PASS) and a dead endpoint (fails with no false PASS). It has **not** run against staging: the staging URL does not exist yet. Treat every staging row above as `DEFERRED (no staging)` until a run log with the deployed commit SHA is attached.

**Local DB status (T11, 9 Nov 2026).** Local PostgreSQL 18.6 is live at `127.0.0.1:5432`; `raf_pms` is migrated and seeded (6 users); `npm run test:db` passes **22/22** against `raf_pms_test`; the DB-backed Phase-1 Bearer smoke passed **13/13**. This closes the DB-deferred rows above locally, but **no AC row changes status** — cookie/CSRF, email and reset features remain `not yet implemented`. Full evidence: [`verification-local-db.md`](verification-local-db.md).

---

## 7. Maintenance rules

1. QA owns this file; status changes are part of a verification task/report, not an implementation task.
2. A row moves off `not yet implemented` only when the named test exists **and** its evidence exists. "Implemented but not run" is `DEFERRED` with the destination environment, not `PASS`.
3. When a row becomes `PASS (CI)`/`PASS (staging)`, add the run URL or artifact path to the Evidence cell and the date to the header.
4. If a row fails, open a defect per [`defect-workflow.md`](defect-workflow.md) and record severity in the report; do not edit the row to "partial" without naming the failing sub-check.
5. When `[OPEN-1]` is ratified or rejected, update the US18 AC2 / US19 AC3 rows' wording and evidence requirement; do not silently keep the deviation label.
6. Do not create a second case-level checklist here. Case-level coverage lives in `SPRINT1_PLAN.md` §16.3; this file is the AC roll-up.
