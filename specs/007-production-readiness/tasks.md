# Tasks: Production Readiness (Milestone M3)

**Input**: Design documents from `/specs/007-production-readiness/`
**Prerequisites**: plan.md, spec.md, research.md (R1–R12), contracts/env-contract.md, contracts/keepalive-route.md, quickstart.md (the ops record). No data-model.md — the spec's entities are ops artifacts, none persisted.

**Tests**: Included — plan.md's constitution check (Principle II) requires test-first for the env schema, the keep-alive route and the changed server action. Scripts and runbooks are verified by running them.

**Organization**: Task IDs T001–T022 are fixed: `quickstart.md`'s evidence rows, `plan.md`, `research.md` and `docs/M3-PLAN.md` already cite them. Phases follow spec priority except that US5 (accounts) precedes US4 (rehearsal), because rehearsal step 9 needs an organizer account and the auth redirect URLs set (T013a, T014). `[manual]` tasks are dashboard or terminal work done by the maintainer; each ends with an **evidence:** clause and is ticked only when the matching row in `quickstart.md` is filled (spec 005 T062 / spec 006 T004 precedent). Each repo task is one branch off `dev` and one PR, commits tagged `[007-Txx]`, gated by `npm run lint && npm test && npm run build` with the local stack up (`docker restart supabase_kong_Holigay` if auth health returns 502 after a reset). No Claude co-authoring trailers on commits or PRs. **Re-sequenced 2026-09-16**: the maintainer has no
Resend or DNS access for now, so the four tasks that genuinely need it (T002, T003, T013b, T006 —
tagged `[needs-resend]`) moved from the front of the list to Phase 8, and the promotion that
depends on them (T020) and the production proof that depends on that (T021, and T008's scheduled
run) follow in Phase 9. Task IDs are unchanged; only the order is. T013 split into T013a (auth URLs
and mailer baseline — dashboard only) and T013b (custom SMTP — needs the verified sender), and
T008a was added as an interim keep-alive so the pause risk is covered while the promotion waits.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependency on an incomplete task)
- **[Story]**: US1–US5 from spec.md
- **[manual]**: Dashboard/terminal work; evidence recorded in quickstart.md before ticking

## Phase 1: Setup

**Purpose**: Finish the spec scaffold so the task list is the source of truth.

- [X] T001 Finish the spec scaffold: add the row `| 007 | Production readiness (M3) | 🚧 In progress | — | — |` to the Status table in specs/README.md; commit this tasks.md; open the docs-only PR from `007-production-readiness` to `dev` (spec.md, plan.md, research.md, contracts/, quickstart.md are already on the branch) and put its link in the README row — PR [#9](https://github.com/Owen-Rose/Holigay-YYC/pull/9)

---

## Phase 2: User Story 1 (repo half) — the environment contract and the missing warning (Priority: P1) 🎯 MVP

**Purpose**: Everything in US1 that does not need the sending domain. One validated environment
contract with production-only strictness, and the dynamic form warning the applicant when the
confirmation email fails, matching the legacy form and the status-update flow. The delivery proof
(T006) waits in Phase 8.

**Independent Test**: `npm test` passes the new env and warning cases; a local
`VERCEL_ENV=production npm run build` with `EMAIL_FROM_ADDRESS` unset fails with one message naming
every missing variable while a plain `npm run build` succeeds.

- [ ] T004 [US1] Environment contract, test-first. Write src/test/env.test.ts (each case: `vi.resetModules()`, `vi.stubEnv(...)`, then `await import('@/lib/env-public')` / `import('@/lib/env')`): public module throws one `Invalid environment: NEXT_PUBLIC_SUPABASE_URL (…); NEXT_PUBLIC_SUPABASE_ANON_KEY (…)` error when both are missing and exports `{ supabaseUrl, supabaseAnonKey }` when set; server module with `VERCEL_ENV=production` and `RESEND_API_KEY`/`EMAIL_FROM_ADDRESS` unset throws one error naming both (message format in contracts/env-contract.md "Failure behaviour"); production with `EMAIL_FROM_ADDRESS` containing `resend.dev` throws `must not use the resend.dev test sender in production`; production accepts `Name <a@b.co>` and `a@b.co`, rejects a bare `Name`; `VERCEL_ENV` unset or `preview` with nothing set parses with `emailFromAddress`/`resendApiKey` undefined and `isProduction` false; `CRON_SECRET` shorter than 16 chars or unset → `cronSecret` null; `KEEPALIVE_SUPABASE_TARGETS` `url|key,url|key` → `[{url, anonKey}, …]`, malformed or unset → `keepaliveTargets` null (never throws — the app must deploy without the keep-alive configured); `VERCEL_ENV=bogus` throws; `typeof window !== 'undefined'` guard throws. Then create src/lib/env-public.ts (literal `process.env.NEXT_PUBLIC_SUPABASE_URL` / `process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY` reads, zod `safeParse`, aggregated `Error`, exports `supabaseUrl`, `supabaseAnonKey`) and src/lib/env.ts (window guard first; zod schema with `superRefine` for the production-only rules; exports `isProduction`, `resendApiKey`, `emailFromAddress`, `cronSecret`, `keepaliveTargets`). Replace the `process.env…!` reads in src/lib/supabase/client.ts:6-7, src/lib/supabase/server.ts:9-10, src/lib/supabase/middleware.ts:10-11 and src/middleware.ts:19-20 with imports from `@/lib/env-public`. In src/lib/email/client.ts import `resendApiKey`/`emailFromAddress` from `@/lib/env`, keep the `onboarding@resend.dev` fallback and the log-instead-of-send behaviour for non-production, delete the `NODE_ENV === 'production'` throw at :35 (the env module now enforces it at build/import time), and point `isEmailConfigured` (:214) at `resendApiKey`; rework src/test/email-client.test.ts accordingly (stub `VERCEL_ENV`, `vi.resetModules()` + dynamic import; drop the NODE_ENV guard case). Docs in the same PR: add `EMAIL_FROM_ADDRESS` guidance and the `VERCEL_ENV` rule to .env.example and CLAUDE.md "Environment Variables" (link contracts/env-contract.md); in docs/DEV-ENVIRONMENT-SETUP.md replace `develop` with `dev` at :9, :130-151 (retitle Part 7 to describe the current `dev` branch), :175, :188-203, :216 and add `EMAIL_FROM_ADDRESS` (Preview + Production) to the Part 8 table — R1, R2, R3, R11, FR-002, FR-003, FR-005
- [ ] T005 [P] [US1] Email-warning parity, test-first. In src/test/answers-actions.test.ts add cases where the mocked `sendEmail` resolves `{ success: false, messageId: null, error: 'boom' }` and where it rejects: both return `success: true` with `data.applicationId` set and `warning` equal to `'Application submitted, but the confirmation email could not be sent.'` (the constant at src/lib/actions/applications.ts:200 — hoist it to a shared export or duplicate verbatim). Then in src/lib/actions/answers.ts add `warning?: string` to `SubmitDynamicApplicationResponse`, capture `const emailResult = await sendEmail(...)` at :235, set the warning on `!emailResult.success` or on throw, and return it. In src/app/(public)/apply/_components/dynamic-application-form.tsx after the `!result.success` branch at :161 add `if (result.warning) toast.warning(result.warning)` (mirrors src/app/(public)/apply/client.tsx:76-78 and src/app/dashboard/applications/[id]/status-buttons.tsx:70-72); add a case to src/test/dynamic-application-form.test.tsx asserting the mocked `toast.warning` is called with the warning and the success state still renders — FR-004

**Checkpoint**: Preview builds without the sender; a `VERCEL_ENV=production` build refuses the test sender; the dynamic form surfaces email failures.

---

## Phase 3: User Story 2 — The hosted projects never pause and their data can be restored (Priority: P1)

**Goal**: A daily scheduled read of both Supabase projects that fails red, and a practised backup/restore routine covering schema, data and the attachments bucket.

**Independent Test**: The keep-alive route passes its seven-case test matrix and answers `200`/`401`/`500` by hand via curl; the interim GitHub Actions run is green and dev is still active a week later; one dev dump restores into the local stack with matching row counts and a working signed-URL download.

- [ ] T007 [P] [US2] Keep-alive route, test-first. Write src/test/keepalive-route.test.ts covering every row of the "Test matrix" in contracts/keepalive-route.md (stub `globalThis.fetch` with `vi.fn()`; `vi.stubEnv('CRON_SECRET', …)` / `vi.stubEnv('KEEPALIVE_SUPABASE_TARGETS', …)`; `vi.resetModules()` + `await import('@/app/api/keepalive/route')`; call `GET(new Request('http://localhost/api/keepalive', { headers }))`; assert the response body text never contains an anon key). Then create src/app/api/keepalive/route.ts: `export const dynamic = 'force-dynamic'`; `GET` only; read `cronSecret` and `keepaliveTargets` from `@/lib/env`; bearer check first — no secret configured or mismatch → `401 { ok: false, error: 'unauthorized' }` before any fetch; `keepaliveTargets` null → `500 { ok: false, error: 'misconfigured' }`; otherwise `Promise.all` over targets of `fetch(`${url}/rest/v1/events?select=id&limit=1`, { headers: { apikey, Authorization: `Bearer ${anonKey}` }, signal: AbortSignal.timeout(8000) })` producing `{ url, ok, status, ms, error? }` (status `0` + error text on throw); `200` when every target is ok, else `500`; body `{ ok, checkedAt, targets }`. The Response table in contracts/keepalive-route.md was corrected under T001 (only "targets unset/unparseable" maps to `500 misconfigured`; a missing secret is `401`, per its Inputs table) — implement against it as written. Add vercel.json `{ "crons": [{ "path": "/api/keepalive", "schedule": "0 12 * * *" }] }`. Document `CRON_SECRET` and `KEEPALIVE_SUPABASE_TARGETS` (Production only, never in `.env.local`) in .env.example (commented), CLAUDE.md "Environment Variables" and the docs/DEV-ENVIRONMENT-SETUP.md Part 8 table. Verify by hand with the quickstart.md "Keep-alive route by hand" block against the local stack — R4, FR-006
- [ ] T008a [P] [US2] Interim keep-alive, because the Vercel cron cannot run until the promotion (T020) clears the email track: add .github/workflows/keepalive.yml — `on: schedule: - cron: '0 12 * * *'` plus `workflow_dispatch`, one job that curls `${{ secrets.KEEPALIVE_DEV_URL }}/rest/v1/events?select=id&limit=1` and the prod equivalent with `apikey` and `Authorization: Bearer` headers from the matching anon-key secrets, `curl --fail-with-body -sS` so a non-2xx fails the job. Set the four repo secrets under Settings → Secrets and variables → Actions (`KEEPALIVE_DEV_URL`, `KEEPALIVE_DEV_ANON_KEY`, `KEEPALIVE_PROD_URL`, `KEEPALIVE_PROD_ANON_KEY`). Needs no Vercel Production deploy and no Resend, so it runs from day one. Verify with one `workflow_dispatch` run. Removed by T008 once the real cron is green. evidence: the two T008a rows in quickstart.md — R4, FR-006
- [ ] T009 [P] [US2] Backup/restore runbook: create docs/runbooks/backup-restore.md per research.md R7 — `npx supabase link --project-ref <ref>`; `read -s SUPABASE_DB_PASSWORD && export SUPABASE_DB_PASSWORD` (never written to a file); `npx supabase db dump --linked -f backup/<project>/<date>/schema.sql`; `npx supabase db dump --linked --data-only --use-copy -f backup/<project>/<date>/data.sql`; `npx supabase storage cp -r ss:///attachments backup/<project>/<date>/attachments --linked`; restore drill into the local stack (`npx supabase db reset`, `psql postgresql://postgres:postgres@127.0.0.1:54322/postgres -f data.sql`, a row-count SQL block over every `public` table to compare source vs restored, open the app against local and download one attachment via its signed link); `docker restart supabase_kong_Holigay` gotcha; end with relinking to dev; a bold rule that production dumps are never restored into dev. Run the R7 empirical checks first with `--dry-run` and record in the runbook which schemas `--data-only` includes on CLI 2.65.6 (add `--schema auth,storage,public` if `auth` is excluded, because `user_profiles.id` references `auth.users`) and the exact `storage cp` syntax. Add `backup/` to .gitignore — FR-007
- [ ] T010 [manual] [US2] Restore drill: follow docs/runbooks/backup-restore.md against the **dev** project — take the three-part backup, restore the data dump into the local stack, compare row counts per table, download one attachment through the local app's signed URL, relink the CLI to dev. Needs T009. evidence: the three T010 rows in quickstart.md (schemas dumped and file counts; row counts source vs restored plus the download result; relink confirmed) — FR-008, SC-003

**Checkpoint**: Interim keep-alive green; restore drill recorded. T008 (the real Vercel cron) waits for the promotion in Phase 9.

---

## Phase 4: User Story 3 — The maintainer can prove production healthy in ten minutes on event day (Priority: P2)

**Goal**: `npm run smoke` automates the spec 006 probe plus three invariants, an event-week runbook covers the click-through and cleanup, and the two obsolete scripts are replaced.

**Independent Test**: `npm run smoke` against the local stack prints `PASS` for every check and exits 0; pointing it at a broken condition (wrong `SMOKE_APP_URL`, or an active event with no questions) exits 1 naming the failed check; the runbook click-through and cleanup run on dev.

- [ ] T011 [P] [US3] Smoke check, event-week runbook and script cleanup: create scripts/smoke-check.mjs (plain ESM, Node ≥ 20, `import { createClient } from '@supabase/supabase-js'`; reads `SMOKE_APP_URL`, `SMOKE_SUPABASE_URL`, `SMOKE_SUPABASE_ANON_KEY` from the shell and exits 2 with usage if any is missing; runs the five checks of research.md R6 — (1) `GET /` and `/apply` return 200; (2) anon `select` on `vendors`, `applications`, `attachments`, `application_answers` each returns `[]`; (3) every `events` row with `status = 'active'` has an `event_questionnaires` row and ≥ 1 `event_questions` row; (4) `rpc('submit_public_application', { p_submission: { event_id: '00000000-0000-0000-0000-000000000000', vendor: { business_name: 'smoke', contact_name: 'smoke', email: 'smoke@example.invalid' } } })` returns `error.code === 'P0002'` — confirm on the local stack that the event gate fires before vendor validation, else adjust the minimal vendor so `P0002` stays the first failure; (5) `rpc('create_event_with_default_questionnaire', { p_event: {} })` and `rpc('ensure_event_questionnaire', { p_event_id: '00000000-0000-0000-0000-000000000000' })` both return `42501`; each check prints `PASS <name>` or `FAIL <name>: <reason>`, 10 s timeout per request, `process.exit(1)` if any failed). Add `"smoke": "node scripts/smoke-check.mjs"` to package.json scripts. Create docs/runbooks/event-week-smoke.md: run `npm run smoke` with production values; the ten-minute click-through (a test event with a questionnaire; submit via the dynamic form with a PDF; confirm the email arrives from the verified domain; open the application on `/dashboard/applications/[id]` and download the attachment via its signed link; change status and confirm the status email); cleanup SQL that deletes the test `application_answers`, `attachments` rows and storage objects, the `applications` row, the test `vendors` row and the test event (the UI refuses to delete an event with applications); a pointer to the `SMOKE_*` shell variables (document them commented in .env.example as "shell only"). `git rm scripts/verify-db.ts`; `git mv scripts/seed-admin.sql scripts/seed-role.sql` with `<email>` and `<role>` placeholders (`vendor | organizer | admin`) and an updated usage comment; in CLAUDE.md update "Admin Bootstrap" (:258) to name `scripts/seed-role.sql` and add a Runbooks pointer to `docs/runbooks/`. Verify: `npm run smoke` against the local stack exits 0; against a deliberately broken condition exits 1 — R6, FR-009, FR-010, FR-011
- [ ] T012 [manual] [US3] Prod probe by hand: run the "Prod probe checklist" curl block in quickstart.md against the prod URL with the prod anon key (or `npm run smoke` with prod values once T011 lands — either satisfies it); Supabase prod Dashboard → Storage → Policies: confirm exactly `attachments_anon_insert`, `attachments_authenticated_select`, `attachments_authenticated_delete` and no dashboard-named leftovers; tick the "manual probe checklist" and "Storage → Policies visual confirmation" boxes under "Still owed on prod" in specs/006-close-public-data-exposure/quickstart.md. evidence: the two T012 rows in quickstart.md — FR-018

**Checkpoint**: `npm run smoke` is the event-day check; two of the four spec 006 residuals are closed.

---

## Phase 5: User Story 5 (dashboard half) — Organizers exist on both projects and can sign in (Priority: P3)

**Goal**: The real organizer accounts exist with the organizer role on both projects, and the auth redirect addresses match the deployments. Accounts are created with dashboard Add User and auto-confirm, so none of this needs working auth mail — custom SMTP (T013b) is the only part that does, and it sits in Phase 8. Sequenced before US4 because rehearsal step 9 needs T013a and T014.

**Independent Test**: Each organizer signs in on each project and lands on `/dashboard`.

- [ ] T013a [manual] [US5] Supabase auth URLs and mailer baseline, dev then prod: Authentication → URL Configuration — Site URL and Redirect URLs = the Vercel preview origin for dev (`dev` branch preview host plus `/**`) and the production origin for prod; Authentication → Emails — record the built-in mailer's restriction wording and the state of the "Confirm email" toggle without changing either. Dashboard access only; no Resend. Nothing in the repo changes (supabase/config.toml governs local only). evidence: the three T013a rows in quickstart.md — R8, FR-015
- [ ] T014 [manual] [US5] Organizer accounts on dev: Authentication → Users → Add user (email + password, auto-confirm) for each real organizer and for the maintainer's rehearsal organizer account; SQL Editor → scripts/seed-role.sql with `<email>` and `organizer` (or the same `UPDATE user_profiles SET role = 'organizer' …` inline if T011 has not merged); sign in on the dev preview and confirm the landing is `/dashboard`, not `/vendor-dashboard`. evidence: the T014 row in quickstart.md — R9, FR-016
- [ ] T015 [manual] [US5] Same as T014 on the prod project, signing in on the production deployment. evidence: the T015 row in quickstart.md — FR-016

**Checkpoint**: Organizer sign-in works on both projects.

---

## Phase 6: User Story 4 — The full event lifecycle works end to end on a preview with no one intervening (Priority: P2) — M3 gate

**Goal**: A committed rehearsal record: eleven lifecycle steps with expected results written before the run and observed results written during it, every deviation triaged, every blocker fixed before promotion.

**Independent Test**: Run the script on the dev preview playing both roles; every expected result observed; emails observed on the fallback sender (`onboarding@resend.dev` delivers to the Resend account owner's address, so the maintainer's own mailbox keeps steps 3 and 7 visible); no browser console errors on the pages used; the findings log committed with a severity on each deviation.

- [ ] T016 [P] [US4] Rehearsal script template: create specs/007-production-readiness/rehearsal/<planned run date>-solo-lifecycle.md with an environment header (preview URL, `dev` commit SHA, sender in use — verified domain or fallback, organizer account, vendor mailbox), an eleven-row table `step · action · expected · observed · pass/fail` whose action and expected columns transcribe spec.md US4 acceptance scenarios 1–11 (observed left blank), a per-step "console errors: none / list" column, and a findings table `id · step · severity (blocker / tier3 / backlog) · description · decision · fix PR` pre-seeded with F-001 CSV export lacks questionnaire answers (step 5), F-002 unsaved organizer notes are not in the status email (step 7, M4 organizer judgement), F-003 closed events cannot be reopened (step 10, backlog); severity definitions from spec FR-012. Docs-only PR — R10, FR-012
- [ ] T017 [manual] [US4] Solo rehearsal on the dev preview: with T004, T005 and T007 merged to `dev` and deployed to the preview, T013a and T014 done, and the dev project awake, run every step of the T016 script playing organizer and vendor (the maintainer's own mailbox as the vendor email); fill the observed and pass/fail columns during the run; log every deviation in the findings table with a severity; mark steps 3 and 7 "passed on fallback sender" — expected, since T002 sits in Phase 8 — and re-run those two steps once the domain verifies; commit the filled file as `[007-T017]`. Zero interventions outside the script and zero console errors are pass conditions. evidence: the committed rehearsal file (quickstart.md "Solo rehearsal" section) — FR-013, SC-005
- [ ] T018 [US4] Fixes from the rehearsal: one branch and PR per blocker or Tier 3 finding, each with a test per the constitution, tagged `[007-T018]`, its PR number recorded in the finding's `fix PR` column; a finding that needs a schema, RLS or auth change is not fixed here — open `specs/008-<slug>/` and mark the finding "→ spec 008"; re-run the affected rehearsal steps on the preview and update the observed column. Exit condition: zero open blocker findings — FR-014

**Checkpoint**: The M3 gate — rehearsal file committed with no open blockers. Steps 3 and 7 carry "passed on fallback sender" until Phase 8 lets them be re-run.

---

## Phase 7: Credentials

**Purpose**: Rotate the database passwords while the CLI work from T010 is fresh. Needs no Resend.

- [ ] T019 [manual] Rotate the database password on both hosted projects (Supabase Dashboard → Settings → Database → Reset database password), confirm no local password files remain from the 2026-09 rollouts, and `npx supabase link --project-ref kcokcufmzyckbodelqpb` (dev). Do this after T010 (which links to dev) and before T021. evidence: the three T019 rows in quickstart.md — FR-017

---

## Phase 8: Email track — needs Resend and DNS access 🚧

**Purpose**: The only four tasks that genuinely cannot start without an account on the mail provider and someone who can edit the domain's DNS. Everything above is done without them; everything in Phase 9 waits on them.

**Independent Test**: A test email from `/api/test-email` arrives from the verified domain; a throwaway vendor sign-up on the preview gets its confirmation from the same sender.

- [ ] T002 [manual] [needs-resend] Resend → Domains → Add Domain for the organization's sending domain; copy the DKIM/SPF (and return-path) records; hand them to the DNS owner; poll Resend until the domain shows **Verified**. Start it the day access exists. evidence: the two T002 rows in quickstart.md "Email (US1)" — date the records were handed off, date Verified
- [ ] T003 [manual] [needs-resend] Vercel → Project → Settings → Environment Variables: set `EMAIL_FROM_ADDRESS` (`<Display name> <noreply@<verified domain>>`) and `RESEND_API_KEY` on **both** Preview and Production (the key can be set before T002 verifies; the address must be on the verified domain to deliver). After T004 merges, the next `dev → main` promotion fails without these (contracts/env-contract.md "Ordering rule"). evidence: the two T003 rows in quickstart.md
- [ ] T013b [manual] [needs-resend] [US5] Custom SMTP on both projects: Authentication → SMTP Settings — enable Custom SMTP (host `smtp.resend.com`, port 465, username `resend`, password = the Resend API key, sender name/address on the verified domain), dev then prod. Needs T002. Then sign up one throwaway vendor on the dev preview and confirm the confirmation mail arrives from the verified domain and its link returns to the preview (the US5 independent test). evidence: the two T013b rows in quickstart.md — R8, FR-015
- [ ] T006 [manual] [needs-resend] [US1] Verify delivery from the verified domain: with `RESEND_API_KEY` and `EMAIL_FROM_ADDRESS` (verified-domain address) in `.env.local`, `npm run dev`, then `GET http://localhost:3000/api/test-email?to=<maintainer mailbox>` (route at src/app/api/test-email/route.ts) for each template it offers; confirm each arrives from the verified domain with the expected from-name and is not in spam. Needs T002, T003. evidence: the T006 row in quickstart.md

**Checkpoint**: Production email is no longer silently broken, and the Production build will now pass the env guard.

---

## Phase 9: Close-out — promotion and production proof

**Purpose**: Promote, start the real cron, prove production, and tick the records. Every task here inherits Phase 8's dependency: the env guard fails the Production build without the sender variables.

- [ ] T020 Promote `dev → main` — the first task that cannot proceed without Resend access: confirm T003's variables exist on Vercel Production (the env guard fails the build otherwise) and T018 left no open blockers; `git checkout main && git merge --ff-only dev && git push origin main` (matches the 2026-09-13/14 promotions); confirm the Vercel Production build is green, the production `/apply` loads, and `/api/keepalive` answers `401` without the secret and `200` with it. evidence: the T020 row in quickstart.md (merge commit; build green)
- [ ] T008 [manual] [US2] Vercel Production → Environment Variables: `CRON_SECRET` (e.g. `openssl rand -hex 32`) and `KEEPALIVE_SUPABASE_TARGETS` = `https://kcokcufmzyckbodelqpb.supabase.co|<dev anon key>,https://hgmfjvjlxrhdojwlkgap.supabase.co|<prod anon key>` (both projects listed explicitly). Crons run only on Production, so this cannot happen before T020 — T008a covers the gap until then (research.md R4 implementer note). Observe the first scheduled run in Vercel → Project → Cron Jobs / Logs; seven days later confirm the dev project is still Active and the preview `/apply` loads. Needs T007 on Production (so: after T020). When the first cron run is green, delete .github/workflows/keepalive.yml and its four repo secrets from T008a. evidence: the three T008 rows in quickstart.md
- [ ] T021 [manual] Prod smoke run: `SMOKE_APP_URL=<production host> SMOKE_SUPABASE_URL=https://hgmfjvjlxrhdojwlkgap.supabase.co SMOKE_SUPABASE_ANON_KEY=<prod anon> npm run smoke` → exit 0; then the docs/runbooks/event-week-smoke.md click-through on production — one live submission per reachable form variant (dynamic; legacy if a legacy event exists) against a test event, the "application received" and status-update emails observed from the verified domain (SC-001), dashboard review with a signed-URL download, cleanup SQL run; time the whole check (SC-004 ≤ 10 min); tick the remaining "Still owed on prod" boxes (live submission per variant; password rotation from T019) in specs/006-close-public-data-exposure/quickstart.md. Needs T020. evidence: the three T021 rows in quickstart.md — FR-018, SC-001, SC-004
- [ ] T022 Docs close-out: tick every M3 checklist box in docs/ROADMAP.md with the PR number or date beside it (preview access is decided: public-by-link, test data only on dev); set the 007 row in specs/README.md to ✅ Shipped with its PRs and date and add a short post-merge note; update the "Current Development Phase" paragraph and "Recent Changes" in CLAUDE.md; note the M4 entry gate (organizer session) in docs/ROADMAP.md; confirm `git diff main dev` is empty — SC-006

---

## Dependencies & Execution Order

### Critical path

**Without Resend access** (the current situation): T004 → T007 → T017 → T018. That is as far as M3 can be taken; everything through Phase 7 is reachable.

**Once Resend access exists**: T002 → T003 → T020 → T021. T002 is external (DNS propagation), so start it the day access appears.

### Phase and task dependencies

- **T001**: none (docs PR; this file). Done — PR #9.
- **T004**: no Vercel prerequisite (previews are lenient). Must merge before T005 and T007 touch `src/lib/email/client.ts` / `@/lib/env` — T005 only if it hoists the warning constant; T007 imports `@/lib/env`.
- **T005**: independent of T004 unless sharing the warning constant; different files otherwise.
- **T007**: needs T004 merged (imports `@/lib/env`).
- **T008a**: independent of everything — no Vercel deploy, no Resend. Do it early; T008 removes it.
- **T009**: independent. T010 needs T009 and an awake dev project.
- **T011**: independent. T012 can run before or after it. T014 prefers T011's `seed-role.sql` but can inline the SQL.
- **T013a**, **T014**, **T015**: dashboard access only.
- **T016**: independent. T017 needs T004, T005, T007 (on the preview), T013a, T014, T016. T018 needs T017.
- **T019**: after T010 (which links the CLI to dev), before T021.
- **T002**: external (DNS owner). Gates T003 (address), T013b, T006, the re-run of T017 steps 3 and 7, and T021's email check.
- **T003**: after T002 verifies (the key can be set as soon as there is a Resend account). Gates T020 — the env guard fails the Production build without it.
- **T020**: needs T003 and zero open blocker findings from T018. **T008** needs T007 on Production, so it needs T020. T021 needs T020 and T011. T022 last.

### Parallel opportunities

- T004 first, then T005 ∥ T007 ∥ T009 ∥ T011 ∥ T016 ∥ T008a — six independent repo tasks, six branches off `dev`.
- Manual filler alongside them: T012 (prod probe), T013a, T014/T015 (accounts), T010 once T009 lands.
- Session mapping from docs/M3-PLAN.md, re-sequenced: S1 = T001 + T004; S2 = T005 + T007 + T008a; S3 = T011 + T009 + drive T010 (T012, T013a, T014, T015 in between); S4 = T016 + drive T017; S5 = T018 + T019. Phases 8 and 9 become S6 whenever access arrives.

---

## Parallel Example: after T004 merges

```bash
# Five independent repo tasks, five branches off dev, five PRs:
Task: "T005 email-warning parity in src/lib/actions/answers.ts + dynamic-application-form.tsx"
Task: "T007 keep-alive route in src/app/api/keepalive/route.ts + vercel.json"
Task: "T008a interim keep-alive in .github/workflows/keepalive.yml"
Task: "T009 backup/restore runbook in docs/runbooks/backup-restore.md"
Task: "T011 smoke check in scripts/smoke-check.mjs + docs/runbooks/event-week-smoke.md"
Task: "T016 rehearsal template in specs/007-production-readiness/rehearsal/"
```

---

## Implementation Strategy

### What is reachable without Resend

Eighteen of the twenty-four tasks, including the M3 gate. In order: T004 (env contract, test-first)
→ T005 ∥ T007 ∥ T008a ∥ T009 ∥ T011 ∥ T016 → T010, T012, T013a, T014, T015 → T017 (the rehearsal, on
the fallback sender) → T018 (fixes) → T019. At that point M3 is complete except for its email proofs
and the promotion.

### What genuinely waits

T002, T003, T013b and T006 need the mail provider and the DNS records. T020 waits because T004's env
guard fails a Production build without the sender variables — that is the contract working as
designed (contracts/env-contract.md "Ordering rule"), not an accident to work around. T021 and T008's
scheduled run follow T020. SC-001 (all three email kinds delivered from the verified domain) and
SC-002's Vercel cron evidence cannot be claimed before then; SC-002's *no-pause* half is covered by
T008a in the meantime.

### The pause risk while the promotion waits

Vercel crons fire only on Production deploys, so `vercel.json`'s schedule is dormant until T020.
T008a (GitHub Actions, repo secrets, no Vercel and no Resend) keeps both projects awake from day
one and is deleted at T008.

### Incremental delivery

- US1 repo half (T004–T005) → no silent `resend.dev` on production, no silent failed send.
- US2 (T007–T010) → keep-alive proven by hand and scheduled on Actions, restore drill recorded.
- US3 (T011–T012) → `npm run smoke` replaces the manual probe.
- US5 dashboard half (T013a–T015) → organizers can sign in.
- US4 (T016–T018) → the M3 gate; blockers fixed.
- Email track (T002, T003, T013b, T006) → whenever access arrives.
- Close-out (T020, T008, T021, T022) → `main` = `dev`, prod smoke run, records ticked.

---

## Notes

- A `[manual]` task is never ticked before its `quickstart.md` evidence row is filled (FR-019, SC-007).
- `[needs-resend]` marks the four tasks that cannot start without a mail-provider account and DNS control. Nothing else in the list depends on them except T020 and what follows it.
- No schema, RLS or auth change and no new package under this spec (FR-020); a rehearsal finding that needs one opens spec 008.
- Anon keys only in the smoke script, the keep-alive route and T008a's repo secrets; the database password is entered interactively, never written to a file; prod data is never restored into dev.
- Real vendor data never goes on dev (previews are public-by-link).
