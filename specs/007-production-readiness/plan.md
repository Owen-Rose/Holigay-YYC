# Implementation Plan: Production Readiness (Milestone M3)

**Branch**: `007-production-readiness` | **Date**: 2026-09-14 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/007-production-readiness/spec.md`

## Summary

M3 makes the platform ready for a real event without changing what it does. The spec's
five stories reduce to four repo deliverables and a set of manual dashboard/terminal tasks
whose evidence is recorded in `quickstart.md`:

1. **Environment contract** — two Zod-parsed modules (`src/lib/env-public.ts`,
   `src/lib/env.ts`) replace the eight `process.env.X!` reads and the email client's
   silent `onboarding@resend.dev` fallback. Strictness keys on `VERCEL_ENV === 'production'`
   so previews and local builds stay lenient while the sending domain is pending.
2. **Email-warning parity** — `submitDynamicApplication` captures the `sendEmail` result
   and returns `warning` the way the legacy submit and the status update already do; the
   dynamic form surfaces it as `toast.warning`.
3. **Keep-alive** — `GET /api/keepalive` behind `CRON_SECRET`, scheduled daily by
   `vercel.json`, reads one row from every listed Supabase project and answers `500` on any
   failure so the cron log goes red.
4. **Event-day tooling** — `scripts/smoke-check.mjs` (`npm run smoke`, read-only, anon key,
   non-zero exit) automates the spec 006 probe plus three new invariants;
   `docs/runbooks/event-week-smoke.md` and `docs/runbooks/backup-restore.md` are the
   click-through and the dump/restore routine; `scripts/verify-db.ts` is deleted and
   `seed-admin.sql` becomes `seed-role.sql`.

Everything else — Resend domain, Vercel variables, auth SMTP and URLs, organizer accounts,
the restore drill, the prod probe, password rotation, the promotion and the prod smoke run
— is `[manual]` work. The M3 gate is a **solo technical rehearsal** of the eleven-step
event lifecycle on the dev preview (US4), logged under `rehearsal/`. No migration, no RLS
or auth change, no new dependency. Reasoning record: `docs/M3-PLAN.md`.

## Technical Context

**Language/Version**: TypeScript 5.x, `strict: true` (unchanged) + one plain-ESM Node script (`scripts/smoke-check.mjs`) + Markdown runbooks
**Primary Dependencies**: Next.js 16 (App Router; one new Route Handler), React 19, `zod` ^4 (env schemas), `@supabase/supabase-js` ^2.86 (smoke script), `resend` ^6 (unchanged), Supabase CLI 2.65.6 (`db dump`, `storage cp` in the backup runbook), Vitest ^4 (unit project) — **no new packages**
**Storage**: Unchanged. Backups are files on the maintainer's machine under `backup/` (git-ignored by T009); the `attachments` bucket is copied alongside the SQL dumps
**Testing**: Vitest unit project — env schema tests, keep-alive route tests (mocked `fetch`), one email-failed test for the dynamic action; the `security` project is untouched. The smoke script is verified by running it against local, dev and prod
**Target Platform**: Vercel Hobby (crons run on Production deploys only; daily granularity) + Supabase free tier (dev `kcokcufmzyckbodelqpb`, prod `hgmfjvjlxrhdojwlkgap`)
**Project Type**: Single Next.js web application + scripts + docs
**Performance Goals**: smoke script < 60 s; whole event-day check ≤ 10 min (SC-004); keep-alive route < 10 s for two targets (8 s per-target timeout, concurrent)
**Constraints**: Production-only strictness via `VERCEL_ENV`, not `NODE_ENV` (previews build with `NODE_ENV=production`); anon key only in the smoke script and the keep-alive; database password entered interactively, never in a file; prod data never restored into dev; no schema/RLS/auth change — a rehearsal finding that needs one opens a new spec
**Scale/Scope**: 2 new source modules, 1 new route + `vercel.json`, 5 files edited for env reads, 1 action + 1 form edited, 1 script added / 1 deleted / 1 generalized, 2 runbooks, 4 docs touched, ~4 test files; 22 tasks, about half `[manual]`

## Constitution Check

*GATE: evaluated pre-Phase 0 and re-checked post-design — PASS (no violations to justify).*

| Principle | Check | Status |
|---|---|---|
| I — Zod before DB | The env modules are Zod schemas parsed at import; no server action's validation order changes; the keep-alive handler checks its bearer header before any network call | PASS |
| I — `requireRole()` on mutations | No new server action. The keep-alive is a Route Handler guarded by the scheduler secret; it performs an anon read of the one intentionally public table and touches no user data | PASS |
| I — `{success, error, data}` responses | `SubmitDynamicApplicationResponse` gains the same optional `warning` field `ApplicationSubmitResponse` already has; shape otherwise unchanged | PASS |
| I — RLS on user-data tables / append-only migrations | No migration; no policy change | PASS |
| I — CI gates | `format:check → lint → test → build` unchanged; new tests run in the existing unit project | PASS |
| I — No `any`, no dead code | `verify-db.ts` (always exits 0, needs an uninstalled runner) is deleted; the `!` reads are replaced by typed exports, not wrapped | PASS |
| I — New env vars documented with their introduction | `CRON_SECRET`, `KEEPALIVE_SUPABASE_TARGETS`, `SMOKE_*` land in `CLAUDE.md`, `.env.example`, `docs/DEV-ENVIRONMENT-SETUP.md` Part 8 and `contracts/env-contract.md` in the PRs that introduce them | PASS |
| II — Tests with every changed action / new route | `src/test/env.test.ts`, `src/test/keepalive-route.test.ts`, one email-failed case in `src/test/answers-actions.test.ts`; test-first for all three (roadmap per-session workflow #2) | PASS |
| III — UI consistency | One `toast.warning` added to the dynamic form, mirroring `apply/client.tsx:76` and `status-buttons.tsx:70`; no styling | PASS |
| IV — RSC / performance | No client-component conversions; `revalidatePath` calls untouched | PASS |
| Stack lock-in | Zero new runtime or dev dependencies (`server-only` is not installed and is not added — see research R2) | PASS |

## Project Structure

### Documentation (this feature)

```text
specs/007-production-readiness/
├── spec.md                          # /speckit.specify output
├── plan.md                          # This file
├── research.md                      # Phase 0 output — decisions R1–R12
├── quickstart.md                    # Phase 1 output — the ops/evidence record
├── checklists/requirements.md       # spec quality checklist (passed 2026-09-14)
├── contracts/
│   ├── env-contract.md              # every variable: where read, where required, validation
│   └── keepalive-route.md           # request/response/schedule/test matrix
├── rehearsal/                       # created by T016; <date>-solo-lifecycle.md filled by T017
└── tasks.md                         # Phase 2 output (/speckit.tasks — NOT created by /speckit.plan)
```

No `data-model.md`: the spec's entities (environment contract, keep-alive target, backup
set, findings log, evidence record) are ops artifacts, none persisted in the database.

### Source Code (repository root)

```text
src/
├── lib/
│   ├── env-public.ts                        # NEW: NEXT_PUBLIC_* parsed from literal reads; safe in client/server/middleware
│   ├── env.ts                               # NEW: server-only; RESEND_API_KEY, EMAIL_FROM_ADDRESS, CRON_SECRET, KEEPALIVE_SUPABASE_TARGETS, VERCEL_ENV
│   ├── supabase/{client,server,middleware}.ts  # MODIFIED: import from env-public (drops the `!` reads)
│   ├── email/client.ts                      # MODIFIED: sender + key from env; NODE_ENV throw replaced by the env contract
│   └── actions/answers.ts                   # MODIFIED: capture sendEmail result → `warning`
├── middleware.ts                            # MODIFIED: import from env-public
├── app/
│   ├── (public)/apply/_components/dynamic-application-form.tsx  # MODIFIED: toast.warning(result.warning)
│   └── api/keepalive/route.ts               # NEW: GET; bearer check; per-target anon read; 200/401/500
└── test/
    ├── env.test.ts                          # NEW
    ├── keepalive-route.test.ts              # NEW
    └── answers-actions.test.ts              # EXTENDED: email-failed → warning

vercel.json                                  # NEW: daily cron for /api/keepalive
scripts/
├── smoke-check.mjs                          # NEW: `npm run smoke`
├── seed-role.sql                            # RENAMED from seed-admin.sql; email + role placeholders
└── verify-db.ts                             # DELETED
docs/
├── runbooks/event-week-smoke.md             # NEW
├── runbooks/backup-restore.md               # NEW
├── DEV-ENVIRONMENT-SETUP.md                 # MODIFIED: Part 8 table + `develop` → `dev`
└── ROADMAP.md                               # MODIFIED at close-out: M3 checkboxes
.env.example, CLAUDE.md, .gitignore, package.json (`smoke` script), specs/README.md   # MODIFIED
```

**Structure Decision**: Existing single-project layout. The only new directories are
`docs/runbooks/` and `specs/007-production-readiness/rehearsal/`. The two env modules sit
beside `src/lib/utils.ts` rather than in a subfolder because there are exactly two and
every Supabase client file imports one of them.

## Design Highlights

Full reasoning in `research.md`; the load-bearing decisions:

1. **Strictness keys on `VERCEL_ENV`** (R1). `RESEND_API_KEY` and `EMAIL_FROM_ADDRESS`
   are required, and `resend.dev` refused, only when `VERCEL_ENV === 'production'`. This
   is what lets the env-module PR merge before DNS is done and lets the rehearsal run on
   the fallback sender if it has to.
2. **Two env modules, literal reads** (R2). `env-public.ts` reads
   `process.env.NEXT_PUBLIC_*` as literal property accesses so Next inlines them into the
   browser bundle. `env.ts` is server-only by a runtime guard, not by the uninstalled
   `server-only` package. Both throw one aggregated error naming every problem.
3. **Keep-alive lists both projects explicitly and fails red** (R4, contract). Anon key,
   one-row read of the public `events` table, `500` on any failure, daily schedule.
4. **Smoke check = the 006 probe automated, plus three invariants** (R6). Private tables
   empty for anon; every active event has a questionnaire with a question; the submission
   RPC exists and validates before writing (`P0002` on a nil event id); organizer RPCs
   denied (`42501`). Pass/fail per check; exit 1 on any failure.
5. **Backups are dump + bucket copy; the drill restores into the local stack** (R7).
   `supabase db dump` for schema and data, `supabase storage cp` for the bucket, password
   via `read -s`, prod data never into dev, relink to dev afterwards.
6. **The rehearsal is a committed artifact** (R10): an eleven-step expected/observed table
   plus a findings table with severities, written as a template before the run.

## Rollout and sequencing

From `docs/M3-PLAN.md` "Execution structure". Critical path:
T002 (Resend domain) → T003 (Vercel vars) → T004 (env module) → T017 (rehearsal) →
T018 (fixes) → T020 (promote) → T021 (prod smoke). Everything else is parallel filler
while DNS propagates.

- Each repo task is one branch off `dev`, one PR, merged before the next task touches the
  same files. Commits tagged `[007-Txx]`. No co-author trailers.
- **T004 merges with no Vercel prerequisite** (previews are lenient), but the **first
  `dev → main` promotion after it needs `EMAIL_FROM_ADDRESS` and `RESEND_API_KEY` on Vercel
  Production** or the production build fails — by design.
- Manual tasks are ticked only when their evidence row in `quickstart.md` is filled.
- If the Resend domain is delayed: sixteen of the 22 tasks do not touch it; the two
  adjustments are recorded in `quickstart.md`.

## Complexity Tracking

No constitution violations; nothing to justify.
