# Specs Index

At-a-glance status of every Speckit spec in this repo. New specs go here, one directory each (`NNN-<slug>/`); see `.specify/templates/spec-template.md` to scaffold.

## Status

| Spec | Title | Status | PR | Merged |
|------|-------|--------|----|--------|
| 001 | Consolidate role-check helpers | ✅ Shipped | [#2](https://github.com/Owen-Rose/Holigay-YYC/pull/2) | 2026-04-19 |
| 002 | Consolidate vendor portal | ✅ Shipped | (direct commits to dev) | 2026-04-21 |
| 003 | — (number skipped) | — | — | — |
| 004 | Consolidate role-system migrations | ✅ Shipped | [#4](https://github.com/Owen-Rose/Holigay-YYC/pull/4) | 2026-04-25 |
| 005 | Dynamic per-event questionnaires | ✅ Shipped to `dev` (T050 waived) | [#7](https://github.com/Owen-Rose/Holigay-YYC/pull/7) | 2026-08-22 |
| 006 | Close the public data exposure | ✅ Shipped to `dev` | [#7](https://github.com/Owen-Rose/Holigay-YYC/pull/7) | 2026-08-22 |

### Post-merge detail

005 and 006 shipped together in PR #7 — a single 13-commit fast-forward onto `dev`. Their
histories were inseparable (all of 005's commits are ancestors of the 006 branch), so they
merged as one unit.

- **006** is complete: all 31 tasks done, migration `011` applied to the dev Supabase project
  on 2026-08-22 and the closed posture verified against the live dev API. **Prod rollout is
  still outstanding** — follow `specs/006-close-public-data-exposure/quickstart.md`.
- **005** is closed with **T050 waived, not executed** (2026-08-22) — see its `tasks.md`
  for the full reasoning and the five things that leaves unverified. Two known defects
  remain, tracked as `docs/ROADMAP.md` Tier 2: non-atomic questionnaire-builder saves and
  the never-populated `seeded_from_template_id`. Its third defect — required-answer
  semantics — was fixed by 006/US3.

## Queued work (no spec yet)

See `docs/ROADMAP.md` Tier 3 (foundation hardening) and Tier 4. `docs/cleanup-roadmap.md` is historical — all five of its workstreams are complete and its leftover items were folded into Tier 3.

## Conventions

- Spec directories are kept after merge as historical record. Don't move or rename them — git commit messages and other docs reference their paths.
- Number skips (e.g., spec 003 above) happen when a number gets reserved and then abandoned. Just pick the next free number for new work.
- Governance: `.specify/memory/constitution.md`. Workflow: `CLAUDE.md` "Task Workflow" section.
