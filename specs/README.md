# Specs Index

At-a-glance status of every Speckit spec in this repo. New specs go here, one directory each (`NNN-<slug>/`); see `.specify/templates/spec-template.md` to scaffold.

## Status

| Spec | Title | Status | PR | Merged |
|------|-------|--------|----|--------|
| 001 | Consolidate role-check helpers | ✅ Shipped | [#2](https://github.com/Owen-Rose/Holigay-YYC/pull/2) | 2026-04-19 |
| 002 | Consolidate vendor portal | ✅ Shipped | (direct commits to dev) | 2026-04-21 |
| 003 | — (number skipped) | — | — | — |
| 004 | Consolidate role-system migrations | ✅ Shipped | [#4](https://github.com/Owen-Rose/Holigay-YYC/pull/4) | 2026-04-25 |
| 005 | Dynamic per-event questionnaires | 🚧 In progress | — | — |

## Queued work (no spec yet)

See `docs/cleanup-roadmap.md` Workstreams 4 (local `supabase db reset` fix) and 5 (drop `user_roles` table). Either may end up as a lightweight spec if paper trail is wanted; both are small enough to ship as a single PR without one.

## Conventions

- Spec directories are kept after merge as historical record. Don't move or rename them — git commit messages and other docs reference their paths.
- Number skips (e.g., spec 003 above) happen when a number gets reserved and then abandoned. Just pick the next free number for new work.
- Governance: `.specify/memory/constitution.md`. Workflow: `CLAUDE.md` "Task Workflow" section.
