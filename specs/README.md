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
| 007 | Production readiness (M3) | ✅ Shipped; M3 closed 2026-10-08 — production live on `vendors.holigayeventsyyc.ca` since 2026-10-07 (T020), prod smoke + live submission 2026-10-08 (T021). Residual: T008 seven-day check 2026-10-15 | [#9](https://github.com/Owen-Rose/Holigay-YYC/pull/9) (spec), [#10](https://github.com/Owen-Rose/Holigay-YYC/pull/10)–[#26](https://github.com/Owen-Rose/Holigay-YYC/pull/26) (tasks), [#52](https://github.com/Owen-Rose/Holigay-YYC/pull/52), [#55](https://github.com/Owen-Rose/Holigay-YYC/pull/55)–[#57](https://github.com/Owen-Rose/Holigay-YYC/pull/57) (organizer session + fixes) | 2026-10-08 |
| 008 | Self-hosted infrastructure | ⏸ Post-launch — design, plan and tasks T001–T027 written 2026-09-19 (only T001 done); deferred by the 2026-10-06 go-live decision (Vercel + hosted Supabase). Before any task starts, fold in the eight findings in `specs/008-self-hosted-infrastructure/review-2026-09-19.md` | [#23](https://github.com/Owen-Rose/Holigay-YYC/pull/23) (docs only) | — |
| 009 | Organizer invites, link consumption and password reset | ✅ Shipped; migration `013` on dev and prod 2026-09-27; prod configured 2026-10-07, first onboarding rehearsed 2026-10-08 (real organizers → backlog BL-12) | [#27](https://github.com/Owen-Rose/Holigay-YYC/pull/27) (spec), [#28](https://github.com/Owen-Rose/Holigay-YYC/pull/28)–[#35](https://github.com/Owen-Rose/Holigay-YYC/pull/35) (T002–T015) | 2026-09-27 |
| 010 | Invite-only UAT environment | ✅ Shipped; training deployment invite-only since 2026-09-27; prod non-regression T011/T012 done 2026-10-07 (findings fixed in #58/#59, shipping with the next promotion) | [#38](https://github.com/Owen-Rose/Holigay-YYC/pull/38) (spec), [#39](https://github.com/Owen-Rose/Holigay-YYC/pull/39)–[#42](https://github.com/Owen-Rose/Holigay-YYC/pull/42) (tasks), [#58](https://github.com/Owen-Rose/Holigay-YYC/pull/58), [#59](https://github.com/Owen-Rose/Holigay-YYC/pull/59) | 2026-09-28 |

### Post-merge detail

005 and 006 shipped together in PR #7 — a single 13-commit fast-forward onto `dev`. Their
histories were inseparable (all of 005's commits are ancestors of the 006 branch), so they
merged as one unit.

- **006** is complete: all 31 tasks done, migration `011` applied to the dev Supabase project
  on 2026-08-22 and the closed posture verified against the live dev API. **Prod rolled out
  2026-09-13**: `009`–`011` applied to the prod project, all object markers verified, and
  `dev` promoted to `main` (`3dc243c`) for the Vercel Production deploy. The prod probe
  checklist ran 2026-09-18 (007 T012) and the live test submission 2026-10-08 (007 T021) —
  every box in the "Prod rollout record" of `specs/006-close-public-data-exposure/quickstart.md`
  is ticked.
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

Production has been live since 2026-10-07. The ordered list of what remains for go-live's clean slate (prod reset and final smoke, real organizer invites, the `/forgot-password` prod check, one `dev` → `main` promotion) is Phase 4 of `docs/backlog/2026-10-06-uat-and-go-live.md`; its completed Phases 0–3 are archived in `docs/archive/backlog-2026-10-06-phases-0-3.md`. Spec 008 (self-hosting) is the post-launch track. Beyond that, see `docs/ROADMAP.md` Tier 3 (foundation hardening) and Tier 4. `docs/cleanup-roadmap.md` is historical — all five of its workstreams are complete and its leftover items were folded into Tier 3.

## Conventions

- Spec directories are kept after merge as historical record. Don't move or rename them — git commit messages and other docs reference their paths.
- Number skips (e.g., spec 003 above) happen when a number gets reserved and then abandoned. Just pick the next free number for new work.
- Governance: `.specify/memory/constitution.md`. Workflow: `CLAUDE.md` "Task Workflow" section.
