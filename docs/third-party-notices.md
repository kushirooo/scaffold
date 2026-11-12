# Third-party notices

| Field | Value |
|---|---|
| Owner | `architect` (`docs/team/COLLABORATION.md` §2) |
| Status | **STUB — no third-party dataset is bundled yet** |
| Created | 9 November 2026 |
| Required by | `SPRINT1_PLAN.md` §9.2, §22.1; [ADR 0003](adr/0003-password-policy.md) |

This file records third-party **data and assets committed into the repository**. Package
dependencies are not listed here; their licences are governed by `package-lock.json` and
`node_modules/**/LICENSE`. The one dataset intended for Sprint 1 is the common-password
blocklist for US19. As of 9 November 2026 the application code contains no
`src/auth/data/` directory and no blocklist file, so **no entry below is final and the
project currently bundles no third-party data**.

## Planned entry 1 — SecLists common-password list (NOT YET BUNDLED)

Filled in from `SPRINT1_PLAN.md` §9.2. Fields marked **TBD** must be completed from the
actual file at bundling time; they are not guesses.

| Field | Value |
|---|---|
| Item | SecLists common-password blocklist (10,000 entries) |
| Upstream project | SecLists — <https://github.com/danielmiessler/SecLists> |
| Exact file (planned) | `Passwords/Common-Credentials/10-million-password-list-top-10000.txt` |
| Upstream commit | **TBD** — pin the exact commit SHA used |
| Licence | **TBD — verify at bundling.** The sprint plan records it as MIT; the upstream `LICENSE` and file header must be checked before this is stated as fact |
| Copyright holder | **TBD** — copy the upstream notice verbatim (SecLists / listed contributors) |
| Bundled location (planned) | `scaffold/backend/app/src/auth/data/10-million-password-list-top-10000.txt` |
| Use in this project | US19 password policy: exact-match blocklist after NFKC + lowercase; loaded once into a `Set<string>` at module init ([ADR 0003](adr/0003-password-policy.md)) |
| Distribution | Committed to Git; never fetched at runtime |
| Modifications | **TBD** — none expected; if the file is trimmed, sorted or normalised for bundling, record it here |
| File checksum | **TBD** — SHA-256 of the committed file |
| Attribution text | **TBD** — a short attribution line suitable for the repository README and this notice |

### Completion checklist (must be ticked before the list is committed)

- [ ] Download the list at a pinned upstream commit; record the commit SHA above.
- [ ] Read the upstream `LICENSE` and copy it (or the required notice) to the bundled
      directory; record the SPDX identifier, not just the name.
- [ ] Verify the licence permits redistribution in this repository and record any
      attribution wording the licence requires.
- [ ] Record the SHA-256 of the committed file and confirm the committed file matches it.
- [ ] Replace every **TBD** above; change the file status from **STUB** to **Complete**.
- [ ] Confirm nothing else is bundled unintentionally (images, fonts, fixtures, corpora).
- [ ] Re-check this notice in the Day 10 handoff checklist (`SPRINT1_PLAN.md` §22.1).

## Other third-party material

None identified in the repository at the time of writing. If any asset is added later,
add an entry in the same format rather than amending an existing entry in place.
