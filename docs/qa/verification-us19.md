# US19 verification — password reset, change and policy

| Field | Value |
|---|---|
| Task | task-7 (k71) — US19 edge-case matrix + QA evidence |
| Owner / verified by | implementer self-check; independent review in task-9 |
| Date / environment | 2026-11-14 10:24 Asia/Kuala_Lumpur; agent sandbox, Node v26.13.0, local PostgreSQL 18 (`raf_pms_test`, `raf_pms_e2e`) |
| Revision | `feat/us19-backend` @ `8d10156` (T1–T6 committed; T7 test edits uncommitted at run time) |
| Verdict | **PASS (local)** for the US19 API; US18 AC1, CI and staging `DEFERRED` |

`[OPEN-1]`: US19 AC3 asks for "system complexity rules"; the implemented policy is the
agreed deviation — **12–128 code points after NFKC, no character classes, exact bundled
blocklist** — *met per agreed deviation, pending SM amendment*. Literal AC3 is not claimed.

## Commands run (from `backend/app`)

| # | Command | Result |
|---|---|---|
| 1 | `npm test` | exit 0 — 22 files, **150/150** |
| 2 | `npm run test:db` | exit 0 — 6 files, **43/43** on `raf_pms_test` |
| 3 | `npm run test:e2e` | exit 0 — 5 files, **55/55** on `raf_pms_e2e` |
| 4 | `npm run lint` | exit 0 — 0 warnings, 0 errors |
| 5 | `npm run build` | exit 0 — `nest build` |

## Acceptance criteria (plan §16.3 US19) → evidence

| Check | Status | Evidence |
|---|---|---|
| forgot known → 204 + one email; unknown/inactive/invited → 204, no email; duplicate re-issue kills older link | PASS (local) | e2e forgot cases |
| reset `RESET`/`INVITE` valid → 200, argon2 credential, token used, tokenVersion+1, sessions revoked, siblings used | PASS (local) | e2e reset cases; DB `resetPassword` |
| reset expired/used/unknown/inactive → identical generic 400; password/token unchanged | PASS (local) | e2e invalid-link case; DB cases |
| reset: empty 200, no `Set-Cookie` (no auto-login) | PASS (local) | e2e reset success assertions |
| policy 11 reject, 12/128 accept, 129 reject; spaces/emoji/all-lowercase accept; blocklist (incl. uppercase/fullwidth) reject | PASS (local) | e2e reject + accept matrix; `password-policy.spec.ts` 16/16 |
| NFKC: NFC-set password, NFD login | PASS (local) | e2e NFKC case |
| concurrent same-token reuse → exactly one success | PASS (local) | e2e + DB concurrency cases |
| change: wrong-current generic 401; policy 400; success rotates cookie; old/second-device 401; one live session | PASS (local) | e2e + DB change cases |
| token/password/hash absent from bodies and captured logs; hash-only at rest | PASS (local) | e2e secrets case; forced-failure log cases; DB hash assertions |
| fail paths: token/email/alert throw → still 204, one alert, no token in alert/log | PASS (local) | e2e failure cases |
| US18 AC1 — account creation triggers welcome email | DEFERRED (no US02) | US18 e2e covers the `account.created` event; US02 emitter absent |
| CI suites / staging end-to-end (DoD item 5) | DEFERRED (no CI run / no staging) | no run URL; staging not deployed |

## Deferred checks

- CI `api` job (`test`, `test:db`, `test:e2e` with both test DBs) — no CI run in the sandbox; runs on the T7 commit (Lead/DevOps).
- Staging forgot→email→reset→login and Mailtrap/Resend delivery — staging not deployed (Lead/QA).
- US18 AC1 (`account.created` emission) — US02 is not in this slice (Lead).
Deferred is not passed; no CI or staging result is claimed.

## Defects found

None. Known limitations (not defects): no forgot-password rate limit, forgot timing not equalised, exact-match blocklist, no token-row cleanup. Add throttling before production.

## Honesty checklist

- [x] Every command above was run in the stated local environment.
- [x] No deferred check is reported as passed; CI/staging are not claimed.
- [x] No password, JWT, cookie value, raw reset token or hash appears in this evidence.
- [x] No failed check omitted (none failed).
- [x] Statuses use strategy §8 vocabulary; `docs/qa/ac-matrix.md` is updated by the Lead; `[OPEN-1]` is stated as a deviation, not literal AC3.
