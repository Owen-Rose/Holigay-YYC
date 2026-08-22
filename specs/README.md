# Specs Index

At-a-glance status of every Speckit spec in this repo. New specs go here, one directory each (`NNN-<slug>/`); see `.specify/templates/spec-template.md` to scaffold.

## Status

| Spec | Title | Status | PR | Merged |
|------|-------|--------|----|--------|
| 001 | Consolidate role-check helpers | ✅ Shipped | [#2](https://github.com/Owen-Rose/Holigay-YYC/pull/2) | 2026-04-19 |
| 002 | Consolidate vendor portal | ✅ Shipped | (direct commits to dev) | 2026-04-21 |
| 003 | — (number skipped) | — | — | — |
| 004 | Consolidate role-system migrations | ✅ Shipped | [#4](https://github.com/Owen-Rose/Holigay-YYC/pull/4) | 2026-04-25 |
| 005 | Dynamic per-event questionnaires | 🧪 Implemented, unmerged | — | — |
| 006 | Close the public data exposure | 🧪 Implemented, unmerged | — | — |

### In-flight detail

- **005** lives on `005-dynamic-questionnaires`; its commits are also contained in the 006 branch. All user stories are implemented and unit-tested, but two known defects remain before merge: non-atomic questionnaire-builder saves and the never-populated `seeded_from_template_id` column (`docs/ROADMAP.md` Tier 2). Its third known defect — required-answer semantics — was fixed by 006/US3.
- **006** lives on `006-close-public-data-exposure`. Tasks T001–T027 and T029–T031 are done and the full gates pass locally; T028 (verify the `security-tests` CI job green in under 5 minutes) needs the branch pushed. Rollout to dev then prod follows `specs/006-close-public-data-exposure/quickstart.md`.

## Queued work (no spec yet)

See `docs/ROADMAP.md` Tier 3 (foundation hardening) and Tier 4. `docs/cleanup-roadmap.md` is historical — all five of its workstreams are complete and its leftover items were folded into Tier 3.

## Conventions

- Spec directories are kept after merge as historical record. Don't move or rename them — git commit messages and other docs reference their paths.
- Number skips (e.g., spec 003 above) happen when a number gets reserved and then abandoned. Just pick the next free number for new work.
- Governance: `.specify/memory/constitution.md`. Workflow: `CLAUDE.md` "Task Workflow" section.
