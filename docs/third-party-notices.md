# Third-party notices

| Field | Value |
|---|---|
| Owner | `architect` (`docs/team/COLLABORATION.md` §2) |
| Status | **Complete — one third-party dataset bundled (13 November 2026)** |
| Created | 9 November 2026 |
| Required by | `SPRINT1_PLAN.md` §9.2, §22.1; [ADR 0003](adr/0003-password-policy.md) |

This file records third-party **data and assets committed into the repository**. Package
dependencies are not listed here; their licences are governed by `package-lock.json` and
`node_modules/**/LICENSE`. As of 13 November 2026 the only committed third-party dataset
is the US19 common-password blocklist in `backend/app/src/auth/data/`; its entry is
complete below.

## Entry 1 — SecLists common-password list (bundled)

| Field | Value |
|---|---|
| Item | SecLists common-password blocklist (10,001 entries) |
| Upstream project | SecLists — <https://github.com/danielmiessler/SecLists> |
| Exact file | `Passwords/Common-Credentials/10k-most-common.txt` |
| Upstream commit | `913b327317496d062bcc7cace524aaad8a693be2` |
| Licence | MIT (`SPDX-License-Identifier: MIT`); upstream `LICENSE` copied verbatim to `backend/app/src/auth/data/LICENSE-SecLists.txt` |
| Copyright holder | Copyright (c) 2018 Daniel Miessler (verbatim from the upstream `LICENSE`) |
| Bundled location | `backend/app/src/auth/data/10k-most-common.txt` and `backend/app/src/auth/data/LICENSE-SecLists.txt` |
| Use in this project | US19 password policy: exact-match blocklist after NFKC + lowercase; loaded once into a `Set<string>` at module init ([ADR 0003](adr/0003-password-policy.md)) |
| Distribution | Committed to Git; never fetched at runtime; copied to `dist/auth/data/` by the `nest-cli.json` asset rule |
| Modifications | None — copied byte-for-byte from the pinned commit (73026 bytes, 10001 entries); no trimming, sorting or normalisation |
| File checksum | SHA-256 `68782d6a4a19a4768d5f15dd66bd534e7a33055cc755411e33f16d18c50fdcce` (`10k-most-common.txt`); `3dbdc93d5f8829de0941744841730a09c106d0732e5ae0e98ca1d77be7ded66c` (`LICENSE-SecLists.txt`) |
| Attribution text | "Common-password blocklist from SecLists (<https://github.com/danielmiessler/SecLists>), MIT License, Copyright (c) 2018 Daniel Miessler." |

### Substitution from the sprint plan

`SPRINT1_PLAN.md` §9.2 and ADR 0003 name
`Passwords/Common-Credentials/10-million-password-list-top-10000.txt`. The agreed
implementation pins the sibling `10k-most-common.txt` from the same SecLists commit
instead; the file, size, entry count, licence and checksum above describe the corpus that
is actually bundled. The ADR is Lead-owned and was not edited by this change.

### Completion checklist

- [x] Download the list at a pinned upstream commit; record the commit SHA above.
- [x] Read the upstream `LICENSE` and copy it to the bundled directory; record the SPDX identifier.
- [x] Verify the licence permits redistribution in this repository; MIT permits it when the copyright and permission notice are retained (`LICENSE-SecLists.txt`).
- [x] Record the SHA-256 of the committed file(s) above and confirm the committed file matches it.
- [x] Replace every **TBD** above; change the file status from **STUB** to **Complete**.
- [x] Confirm nothing else is bundled unintentionally by this change — only the blocklist and its licence were added.
- [ ] Re-check this notice in the Day 10 handoff checklist (`SPRINT1_PLAN.md` §22.1) — open by design.

## Other third-party material

None beyond entry 1. If any asset is added later, add an entry in the same format rather
than amending an existing entry in place.
