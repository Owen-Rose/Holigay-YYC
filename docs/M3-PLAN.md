# M3 — Production-ready: plan

Planning session 2026-09-13. No code, no spec opened. `docs/ROADMAP.md` "Milestones to production" is the authority; this file is the sequencing and division of labour for M3.

## Context

M1 (Safe) and M2 (Feature-complete) are done. Migrations 001–012 are on local, dev and prod. `main` = `75348b8` on Vercel Production; `dev` is one commit ahead (`5facc67`, events-list delete). M3 is the seven-item readiness checklist, an organizer UAT dry-run on a preview deploy, and the Tier 3 fixes the UAT surfaces. Also carried in: the four spec 006 prod residuals (probe checklist, live submission, storage-policy visual check, password rotation).

Decisions made this session (they shape everything below):

| Question | Answer |
|---|---|
| First real event date | None yet → readiness-paced, ordered by risk and dependency |
| Sending domain | Exists; the org controls DNS → a handoff step for the DNS records |
| Supabase plan | Stay free on both; keep-alive → repo work; backups become a dump/restore routine |
| UAT participants | Real organizers, Owen observing → accounts on dev, preview must be reachable |
| Vercel plan | Hobby → accept public-by-link previews (dev DB only); no password protection |
| Smoke test shape | Markdown runbook + a small read-only CLI check that exits non-zero |
| Sequence | Blockers → UAT → fixes, with prod hygiene in parallel |
| Keep-alive | Vercel cron route hitting a list of Supabase targets, guarded by `CRON_SECRET` |

## Facts from exploration that change the work

- Preview deploys build with `NODE_ENV=production`, so `/api/test-email` and `/api/preview-email` are 404 there. **The UAT is the only email test on a preview**, so the Resend domain must be done before UAT, not just before launch.
- `src/lib/actions/answers.ts:235` awaits `sendEmail` but ignores the result. A failed vendor-confirmation email on the dynamic form produces no `warning`, unlike `applications.ts:223` (legacy submit) and `:863` (status update). Must be fixed before UAT or the dry-run cannot distinguish "email works" from "email silently failed".
- `updateApplicationStatus` reads `organizer_notes` before updating and includes them in the status email (`applications.ts:859`). Unsaved notes are not sent. The UAT script exercises this deliberately.
- `exportApplicationsCSV` writes the 13 legacy columns only; no questionnaire answers. Expect organizers to flag it.
- Hosted Supabase's built-in auth mailer delivers only to project team members and is rate-limited. Organizer signup on the preview and vendor signup on prod likely need custom SMTP (Resend works as SMTP) or dashboard-created users. Not on the checklist; confirm in the dashboard.
- `docs/DEV-ENVIRONMENT-SETUP.md` Part 8's Vercel env table omits `EMAIL_FROM_ADDRESS`, so the `onboarding@resend.dev` fallback (`src/lib/email/client.ts:16`) ships to every environment today. The doc also says branch `develop`; CI and reality use `dev`.
- 20 `process.env` reads across 11 variables; 8 use `!` (the four Supabase client files). No `src/lib/env.ts`. No `vercel.json`, no scheduled workflow.
- `scripts/verify-db.ts` predates the questionnaire tables, needs `tsx` (not installed), and always exits 0. Replace, don't fix.
- Free tier has no automatic backups. A `pg_dump` does not cover Storage objects; the attachments bucket needs its own copy.

## Ordered sequence

Three tracks. Track A blocks the UAT. Track C never blocks it and runs in Owen's dashboard time whenever convenient. Track B is the UAT and what follows.

### Track A — unblock and de-risk the UAT (do first, in this order)

| # | Item | Who | Shape | Why here |
|---|---|---|---|---|
| A1 | Resend domain: add domain in Resend → hand DNS records to the org's DNS owner → verify → set `EMAIL_FROM_ADDRESS` and `RESEND_API_KEY` on Vercel **Production and Preview** | Owen (dashboard + handoff) | — | Longest lead time (DNS + another person). Start it day one. Blocks A2 build (prod guard) and the UAT. |
| A2 | Env validation module | Claude (repo) | branch + PR | Makes a missing/wrong `EMAIL_FROM_ADDRESS` fail the build instead of silently sending from resend.dev. Merge only after A1's Vercel vars are set, or preview builds fail. Roadmap item 4 + Tier 3. |
| A3 | Email-warning parity in `answers.ts` | Claude (repo) | branch + PR (small) | UAT must be able to see email failures. |
| A4 | Keep-alive cron route | Claude (repo) | branch + PR | Dev must not pause mid-UAT; prod must not pause before event week. Roadmap item 2. |
| A5 | Supabase Auth mail + URLs on **dev** and **prod**: confirm the built-in mailer restriction, configure SMTP via Resend, set Site URL / redirect URLs to the Vercel URLs, confirm the "Confirm email" setting | Owen (dashboard) | — | Organizer signup on the preview and vendor signup on prod depend on it. Needs A1's API key. |
| A6 | Organizer accounts on **dev** | Owen (dashboard + SQL) | — | Roadmap item 5, dev half. Dashboard "Add user" (auto-confirm) then the role UPDATE. |
| A7 | Preview access decision: accept public-by-link | Owen (decision, recorded in roadmap) | — | Roadmap item 6. Dev DB holds test data only; never put real vendor data on dev. |

### Track B — UAT and what it surfaces

| # | Item | Who | Shape |
|---|---|---|---|
| B1 | Write the UAT script and findings template (shape below) | Claude (repo, docs only) | branch + PR |
| B2 | Run the dry-run on the `dev` preview with the organizers; Owen observes and fills the findings log | Owen + organizers | — |
| B3 | Triage findings: blocker / Tier 3 / backlog (scope-line test) | Owen + Claude | — |
| B4 | Fix blockers and cheap Tier 3 items | Claude (repo) | branch + PR each; **spec only if one touches schema, RLS or auth** (decision table in roadmap) |
| B5 | Promote `dev` → `main` | Owen | — |

### Track C — prod hygiene (parallel, never blocks B)

| # | Item | Who | Shape |
|---|---|---|---|
| C1 | Smoke runbook + `scripts/smoke-check.mjs` (replaces `verify-db.ts`) + generalize `seed-admin.sql` to `seed-role.sql` | Claude (repo) | branch + PR |
| C2 | Backup/restore runbook, then execute one drill on dev; record the outcome in the runbook | Claude writes; Owen runs with Claude driving commands (password never in a file) | branch + PR (docs), drill by hand |
| C3 | Rotate the database password on **dev and prod** (Settings → Database). Nothing deployed uses it; only the CLI at push time | Owen (dashboard) | — |
| C4 | Storage → Policies visual check on prod: exactly the three `attachments_*` policies, nothing dashboard-named | Owen (dashboard) | — |
| C5 | Prod probe checklist (quickstart curl block) once by hand; afterwards C1's script covers it | Owen (terminal, anon key only) | — |
| C6 | Organizer accounts on **prod** (same as A6) | Owen (dashboard + SQL) | — |
| C7 | After B5: run the smoke runbook against prod for real. This **is** the 006 "one live submission per form variant" residual and roadmap item 7's first execution | Owen | — |

**Why this order.** A1 has the longest lead time and gates the only email test we get, so it starts first. A2–A4 are independent repo PRs that can land while DNS propagates. A5–A7 need A1's key and precede the UAT by a day. Track C items are hygiene: none changes what the UAT would find, so they fill Owen's dashboard time without holding the calendar. C7 is deliberately last because it exercises prod with the code that survived UAT.

## Spec vs branch decisions

Nothing in M3 opens a spec by default: no schema, RLS or auth changes, and each repo item is a contained single-session PR with clear acceptance. The one trigger is B4: a UAT finding that needs a migration or policy change becomes `specs/007-*`. Everything else is a branch + PR tagged `[M3]` in the commit message (the constitution wants a task reference; the roadmap checklist is the task source here). Each PR ticks its roadmap checkbox in the same change.

No Claude co-authoring trailers or "Generated with" lines on any commit or PR.

## Repo items in detail

### A2 — env validation module

- `src/lib/env-public.ts`: Zod-parses `NEXT_PUBLIC_SUPABASE_URL` (url) and `NEXT_PUBLIC_SUPABASE_ANON_KEY` (non-empty) from explicit `process.env.NEXT_PUBLIC_*` literals so Next inlines them. Importable from client, server and middleware.
- `src/lib/env.ts` (server-only): `RESEND_API_KEY` optional in dev, required when `NODE_ENV === 'production'`; `EMAIL_FROM_ADDRESS` required in production and refused if it contains `resend.dev`; `CRON_SECRET` and `KEEPALIVE_SUPABASE_TARGETS` (A4) optional. Parsed at import; a clear aggregated error naming the missing variables.
- Replace the eight `!` reads in `src/middleware.ts`, `src/lib/supabase/{client,server,middleware}.ts` and the `EMAIL_FROM_ADDRESS` / `RESEND_API_KEY` reads in `src/lib/email/client.ts`. The two API routes keep their `NODE_ENV` gate.
- Tests: schema unit tests (missing var, resend.dev in prod, dev leniency) following `src/test/auth-roles.test.ts` style.
- Docs in the same PR (constitution: new env vars documented with their introduction): `CLAUDE.md` env contract, `.env.example`, `docs/DEV-ENVIRONMENT-SETUP.md` Part 8 table (add `EMAIL_FROM_ADDRESS`, fix `develop` → `dev`).
- Sequencing gotcha: Vercel Preview and Production must have `EMAIL_FROM_ADDRESS` set **before** this merges.

### A3 — email-warning parity

In `src/lib/actions/answers.ts` around line 220–243, capture the `sendEmail` result and return `warning` on failure the way `applications.ts:196-240` does; the caller (`dynamic-application-form.tsx`) surfaces it as `toast.warning`, matching `status-buttons.tsx:70-73`. One happy-path and one email-failed test.

### A4 — keep-alive

- `vercel.json`: `{"crons":[{"path":"/api/keepalive","schedule":"0 12 * * *"}]}`. Daily: Hobby allows it, and 7-day pause vs weekly ping is too tight.
- `src/app/api/keepalive/route.ts`: GET; requires `Authorization: Bearer ${CRON_SECRET}` (Vercel sends it); for each target in `KEEPALIVE_SUPABASE_TARGETS` (format `url|anonKey,url|anonKey`) does `GET {url}/rest/v1/events?select=id&limit=1` with the anon key; returns per-target status JSON, HTTP 500 if any target failed so Vercel's cron log shows red. Prod's own project is listed explicitly rather than inferred.
- Tests: mock `fetch`; unauthorized → 401, all ok → 200, one failing → 500.
- Owen sets `CRON_SECRET` and `KEEPALIVE_SUPABASE_TARGETS` on Vercel Production (crons run only on production deploys). Note in the runbook: an anon REST read counts as activity for Supabase's pause rule; confirm after the first week by checking the cron log and that dev did not pause.

### C1 — smoke runbook and check script

- `docs/runbooks/event-week-smoke.md`: a 10-minute click-through (below) plus the cleanup SQL, since `deleteEvent` refuses events with applications.
- `scripts/smoke-check.mjs` (plain ESM, `@supabase/supabase-js` + native fetch; no new dependency; `npm run smoke`). Inputs: `SMOKE_APP_URL`, `SMOKE_SUPABASE_URL`, `SMOKE_SUPABASE_ANON_KEY`. Checks, each printed pass/fail, exit 1 on any failure:
  1. `/` and `/apply` return 200.
  2. Anon reads of `vendors`, `applications`, `attachments`, `application_answers` return `[]` (the 006 probe, automated).
  3. `events?status=eq.active` readable; every active event has an `event_questionnaires` row with ≥1 question.
  4. `submit_public_application` exists: call with an invalid payload and expect the RPC's validation ERRCODE (per `contracts/submit-public-application.md`), not `404`/`42883`. Confirm during implementation that validation precedes any write.
  5. Organizer-only RPCs return `42501` for anon.
- Delete `scripts/verify-db.ts`. Generalize `scripts/seed-admin.sql` → `seed-role.sql` (email + role placeholders).

### C2 — backup/restore runbook

- `docs/runbooks/backup-restore.md`: `supabase link` to the target, `read -s SUPABASE_DB_PASSWORD` (never in a file), `supabase db dump --linked -f schema.sql` and `--data-only -f data.sql`, and `supabase storage cp -r ss:///attachments ./backup/attachments --linked` for the bucket. Restore: data-only into the local stack (`supabase db reset` → `psql -f data.sql`) as the default drill; restoring into dev only from a **dev** dump so prod PII never lands on dev. Verify by row counts and one signed-URL download.
- The drill is executed once on dev and its date and result recorded in the runbook and the roadmap checkbox. After the drill, relink the CLI to dev (it is linked to dev today).
- Known kong gotcha after `supabase db reset`: `docker restart supabase_kong_Holigay`.

## UAT dry-run shape (B1/B2)

**Environment.** The `dev` branch Vercel preview, dev Supabase, `EMAIL_FROM_ADDRESS` set, keep-alive live. Two organizers with dev accounts (A6). One of them, or Owen in a private window, plays the vendor with a real mailbox they control. Owen observes and logs; organizers drive.

**Fake event.** "UAT Dry Run — <date>", a plausible real market: date two months out, real venue text, booth prices as they would write them. Created by an organizer from scratch, not seeded by Owen, so the create path is tested.

**Script, in order.** Each step has an expected result written into `docs/uat/<date>-organizer-dry-run.md` before the session, with a column for observed result.

1. **Organizer: create the event** as draft → open the builder → seed from the existing template → add one yes/no question and one short-text question that shows if the first equals Yes → mark one question required → reorder → save once → hard reload, everything present.
2. **Organizer: publish** (draft → active). Confirm the builder locks. Confirm `/apply` lists the event.
3. **Vendor: submit application 1** (new vendor) with a PDF attached, the branch triggered, the required question left empty → blocked with a visible error → fill it → submit → success message. Vendor mailbox receives the "application received" email from the verified domain within a minute. Check spam folder and the from-name.
4. **Vendor: submit application 2** with the **same email** and a changed phone number → duplicate handling behaves as the organizers expect (this is the RPC's returning-vendor path). Then **application 3** as a different new vendor with no file.
5. **Organizer: review list.** Dashboard shows the applications, filter by event and status works, search finds a business name, export CSV downloads. Note whether the missing questionnaire answers in the CSV matter to them.
6. **Organizer: detail page.** Answers show, including the branch; attachment opens via signed URL.
7. **Organizer: the notes gotcha.** Type notes, do **not** save, change status to approved → email arrives at the vendor; record whether the notes appear (they will not). Then save notes, set status to waitlisted → email includes notes. Organizers decide whether the unsaved-notes behaviour is acceptable; it is a finding either way.
8. **Organizer: set status back to pending.** No email is sent by design; organizers confirm that is what they want.
9. **Vendor: sign up** on the vendor dashboard with the applicant email → profile links to the vendor record via the trigger → applications and current status visible, read-only. (Depends on A5.)
10. **Organizer: close the event.** Try to delete it → refused because it has applications. Create a throwaway draft event → delete it (the `5facc67` feature).
11. **Cleanup.** Leave the rows on dev or clear them with the runbook SQL; dev is throwaway.

**Pass criteria.** Every step's expected result observed, all three emails delivered from the verified domain, no console errors on the pages used, and no step required Owen to intervene. Any deviation is a finding with a severity: **blocker** (fix before M4), **Tier 3** (fix in M3 if a single-session PR), **backlog** (goes through the scope-line table in the roadmap). Organizer judgement calls (email wording, status names, what "waitlisted" should say) are recorded verbatim.

**Likely findings to pre-triage.** CSV without questionnaire answers (Tier 3-sized change to `export.ts`); unsaved-notes-in-email (decide: warn in the UI, or auto-save notes before status change); no reopen for closed events (`VALID_TRANSITIONS` is forward-only; likely backlog).

## M3 exit criteria

- [ ] Every roadmap checklist box ticked, with the PR or date beside it.
- [ ] Emails from the dynamic form, legacy form and status update all delivered from the verified domain on prod (C7).
- [ ] Keep-alive cron has run at least once with a green log; dev did not pause in the following week.
- [ ] One restore drill recorded in `docs/runbooks/backup-restore.md`.
- [ ] Passwords rotated on dev and prod; CLI relinked to dev.
- [ ] The four "Still owed on prod" boxes in `specs/006-close-public-data-exposure/quickstart.md` ticked.
- [ ] Solo rehearsal findings log committed; every blocker fixed and merged; `main` = `dev`. (The organizer session is M4's entry gate, not an M3 exit criterion.)
- [ ] `npm run smoke` passes against prod.

## Execution structure (added 2026-09-14): spec 007, solo-first

**Decision.** M3 becomes one spec-kit spec, `specs/007-production-readiness/`. Reason: multi-session scope (roadmap decision table), and the constitution names `tasks.md` as the task source of truth. Precedent: specs 005 and 006 already track manual rollout work as tasks and use `quickstart.md` as the ops record with evidence. Commits are tagged `[007-Txx]`. `docs/M3-PLAN.md` stays as the reasoning record; `spec.md` distils it and links back.

**Solo-first.** Everything technical in M3 is done and verified by Owen alone. A **solo technical rehearsal** of the full UAT script on the dev preview is M3's gate. The organizer session becomes the entry gate for M4 (usability and judgement calls only), so M3 no longer waits on anyone but the DNS owner.

### Spec contents

- `spec.md` — user stories, each independently testable:
  - US1 (P1) Vendors and organizers receive email from the real domain, and a failed send is never silent. (A1, A2, A3)
  - US2 (P1) The projects never pause and their data can be restored. (A4, C2)
  - US3 (P2) Owen can prove prod healthy in ten minutes on event day. (C1, C5, C7)
  - US4 (P2) The full event lifecycle works end to end on a preview with no one intervening. (B1, rehearsal, B4)
  - US5 (P3) Organizers exist on both projects and can sign in. (A5, A6, C6)
- `plan.md` — technical context and constitution check; it will note the one new file-level pattern (`src/lib/env.ts` + `env-public.ts`) and the one new runtime surface (`/api/keepalive` + `vercel.json`), no new dependencies.
- `tasks.md` — phases below. Manual tasks are prefixed **[manual]** with "evidence:" naming what gets recorded in `quickstart.md`.
- `quickstart.md` — the ops record: per-project tables (dev / prod) for domain verification, SMTP, keep-alive first run, rotation dates, restore-drill result, prod probe output, prod smoke result; the same shape as 006's "Prod rollout record".
- `contracts/keepalive-route.md` and `contracts/env-contract.md` — small, so the next person does not read code to learn the env names.
- No `data-model.md`, no migration.

### tasks.md phases and dependencies

```
Phase 1 Setup          T001 scaffold spec (docs PR)             — no deps
Phase 2 Foundational   T002 [manual] Resend domain → DNS handoff → verified   — external, start day one
                       T003 [manual] EMAIL_FROM_ADDRESS + RESEND_API_KEY on Vercel Preview+Production
Phase 3 US1 email      T004 env module + tests + docs (PR)      — merge after T003
                       T005 answers.ts warning parity (PR)      — independent
                       T006 [manual] verify domain delivery from local dev via /api/test-email  — needs T002
Phase 4 US2 uptime     T007 keep-alive route + vercel.json + tests (PR)     — independent
                       T008 [manual] CRON_SECRET + targets on Vercel; first cron run green
                       T009 backup/restore runbook (PR)         — independent
                       T010 [manual] restore drill on dev, recorded            — needs T009
Phase 5 US3 smoke      T011 smoke-check.mjs + runbook + seed-role.sql (PR)  — independent
                       T012 [manual] prod probe once by hand + storage-policy visual check
Phase 6 US5 accounts   T013 [manual] Supabase auth SMTP + Site/redirect URLs, dev and prod  — needs T002
                       T014 [manual] organizer accounts on dev; T015 on prod
Phase 7 US4 lifecycle  T016 UAT script + findings template (PR)  — independent
                       T017 [manual] solo rehearsal on dev preview, findings logged  — needs T003–T005, T007, T013, T014
                       T018 fixes from rehearsal (PR each; spec only if schema/RLS/auth)
Phase 8 Close          T019 [manual] rotate DB passwords dev + prod; relink CLI to dev
                       T020 promote dev → main
                       T021 [manual] prod smoke run = 006 live-submission residual; tick 006 quickstart boxes
                       T022 docs close-out: roadmap checkboxes, specs/README, CLAUDE.md phase note
```

Critical path: T002 → T003 → T004 → T017 → T018 → T020 → T021. Everything else is parallel filler while DNS propagates.

### Session plan

Each session opens with the next unblocked task in `tasks.md`; each repo task is one branch off `dev`, one PR, merged before the next starts on the same files.

| Session | Repo work (Claude) | Owen, in between |
|---|---|---|
| S1 | T001 scaffold spec 007 (docs-only PR). Then T004 env module | Start T002 today; set T003 once verified |
| S2 | T005 answers parity, T007 keep-alive (two PRs) | T008 after the keep-alive deploy; T006 once DNS is live |
| S3 | T011 smoke script + runbook; T009 backup runbook; drive T010 with Owen at the keyboard | T012, T013, T014 |
| S4 | T016 UAT script; drive T017 rehearsal with Owen (Chrome tools available for observation) | — |
| S5 | T018 fixes; T022 docs | T019, T020, T021 |

### Per-task discipline

- Repo tasks: TDD for the route, the env schema and the action change (constitution Principle II); presentational or docs work verified by running it. Before each PR: `npm run lint && npm test && npm run build` with the local stack up; `docker restart supabase_kong_Holigay` if auth health returns 502 after a reset.
- Manual tasks: done by Owen in the dashboard; Claude supplies the exact steps and expected screen states, and the task is ticked only when evidence is in `quickstart.md`.
- Merge order for T004: Vercel vars first, then merge, then confirm the preview build is green.

## Explicitly out of M3

Epic 4 invite backend (manual SQL suffices at two organizers), browser-automation tests, Sentry or structured logging, paid Supabase or Vercel tiers, email via `after()`, retiring the legacy form, and any builder extension the UAT requests (scope-line table applies).

## How the solo rehearsal fits the spec-kit flow

- `/speckit.specify` turns the description into `spec.md` with user stories. The rehearsal is **US4**: its acceptance scenarios are the eleven lifecycle steps written as Given/When/Then, and its "Independent Test" is literally "run the script on the dev preview playing both roles; every expected result observed". The other stories carry their own measurable acceptance (email from the verified domain, cron log green, restore row counts match, smoke script exits 0).
- `/speckit.plan` produces `plan.md` plus `quickstart.md` and `contracts/`. Here `quickstart.md` is the ops record (per-project evidence tables), and the two contracts document the env names and the keep-alive route.
- `/speckit.tasks` produces `tasks.md`. Manual dashboard work is a task like any other, prefixed **[manual]** with an "evidence:" clause; precedent is 006 T004 (boot the stack and probe) and 005 T062 (record the migration on prod). The rehearsal is one task whose output is a committed findings file under `specs/007-production-readiness/rehearsal/<date>.md`; a follow-up task holds the fixes.
- Execution is per session, not `/speckit.implement` in one go: open `tasks.md`, take the next unblocked task, branch, TDD where the constitution requires it, gate, PR, tick.

### If the Resend domain is delayed

Resend gates only the email-specific proofs: T006 (delivery from the domain), T013 (auth SMTP needs a verified sender), the two email steps of T017, T021's email check, and the final promotion once the env guard is live. Sixteen of the 22 tasks do not touch it. Two adjustments keep the rest moving:

- **Env guard keys on `VERCEL_ENV === 'production'`, not `NODE_ENV`.** Preview builds then pass without `EMAIL_FROM_ADDRESS`; only a Production deploy fails without it, which is the behaviour wanted anyway. T004 merges with no Vercel prerequisite.
- **Rehearsal runs with the fallback sender.** `onboarding@resend.dev` delivers only to the Resend account owner's address, so Owen's own mailbox as the vendor email makes steps 3 and 7 observable. Record them as "passed on fallback sender"; re-run those two steps after verification. Organizer accounts (T014/T015) use dashboard Add User with auto-confirm, so they need no SMTP.

### Kickoff prompt for the fresh session

```
/speckit.specify Production readiness for the Holigay Vendor Market — milestone M3.
Read docs/M3-PLAN.md and ~/.claude/plans/plan-milestone-m3-production-ready-synthetic-river.md
first: they are the brainstorm output and are authoritative for scope, sequence, the five
user stories and the task phases. Spec number 007, short name production-readiness.
All work is solo. Dashboard work is tracked as [manual] tasks with evidence recorded in
quickstart.md, as specs 005 and 006 did. The M3 gate is a solo technical rehearsal of the
full event lifecycle on the dev preview (US4); the organizer session is M4, out of scope.
No schema, RLS or auth changes. The Resend domain may be delayed: mark the tasks that depend
on it and keep every other task executable without it (see "If the Resend domain is delayed").
First task: sync the "Execution structure" section from the plan file into docs/M3-PLAN.md.
No Claude co-authoring trailers on commits or PRs.
```

## First moves next session (S1)

1. Owen: start T002 (add the domain in Resend, send the DNS records to the DNS owner). This is the critical path.
2. Claude: T001 — scaffold `specs/007-production-readiness/` (`spec.md`, `plan.md`, `tasks.md`, `quickstart.md`, two contracts) from this plan and `docs/M3-PLAN.md`; add the 007 row to `specs/README.md`; docs-only PR to `dev`.
3. Claude: T004 env-module branch, test-first. Hold the merge until T003 is set on Vercel.
