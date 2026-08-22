# Implementation Plan: Close the Public Data Exposure

**Branch**: `006-close-public-data-exposure` | **Date**: 2026-08-21 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/006-close-public-data-exposure/spec.md`

## Summary

Anyone holding the app's public anon key can dump vendor PII, application records
(including internal organizer notes), attachment paths, and application answers
directly through PostgREST, because seven broad anon RLS policies grant blanket
read/write. The same root cause makes two writes silently no-op (returning
vendors' contact updates; the orphan-cleanup delete after a failed answers
insert).

The fix: one new append-only migration (`011_close_public_data_exposure.sql`)
that (a) creates a transactional `SECURITY DEFINER` RPC,
`submit_public_application(p_submission jsonb)`, serving both the legacy static
form and the dynamic questionnaire form; (b) drops the seven broad anon
policies while keeping the three intentionally public read policies; (c)
codifies the `attachments` storage bucket and its policies in SQL (anon uploads
kept, downloads/deletes authenticated-only); and (d) revokes the default
PUBLIC/anon EXECUTE grants on the two existing SECURITY DEFINER RPCs. App-side,
the two submission server actions swap their multi-step anon write sequences
for one RPC call (Zod validation and show-if re-evaluation stay in the
actions), the ungated `deleteFile` action and its `/test-upload` caller are
deleted, and required-answer semantics gain a per-kind emptiness check shared
by client and server. A new security test suite runs the real local Supabase
stack (Vitest `security` project) and gates every PR via a new CI job.

## Technical Context

**Language/Version**: TypeScript 5.x, `strict: true` (unchanged) + PL/pgSQL for the RPC
**Primary Dependencies**: Next.js 16 (App Router), React 19, `@supabase/ssr`, `@supabase/supabase-js` ^2.86 (already a direct dependency — used by the new test harness), Supabase CLI ^2.65.6 (devDependency), Vitest ^4
**Storage**: Supabase PostgreSQL (hosted dev + prod; local stack via `supabase/config.toml`) + Supabase Storage bucket `attachments`
**Testing**: Vitest 4 — existing jsdom unit project + new `security` project (node env) exercising the real local stack; skipped when the stack is down, mandatory in CI
**Target Platform**: Vercel (app), Supabase hosted (dev `kcokcufmzyckbodelqpb`, prod `hgmfjvjlxrhdojwlkgap`)
**Project Type**: Web application (single Next.js project + SQL migrations)
**Performance Goals**: Security CI job completes in under 5 minutes (SC-004); submission latency improves slightly (8 sequential DB round-trips collapse into 1 RPC)
**Constraints**: Append-only migrations; anon key only in the request path (no service-role client); zero observable behavior change for legitimate users aside from the spec's carve-outs (SC-005)
**Scale/Scope**: Single-tenant, barely-used production app; 1 migration, 2 server-action refactors, 2 deletions, 1 shared helper, ~5 new security-test files, 1 CI job

## Constitution Check

*GATE: evaluated pre-Phase 0 and re-checked post-design — PASS (no violations to justify).*

| Principle | Check | Status |
|---|---|---|
| I — Zod before DB | Both refactored actions keep `safeParse` ahead of the RPC call | PASS |
| I — `requireRole()` on mutations | The two submission actions are intentionally anonymous (public apply flow) — same posture as today; authorization moves *into* the data layer (RPC re-checks event status, RLS drops anon table access). No other action changes authz. `deleteFile` (the one ungated mutation) is deleted, not gated | PASS |
| I — `{success, error, data}` responses | Response shapes preserved (legacy keeps `warning`) | PASS |
| I — RLS on user-data tables | No new tables; policy changes ship in migration 011 | PASS |
| I — Append-only migrations | 011 is new; 005/009 are not edited | PASS |
| I — CI gates | Existing format→lint→test→build job untouched; security job is additive | PASS |
| I — No `any`/hand-edited types | `database.ts` regenerated via new `db:types:local` script | PASS |
| II — Tests per changed action/form | Reworked unit tests for both actions + form; new pure tests for `isAnswerEmpty` and `mapSubmissionError`; security suite covers the rest | PASS |
| III — UI consistency | No visual changes; client-side required-empty errors reuse the existing per-question error rendering | PASS |
| IV — RSC/perf | No client-component conversions; `revalidatePath` calls preserved | PASS |
| Stack lock-in | No new runtime dependencies | PASS |

**Scope addition (flagged, not a violation)**: migration 011 also revokes the
default `PUBLIC` EXECUTE grant on `create_event_with_default_questionnaire` and
`ensure_event_questionnaire`. PostgreSQL grants EXECUTE to PUBLIC on new
functions by default, so both are almost certainly anon-callable via
`POST /rest/v1/rpc/...` today despite their `TO authenticated` grants. This is
squarely "close the public data exposure"; the security suite asserts it
(verified empirically before relying on it — see research.md R6).

## Project Structure

### Documentation (this feature)

```text
specs/006-close-public-data-exposure/
├── plan.md                                  # This file
├── research.md                              # Phase 0 output
├── data-model.md                            # Phase 1 output
├── quickstart.md                            # Phase 1 output
├── contracts/
│   ├── submit-public-application.md         # RPC contract
│   └── security-test-matrix.md              # FR ↔ test mapping
└── tasks.md                                 # Phase 2 output (/speckit.tasks — NOT created by /speckit.plan)
```

### Source Code (repository root)

```text
supabase/
├── config.toml                              # MODIFIED: [analytics] enabled = false
├── seed.sql                                 # NEW: empty (config declares a dangling seed path)
└── migrations/
    └── 011_close_public_data_exposure.sql   # NEW: RPC + revokes + policy drops + storage

src/
├── lib/
│   ├── actions/
│   │   ├── applications.ts                  # MODIFIED: submitApplication → RPC call
│   │   ├── answers.ts                       # MODIFIED: submitDynamicApplication → RPC call + FR-009 + unknown-question rejection
│   │   └── upload.ts                        # MODIFIED: deleteFile removed
│   ├── submission/
│   │   └── errors.ts                        # NEW: mapSubmissionError (ERRCODE → friendly message)
│   └── questionnaire/
│       └── answer-coercion.ts               # MODIFIED: + isAnswerEmpty
├── app/
│   ├── (public)/apply/_components/
│   │   └── dynamic-application-form.tsx     # MODIFIED: client required-empty check
│   └── test-upload/                         # DELETED (sole deleteFile caller)
├── test/
│   ├── security/                            # NEW: harness.ts + 5 suites (real local stack)
│   ├── answers-actions.test.ts              # REWORKED: rpc mock, ERRCODE mapping, FR-009 cases
│   ├── applications-email-warning.test.ts   # REWORKED: rpc mock
│   └── dynamic-application-form.test.tsx    # EXTENDED: client empty-answer cases
└── types/
    └── database.ts                          # REGENERATED (db:types:local)

vitest.config.ts                             # MODIFIED: projects split (unit / security)
package.json                                 # MODIFIED: test:security, db:types:local scripts
.github/workflows/ci.yml                     # MODIFIED: + security-tests job
```

**Structure Decision**: Single Next.js project (existing layout). The only new
directories are `src/lib/submission/` (shared error mapper used by two action
files) and `src/test/security/` (the integration suite, isolated so the unit
project can exclude it by glob).

## Design Highlights

Full details live in `contracts/submit-public-application.md`, `research.md`,
and `data-model.md`; the load-bearing decisions:

1. **One RPC, both variants** — `submit_public_application(p_submission jsonb)`
   `RETURNS TABLE (application_id, vendor_id, vendor_created, event_name,
   event_date)`. Legacy passes `attachments`, dynamic passes `answers`; either
   may be null. Returning the event fields lets both actions drop their event
   fetches for the confirmation email.
2. **Errors by SQLSTATE** — `P0002` event not found, `P0001` not accepting
   applications, `P0003` duplicate application, `P0004` answer references a
   question outside the event's questionnaire. Actions map codes to the
   existing friendly messages via `mapSubmissionError`; raw PostgREST error
   text is never forwarded to callers (leak prevention).
3. **Atomicity from the function transaction** — any `RAISE` rolls back vendor
   upsert, application, answers, and attachments together (FR-004/FR-008).
   Races are settled by existing UNIQUE constraints: `vendors.email`
   (`ON CONFLICT DO UPDATE` — also fixes the silent contact-update bug, FR-005)
   and `applications(event_id, vendor_id)` (`ON CONFLICT DO NOTHING` → NULL id
   → `P0003`, FR-006).
4. **Attachments move inside the transaction** — the legacy path's swallowed
   attachment-insert failure becomes a hard rollback (accepted behavior change
   under SC-005's carve-outs).
5. **Storage in SQL** — idempotent bucket insert; a DO block drops *all*
   existing `storage.objects` policies (prod's dashboard-created names are
   unknown; `attachments` is the only bucket); three named policies recreate
   the posture: anon+authenticated INSERT, authenticated SELECT, authenticated
   DELETE. The dashboard's signed-URL download keeps working because
   `createSignedUrl` runs under the authenticated session.
6. **FR-009 via one helper** — `isAnswerEmpty` in `answer-coercion.ts` defines
   emptiness per answer kind (trimmed text, empty choice/date/file-path, empty
   choices array; number/boolean are never empty). Used by the server required
   check and the client form; leaf Zod schemas stay permissive so optional
   questions may carry empty values.
7. **Security suite = Vitest project** — `describe.runIf(stackUp)` with a 2s
   health probe gives the local skip (US4-AC4); `CI_REQUIRE_SECURITY_TESTS=1`
   turns a down stack into a CI failure so the suite can never silently skip.
   Deterministic local demo keys mean no CI secrets.
8. **CI as a parallel job** — `supabase start` (heavy services excluded) applies
   all migrations, then `npm run test:security`; the existing gate job is
   untouched.

## Complexity Tracking

> No constitutional violations — table intentionally empty. The one scope
> addition (revoking PUBLIC EXECUTE on the two existing RPCs) is documented in
> the Constitution Check section above and research.md R6.
