# Backlog — organizer UAT and go-live

Compiled 2026-10-06 from every open branch, PR, spec task list, quickstart "owed" row,
the ROADMAP M3 checklist and the 2026-09-27 UAT findings. This is the single ordered
list of what stands between today and (a) inviting real organizers to the training
deployment and (b) going live on production with a clean environment.

**Status 2026-10-08:** (b) is done — production has been live since 2026-10-07. Phases 0–3
are complete and archived (see below); Phase 4 is the live list.

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

## Phases 0–3 — complete (archived)

Phase 0 (repo hygiene, 2026-10-06), Phase 1 (before the first organizer invite, 2026-10-06,
PRs #46–#51), Phase 2 (organizer UAT, 2026-10-06/07, PRs #52 and #55–#57) and Phase 3
(production rollout, 2026-10-07/08, PRs #58/#59 plus the dashboard work recorded in the
007/009/010 quickstarts) are all ticked. Their items and evidence records moved verbatim to
`docs/archive/backlog-2026-10-06-phases-0-3.md` on 2026-10-08 (BL-10). Outcome: `dev` → `main`
promoted 2026-10-07 (`66fc1dd..94e6f6d`), production live on `vendors.holigayeventsyyc.ca`,
prod smoke 5/5 with a live submission 2026-10-08, prod data 0 events / 0 vendors / 0 objects.

Housekeeping 2026-10-08 (BL-02-style, Owen's go in chat): the squash-merged remote branches
`uat-3-signup-session-message` and `uat-9-signup-subtitle` (#59, #58) deleted; `main` still
awaits the single Phase 4 promotion (Owen runs it — auto mode denies pushes to `main`).

---

## Phase 4 — Go-live clean slate and docs truth-up

- [x] **BL-08** (run 2026-10-08, near no-op — see record) — Prod reset right before the first real event, using BL-04. Keep Owen's
      admin and the real organizers; remove every test event, vendor, application,
      attachment, bucket object and throwaway user from Phase 3. Inventory read →
      Owen confirms → write → verify. (Prod was last wiped 2026-09-19; Phase 3 adds test
      rows again.)
      Owner: Owen's go, agent executes in default mode · Shape: SQL + storage ·
      Blocked by: 007-T021, 009-T018 · Done when: verify query recorded under this item.
      **Record (2026-10-08, ~22:00 MDT; Management API read path, default mode, prod
      `hgmfjvjlxrhdojwlkgap`).** Runbook §1.1 inventory: `events` 0, `event_questionnaires` 0,
      `event_questions` 0, `vendors` 0, `applications` 0, `application_answers` 0, `attachments` 0,
      `questionnaire_templates` 0, `template_questions` 0, `user_profiles` 2, `auth.users` 2,
      `storage.objects` (attachments) 1 — only `uploads/.emptyFolderPlaceholder` (0 bytes). §1.2:
      the maintainer's admin (created 2025-12-26) and the `+prod-org` organizer from 009 P7
      (created 2026-10-08), both confirmed. Phase 3's smoke rows were already removed by 007
      T021, so **no write was needed**. Decision (Owen, in chat): the `+prod-org` organizer
      **stays** — it is the maintainer's own alias and the only organizer seat on prod until
      BL-12. Verify query (re-run after BL-13): `events` 0, `vendors` 0, non-placeholder bucket
      objects 0. Observation, not acted on: `questionnaire_templates` is 0 on prod, so the
      builder's "seed from template" has nothing to offer there until a template is created.
- [x] **BL-09** (run 2026-10-08) — Final `npm run smoke` against prod after the reset; record the date
      in `docs/runbooks/event-week-smoke.md`.
      Owner: agent · Shape: terminal · Blocked by: BL-08.
      **Record (2026-10-08, 22:11 MDT).** Run right after the Phase 4 promotion
      (`94e6f6d..e342cf6`) reached Production (Vercel status `success`; `/`, `/apply`, `/login`,
      `/signup` → 200, `/api/keepalive` without a header → 401, the #58 sign-up subtitle live):
      `PASS app-pages`, `private-tables-closed`, `questionnaire-invariant (no active events)`,
      `submit-rpc-event-gate`, `organizer-rpcs-denied` — all 5, exit 0. Anon key from
      `supabase projects api-keys`. Dated entry in `docs/runbooks/event-week-smoke.md`.
- [x] **009-T019** (PR #60 merged 2026-10-08) — Docs and constitution PATCH per FR-031: CLAUDE.md Epic 4 row
      ("Partial … pending service-role client" is wrong — spec 009 shipped it),
      `docs/ARCHITECTURE.md` line 224 ("one TODO (`team.ts` invite stub)" no longer
      exists), `docs/ROADMAP.md` current-state row "Organizer invites: UI only", notes
      under 007 T013/T015 and 008 T008/T013, archive TASKS 4.2.x, constitution 1.1.2.
      Owner: agent · Shape: PR · Blocked by: 009-T018 (dates).
- [x] **007-T022** (PR #61 merged 2026-10-08) — M3 close-out: tick every M3 checklist box in `docs/ROADMAP.md` with
      PR or date (Resend domain → T002/T003 2026-09-20; keep-alive → T008; backups and
      drill → T010 2026-09-17; env module → PR #10; organizer accounts → BL-06/P7;
      smoke → T011/T021); set the 007, 009 and 010 rows in `specs/README.md` to shipped
      with PRs and dates; rewrite the "Current Development Phase" and "Recent Changes"
      paragraphs in CLAUDE.md; remove the dead `docs/uat/<date>-organizer-dry-run.md`
      reference from `docs/M3-PLAN.md`; confirm `git diff main dev` is empty.
      Owner: agent · Shape: PR · Blocked by: 007-T021, 009-T019.
- [x] **BL-10** (PR #62 merged 2026-10-08) — Mark M3 done and M4 entered in `docs/ROADMAP.md` "Milestones to
      production"; move spec 008 to a "post-launch" note in `specs/README.md`; tick the
      M3 exit criteria in `docs/M3-PLAN.md`; archive this backlog's completed phases
      with a closing note.
      Owner: agent · Shape: PR · Blocked by: 007-T022.
- [ ] **BL-12** (also covers **prod**: 009 P7 on 2026-10-08 was a rehearsal with `+prod-org`, so the real organizers are invited on both hosts here) — Invite the real organizers from `/dashboard/team` (role picker →
      Organizer). Until then the organizer seat is Owen on the `+uat-org` account (BL-06).
      Record who (role only, no addresses) and when in
      `specs/010-invite-only-uat/quickstart.md`, and tell them what to test.
      Owner: Owen · Shape: UI · Blocked by: BL-10 · Done when: the organizers have signed
      in and land on `/dashboard`.
- [x] **BL-13** (added and run 2026-10-08) — `/forgot-password` live mail on
      **prod**: the reset template was set (009 row P4) but never exercised by a real mail.
      Request a reset for an existing prod account (Owen's admin or the `+prod-org`
      organizer) → mail from `noreply@holigayeventsyyc.ca` with the §2 body → link →
      `/set-password` signed in → new password → `/dashboard`. Record the date and link host
      under this item and cross-reference 009 quickstart P4. Run alongside BL-09.
      Owner: joint · Shape: UI + mailbox · Blocked by: nothing · Done when: recorded here.
      **Record (2026-10-08, ~22:15 MDT).** Agent (Chrome extension) submitted
      `/forgot-password` on `vendors.holigayeventsyyc.ca` for the maintainer's admin address →
      neutral "If that address has an account, a reset link is on its way." Owen: mail from
      `noreply@holigayeventsyyc.ca`, link host `vendors.holigayeventsyyc.ca` (`/auth/confirm`,
      type recovery) → landed signed in on `/set-password` → new password → `/dashboard`.
      Corroborated by a read-only prod query: `auth.users.last_sign_in_at` 2026-10-09 04:16Z
      (the link's `verifyOtp`), `updated_at` 04:18Z (the password change). 009 quickstart P4
      annotated. Pass.
- [x] **BL-14** (added and run 2026-10-09) — Serve the training deployment at
      `training.holigayeventsyyc.ca`: Vercel branch domain (Preview / `dev`) on the
      `holigay-yyc` project, one GoDaddy CNAME `training` → `2dca14a070d5bcca.vercel-dns-017.com`
      (the same per-project target as `vendors`), dev Supabase `site_url` → the new host and
      the host appended to `uri_allow_list`.
      Design: `docs/superpowers/specs/2026-10-09-uat-custom-domain-design.md`; plan:
      `docs/superpowers/plans/2026-10-09-uat-custom-domain-plan.md`.
      Owner: joint (agent drives Chrome + Management API, Owen signed in) · Shape: dashboards +
      API + docs PR · Blocked by: nothing · Done when: an emailed link's host is the new domain.
      **Record (2026-10-09).** Vercel row Valid Configuration on branch `dev` (`vendors` still
      Production); GoDaddy zone 12 → 13 records (reached through Delegate Access → Access now);
      HTTPS `200 0` after a ~2 min certificate wait; `/signup` 404 on the new host (invite-only
      intact). Management API read-back `site_url` = `https://training.holigayeventsyyc.ca`,
      allow-list = git-dev, uat vercel.app, training (each `/**`). `/forgot-password` on the
      new host for `+uat-org` → neutral message → Owen opened the mail and clicked the link →
      landed signed in on `training.holigayeventsyyc.ca/dashboard`. (A first mail, opened late,
      reported the link expired; a fresh request worked.) `uat-holigay-yyc.vercel.app` and
      `vendors.holigayeventsyyc.ca` 200; `vendors`/`send`/`rsend`/`resend._domainkey` unchanged
      (dig diff empty). Pass.

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
- **Organizer judgement calls, decided 2026-10-07** (Phase 2 session, verbatim answers in
  the rehearsal log): CSV export lacks questionnaire answers and shows blank legacy
  Booth/Categories/Requirements columns for dynamic-form rows (F-001) — "backlog"; the
  duplicate-application refusal is a four-second toast with no inline message (F-005) —
  "later"; closed events cannot be reopened (F-003) — "backlog with the close copy change"
  (copy shipped in #55; reopen itself waits on the organizers). Unsaved-notes-in-email
  (F-002) and the missing event filter (F-006) were fixed in Phase 2.

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
