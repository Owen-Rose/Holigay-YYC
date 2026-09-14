# Research: Close the Public Data Exposure

**Feature**: 006-close-public-data-exposure | **Date**: 2026-08-21

No `NEEDS CLARIFICATION` markers existed in the Technical Context; the research
below records the design decisions that resolve every open question from the
brainstorming handoff, plus the empirical checks the implementation must run
before relying on an assumption. Facts cited by file:line were verified against
the working tree on 2026-08-21.

---

## R1. RPC shape: one function, jsonb in, `RETURNS TABLE` out

**Decision**: `public.submit_public_application(p_submission jsonb)` —
`LANGUAGE plpgsql SECURITY DEFINER SET search_path = public`, returning
`TABLE (application_id uuid, vendor_id uuid, vendor_created boolean,
event_name text, event_date date)`. Full contract in
`contracts/submit-public-application.md`.

**Rationale**: A single jsonb argument matches the repo's established RPC idiom
(`create_event_with_default_questionnaire(p_event jsonb)`,
`009_dynamic_questionnaires.sql:381`), so call sites, GRANT syntax, and
generated types follow a known pattern. One function with nullable
`answers`/`attachments` branches serves both form variants (decision carried in
from brainstorming — not relitigated). `RETURNS TABLE` yields fully typed
generated types (no `Json` casts); returning `event_name`/`event_date` deletes
the legacy action's post-insert event fetch (`applications.ts:300`) — today an
extra failure mode that degrades to an email warning — and the dynamic action's
pre-fetch. `vendor_created` comes nearly free via the `(xmax = 0)` upsert idiom
and lets tests assert create-vs-update without another query.

**Alternatives considered**: Two thin functions sharing an inner helper —
rejected (more surface, and ROADMAP Tier 4 wants the legacy path retired;
don't over-invest). Discrete SQL arguments — unwieldy for nested arrays.
`RETURNS jsonb` — loses generated-type precision; kept as the documented
fallback if `RETURNS TABLE` column-name shadowing proves annoying
(**implementer note**: output column names become plpgsql variables, so every
column reference in the body must be table-qualified, e.g. `e.event_date`).

## R2. Error signalling: SQLSTATE codes, canned messages in TS

**Decision**: The RPC raises `RAISE EXCEPTION ... USING ERRCODE = 'P000x'`
(`P0002` event not found, `P0001` event not accepting applications, `P0003`
duplicate application, `P0004` answer references a foreign question). A shared
`mapSubmissionError(error)` in new `src/lib/submission/errors.ts` maps
`error.code` to the existing friendly strings; anything unrecognized maps to
the generic `'Failed to create application'` and full details go to
`console.error` only.

**Rationale**: Follows `010_ensure_event_questionnaire.sql`'s existing
`ERRCODE` convention; PostgREST surfaces SQLSTATE as `error.code` on the
supabase-js response, so mapping is deterministic. Mapping in one shared module
keeps both actions consistent and unit-testable once. Never forwarding
`error.message`/`details` prevents leaking constraint names and RAISE text to
anonymous callers.

**Alternatives considered**: Returning an error payload from the function
instead of raising — rejected: raising is what makes the transaction roll back
(FR-008). String-matching on error messages — brittle, locale-hostile.

## R3. Atomicity and races: rely on the function transaction + UNIQUE constraints

**Decision**: The whole submission runs in the function's implicit transaction;
any raise rolls everything back. Vendor upsert uses
`INSERT ... ON CONFLICT (email) DO UPDATE` (updates contact fields +
`updated_at`; never touches `email` or `user_id`). Application insert uses
`ON CONFLICT (event_id, vendor_id) DO NOTHING` with a NULL-id check → `P0003`.

**Rationale**: `vendors.email UNIQUE` and `applications UNIQUE(event_id,
vendor_id)` already exist (`001_initial_schema.sql`), so concurrent same-email
submissions serialize on the row lock (exactly one vendor row) and concurrent
duplicate applications lose deterministically (the loser's whole transaction —
including its vendor update — rolls back, matching today's observable
duplicate behavior). This simultaneously fixes both silent-failure bugs: the
anon vendor UPDATE no-op (`applications.ts:169`, `answers.ts:186`) and the
orphaned application row from the no-op rollback delete (`answers.ts:269`).
`application_answers UNIQUE(application_id, event_question_id)` backstops
duplicate-question payloads (23505 → full rollback → generic message; also a
handy forced-failure vector for tests).

**Alternatives considered**: Select-then-insert/update for the vendor —
race-prone, more code. Advisory locks — unnecessary given the constraints.

## R4. Attachments move inside the RPC transaction

**Decision**: Legacy attachment records are inserted by the RPC as part of the
single transaction; an attachment failure now fails the whole submission.

**Rationale**: FR-004 demands all-or-nothing. Today `applications.ts:282-288`
swallows attachment-insert failures ("We don't fail the whole submission"),
committing an application without its attachment rows while the user sees
success. Hard failure with full rollback is the intended behavior change,
covered by SC-005's carve-outs.

**Alternatives considered**: Keep attachments outside and best-effort —
violates FR-004/FR-008.

## R5. Event-open check: `status = 'active'` only

**Decision**: The RPC re-checks `events.status = 'active'` (SECURITY DEFINER
bypasses RLS, so it must not rely on the dropped anon policies' guards). The
application deadline is **not** enforced at the data layer.

**Rationale**: Parity with today's strictest path — the dynamic action already
checks status (`answers.ts:95`); the legacy action has no data-layer check at
all, so `P0001` is exactly the FR-007-mandated tightening. Deadline filtering
stays UI-level (`getActiveEvents`), unchanged.

**Alternatives considered**: Also enforcing `application_deadline` — a real
behavior change beyond the spec (SC-005 zero-change rule); recorded as a
possible future spec.

## R6. Harden existing SECURITY DEFINER RPCs (scope addition)

**Decision**: Migration 011 also runs `REVOKE EXECUTE ... FROM PUBLIC, anon`
on `create_event_with_default_questionnaire(jsonb)` and
`ensure_event_questionnaire(uuid)`, and the security suite asserts anon cannot
invoke them (test W3).

**Rationale**: PostgreSQL grants EXECUTE to PUBLIC by default on new
functions; the migrations' `GRANT ... TO authenticated` statements are no-ops
on top of that default, so both functions — which have only app-layer role
checks — are almost certainly anon-callable via `POST /rest/v1/rpc/...` today.
That is a public-data-exposure hole of the same class this spec closes.
**Empirical check first**: before writing the assertion, invoke each as anon
against the local stack to confirm the exposure (a one-line probe).

**Alternatives considered**: Deferring to a future spec — rejected; it is two
lines in a migration this spec already ships, and squarely on-mission. It is
flagged in plan.md's Constitution Check as the one scope addition.

## R7. One migration, ordered for safety

**Decision**: A single `011_close_public_data_exposure.sql`, ordered: (§1)
create + grant the RPC, (§2) revoke PUBLIC/anon on existing RPCs, (§3) drop
the seven anon policies, (§4) storage bucket + policies.

**Rationale**: The policy drops and the RPC are one atomic security-posture
change — splitting them creates windows where public submission is broken.
Creating the RPC first means the file never leaves the database in a
submission-broken state even mid-apply. The seven drops (verified against the
working tree): `anon_insert_vendors` (005:84), `anon_select_vendors` (005:89),
`anon_insert_applications` (005:132), `anon_select_applications` (005:137),
`anon_insert_attachments` (005:185), `anon_select_attachments` (005:190),
`anon_insert_application_answers` (009:298). Kept: `anon_select_active_events`
(005:52), `anon_select_event_questionnaires` (009:174),
`anon_select_event_questions` (009:217). (The handoff's "two
application_answers anon policies" was off by one — the spec already records
this.)

**Alternatives considered**: A separate storage-only migration — no benefit;
same deploy unit.

## R8. Storage codified: idempotent bucket insert + drop-all-then-recreate policies

**Decision**: `INSERT INTO storage.buckets (id, name, public) VALUES
('attachments','attachments',false) ON CONFLICT (id) DO NOTHING`; a DO block
iterating `pg_policies` drops **every** existing policy on `storage.objects`;
then three named policies: `attachments_anon_insert` (INSERT to
anon+authenticated, `bucket_id = 'attachments'`),
`attachments_authenticated_select` (SELECT to authenticated),
`attachments_authenticated_delete` (DELETE to authenticated). No
`[storage.buckets.*]` block is added to config.toml — the migration itself
creates the local bucket on `supabase db reset`/`start`, keeping one source of
truth.

**Rationale**: Prod's current policies were created in the dashboard with
unknown names, so name-targeted drops can't be trusted; this app owns the whole
Supabase project and has exactly one bucket, so drop-all-then-recreate is the
only deterministic approach (consequence — any other bucket's policies would be
nuked — is vacuous here). Dropping anon SELECT implements the clarified
decision: anon uploads keep working (plain `.upload()` needs only INSERT;
`uploadFile` never uses upsert), downloads become authenticated-only.

**Risk (highest in this spec) + check**: whether hosted Supabase still permits
`CREATE POLICY` on `storage.objects` and inserts into `storage.buckets` from
`db push` as the `postgres` role after the 2025 storage-schema lockdown.
Believed yes (policies remain the supported SQL surface). **Prove on the dev
project before prod** (rollout step 2 in quickstart.md). Fallback if it fails
with "must be owner of relation objects": keep the bucket insert, configure
policies via the dashboard/management API, leave a loud comment in 011, and
record a time-boxed exception per the constitution.

**Alternatives considered**: Dashboard-only (status quo) — violates FR-011.
config.toml bucket declaration — redundant second source of truth.

## R9. Signed URLs under authenticated-only SELECT

**Decision**: Keep the dashboard's `createSignedUrl` flow unchanged
(`src/app/dashboard/applications/[id]/attachments-list.tsx:109`) and prove it
in the suite (tests ST2/ST3).

**Rationale**: `createSignedUrl` authorizes against the *calling* role's
SELECT policy; redeeming the signed URL is token-based and does not re-check
RLS. The dashboard call runs under an authenticated organizer session →
covered by `attachments_authenticated_select`. Anon signed-URL creation (and
direct download) must fail after the change. Treated as open until ST2/ST3
pass against the real stack.

## R10. Required-answer emptiness: one shared helper, schemas unchanged

**Decision**: Add `isAnswerEmpty(answer: AnswerValue): boolean` to
`src/lib/questionnaire/answer-coercion.ts`: `text` → trimmed length 0;
`choice`/`date` → `''`; `choices` → `[]`; `file` → `path === ''`;
`number`/`boolean` → never empty (0 and false are answers). Server required
check becomes `!answerMap.has(id) || isAnswerEmpty(...)`; the client form
replaces its object-truthiness test with the same helper (file questions key
off `pendingFiles` presence, since the pre-upload placeholder is
`{kind:'file', path:''}`). Empty *optional* answers are skipped when building
the RPC payload (no `{kind:'text', value:''}` rows stored). The permissive
leaf Zod schemas (`answer-coercion.ts:43-63`,
`validations/questionnaire.ts:69-96`) do **not** change.

**Rationale**: Emptiness is a semantic check on required questions, not a
shape constraint — tightening the schemas would break optional questions that
legitimately carry empty values through the pipeline. One helper in the
client-safe module that already owns `AnswerValue` serves both sides (FR-009's
"client-side and server-side") without creating a third copy of per-kind
logic. The near-duplication between the two leaf-schema files is noted as
future cleanup, out of scope.

**Alternatives considered**: `.min(1)` on text/choices schemas — breaks
optionals; conditional schemas per required flag — the existing
`buildAnswersSchema` deliberately parses with `required: false`
(`answers.ts:130`) precisely because requiredness is checked separately.

## R11. Unknown question IDs: reject in the action, backstop in the RPC

**Decision**: The dynamic action rejects any submitted answer whose questionId
is not in the event's question set (new check; today they are silently dropped
by the visibility filter). The RPC independently validates every
`event_question_id` belongs to the event's questionnaire and raises `P0004`.

**Rationale**: The spec's edge case requires rejection with no partial
records. The action-level check gives the friendly early error; the RPC-level
check is defense-in-depth (the RPC is anonymously callable and must not trust
its caller).

## R12. Security suite: Vitest projects in the existing config

**Decision**: Split `vitest.config.ts` into `projects`: `unit` (jsdom,
existing include, excludes `src/test/security/**`) and `security` (node
environment, `src/test/security/**/*.test.ts`, `fileParallelism: false`,
`testTimeout` 20s / `hookTimeout` 60s). Scripts: `test` unchanged (runs both;
security self-skips when the stack is down — US4-AC4), plus
`test:security` (`vitest run --project security`).

**Rationale**: Vitest 4 (`^4.0.15` installed) supports `projects` natively —
one config file, shared alias/coverage, per-project environments. Sequential
files because suites share seeded DB fixtures.

**Alternatives considered**: A second config file + separate script — more
drift surface; workspace files — deprecated in favor of `projects`.

## R13. Harness env: deterministic local demo keys, health-probe skip, CI must-run

**Decision**: `src/test/security/harness.ts` reads
`SUPABASE_URL`/`SUPABASE_ANON_KEY`/`SUPABASE_SERVICE_ROLE_KEY` with the
Supabase CLI's deterministic local demo JWTs as fallbacks (public constants,
not secrets — copy exact strings from `supabase status` during
implementation). A top-level 2s `fetch(${URL}/auth/v1/health)` probe sets
`stackUp`; every suite is `describe.runIf(stackUp)`. If
`CI_REQUIRE_SECURITY_TESTS=1` and the stack is down, the harness **throws**.
Clients are plain `@supabase/supabase-js` (`^2.86.2`, already a direct
dependency): anon, service-role (fixtures, ground-truth asserts, cleanup), and
an authed organizer created via `auth.admin.createUser` + a service-side
`user_profiles.role = 'organizer'` update + `signInWithPassword`.

**Rationale**: Demo keys mean zero CI secrets. The CI guard is essential —
without it a broken CI stack would silently skip the entire suite and
green-light the PR, defeating FR-012. `describe.runIf` gives the local
skip-not-fail behavior (US4-AC4).

**Checks at implementation time**: `supabase status` on CLI 2.65.6 still
prints the legacy `anon key`/`service_role key` demo JWTs (true unless the
project opts into publishable keys — config.toml does not).

## R14. Fixtures and forced-failure vectors

**Decision**: `beforeAll` seeds via the service client: one active event with
questionnaire + questions (one per answer kind, incl. required text /
multi-select / file), one draft event, one second active event
(returning-vendor case), with a per-run unique suffix in names/emails.
`afterAll` deletes seeded events (FK cascade), vendors by suffix, storage
objects, and created auth users. Forced mid-transaction failures: (S8) same
question id twice → unique_violation *after* vendor+application inserts; (S7)
bogus question id → `P0004`; (S9) attachment missing `file_name` → NOT NULL
violation after the application insert. Each asserts zero orphaned rows via
the service client (SC-003).

**Rationale**: These vectors fire at different depths of the transaction and
need no test-only hooks in production code. The full FR ↔ test mapping lives
in `contracts/security-test-matrix.md`.

## R15. CI: parallel job, slim `supabase start`

**Decision**: A second job `security-tests` in `.github/workflows/ci.yml`
(existing job untouched): checkout → node 20 + npm cache → `npm ci` →
`supabase/setup-cli@v1` pinned to `2.65.6` → `supabase start -x
studio,inbucket,realtime,edge-runtime,logflare,vector,imgproxy` → `npm run
test:security` with `CI_REQUIRE_SECURITY_TESTS=1`. Supporting tweaks: set
`[analytics] enabled = false` in config.toml (drops the logflare/vector
containers everywhere, not just CI) and add an empty `supabase/seed.sql`
(config.toml declares `sql_paths = ["./seed.sql"]` but the file doesn't exist
— an empty file removes CLI-version-dependent behavior on a dangling path).

**Rationale**: `supabase start` applies all migrations on boot — the suite
tests exactly what ships. Needed containers: db, kong/rest, auth (GoTrue, for
authed tests), storage. Expected wall clock ~3–4 min cold (pulls dominate),
inside SC-004's 5-minute budget. A parallel job keeps the constitutional gate
order untouched.

**Checks at implementation time**: exact `-x` service names on CLI 2.65.6
(`supabase start --help`; `inbucket` vs `mailpit` naming shifted across CLI
versions).

**Alternatives considered**: Extending the existing job — serializes ~3 min of
Supabase boot behind the build, risking SC-004. `supabase db start` (db only)
— no storage/auth containers, can't cover FR-011 or authed tests.

## R16. Types regeneration: new `db:types:local`

**Decision**: Add `"db:types:local": "supabase gen types typescript --local >
src/types/database.ts"` and use it as the primary regeneration path for this
spec. Expected diff: only `Database['public']['Functions']` gains
`submit_public_application`; no table/enum changes.

**Rationale**: `db:types`/`db:types:dev` target *hosted* projects by
`--project-id`, but migration 011 exists only locally until rollout —
generating from the local stack decouples types from hosted deployment and is
reproducible. Constitution satisfied (generated, never hand-edited).

**Alternatives considered**: Push to the dev project first, then
`db:types:dev` — couples every WIP schema tweak to a shared hosted
environment; demoted to a rollout *verification* step (after `db push` to dev,
`db:types:dev` must produce zero diff).

## R17. Accepted behavior deltas (SC-005 carve-outs, enumerated)

1. Returning vendors' changed contact details are now saved (bug fix, FR-005).
2. Present-but-empty required answers are now rejected (bug fix, FR-009).
3. A failed attachment insert now fails the whole submission instead of
   silently committing an attachment-less application (R4).
4. Legacy-form submissions forced at draft/closed events are now rejected at
   the data layer (previously only UI-filtered; FR-007).
5. Empty optional answers are no longer stored as rows (R10).
6. Duplicate submissions no longer update the vendor's contact info before
   being rejected (the whole transaction rolls back; today the update
   silently no-ops anyway, so observable behavior is unchanged).

## R18. Unit-test fallout strategy

**Decision**: `answers-actions.test.ts` — rewrite its positional response
queue (models ~8 sequential calls; the action now makes 2 reads + 1 rpc) using
the per-table-queue idiom from `applications-email-warning.test.ts` plus an
`rpc` mock; convert event-status and duplicate tests to ERRCODE-mapping tests;
delete the orphan-cleanup (`applications.delete`) test; add FR-009 per-kind
required-empty cases and the unknown-question rejection.
`applications-email-warning.test.ts` — rewrite around a mocked
`rpc().single()` returning the new row shape; drop the event-fetch-failure
warning case (path removed). `dynamic-application-form.test.tsx` — add client
required-empty cases (empty text, unchecked multi-select, missing file → no
submit call). New pure table tests: `isAnswerEmpty`, `mapSubmissionError`.

---

## Implementation-time check results (verified 2026-08-21, T004)

Ran against the local stack (Supabase CLI 2.65.6, migrations 001–010 applied).
Recorded here rather than edited into R6/R13/R15 so the decision record stays
intact; **where a result contradicts the original text, the result wins.**

### R6 — both privileged RPCs are anon-callable today (exposure confirmed)

`has_function_privilege` on the local database:

| Function | PUBLIC | anon | SECURITY DEFINER |
|---|---|---|---|
| `create_event_with_default_questionnaire(p_event jsonb)` | true | true | true |
| `ensure_event_questionnaire(p_event_id uuid)` | true | true | true |

Confirmed over HTTP with only the anon key (both calls rolled back; `events`
count unchanged at 0):

- `POST /rest/v1/rpc/ensure_event_questionnaire` `{"p_event_id":"000…0"}` →
  `P0002 Event not found` — the function's *own* error, i.e. it executed.
- `POST /rest/v1/rpc/create_event_with_default_questionnaire` `{"p_event":{}}` →
  `23502 null value in column "name" of relation "events"` — an anonymous
  caller reached the `INSERT INTO events`.

Neither returned `42501`. The `GRANT … TO authenticated` in 009/010 is a no-op
on top of PostgreSQL's default PUBLIC grant, exactly as R6 predicted. Migration
011 §2's revokes are therefore load-bearing, and test W3 can assert `42501`.

Adjacent, deliberately **not** changed: `get_user_role()` and
`handle_new_user()` are also SECURITY DEFINER with the default PUBLIC EXECUTE.
`get_user_role()` returns only the caller's own role (NULL for anon) and is
referenced by RLS policies, so revoking anon EXECUTE risks breaking policy
evaluation for the kept anon-read policies; `handle_new_user()` returns
`trigger` and is not exposed by PostgREST. Out of scope for spec 006.

### R13 — demo JWTs still exist, but not in the pretty `supabase status`

On CLI 2.65.6 the table output prints only the new-format keys
(`sb_publishable_…` / `sb_secret_…`). The legacy demo JWTs the harness needs
come from **`supabase status -o env`** (`ANON_KEY`, `SERVICE_ROLE_KEY`) — the
standard deterministic values, payloads `{"iss":"supabase-demo","role":"anon",
"exp":1983812996}` and `…"role":"service_role"…`, signed with the documented
demo `JWT_SECRET`. Safe to hardcode as harness fallbacks (public constants).
T010 should copy them from `supabase status -o env`, not the pretty output.

### R15 — corrected `supabase start -x` service names

R15's proposed list is invalid on 2.65.6: there is no `inbucket` service — it is
`mailpit`. The full valid set (from `supabase start --help`) is:

```text
gotrue, realtime, storage-api, imgproxy, kong, mailpit, postgrest,
postgres-meta, studio, edge-runtime, logflare, vector, supavisor
```

The suite needs db (not excludable), `kong`, `postgrest`, `gotrue`,
`storage-api`. Recommended CI exclusion for T026:

```text
-x studio,mailpit,realtime,edge-runtime,imgproxy,postgres-meta,logflare,vector,supavisor
```

(`logflare`/`vector` are already moot after T001's `[analytics] enabled = false`;
listing them is harmless and survives a future config change.)

**SC-004 risk raised.** The local `supabase stop` → `supabase start` in this
task took ~10 minutes wall clock, essentially all of it image pulls (the CLI
re-pulled ~10 images despite a warm cache). Every CI pull is cold, so the
5-minute budget depends on the exclusion list actually eliminating those pulls —
`studio` in particular. T026/T028 must measure the real job time; if it exceeds
SC-004, the next levers are excluding `postgres-meta` (already listed above) and
caching the Docker images between runs.

### Storage baseline (context for T007/T014)

The local database has **zero** rows in `storage.buckets` and **zero** policies
on `storage.objects`. So locally there is nothing for 011 §4's drop-all DO block
to drop, and the `attachments` bucket does not exist until 011 creates it —
R8's "drop everything and recreate" only does real work against the hosted
projects, where the dashboard-created policies live. Local `db reset` therefore
proves the *create* half of §4 but not the *drop* half; the dev-project push
(quickstart rollout step 1) remains the real test of R8.

### R19 — storage policies verified: supautils permits it, locally and hosted (resolves R8's open risk)

R8 named the storage section the highest-risk part of this spec and deferred the
proof to the dev-project push. It is now settled locally, at implementation
time, and the answer is **it works** — but not for the reason the catalog
suggests, so the mechanism is worth recording.

Measured on the local stack (CLI 2.65.6, Postgres 17) *before* applying 011:

| Fact | Value |
|---|---|
| `storage.objects` / `storage.buckets` owner | `supabase_storage_admin` |
| Role applying migrations | `postgres` (proof: `public.events`, `create_event_with_default_questionnaire`, and `supabase_migrations.schema_migrations` are all owned by `postgres`) |
| `postgres` `rolsuper` | `false` |
| `pg_has_role('postgres','supabase_storage_admin','MEMBER')` | `false` (that role has no members at all) |
| `has_schema_privilege('postgres','storage','CREATE')` | `false` |
| `storage.objects` RLS | enabled, `FORCE` off, zero policies |
| `storage.buckets` rows | zero |

By stock PostgreSQL rules that combination forbids `CREATE POLICY` (ownership or
superuser required), which predicts a `42501 must be owner of table objects` and
a failed `supabase db reset`. **That prediction is wrong.** Supabase's
`supautils` extension intercepts policy DDL and grants the privileged role an
explicit carve-out:

```text
supautils.privileged_role = postgres
supautils.policy_grants   = {"postgres":[ … ,"storage.buckets","storage.objects",
                             "storage.prefixes","storage.s3_multipart_uploads", … ]}
```

This is the machinery behind the April-2025 storage lockdown announcement
(github.com/orgs/supabase/discussions/34270), which keeps "create RLS policies
and database triggers on `storage.buckets`, `storage.migrations`,
`storage.objects`, …" available to `postgres` while removing table/function
creation, drops, and index creation. Verified two ways on the local stack:
`CREATE POLICY … ON storage.objects` as `postgres` succeeds in a rolled-back
transaction, and `supabase db reset` applied 011 §4 end to end, leaving one
`attachments` bucket row and exactly the three intended policies.

**Consequence for the migration**: §4 is plain SQL — bucket insert, a `DO` block
dropping every existing `storage.objects` policy, then the three named policies.
No privilege guard, no out-of-band bridge script, no `[storage.buckets.*]` block
in config.toml. One source of truth, and a genuine failure on a hosted push will
fail loudly rather than warn.

**The trap to avoid**: the widely-reported `must be owner of table objects`
breakages (e.g. supabase/cli#4289) are triggered by `ALTER TABLE
storage.objects ENABLE ROW LEVEL SECURITY` in a migration — altering storage
tables is outside the carve-out, and RLS is already enabled by the platform.
Migration 011 deliberately does not emit it.

**Still unproven**: that hosted dev/prod behave identically. They ship the same
supautils configuration, so they should, but R8's rollout instruction stands —
after `db push` to dev, confirm the three `attachments_*` policies actually
exist rather than trusting a clean exit.
