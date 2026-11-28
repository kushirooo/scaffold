## US16-be dashboard core and e2e — 2026-11-28 — PASS WITH CHANGES

**Scope.** Read `src/dashboard/{dashboard.types,dashboard.rules,dashboard.rules.spec,dashboard.service,dashboard.controller,dashboard.module}.ts`, the two-line `app.module.ts` registration, and `test/dashboard.e2e-spec.ts`. No source edits. Evidence: `npx vitest run src/dashboard/dashboard.rules.spec.ts` → 19/19 pass; `npm run lint` → 0 warnings/0 errors; `tsc --noEmit` → no errors in dashboard files (two unrelated errors outside this diff: `accounts/welcome-email.service.spec.ts`, `test/auth.e2e-spec.ts`).

**Findings.**

1. P2 — `test/dashboard.e2e-spec.ts:1180-1184` — Worker group sort (§7.4) is never asserted; the caps test checks only lengths, so capping before sorting or sorting on the wrong key still passes. Fix: assert PENDING/IN_PROGRESS order by `dueDate`, `title`, `id` and COMPLETED by `completedAt` desc, `id`.
2. P2 — `test/dashboard.e2e-spec.ts:804-825` — the `teamWorkload` cap of 20 is not exercised (two workers only); the unit `takeTop` test proves the constant, not the service slice. Fix: create 21+ worker members and assert 20, or cover the service slice directly.
3. P3 — `test/dashboard.e2e-spec.ts:1199-1208` — the deadlines-cap assertion (`toHaveLength(20)` plus `some(projectId)`) passes even when the wrong 20 survive, so sort-then-cap is unproven. Fix: assert the exact kept ids (3 overdue + 17 of the 21 capped tasks).
4. P3 — `test/dashboard.e2e-spec.ts:491-495` — the `Hold` and `Archived` projects carry no tasks or milestones, so row-level archived/`ON_HOLD` exclusion is proven only for cards, `byStatus`, and budget; admin task/milestone counts and PM calendar/upcoming row exclusion are untested. Fix: add one task and one milestone to each and assert absence plus the admin delta.
5. P3 — `test/dashboard.e2e-spec.ts:1024-1049` and `:703` — all notification items are unread, and `toHaveLength(Math.min(unreadCount, 5))` conflates total items with unread; a service returning only unread items would pass and "newest 5 includes read rows" is unproven. Fix: mark one of the six read, assert 5 items including it and `unreadCount` 5.
6. P3 — `src/dashboard/dashboard.service.ts:146-187` — contract §5.2 rule 5 ("one snapshot per request") is not met: six statements (5 parallel + milestone task group + notifications) can see different snapshots; the suite's own comment at `test/dashboard.e2e-spec.ts:376` documents this. Fix: run the admin reads in one interactive `$transaction`, or record the deviation.
7. P3 — `test/dashboard.e2e-spec.ts:222-373` — `computeSystemOverview` mirrors the service's aggregation and Prisma calls, so a shared misreading or shared query behaviour is invisible and no fixture-derived value is asserted. Fix: assert the delta of known fixtures (e.g. `archived === 1`, known budget sums) instead of only a same-shape recomputation.

**Verified.** Role matrix exact (Admin/PM/Worker/Viewer key sets; Viewer `{}`; `equipmentUsage` absent). Active scope is `ACTIVE` + not archived; PM owner-only; Worker member projects + own tasks; deleted tasks filtered in every task/milestone query. Admin counts, archived/`byStatus`/budget rules match §5.2 and contain no project IDs or names. PM health RED>YELLOW, cards, `today+7` window, month calendar, TASK-before-MILESTONE. Worker 50/50/20 caps genuinely exceeded by 55/55/25 fixtures, one-step `allowedStatusChanges`, task-only calendar. Notifications newest 5 + unread over all rows. Query count constant (admin 8, PM 10, worker 7); no N+1. Cookie guard only, no token echoed, GET is CSRF-exempt by design, no cross-role query.

**Residual risks.** The admin tolerance is an 8-attempt retry loop (`test/dashboard.e2e-spec.ts:380-396`) that can still flake while another e2e file writes; `TODAY` is fixed at module load (`:28`) so a run crossing midnight in `APP_TIMEZONE` fails. No functional blockers found.

## Resolution — lead — 2026-11-28 — PASS

- Fixed findings 1 to 6: worker sort, team cap, deadline cap ids, `ON_HOLD`/archived rows, notification read mix, Admin RepeatableRead transaction.
- Finding 7 accepted: the independent Prisma recomputation is the right oracle because the shared e2e database is not reset between runs.
- E2E now runs one file at a time (`fileParallelism: false`) so the global Admin counts settle.
- Full checks: lint 0, build pass, unit 239/239, DB 50/50, e2e 120/120.
- Remaining non-blocking risks: default 5 s transaction timeout under production volume; stale parallel-e2e comments in test files; worker-cap kept set pinned by length and order.

**Final verdict: PASS.**
