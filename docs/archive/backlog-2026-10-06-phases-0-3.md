# Backlog archive — organizer UAT and go-live, Phases 0–3 (completed)

Moved verbatim from `docs/backlog/2026-10-06-uat-and-go-live.md` on 2026-10-08 (BL-10), once
every item in these four phases was ticked. The records under each item (reset inventories,
keep-lists, verify queries, dates) are evidence — they are kept unchanged. The live list and
its working rules stay in the original file; Phase 4 and the Deferred section are there.

| Phase | Ran | Repo PRs |
|---|---|---|
| 0 — Repo hygiene | 2026-10-06 | #43 (plus branch/stash cleanup, no PR) |
| 1 — Before the first organizer invite to UAT | 2026-10-06 | #46–#51 |
| 2 — During and after the organizer UAT | 2026-10-06/07 | #52, #55–#57 |
| 3 — Production rollout | 2026-10-07/08 | #58, #59 (dashboard work recorded in the 007/009/010 quickstarts) |

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
      Owen's check 2026-10-06, uat host (dev project): a generated 1400×1000 PNG of
      4,202,343 bytes (4.0 MB) on the required file-upload question of "Holigay Winter
      Market 2026", submitted twice — once signed in as admin (by mistake; the public path
      was meant), once signed out as anon. Both: success screen, upload server action 200,
      no 413, no console errors; the signed URL served the full file to the admin and to
      the rehearsal organizer. **Pass.** Observation, not a blocker: after every server
      action that succeeds on this deployment the network log shows one extra POST to the
      same path answering 503 (apply ×2, team invite ×1) and once a 503 on an RSC prefetch
      of `/apply`; the duplicate-vendor refusal (early return) showed none. No user-visible
      effect. Resolved the same night against the Vercel logs (past hour, preview, branch
      `dev`): no 503 was logged at all — every POST was 200, the six `/apply` action calls
      and the invite included; the only non-200 rows were 18 `OPTIONS /` → 400 from Chrome
      itself, spread across the hour. The 503s were an artefact of the Chrome extension's
      network tracker, not the app or the platform. Nothing to fix.
- [x] **BL-06** (rehearsal 2026-10-06; real invites → BL-12) — Invite the organizers from `/dashboard/team` on the uat host
      (role picker → Organizer). Record who (role only, no addresses) and when in
      `specs/010-invite-only-uat/quickstart.md`, and tell them what to test (the
      lifecycle in `docs/M3-PLAN.md` "UAT dry-run shape" is the script).
      Owner: Owen · Shape: UI · Blocked by: UAT-6, UAT-4, UAT-5, UAT-11, BL-05 ·
      Done when: organizers have signed in and land on `/dashboard`.
      Rehearsal invite only, 2026-10-06: organizer role to my +uat-org address, landed on
      /dashboard; real organizer invites deferred to new item BL-12. Team page showed the
      invite Pending; the mail link went to `/auth/confirm` → `/set-password` already
      signed in; after the password the account landed on `/dashboard` with the organizer
      nav (no Team, no User Management); a fresh sign-in as that organizer saw the sample
      event "Holigay Winter Market 2026" and the BL-11 application, and its file link
      opened. Sample event left published with no applications.
      Tidy 2026-10-06 (runbook §3 + §4 scoped to the two BL-11 applications, Management
      API path, keep both users): Owen removed the three BL-11 objects in the dashboard;
      one write request deleted 12 answers, 0 attachment rows, 2 applications, 2 vendors.
      Verify: events 1, event_questionnaires 1, event_questions 7, vendors 0,
      applications 0, application_answers 0, attachments 0, questionnaire_templates 1,
      template_questions 1, user_profiles 2, auth.users 2 (admin + `+uat-org` organizer),
      storage.objects 1 (`uploads/.emptyFolderPlaceholder`).

---

## Phase 2 — During and after the organizer UAT

Until BL-12, the organizer session is run by Owen playing organizer on the `+uat-org`
account (the BL-06 rehearsal invite, 2026-10-06). "Organizers" in the items below means
that account.

- [x] **007-T017** (reframed; run 2026-10-06/07, log on `dev` 6dfc49a → 9887a82) — The organizer session on the uat host _is_ the lifecycle
      run. Log it against the T016 template in
      `specs/007-production-readiness/rehearsal/` (observed column, console errors,
      findings table with severities). The 2026-09-27 solo run already proved the steps
      technically; this run captures organizer judgement calls (unsaved notes in the
      status email, CSV without questionnaire answers, no reopen for closed events).
      Owner: joint · Shape: docs commit · Blocked by: BL-06 · Done when: the filled
      rehearsal file is on `dev`.
      **Record.** `specs/007-production-readiness/rehearsal/2026-10-06-organizer-uat.md`.
      Two sittings (2026-10-06 23:34–23:48 and 2026-10-07 17:20–17:33 MDT), Owen as the
      `+uat-org` organizer, Claude driving Chrome and Gmail. All steps reached (step 9 `n/a`:
      invite-only host), zero console errors, four emails from the verified domain within a
      minute, zero blockers. Organizer decisions verbatim in the findings table: F-001 CSV
      "backlog"; F-002 "agreed, warn with save-and-confirm"; F-003 "agreed, backlog with the
      close copy change"; F-005 (duplicate refusal is a 4 s toast only) "later"; F-006 (no
      event filter) "now".
- [x] **007-T018** (PRs #55, #56, #57 merged 2026-10-07; zero open blockers) — Fix the blockers the session surfaces, one PR each, test per
      constitution. A finding that needs a schema, RLS or auth change opens a spec
      instead (next free number is 011). Exit condition: zero open blocker findings.
      Owner: agent · Shape: PR each · Blocked by: 007-T017.
      **Record.** No blocker-severity finding. Tier3 fixes, one PR each, re-checked with Owen:
      #55 Close prompt says the event cannot be reopened (F-003 interim); #56 Event select on
      `/dashboard/applications` (F-006); #57 unsaved-notes warning with "Save notes and
      confirm" on emailing status changes (F-002; the note reached the approved email on the
      PR preview). Fix PRs recorded in the log's table.
- [x] **UAT-7** `[P]` (PR #53 merged 2026-10-06) — Polish: the locked questionnaire view in
      `src/app/dashboard/events/[id]/questionnaire-builder.tsx` lists type and required
      but not the show-if rule, so a conditional question looks unconditional.
      Owner: agent · Shape: PR · Do if organizers notice or time allows.
- [x] **UAT-8** `[P]` (PR #54 merged 2026-10-06; evidence: 930 px and 1024 px checks on the PR preview, recorded on the PR) — Polish: on `/dashboard/events` at about 930 px the "Yes, delete /
      Cancel" pair overlaps the Applications column.
      Owner: agent · Shape: PR · Do if organizers notice or time allows.
- [x] **BL-07** (run 2026-10-07, Owen's go in chat) — Reset dev again with BL-04 after the organizers are done, so the
      training environment is clean for any later cohort. Keep the organizer accounts.
      Owner: Owen's go, agent executes · Shape: SQL + storage · Blocked by: 007-T018.
      **Record (2026-10-07, 18:06 MDT).** Runbook §1–§6, Management API path, dev project.
      Keep-list: `owenconnorrose@gmail.com` (admin), the `+uat-org` organizer, event
      `Holigay Winter Market 2026` (`a37ece55…`) with its questionnaire, the template.
      Inventory before: events 2 (sample 0 apps; `UAT Dry Run — 2026-10-06` `cd9751a5…`
      closed, 2 apps), event_questionnaires 2, event_questions 14, vendors 2 (UAT Vendor One /
      Two, no users), applications 2, application_answers 10, attachments 0, templates 1/1,
      user_profiles 2, auth.users 2, bucket objects 2 (placeholder +
      `uploads/1791351596575-orrmzw-uat-dry-run.pdf`). Owen deleted the PDF in the dashboard
      (1.4 re-read: placeholder only). Write: one request — answers → attachments →
      applications (all, the sample's included) → vendors → `events WHERE id <> sample` →
      `auth.users NOT IN (keep-list)` (0 rows) → `[]`. Verify: events 1, event_questionnaires
      1, event_questions 7, vendors 0, applications 0, application_answers 0, attachments 0,
      questionnaire_templates 1, template_questions 1, user_profiles 2, auth.users 2 (admin +
      `+uat-org` organizer, both confirmed), storage.objects 1
      (`uploads/.emptyFolderPlaceholder`).

---

## Phase 3 — Production rollout

Phase 2 note (2026-10-07): no Phase 2 finding changes this order. The three T018 fixes
(#55, #56, #57) ride the same `dev → main` promotion; F-001 and F-005 are backlog (see
Deferred); F-003's reopen question waits on the organizers and is not a go-live gate.

Everything here hangs on one `dev → main` promotion (`dev` is 127 commits ahead of
`origin/main`, which is `66fc1dd` from 2026-09-17: the rest of spec 007, migration 013
and all of spec 009, UAT fixes #36/#37, all of spec 010). **The Production build will
fail until `SUPABASE_SERVICE_ROLE_KEY` is set on Vercel Production** (009 T017 step 3),
so the order below is strict.

- [x] **010-T011** `[P]` (read 2026-10-07 via the Management API: sign-up on, confirmations on) — Prod read-backs, read-only, can be done any time:
      "Allow new users to sign up" is on (`disable_signup: false`); read and record
      "Confirm email" (`mailer_autoconfirm`). Change nothing.
      Owner: Owen, or agent in default mode · Shape: dashboard or Management API ·
      Evidence: 010 quickstart row P1.
- [x] **009-T017** (done 2026-10-07; secret rolled, old key 401; Production-only key; templates via Management API, read-back identical) — Production configuration. (0) **Roll the prod service-role
      secret first** — it was pasted into Vercel Preview by mistake on 2026-09-27 and
      replaced, but the old value was exposed. (1) Re-read prod Site URL
      `https://vendors.holigayeventsyyc.ca` (row V4). (2) Migration 013 is already on
      prod (row P1, 2026-09-27) — confirm only. (3) Vercel → `SUPABASE_SERVICE_ROLE_KEY`
      = the new prod key, **Production scope only** (row P2). (4) Prod Email Templates:
      Invite, Reset password, Confirm signup from
      `specs/009-organizer-invites/contracts/email-templates.md` (rows P3–P5).
      Owner: Owen · Shape: dashboard · Blocked by: — · Evidence: 009 quickstart V4, P2–P5.
- [x] **007-T019** (done 2026-10-07; both rotated, CLI relinked to dev) — Rotate the database password on dev and prod (Settings → Database
      → Reset database password); confirm no local password files remain; relink the CLI
      to dev. Also closes the second "Still owed on prod" box in
      `specs/006-close-public-data-exposure/quickstart.md`.
      Owner: Owen · Shape: dashboard · Blocked by: — · Evidence: 007 quickstart T019 rows.
- [x] **007-T020 / 009-T018 (1)** (promoted 2026-10-07, `66fc1dd..94e6f6d`, Production Ready) — Promote `dev → main`:
      `git checkout main && git merge --ff-only dev && git push origin main`. Confirm
      `RESEND_API_KEY`, `EMAIL_FROM_ADDRESS` and `SUPABASE_SERVICE_ROLE_KEY` exist on
      Production first (the env guard fails the build otherwise), Production build green,
      `/apply` loads, `/api/keepalive` answers 401 without the secret.
      Owner: Owen · Shape: git + Vercel · Blocked by: 009-T017, 007-T018 (zero blockers) ·
      Evidence: 007 quickstart T020 row, 009 row P6.
- [ ] **007-T008** (vars set and `200 ok:true` proven 2026-10-07; first scheduled run seen 2026-10-08 12:33Z on both projects; open: 7-day check due 2026-10-15 → workflow + secrets deletion PR on `main`) — Vercel Production → `CRON_SECRET` and `KEEPALIVE_SUPABASE_TARGETS`
      (both projects listed). Watch the first cron run; seven days later confirm dev is
      still active. Then delete `.github/workflows/keepalive.yml` from `main` and its
      four repo secrets (agent PR).
      Owner: Owen (vars), agent (deletion PR) · Shape: dashboard + PR · Blocked by:
      007-T020 · Evidence: 007 quickstart T008 rows.
- [x] **010-T012** (run 2026-10-07; sign-up → mail → `/vendor-dashboard` all good; items 3 and 9 confirmed, PRs follow) — Production non-regression: no Production-scope
      `NEXT_PUBLIC_INVITE_ONLY`; `/login` shows Sign up and `/signup` renders; sign up a
      throwaway, record whether the "check your email" copy matched P1's confirm setting
      (UAT item 3: `signUp` in `src/lib/actions/auth.ts` discards `authData.session`)
      and that the subtitle still says "Sign up to manage vendor applications" (UAT item
      9, `src/app/(auth)/signup/page.tsx:38`); delete the throwaway. Items 3 and 9 then
      get their own small PRs.
      Owner: Owen · Shape: dashboard + browser · Blocked by: 007-T020 · Evidence: 010
      quickstart rows P2, P3.
- [x] **007-T021** (run 2026-10-08; smoke 5/5 twice, live dynamic submission, both mails, cleanup verified; 14:26 vs the 10-min target) — Prod smoke: `npm run smoke` with the prod values → exit 0; then
      the `docs/runbooks/event-week-smoke.md` click-through on production (one live
      submission per reachable form variant, both emails from the verified domain,
      signed-URL download, cleanup SQL, timed ≤ 10 min). Ticks the remaining "Still owed
      on prod" box in the 006 quickstart.
      Owner: joint · Shape: terminal + browser · Blocked by: 007-T020, 007-T019 ·
      Evidence: 007 quickstart T021 rows; 006 quickstart boxes.
- [x] **009-T018 (P7–P9)** (rehearsal 2026-10-08: `+prod-org` invited and in as organizer, P8 via 010 P3, placeholder removed; real organizer → BL-12) — First real onboarding on prod: invite a real organizer
      (P7), throwaway vendor sign-up and delete (P8), remove the auto-confirmed
      placeholder organizer from 007 T015 (P9).
      Owner: Owen · Shape: UI + dashboard · Blocked by: 007-T020 · Evidence: 009
      quickstart P7–P9.
- [x] **007-T014 / 007-T015** (closed 2026-10-08 as superseded by the invite flow; note under both tasks) — Close as superseded: real organizer accounts are created
      by the spec 009/010 invite flow (BL-06 on dev, P7 on prod), not by SQL. One docs
      commit noting that under both tasks.
      Owner: agent · Shape: docs commit (with 007-T022) · Blocked by: 009-T018.
