# Backlog — organizer UAT and go-live

Compiled 2026-10-06 from every open branch, PR, spec task list, quickstart "owed" row,
the ROADMAP M3 checklist and the 2026-09-27 UAT findings. This is the single ordered
list of what stands between today and (a) inviting real organizers to the training
deployment and (b) going live on production with a clean environment.

Decisions this list is built on (Owen, 2026-10-06):

- **Go-live stack is Vercel + hosted Supabase.** Spec 008 (self-hosting) is a
  post-launch track and sits in the Deferred section.
- **"Clean slate" means all of:** dev/UAT data reset, a prod reset right before the
  first real event, repo hygiene, and truing up the stale docs.
- The organizer-invite path already works end to end on `uat-holigay-yyc.vercel.app`
  (spec 010 rows D1–D8). Organizers _could_ be invited today; Phase 1 is what spec 010
  itself said should land first.

## How to work this list

- **One item = one branch off `dev` = one PR**, commit tagged `[<ID>]`, gated by
  `npm run lint && npm test && npm run build` (plus `npm run test:security` when the
  change touches SQL or RLS). Tick the box only after the PR merges. This is the
  constitution's workflow; the list does not replace it.
- **Nothing starts without Owen naming the item.** Agents may prepare, but not begin.
- **IDs:** an existing spec task keeps its ID (`007-T019`); a UAT finding keeps its
  number from `docs/handoffs/2026-09-27-uat-findings.md` (`UAT-6`); new items are
  `BL-nn`.
- **Owner:** `agent` (repo work), `Owen` (dashboard, decisions, prod), or
  `joint` (Owen drives Chrome or types passwords while the agent follows).
- **Prod rule:** anything that reads or writes the production project needs the
  session in default permission mode (auto mode denies prod-touching commands) and an
  inventory read → confirm → write → verify sequence. Dev writes go through the
  Management API and are fine in either mode.
- **Evidence:** manual items are done when their row in the owning spec's
  `quickstart.md` is filled. New manual items record evidence in this file, under the
  item.
- No Claude co-authoring trailers on commits or PRs.

Phases are ordered. Inside a phase, items are ordered by dependency, then by value.
Items marked `[P]` can run in parallel with their neighbours.

---

## Phase 0 — Repo hygiene

Mechanical, so the tree tells the truth before anyone starts real work.

- [x] **007-T016** (PR #26 merged 2026-10-06) — Resolve PR #26 (`007-T016-rehearsal-template`, 59 commits behind
      `dev`). It adds `specs/007-production-readiness/rehearsal/2026-09-23-solo-lifecycle.md`
      (90 lines) and 5 lines in the 007 quickstart. Rebase onto `dev`, merge, tick T016
      in the same PR.
      Owner: agent · Shape: PR (existing) · Blocked by: — · Done when: #26 merged, T016 `[X]`.
- [x] **BL-01** `[P]` (PR #44 merged 2026-10-06) — Open a docs PR for branch `008-review-2026-09-19` (one commit,
      `specs/008-self-hosted-infrastructure/review-2026-09-19.md`, 125 lines, no PR). It
      records eight findings spec 008 must fix before it starts, so keep it.
      Owner: agent · Shape: PR · Blocked by: — · Done when: merged to `dev`.
- [x] **BL-02** (run 2026-10-06 after Owen's approval; also removed `docs/uat-go-live-backlog`, merged as #43) — Delete the merged branches, drop the stale stash, fast-forward local
      `main`. Owen reviews the list before the agent runs it. - Fully merged into `dev` (delete local and `origin/`):
      `005-atomic-builder-save`, `009-organizer-invites`, `009-T002-admin-client`,
      `009-T003-invite-pending`, `009-T005-auth-confirm`, `009-T006-set-password`,
      `009-T007-invite-organizer`, `009-T010-forgot-password`,
      `009-T013-pending-resend`, `009-T015-signup-copy`, `010-invite-only-uat`,
      `010-T005-invite-only-mode`, `010-T007-invite-role`,
      `010-T008-invite-role-picker`, `010-T014-close-docs`,
      `chore/drop-dead-supabase-middleware`, `fix-dashboard-settings-404`,
      `fix-file-answer-links`. - Squash-merged (content is on `dev` via PRs #20, #21, #22; git does not list them
      as merged): `origin/007-T011-smoke-check`, `origin/007-T012-prod-probe`,
      `origin/007-prod-wipe-record`. - After 007-T016 and BL-01 merge: `007-T016-rehearsal-template`,
      `008-review-2026-09-19`. - `stash@{0}` (2026-04-19, 7 lines of CLAUDE.md from the spec 001 era; PR #2 merged
      2026-04-22) — drop. - Local `main` is `3dc243c`, 15 commits behind `origin/main` (`66fc1dd`):
      `git fetch && git checkout main && git merge --ff-only origin/main`.
      Owner: agent, after Owen's go · Shape: git commands, no PR · Blocked by: 007-T016, BL-01 ·
      Done when: `git branch -a` shows only `dev`, `main` and live work branches.
- [x] **BL-03** `[P]` (PR #45 merged 2026-10-06) — Bookkeeping tick for shipped specs: spec 004's 33 task boxes
      (work shipped in PR #4 on 2026-04-25; migrations `007` and `008` exist) and spec
      002's four manual smoke boxes (T013, T014, T015, T017). One docs commit, each box
      annotated "shipped; ticked retroactively 2026-10".
      Owner: agent · Shape: PR · Blocked by: — · Done when: no `- [ ]` left in
      `specs/004-*/tasks.md` or `specs/002-*/tasks.md`.

---

## Phase 1 — Before the first organizer invite to UAT

Spec 010's own gating sequence (`specs/010-invite-only-uat/tasks.md`, dependencies
note) ends "the remaining UAT-findings items (6, 4, 5) as their own PRs → first invite".
Item 11 is added because it silently breaks vendor-to-account linking, which organizers
will exercise.

- [x] **UAT-6** (PR #46 merged 2026-10-06) — Status buttons swap under the cursor with no confirmation.
      `src/app/dashboard/applications/[id]/status-buttons.tsx`: after **Approve**, a
      **Pending** button appears in the same spot, so a double-click approves (email
      sent) then un-approves. `src/app/dashboard/events/event-status-actions.tsx`:
      **Publish** becomes **Close** in the same spot. Recommended fix: a confirm step for
      any transition that sends email or closes an event, plus stable button positions.
      Tests on both components.
      Owner: agent · Shape: PR · Blocked by: — · Done when: merged; double-click on the
      PR preview cannot produce two transitions.
- [x] **UAT-4** `[P]` (PR #47 merged 2026-10-06) — Dates and times render in UTC. Every server-rendered formatter
      calls `toLocaleDateString('en-US', …)` with no `timeZone`, so Vercel formats in
      UTC (a 4:13 PM Calgary submission showed as 10:13 PM). Occurrences: the two
      `formatDateTime` helpers in `src/app/vendor-dashboard/applications/[id]/page.tsx`
      and `src/app/dashboard/applications/[id]/page.tsx`, the `formatDate` helpers in
      `vendor-dashboard/page.tsx`, `vendor-dashboard/applications/page.tsx`,
      `dashboard/page.tsx`, `dashboard/admin/page.tsx`, `dashboard/team/page.tsx`,
      `dashboard/events/page.tsx`, `src/lib/actions/export.ts`, the email date strings
      in `src/lib/actions/answers.ts` and `applications.ts`, and the public pages under
      `src/app/(public)/`. Recommended fix: one shared formatter in `src/lib/` that
      passes `timeZone: 'America/Edmonton'`, used everywhere; date-only values (event
      date, deadline) must not shift a day.
      Owner: agent · Shape: PR · Blocked by: — · Done when: merged; a unit test pins the
      Edmonton rendering of a fixed UTC timestamp.
- [x] **UAT-5** `[P]` (PR #49 merged 2026-10-06; decision: copy only, no reply-to mailbox or env var) — Emails say "reply to this email" but are sent from `noreply@`.
      `src/lib/email/templates/status-update.ts` lines 81, 252, 290, 330 (and the
      received-template equivalents) invite replies; `sendEmail` in
      `src/lib/email/client.ts` accepts `replyTo` but no caller passes it. Recommended
      fix: optional `EMAIL_REPLY_TO` in `src/lib/env.ts` (documented in CLAUDE.md and
      `specs/007-production-readiness/contracts/env-contract.md`); when set, every
      send passes it; when unset, the copy says "contact the organizers" instead of
      "reply". Owen then sets the variable on Vercel Preview and Production.
      Owner: agent (PR), Owen (Vercel var) · Shape: PR + dashboard · Blocked by: Owen
      naming the reply-to mailbox · Done when: merged and a status email on the uat host
      shows the reply-to header.
- [x] **UAT-11** `[P]` (PR #48 merged 2026-10-06) — Application email casing. `src/lib/validations/application.ts:120`
      keeps the case the applicant typed; `handle_new_user` matches `vendors.email`
      exactly; GoTrue stores addresses lower-cased. An applicant who typed capitals is
      never linked to their account, by self sign-up or invite. Recommended fix:
      `.trim().toLowerCase()` on the public-form email schema (cheaper than a migration
      `014` matching `lower(email)`, and matches GoTrue). The documenting case in
      `src/test/security/invite-flow.test.ts` (spec 010 research R8) flips to a passing
      assertion.
      Owner: agent · Shape: PR · Blocked by: — · Done when: merged; the security test
      asserts the link succeeds for a mixed-case applicant.
- [x] **UAT-1** `[P]` (already gone at the 2026-10-06 BL-05 inventory; folded into BL-05) — Delete the three stale dev events (TEST, Beep boop, Test event;
      0 applications each) via `/dashboard/events` → Delete → Yes, delete. Folded into
      BL-05 if that runs first.
      Owner: Owen · Shape: UI · Blocked by: — · Done when: not listed on dev.
- [x] **BL-04** (PR #51 merged 2026-10-06) — Write `docs/runbooks/reset-hosted-project.md`: a reusable recipe to
      return a hosted Supabase project to admin-plus-organizers-only. Contents: an
      inventory query first (counts per table, `auth.users` list, bucket object list);
      SQL in FK order, as in the smoke runbook's cleanup section
      (`application_answers` → `attachments` → `applications` → `vendors` →
      `event_questions`/`event_questionnaires` → `events`), keeping named rows; storage
      objects removed through the Storage API or dashboard, never SQL (SQL orphans the
      bytes); `auth.users` deletions restricted to an explicit allow-list of addresses to
      keep; the Management API + keyring method used for the 2026-09-19 prod wipe
      (`project_prod_rollout_2026_09` in memory / 007 T012 evidence row) as the
      execution path; a verify query at the end. Must state that it is destructive and
      requires Owen's go per run.
      Owner: agent · Shape: PR, docs only · Blocked by: — · Done when: merged; BL-05 can
      be executed by following it without reading code.
- [x] **BL-05** (run 2026-10-06, Owen's go in chat, no sample event by decision) — Reset dev using BL-04. Remove: the UAT seed event **UAT Market 2026**
      (`34dd5881-1a60-4df3-9068-0da57db8d663`, cascades), application
      `2b703c47-1a4f-451e-8d60-742537445195` and its vendor **UAT Candle Co**, auth user
      `owenconnorrose+uat@gmail.com`, `organizer@test.com` (007 T014 / 010 D5), any
      other throwaways, and the stale events from UAT-1. Keep Owen's admin. Then decide
      whether to seed one clean sample event through the UI so organizers see an example
      (recommended: yes, created by Owen, no applications).
      Owner: Owen's go, agent executes via Management API · Shape: SQL + storage ·
      Blocked by: BL-04 · Done when: verify query shows only kept rows; recorded under this item.
      **Record (2026-10-06).** Dev project had been free-tier paused; Owen restored it. Inventory
      before: events 1 (UAT Market 2026, `34dd5881…`, 1 application), vendors 1 (UAT Candle Co),
      applications 1 (`2b703c47…`), application_answers 4, event_questionnaires 1, event_questions
      4, attachments 0, templates 1/1, auth.users 3 (admin, `organizer@test.com`,
      `owenconnorrose+uat@gmail.com`), bucket objects 2 (`__probe-011/x.txt` + placeholder); the
      three UAT-1 events were already gone. Owen deleted `__probe-011/x.txt` in the dashboard.
      Write: runbook §4 as one Management API transaction, keep-list = `owenconnorrose@gmail.com`.
      Verify: events 0, event_questionnaires 0, event_questions 0, vendors 0, applications 0,
      application_answers 0, attachments 0, questionnaire_templates 1, template_questions 1,
      user_profiles 1, auth.users 1 (`owenconnorrose@gmail.com`, admin), storage.objects 1
      (`uploads/.emptyFolderPlaceholder`, 0 bytes).
- [x] **BL-11** (decision 2026-10-06: yes; PR #50 merged 2026-10-06; the 5 MB preview upload is Owen's check) — Decide whether to raise the server-action body limit before UAT.
      `next.config.ts` has no `experimental.serverActions.bodySizeLimit`, so any upload
      over Next's 1 MB default fails with 413 on Vercel today (found during the spec 008
      review; the fix is spec 008 T005's one-line `'11mb'`, matching the 10 MB form
      limit). Organizers testing with real product photos will hit this. Recommended:
      pull it forward as its own small PR with a test.
      Owner: Owen (decision), agent (PR) · Shape: PR · Blocked by: — · Done when: a 5 MB
      upload succeeds on the PR preview.
- [ ] **BL-06** — Invite the organizers from `/dashboard/team` on the uat host
      (role picker → Organizer). Record who (role only, no addresses) and when in
      `specs/010-invite-only-uat/quickstart.md`, and tell them what to test (the
      lifecycle in `docs/M3-PLAN.md` "UAT dry-run shape" is the script).
      Owner: Owen · Shape: UI · Blocked by: UAT-6, UAT-4, UAT-5, UAT-11, BL-05 ·
      Done when: organizers have signed in and land on `/dashboard`.

---

## Phase 2 — During and after the organizer UAT

- [ ] **007-T017** (reframed) — The organizer session on the uat host _is_ the lifecycle
      run. Log it against the T016 template in
      `specs/007-production-readiness/rehearsal/` (observed column, console errors,
      findings table with severities). The 2026-09-27 solo run already proved the steps
      technically; this run captures organizer judgement calls (unsaved notes in the
      status email, CSV without questionnaire answers, no reopen for closed events).
      Owner: joint · Shape: docs commit · Blocked by: BL-06 · Done when: the filled
      rehearsal file is on `dev`.
- [ ] **007-T018** — Fix the blockers the session surfaces, one PR each, test per
      constitution. A finding that needs a schema, RLS or auth change opens a spec
      instead (next free number is 011). Exit condition: zero open blocker findings.
      Owner: agent · Shape: PR each · Blocked by: 007-T017.
- [ ] **UAT-7** `[P]` — Polish: the locked questionnaire view in
      `src/app/dashboard/events/[id]/questionnaire-builder.tsx` lists type and required
      but not the show-if rule, so a conditional question looks unconditional.
      Owner: agent · Shape: PR · Do if organizers notice or time allows.
- [ ] **UAT-8** `[P]` — Polish: on `/dashboard/events` at about 930 px the "Yes, delete /
      Cancel" pair overlaps the Applications column.
      Owner: agent · Shape: PR · Do if organizers notice or time allows.
- [ ] **BL-07** — Reset dev again with BL-04 after the organizers are done, so the
      training environment is clean for any later cohort. Keep the organizer accounts.
      Owner: Owen's go, agent executes · Shape: SQL + storage · Blocked by: 007-T018.

---

## Phase 3 — Production rollout

Everything here hangs on one `dev → main` promotion (`dev` is 90 commits ahead of
`origin/main`, which is `66fc1dd` from 2026-09-17: the rest of spec 007, migration 013
and all of spec 009, UAT fixes #36/#37, all of spec 010). **The Production build will
fail until `SUPABASE_SERVICE_ROLE_KEY` is set on Vercel Production** (009 T017 step 3),
so the order below is strict.

- [ ] **010-T011** `[P]` — Prod read-backs, read-only, can be done any time:
      "Allow new users to sign up" is on (`disable_signup: false`); read and record
      "Confirm email" (`mailer_autoconfirm`). Change nothing.
      Owner: Owen, or agent in default mode · Shape: dashboard or Management API ·
      Evidence: 010 quickstart row P1.
- [ ] **009-T017** — Production configuration. (0) **Roll the prod service-role
      secret first** — it was pasted into Vercel Preview by mistake on 2026-09-27 and
      replaced, but the old value was exposed. (1) Re-read prod Site URL
      `https://vendors.holigayeventsyyc.ca` (row V4). (2) Migration 013 is already on
      prod (row P1, 2026-09-27) — confirm only. (3) Vercel → `SUPABASE_SERVICE_ROLE_KEY`
      = the new prod key, **Production scope only** (row P2). (4) Prod Email Templates:
      Invite, Reset password, Confirm signup from
      `specs/009-organizer-invites/contracts/email-templates.md` (rows P3–P5).
      Owner: Owen · Shape: dashboard · Blocked by: — · Evidence: 009 quickstart V4, P2–P5.
- [ ] **007-T019** — Rotate the database password on dev and prod (Settings → Database
      → Reset database password); confirm no local password files remain; relink the CLI
      to dev. Also closes the second "Still owed on prod" box in
      `specs/006-close-public-data-exposure/quickstart.md`.
      Owner: Owen · Shape: dashboard · Blocked by: — · Evidence: 007 quickstart T019 rows.
- [ ] **007-T020 / 009-T018 (1)** — Promote `dev → main`:
      `git checkout main && git merge --ff-only dev && git push origin main`. Confirm
      `RESEND_API_KEY`, `EMAIL_FROM_ADDRESS` and `SUPABASE_SERVICE_ROLE_KEY` exist on
      Production first (the env guard fails the build otherwise), Production build green,
      `/apply` loads, `/api/keepalive` answers 401 without the secret.
      Owner: Owen · Shape: git + Vercel · Blocked by: 009-T017, 007-T018 (zero blockers) ·
      Evidence: 007 quickstart T020 row, 009 row P6.
- [ ] **007-T008** — Vercel Production → `CRON_SECRET` and `KEEPALIVE_SUPABASE_TARGETS`
      (both projects listed). Watch the first cron run; seven days later confirm dev is
      still active. Then delete `.github/workflows/keepalive.yml` from `main` and its
      four repo secrets (agent PR).
      Owner: Owen (vars), agent (deletion PR) · Shape: dashboard + PR · Blocked by:
      007-T020 · Evidence: 007 quickstart T008 rows.
- [ ] **010-T012** — Production non-regression: no Production-scope
      `NEXT_PUBLIC_INVITE_ONLY`; `/login` shows Sign up and `/signup` renders; sign up a
      throwaway, record whether the "check your email" copy matched P1's confirm setting
      (UAT item 3: `signUp` in `src/lib/actions/auth.ts` discards `authData.session`)
      and that the subtitle still says "Sign up to manage vendor applications" (UAT item
      9, `src/app/(auth)/signup/page.tsx:38`); delete the throwaway. Items 3 and 9 then
      get their own small PRs.
      Owner: Owen · Shape: dashboard + browser · Blocked by: 007-T020 · Evidence: 010
      quickstart rows P2, P3.
- [ ] **007-T021** — Prod smoke: `npm run smoke` with the prod values → exit 0; then
      the `docs/runbooks/event-week-smoke.md` click-through on production (one live
      submission per reachable form variant, both emails from the verified domain,
      signed-URL download, cleanup SQL, timed ≤ 10 min). Ticks the remaining "Still owed
      on prod" box in the 006 quickstart.
      Owner: joint · Shape: terminal + browser · Blocked by: 007-T020, 007-T019 ·
      Evidence: 007 quickstart T021 rows; 006 quickstart boxes.
- [ ] **009-T018 (P7–P9)** — First real onboarding on prod: invite a real organizer
      (P7), throwaway vendor sign-up and delete (P8), remove the auto-confirmed
      placeholder organizer from 007 T015 (P9).
      Owner: Owen · Shape: UI + dashboard · Blocked by: 007-T020 · Evidence: 009
      quickstart P7–P9.
- [ ] **007-T014 / 007-T015** — Close as superseded: real organizer accounts are created
      by the spec 009/010 invite flow (BL-06 on dev, P7 on prod), not by SQL. One docs
      commit noting that under both tasks.
      Owner: agent · Shape: docs commit (with 007-T022) · Blocked by: 009-T018.

---

## Phase 4 — Go-live clean slate and docs truth-up

- [ ] **BL-08** — Prod reset right before the first real event, using BL-04. Keep Owen's
      admin and the real organizers; remove every test event, vendor, application,
      attachment, bucket object and throwaway user from Phase 3. Inventory read →
      Owen confirms → write → verify. (Prod was last wiped 2026-09-19; Phase 3 adds test
      rows again.)
      Owner: Owen's go, agent executes in default mode · Shape: SQL + storage ·
      Blocked by: 007-T021, 009-T018 · Done when: verify query recorded under this item.
- [ ] **BL-09** — Final `npm run smoke` against prod after the reset; record the date
      in `docs/runbooks/event-week-smoke.md`.
      Owner: agent · Shape: terminal · Blocked by: BL-08.
- [ ] **009-T019** — Docs and constitution PATCH per FR-031: CLAUDE.md Epic 4 row
      ("Partial … pending service-role client" is wrong — spec 009 shipped it),
      `docs/ARCHITECTURE.md` line 224 ("one TODO (`team.ts` invite stub)" no longer
      exists), `docs/ROADMAP.md` current-state row "Organizer invites: UI only", notes
      under 007 T013/T015 and 008 T008/T013, archive TASKS 4.2.x, constitution 1.1.2.
      Owner: agent · Shape: PR · Blocked by: 009-T018 (dates).
- [ ] **007-T022** — M3 close-out: tick every M3 checklist box in `docs/ROADMAP.md` with
      PR or date (Resend domain → T002/T003 2026-09-20; keep-alive → T008; backups and
      drill → T010 2026-09-17; env module → PR #10; organizer accounts → BL-06/P7;
      smoke → T011/T021); set the 007, 009 and 010 rows in `specs/README.md` to shipped
      with PRs and dates; rewrite the "Current Development Phase" and "Recent Changes"
      paragraphs in CLAUDE.md; remove the dead `docs/uat/<date>-organizer-dry-run.md`
      reference from `docs/M3-PLAN.md`; confirm `git diff main dev` is empty.
      Owner: agent · Shape: PR · Blocked by: 007-T021, 009-T019.
- [ ] **BL-10** — Mark M3 done and M4 entered in `docs/ROADMAP.md` "Milestones to
      production"; move spec 008 to a "post-launch" note in `specs/README.md`; tick the
      M3 exit criteria in `docs/M3-PLAN.md`; archive this backlog's completed phases
      with a closing note.
      Owner: agent · Shape: PR · Blocked by: 007-T022.

---

## Deferred — listed, not prioritized

Not needed for UAT or go-live on the current stack.

- **Spec 008 self-hosted infrastructure**, T002–T027 (26 open tasks), plus the eight
  findings in `specs/008-self-hosted-infrastructure/review-2026-09-19.md` (BL-01) to fix
  in the spec before any task starts. Post-launch.
- **UAT-10** — `attachments_authenticated_select` (migration 011) lets any signed-in
  user read or sign any object in the bucket. Scoping reads to organizers plus the
  owning vendor is an RLS change, so it needs a spec (ROADMAP Tier 3 candidate).
- **ROADMAP Tier 3 leftovers:** shared `ActionResponse<T>`; `requireVendor()` helper;
  `requireRole('organizer')` on organizer-facing reads in `applications.ts`/`events.ts`;
  split `applications.ts`; atomic `updateTemplate`; cross-vendor isolation security
  suite; tests for `admin.ts` role changes and `updateEventStatus`; the `as Role` cast
  in `admin.ts`; attachment orphaning on failed legacy submits.
- **ROADMAP Tier 4:** retire the legacy form; role in JWT claims; email via `after()`;
  structured logging; Epic 6.9 file previews; Epic 6.10 mobile polish (375 px pass,
  44 px touch targets); shared icon module.
- **Pre-triaged organizer judgement calls** (from `docs/M3-PLAN.md`): CSV export lacks
  questionnaire answers (`export.ts` writes the 13 legacy columns); unsaved organizer
  notes are not in the status email; closed events cannot be reopened
  (`VALID_TRANSITIONS` is forward-only). Decide after Phase 2, not before.

---

## Sources

- Branches and PRs: `git branch -a --merged dev`, `gh pr list` on 2026-10-06.
- `specs/007-production-readiness/tasks.md` (T008, T014–T022 open),
  `specs/009-organizer-invites/tasks.md` (T017–T019),
  `specs/010-invite-only-uat/tasks.md` (T011, T012),
  `specs/006-close-public-data-exposure/quickstart.md` (two "Still owed on prod" boxes).
- `docs/handoffs/2026-09-27-uat-findings.md` (items 1, 4–8, 10, 11 open; 2, 3, 9 moved
  to prod).
- `docs/ROADMAP.md` M3 checklist and Tiers 3–4; `docs/M3-PLAN.md` exit criteria.
- `docs/ARCHITECTURE.md` §10 weak points.
