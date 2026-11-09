# ADR 0003 — Password policy and hashing

| Field | Value |
|---|---|
| Status | Accepted — D11; US19 AC3 wording pending `OPEN-1` |
| Date | 9 November 2026 |
| Decisions | D11 (floor-10 fallback not implemented pre-emptively; NIST deviation recorded) |
| Plan references | `SPRINT1_PLAN.md` §2.3, §4 OPEN-1, §5, §9.2–§9.5, §16.3, §19 |
| Related | ADR 0004 (reset/invite links), [decision log](README.md), [third-party notices](../third-party-notices.md) |

## Context

US19 needs one policy used by reset, change-password and the seed. The backlog's AC3 asks
for "system complexity rules", while the locked deviation in the brief — and DESIGN.md §6
finding #9 — asks for length plus a bundled blocklist with no character classes. That
conflict is `OPEN-1`, owned by the Scrum Master; the plan proceeds with the agreed
deviation and must not claim the literal AC text is met until it is amended
(`SPRINT1_PLAN.md` §4, §8.1).

Two technical facts decide the hash. bcrypt truncates inputs at 72 bytes, so long Unicode
passphrases (and multibyte scripts) silently collide after truncation. NIST SP 800-63B
Rev 4 suggests a 15-character floor for single-factor passwords; the agreed floor here is
12, which is recorded rather than re-litigated (`SPRINT1_PLAN.md` §9.3, §9.5).

## Decision

| Rule | Value |
|---|---|
| Minimum | 12 Unicode code points, measured after NFKC normalisation (`[...s].length`) |
| Maximum | 128 code points |
| Character classes | None — no upper/lower/digit/symbol requirement |
| Allowed characters | All, including spaces, emoji, non-Latin scripts and passphrases |
| Normalisation | NFKC applied once in `normalisePassword()` and reused by set, change and verify |
| Blocklist | Bundled common-password list; exact match after NFKC + lowercase |
| Hashing | argon2id, 19 MiB memory, t=2, p=1 (OWASP baseline), over the UTF-8 bytes of the normalised string |
| Comparison | `argon2.verify` on the normalised input |
| Parameters | One exported `HASH_OPTIONS`, shared by the seed, US18/US19 and US01, so parameters never drift |

- Policy validation runs in a custom `@IsPassword()` validator **before** hashing, so an
  oversized body never reaches argon2; the DTO rejects it first.
- The blocklist is SecLists `10-million-password-list-top-10000.txt`, copied into
  `src/auth/data/`, committed (not fetched at runtime), loaded once at module init into a
  `Set<string>` and exact-matched. Attribution lives in
  [`docs/third-party-notices.md`](../third-party-notices.md); the file is not bundled yet,
  so that notice is a stub.
- Failure is a single policy message per violation (`Password must be at least 12
  characters`, `This password is too common`); no message reveals which fields exist.
- The 10-character floor is **not** implemented pre-emptively. If the team formally
  rejects 12, one constant and its boundary tests change (11→reject becomes 9→reject).
- Because the floor is 12, most short blocklist entries can never be submitted. That is
  expected and is not a reason to weaken the minimum.

## Consequences

- Passphrases with spaces, emoji and mixed scripts work; there is no complexity UI and no
  "must contain a symbol" error class.
- The blocklist is exact-match only: long favourites such as `P@ssw0rd!2026` may pass.
  Breach-corpus lookup (HIBP or similar) is explicitly out of scope; fuzzy matching is not
  claimed.
- The list adds roughly <1 MB to the repository and a startup initialisation step; it
  catches long common passwords, which is its remaining value under a 12-character floor.
- Hashing is deliberately slow (memory-hard argon2id). Tests must use a lower-cost
  parameter set for speed but must not fork the exported options in production code.
- **`OPEN-1` dependency.** The implementation and any evidence or demo wording must say
  "length policy per the agreed deviation, pending SM amendment"; they must not claim US19
  AC3 is satisfied as written until the backlog is amended by 13 November
  (`SPRINT1_PLAN.md` §4). If it is not amended, the deviation is escalated at the Day 8
  DoD audit. NIST's 15-character guidance remains a recorded deviation, not an open
  decision: the agreed floor is 12 for Sprint 1.

## Alternatives considered

| Alternative | Why rejected |
|---|---|
| bcrypt | 72-byte truncation breaks long Unicode passphrases; agreed hashing is argon2id (also in §2.3 scope guard) |
| Character-class complexity rules | Contradicts the locked deviation and NIST guidance; worse usability for no measured strength gain; would also claim the literal (unamended) AC3 |
| 15-character floor (NIST) | Recorded as a deviation, but the agreed sprint floor is 12; changing it requires a formal team decision, not an ADR rewrite |
| 10-character fallback implemented now | Pre-emptive implementation of a rejected alternative; the plan keeps it as a one-constant change if the team rejects 12 |
| Breach-API / fuzzy blocklist | External dependency and privacy call out of scope; the brief asks for a bundled list |
| Argon2i or Argon2d | argon2id is the OWASP-balanced choice and the locked parameter set |
