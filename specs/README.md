# Specs Index

At-a-glance status of every Speckit spec in this repo. New specs go here, one directory each (`NNN-<slug>/`); see `.specify/templates/spec-template.md` to scaffold.

## Status

| Spec | Title | Status | PR | Merged |
|------|-------|--------|----|--------|
| 001 | Consolidate role-check helpers | ✅ Shipped | [#2](https://github.com/Owen-Rose/Holigay-YYC/pull/2) | 2026-04-19 |
| 002 | Consolidate vendor portal | ✅ Shipped | (direct commits to dev) | 2026-04-21 |
| 003 | — (number skipped) | — | — | — |
| 004 | Consolidate role-system migrations | ✅ Shipped | [#4](https://github.com/Owen-Rose/Holigay-YYC/pull/4) | 2026-04-25 |
| 005 | Dynamic per-event questionnaires | ✅ Shipped; on `main`/prod 2026-09-13. Phase 11 (atomic save, migration `012`) on `dev` 2026-09-14 | [#7](https://github.com/Owen-Rose/Holigay-YYC/pull/7), [#8](https://github.com/Owen-Rose/Holigay-YYC/pull/8) | 2026-08-22 |
| 006 | Close the public data exposure | ✅ Shipped; prod migrated 2026-09-13 | [#7](https://github.com/Owen-Rose/Holigay-YYC/pull/7) | 2026-08-22 |
| 007 | Production readiness (M3) | 🚧 In progress | [#9](https://github.com/Owen-Rose/Holigay-YYC/pull/9) | — |
| 008 | Self-hosted infrastructure | 📐 Design approved 2026-09-19 (`spec.md`, `research.md`); `plan.md`/`tasks.md` pending | — | — |

### Post-merge detail

005 and 006 shipped together in PR #7 — a single 13-commit fast-forward onto `dev`. Their
histories were inseparable (all of 005's commits are ancestors of the 006 branch), so they
merged as one unit.

- **006** is complete: all 31 tasks done, migration `011` applied to the dev Supabase project
  on 2026-08-22 and the closed posture verified against the live dev API. **Prod rolled out
  2026-09-13**: `009`–`011` applied to the prod project, all object markers verified, and
  `dev` promoted to `main` (`3dc243c`) for the Vercel Production deploy. The manual probe
  checklist and a live test submission on prod are still owed — see the "Prod rollout
  record" in `specs/006-close-public-data-exposure/quickstart.md`.
- **005** closed 2026-08-22 with **T050 waived, not executed** — see its `tasks.md` for the
  reasoning. Its required-answer defect was fixed by 006/US3. **Phase 11** (2026-09-14,
  branch `005-atomic-builder-save`) fixed the remaining two: the builder and the template
  seed now write through one atomic `save_event_questionnaire` RPC (migration `012`) and
  `seeded_from_template_id` is populated; `src/test/security/questionnaire-save.test.ts` and
  `template-writes.test.ts` give the builder/template paths real-database coverage, retiring
  the waiver's gaps 1, 3 and 5. Migration `012` was applied to dev and prod on 2026-09-14
  and `dev` was promoted to `main` the same day — see the "Phase 11 rollout" table in
  `specs/005-dynamic-questionnaires/quickstart.md`.

## Queued work (no spec yet)

See `docs/ROADMAP.md` Tier 3 (foundation hardening) and Tier 4. `docs/cleanup-roadmap.md` is historical — all five of its workstreams are complete and its leftover items were folded into Tier 3.

## Conventions

- Spec directories are kept after merge as historical record. Don't move or rename them — git commit messages and other docs reference their paths.
- Number skips (e.g., spec 003 above) happen when a number gets reserved and then abandoned. Just pick the next free number for new work.
- Governance: `.specify/memory/constitution.md`. Workflow: `CLAUDE.md` "Task Workflow" section.
