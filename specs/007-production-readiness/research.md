# Research: Production Readiness (Milestone M3)

**Feature**: 007-production-readiness | **Date**: 2026-09-14

No `NEEDS CLARIFICATION` markers existed in the Technical Context. The decisions below
were made in the 2026-09-13/14 brainstorm (`docs/M3-PLAN.md`) and are recorded here in
spec-kit form, with the empirical checks the implementation must run before relying on an
assumption. Facts cited by file:line were verified against the working tree on 2026-09-14.

---

## R1. Production strictness keys on `VERCEL_ENV`, not `NODE_ENV`

**Decision**: `RESEND_API_KEY` and `EMAIL_FROM_ADDRESS` are required — and a sender
containing `resend.dev` refused — only when `process.env.VERCEL_ENV === 'production'`.
Everywhere else the email client keeps its current lenient behaviour: no key → log the
email instead of sending (`src/lib/email/client.ts:33-40`); no sender → the
`onboarding@resend.dev` fallback (`:16`).

**Rationale**: Vercel builds Preview deploys with `NODE_ENV=production`, so the existing
`NODE_ENV` throw at `client.ts:35` is already the wrong key: a strict check on it would
fail every preview build while the sending domain is pending, and would fail a local
`next build` too. `VERCEL_ENV` is `production` only for a Production deploy of `main`,
which is exactly the deployment that must never email from the test sender. This also
removes the sequencing hazard in the original plan ("merge only after the Vercel vars are
set"): T004 merges freely; the guard bites at the next `dev → main` promotion.

**Alternatives considered**: keep `NODE_ENV` (rejected, above); a dedicated
`EMAIL_STRICT=1` flag (rejected: one more variable to forget, and it would be set exactly
where `VERCEL_ENV` is already `production`); a `warn`-only mode (rejected: the roadmap
item exists because silent fallback is the failure).

## R2. Two env modules; literal reads; no `server-only` package

**Decision**: `src/lib/env-public.ts` exports `{ supabaseUrl, supabaseAnonKey }` parsed
from `process.env.NEXT_PUBLIC_SUPABASE_URL` and `process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY`
written as literal property accesses. `src/lib/env.ts` exports the server-side values
(`resendApiKey`, `emailFromAddress`, `cronSecret`, `keepaliveTargets`, `isProduction`)
and begins with a runtime guard that throws if `typeof window !== 'undefined'`. Both parse
once at import with `safeParse` and throw a single `Error` listing every issue as
`NAME (reason)`; the message format is in `contracts/env-contract.md`.

**Rationale**: Next.js inlines `NEXT_PUBLIC_*` only when the access is a literal
`process.env.NEXT_PUBLIC_X`; a loop over names yields `undefined` in the browser. The
four Supabase client files (`src/lib/supabase/client.ts:6-7`, `server.ts:9-10`,
`middleware.ts:10-11`, `src/middleware.ts:19-20`) run in three runtimes (browser, node,
edge middleware), so the public module must be importable from all three and must not
import anything server-only. The `server-only` package is **not installed**
(`node_modules/server-only` absent, checked 2026-09-14) and adding it would violate the
no-new-dependency constraint; a runtime guard gives the same protection for a
two-module setup. Parsing at import means a misconfigured deploy fails at the first
request that touches the module — for the Supabase clients that is the middleware on
every request, i.e. immediately.

**Alternatives considered**: one module for everything (rejected: it would pull server
values into the client bundle's type surface and invite a literal-read mistake); `t3-env`
or similar (rejected: new dependency); a `getEnv()` function called lazily (rejected:
scattered call sites re-create the "which file reads what" problem the module exists to
end).

**Implementer note**: the two dev API routes keep their `NODE_ENV === 'production'` 404
gate (`src/app/api/test-email/route.ts:80`, `src/app/api/preview-email/route.ts:30`);
that gate is about hiding dev tooling on any deployed build and is correct as is.

## R3. Refusing the test sender

**Decision**: `EMAIL_FROM_ADDRESS` is validated as either `Name <local@domain>` or a bare
`local@domain` with a lenient regex, then refined with `!value.includes('resend.dev')`
when `isProduction`. Outside production the same field is optional and unrefined.

**Rationale**: `onboarding@resend.dev` delivers only to the Resend account owner, so a
production sender on that domain means every vendor email silently vanishes — the
roadmap's first checklist item. A format check catches the most likely typo (a bare name
without an address); anything stricter risks rejecting a valid display name.

**Alternatives considered**: an allow-list of the verified domain (rejected: the domain
name would live in code; the refusal of the one known-bad domain is enough).

## R4. Keep-alive route

**Decision**: `GET /api/keepalive` (`src/app/api/keepalive/route.ts`,
`export const dynamic = 'force-dynamic'`); `Authorization: Bearer <CRON_SECRET>` checked
first; targets parsed from `KEEPALIVE_SUPABASE_TARGETS` (`url|anonKey` pairs, comma
separated); each target read concurrently with `GET {url}/rest/v1/events?select=id&limit=1`
and an 8 s `AbortSignal.timeout`; JSON body `{ ok, checkedAt, targets[] }`; `200` all ok,
`500` any failure or misconfiguration, `401` bad secret. `vercel.json` schedules it daily
at 12:00 UTC. Full contract: `contracts/keepalive-route.md`.

**Rationale**: Vercel sends the bearer header automatically when `CRON_SECRET` is set, so
the route needs no other auth. `events` is the one table anon may read (spec 006 kept the
active-events policy), so the anon key suffices and nothing private is touched. A `500`
on any failure is what turns the Vercel cron log red — the only monitoring this project
has. Prod's own project is listed explicitly rather than inferred so a wrong target list
fails visibly instead of protecting one project by accident. Daily because the Hobby plan
allows daily crons and a weekly ping sits too close to the seven-day pause rule.

**Alternatives considered**: GitHub Actions schedule (rejected: a second place holding
the anon keys, and Actions schedules drift/skip on idle repos); an external uptime pinger
(rejected: another account to keep alive); paid Supabase tier (out of M3 by decision).

**Implementer note**: crons never run on Preview deploys, so the first green run can
only be observed after T020 promotes `dev → main`… **unless** T007 merges to `dev` and is
promoted early. The M3-PLAN session plan expects T008 "after the keep-alive deploy": the
route must reach Production before the rehearsal week to protect dev. Sequence T007's
promotion ahead of the rest of `dev` only if `dev` is otherwise promotable; otherwise run
the route by hand daily (`curl` in quickstart) until T020.

## R5. Does an anon REST read count as activity?

**Decision**: Assume yes; verify by observation. Supabase's pause rule counts requests
through the project's API gateway, and a PostgREST read is one. The evidence rows in
`quickstart.md` are "first cron run green on <date>" and "dev project still active on
<date + 7>".

**Rationale**: There is no way to test the pause rule without waiting a week; the plan
makes the observation itself the acceptance evidence (SC-002).

**Fallback if dev pauses anyway**: switch the per-target read to an authenticated call
(a throwaway user per project, key stored on Vercel) — still no schema change. Recorded
so the fallback is a task, not a redesign.

## R6. Smoke check design

**Decision**: `scripts/smoke-check.mjs`, plain ESM, Node ≥ 20 (native `fetch`,
`AbortSignal.timeout`), imports `@supabase/supabase-js` (already a dependency) for the
REST reads and the RPC call. Inputs `SMOKE_APP_URL`, `SMOKE_SUPABASE_URL`,
`SMOKE_SUPABASE_ANON_KEY` from the shell; `npm run smoke`. Checks, each printed
`PASS`/`FAIL <reason>`, exit 1 if any failed:

1. `GET {SMOKE_APP_URL}/` and `/apply` return 200.
2. Anon `select` on `vendors`, `applications`, `attachments`, `application_answers`
   returns `[]` (the spec 006 probe, automated).
3. `events?status=eq.active` is readable; for every active event, `event_questionnaires`
   has a row and `event_questions` has ≥ 1 row for it.
4. `rpc('submit_public_application', { p_submission: { event_id: '00000000-0000-0000-0000-000000000000', vendor: {…minimal…} } })`
   returns `error.code === 'P0002'`. The event gate is the RPC's first step
   (`specs/006-close-public-data-exposure/contracts/submit-public-application.md:75`),
   so a nil event id proves the function exists and validates before any write. A `404`,
   `42883` (function missing) or `42501` (execute revoked) fails the check.
5. `rpc('create_event_with_default_questionnaire')` and `rpc('ensure_event_questionnaire')`
   return `42501` for anon.

**Rationale**: The 006 probe is the check most worth never forgetting; automating it
retires the manual curl block. Check 3 is the questionnaire invariant the builder is
supposed to guarantee and the one an organizer would hit first on event day. Check 4
is the only safe way to prove the write path exists without writing. The script is
read-only by construction: it never calls the RPC with a real event id.

**Alternatives considered**: a Vitest project pointed at prod (rejected: the security
harness seeds and deletes fixtures — never against prod); a Next.js route (rejected: a
health endpoint on the public app reveals posture details; the script runs from the
maintainer's shell only); `tsx` + TypeScript (rejected: `tsx` is not installed, which is
why `verify-db.ts` never ran).

**Implementer note**: confirm during T011 that the RPC's vendor payload validation does
not precede the event gate for the minimal vendor object — if it does, send a valid
minimal vendor so `P0002` is still the first failure.

## R7. Backup contents and the restore drill

**Decision**: `docs/runbooks/backup-restore.md` uses the linked-project CLI flow:
`npx supabase link --project-ref <ref>`, `read -s SUPABASE_DB_PASSWORD; export
SUPABASE_DB_PASSWORD` (never in a file), `npx supabase db dump --linked -f
backup/<project>/<date>/schema.sql`, `npx supabase db dump --linked --data-only --use-copy
-f backup/<project>/<date>/data.sql`, and `npx supabase storage cp -r ss:///attachments
backup/<project>/<date>/attachments --linked` for the bucket. `backup/` is added to
`.gitignore` by T009 (it is not ignored today). The default drill restores a **dev** dump
into the **local stack**: `npx supabase db reset` → `psql
postgresql://postgres:postgres@127.0.0.1:54322/postgres -f data.sql` → compare row counts
per table with the source → open the app against local and download one attachment via
its signed URL. Prod dumps are never restored into dev. After the drill, relink the CLI
to dev.

**Rationale**: The free tier has no automatic backups and `pg_dump` does not cover
Storage objects, so the runbook must do both. Restoring into the local stack keeps the
drill harmless and repeatable. The dev-only rule keeps prod PII off the test project.

**Empirical checks for T009/T010** (run `--dry-run` first; it prints the `pg_dump`
command without connecting for data):
- Whether `--data-only` includes the `auth` and `storage` schemas by default on CLI
  2.65.6. `user_profiles.id` references `auth.users`, so a data restore without `auth`
  rows fails on the FK; if excluded, add `--schema auth,storage,public` (or restore
  `public` with the FK deferred) and record which schemas were dumped in the evidence row.
- The `ss:///attachments` URI form and whether `storage cp` needs `--experimental` on
  2.65.6 (the flag is global; `supabase storage --help` lists `cp` without it).
- Known gotcha after `db reset`: if auth health returns 502,
  `docker restart supabase_kong_Holigay`.

**Alternatives considered**: `pg_dump` directly against the pooler (rejected: the CLI
wraps the right flags and excludes Supabase-managed schemas); Supabase's paid PITR
(out of M3).

## R8. Auth mail and URLs on the hosted projects

**Decision**: Manual tasks T013a (URLs, mailer baseline) and T013b (custom SMTP), per project (dev, prod): in Authentication → Emails /
SMTP Settings, confirm the built-in mailer's restriction wording (team members only,
rate-limited), enable Custom SMTP with Resend (`smtp.resend.com`, port 465, username
`resend`, password = the Resend API key, sender = an address on the verified domain);
in Authentication → URL Configuration set Site URL and Redirect URLs to the Vercel
preview (dev) / production (prod) origins; record the "Confirm email" toggle state.
Nothing in the repo changes — `supabase/config.toml` governs the local stack only
(`enable_confirmations = false`, SMTP block commented out at `:196-216`).

**Rationale**: Vendor sign-up on prod (spec US5 scenario 4) and the rehearsal's step 9
depend on confirmation mail actually reaching a real mailbox; the built-in mailer cannot.
Resend's SMTP gateway means one provider, one API key, one verified domain.

**Alternatives considered**: create every vendor from the dashboard (rejected: only
viable for organizers); disable email confirmation on hosted projects (rejected: the
default posture should match what launch needs; recorded as a state, not changed).

**Note**: T013b needs T002's verified domain for the sender; organizer accounts (T014/T015)
do not, because dashboard Add User auto-confirms.

## R9. Organizer accounts

**Decision**: Dashboard → Authentication → Users → Add user (auto-confirm), then run
`scripts/seed-role.sql` (generalized from `seed-admin.sql`, which hard-codes `'admin'`)
with the email and `'organizer'` in the SQL Editor; sign in once to confirm the
dashboard route. Dev first (T014, before the rehearsal), prod later (T015).

**Rationale**: Two organizers do not justify finishing the Epic 4 invite backend; the
`handle_new_user` trigger already creates the profile, so the seed is one `UPDATE`.

## R10. Rehearsal artifact

**Decision**: T016 writes `specs/007-production-readiness/rehearsal/<date>-solo-lifecycle.md`
as a template: an environment header (preview URL, `dev` commit, sender in use —
verified domain or fallback), the eleven steps as a table `step · expected · observed ·
pass/fail`, and a findings table `id · step · severity (blocker / tier3 / backlog) ·
decision · fix PR`, pre-seeded with the three expected findings (CSV export lacks
questionnaire answers; unsaved organizer notes are not in the status email; closed
events cannot be reopened). T017 fills it in and commits it. T018 holds the fixes.

**Rationale**: The spec's US4 acceptance scenarios *are* the eleven steps; keeping the
expected column written before the run is what makes the rehearsal a test rather than a
demo. Committing the file is the M3 exit evidence.

**Alternatives considered**: a `docs/uat/` location (rejected: the organizer UAT is M4;
the solo rehearsal belongs to this spec).

## R11. Setup-doc currency

**Decision**: In `docs/DEV-ENVIRONMENT-SETUP.md` replace `develop` with `dev` throughout
(the table at `:9`, the Part 7 rename section at `:130-151`, the Part 8 result at `:175`,
the Part 10 workflow at `:188-195`), retitle Part 7 to describe the current state, and
extend the Part 8 Vercel table with `EMAIL_FROM_ADDRESS` (Preview + Production) and
`CRON_SECRET` / `KEEPALIVE_SUPABASE_TARGETS` (Production only). `.env.example` gains the
three new variables with comments; `CLAUDE.md`'s env section links the contract.

**Rationale**: CI and reality use `dev`; the document is the one a future maintainer
would follow. The constitution requires new variables to be documented in the PR that
introduces them, so these edits ride T004 (`EMAIL_FROM_ADDRESS`) and T007 (`CRON_*`).

## R12. What stays out, and why

| Rejected for M3 | Reason |
|---|---|
| Sending email via `after()` / a queue | Adds a runtime pattern; the warning-parity fix makes failures visible, which is the M3 need |
| A service-role client in the request path | Spec 006 deliberately kept anon-only; nothing in M3 needs it |
| Error monitoring (Sentry) or structured logging | Out by decision; the cron log and the smoke script are the monitoring for a barely-used app |
| Paid Supabase or Vercel tiers | Out by decision; keep-alive and dump/restore replace what they would buy |
| Browser-automation tests of the lifecycle | The solo rehearsal is the end-to-end proof; automation is a later investment |
| Retiring the legacy form | Tier 4 |
| Any builder extension the rehearsal suggests | Goes through the roadmap scope-line table |
