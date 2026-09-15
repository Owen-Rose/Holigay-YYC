# Feature Specification: Production Readiness (Milestone M3)

**Feature Branch**: `007-production-readiness`
**Created**: 2026-09-14
**Status**: Draft
**Input**: User description: "Production readiness for the Holigay Vendor Market — milestone M3. Spec number 007, short name production-readiness. All work is solo. Dashboard work is tracked as [manual] tasks with evidence recorded in quickstart.md, as specs 005 and 006 did. The M3 gate is a solo technical rehearsal of the full event lifecycle on the dev preview (US4); the organizer session is M4, out of scope. No schema, RLS or auth changes. No Claude co-authoring trailers on commits or PRs."

## Context

The platform is safe (spec 006) and feature-complete (spec 005), and both are live on
production. Nothing has been proven to work *as a whole* in the hosted environments:
transactional email still leaves from a test sender that cannot reach real vendors, both
hosted database projects have already auto-paused once for inactivity, there is no backup
of either project, no way to tell in ten minutes whether production is healthy on event
day, and no one has ever run an event end to end on a deployed build.

M3 closes that gap. The reasoning record — decisions, facts from exploration, ordered
tracks, the rehearsal script and the task phases — is `docs/M3-PLAN.md`; this spec distils
it into testable stories and requirements and links back. All work is done and verified by
the maintainer alone. The organizer usability session is milestone M4 and out of scope.
No schema, row-security or authentication changes are made.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Email arrives from the real domain, and a failed send is never silent (Priority: P1)

A vendor who applies, and a vendor whose application status changes, receives the email
from the organization's own domain with the organization's name as sender. If an email
cannot be sent, the person triggering it sees a warning instead of a silent success. A
production deployment that is missing its sender configuration refuses to build rather
than quietly falling back to the test sender.

**Why this priority**: Production email is silently broken today. Every other story's
proof (rehearsal, smoke run, sign-up) depends on observable email.

**Independent Test**: Send one email of each kind (application received from each form
variant, status update) to a mailbox the maintainer controls and confirm each arrives from
the verified domain; deliberately break the email provider and confirm the applicant sees a
warning while the application is still recorded; deploy to production with the sender
variable unset and confirm the build fails with a message naming the missing variable.

**Acceptance Scenarios**:

1. **Given** the sending domain is verified and the sender configured on both preview and
   production deployments, **When** a vendor submits an application, **Then** the
   "application received" email arrives within one minute from the verified domain with the
   expected from-name, and is not in spam.
2. **Given** an organizer changes an application's status, **When** the status email is
   sent, **Then** it arrives from the verified domain.
3. **Given** the email provider fails, **When** a vendor submits through the dynamic form,
   **Then** the application is saved and the vendor sees a visible warning that the
   confirmation email could not be sent — the same behaviour the legacy form and the
   status-update flow already have.
4. **Given** a production deployment with the sender address unset or still pointing at
   the test-sender domain, **When** the build runs, **Then** it fails with an aggregated
   message naming every missing or invalid variable.
5. **Given** a preview or local build, **When** the sender address is unset, **Then** the
   build still succeeds (only production is strict), so work continues while the domain
   is pending.

---

### User Story 2 - The hosted projects never pause and their data can be restored (Priority: P1)

Both hosted database projects stay awake without anyone remembering to visit them, and the
maintainer can take a complete copy of a project — schema, data and uploaded files — and
restore it, having practised once.

**Why this priority**: Both projects were found paused on 2026-08-22. A pause during event
week takes the public form offline; the free tier has no automatic backups.

**Independent Test**: Confirm the scheduled keep-alive has run at least once with a green
log and that the dev project did not pause in the following week; follow the backup/restore
runbook once on dev and confirm row counts and one file download match.

**Acceptance Scenarios**:

1. **Given** the keep-alive schedule is configured on the production deployment, **When** a
   day passes, **Then** every listed project (dev and prod) has been read once and the
   schedule log shows success.
2. **Given** one listed project is unreachable, **When** the keep-alive runs, **Then** the
   run is reported as failed so it shows red in the schedule log, and the report names which
   target failed.
3. **Given** a caller without the scheduler's secret, **When** they call the keep-alive
   endpoint, **Then** they are refused and no project is touched.
4. **Given** the backup runbook, **When** the maintainer follows it against a project,
   **Then** it produces a schema dump, a data dump and a copy of the uploaded-files bucket,
   and the database password is entered interactively and never written to a file.
5. **Given** a dev data dump, **When** it is restored into a disposable local database,
   **Then** table row counts match the source and one uploaded file can be downloaded
   through the app's normal signed link.
6. **Given** any restore target, **When** the data came from production, **Then** it is never
   restored into dev (test-data-only project).

---

### User Story 3 - The maintainer can prove production healthy in ten minutes on event day (Priority: P2)

On the morning of an event the maintainer runs one command and a short click-through and
knows, with a pass/fail per check, that the public form is up, private data is still
private, every open event has a questionnaire, submissions work and organizers can review
them.

**Why this priority**: This is the event-week safety net and the automated successor to
spec 006's manual probe checklist. It needs US1 for the email check but nothing else.

**Independent Test**: Run the smoke check against production with only the public key and
see every check print pass and the process exit zero; break one condition (e.g. point it at
a project with no active event) and see a non-zero exit; follow the runbook click-through
and its cleanup steps.

**Acceptance Scenarios**:

1. **Given** a healthy production, **When** the smoke check runs, **Then** it prints a
   pass line for each check and exits zero in well under a minute.
2. **Given** any check fails, **When** the smoke check runs, **Then** it prints which check
   failed and exits non-zero.
3. **Given** only the public key, **When** the check reads the vendors, applications,
   attachments and answers tables, **Then** zero rows come back (the 006 probe, automated).
4. **Given** the active events list, **When** the check inspects each event, **Then** every
   active event has a questionnaire with at least one question.
5. **Given** the public submission operation, **When** the check calls it with an invalid
   payload, **Then** it receives the operation's own validation error (proving it exists
   and validates before writing), not "not found".
6. **Given** the organizer-only operations, **When** called with only the public key,
   **Then** each is refused with a permission error.
7. **Given** the runbook, **When** the maintainer follows the ten-minute click-through
   (submit a test application, confirm the email, review it, change status), **Then** the
   cleanup steps remove the test rows, including the event that cannot be deleted from the
   UI while it has applications.
8. **Given** the old always-passing database verification script, **When** the new check
   ships, **Then** the old script is gone and the admin-seeding script accepts any role.

---

### User Story 4 - The full event lifecycle works end to end on a preview with no one intervening (Priority: P2)

Playing both organizer and vendor, the maintainer runs a scripted dry run of a whole event
on the dev preview deployment: create and publish an event with a custom questionnaire,
apply to it three ways, review and change statuses with emails, sign up as the vendor and
see the application, close and delete. Every step has an expected result written before the
run and an observed result written during it. This rehearsal is M3's gate.

**Why this priority**: It is the only end-to-end proof on a deployed build and it depends on
US1, US2 and US5 being in place. Every deviation becomes a triaged finding.

**Independent Test**: Run the script on the dev preview playing both roles; every expected
result observed, all emails delivered from the verified domain, no browser console errors,
findings log committed with each deviation given a severity.

**Acceptance Scenarios** (the eleven script steps):

1. **Given** an organizer signed in on the preview, **When** they create a draft event, seed
   its questionnaire from the template, add a yes/no question and a short-text question
   shown only when the first is Yes, mark one question required, reorder, save once and
   hard-reload, **Then** everything is present exactly as saved.
2. **Given** the draft event, **When** the organizer publishes it, **Then** the builder locks
   and the public apply page lists the event.
3. **Given** a new vendor on the apply page, **When** they attach a PDF, trigger the
   branch, leave the required question empty and submit, **Then** they are blocked with a
   visible error; **When** they fill it and submit, **Then** they see success and the
   "application received" email arrives from the verified domain within a minute.
4. **Given** the same vendor email with a changed phone number, **When** a second
   application is submitted, **Then** it is handled as a returning vendor per the 006
   rules; **When** a third, different vendor applies with no file, **Then** it succeeds.
5. **Given** the organizer's application list, **When** they filter by event and status,
   search a business name and export CSV, **Then** each works and the export downloads
   (its lack of questionnaire answers is recorded as an expected finding).
6. **Given** an application's detail page, **When** opened, **Then** all answers including
   the branch answer show and the attachment opens via a signed link.
7. **Given** typed-but-unsaved organizer notes, **When** status is set to approved,
   **Then** the email arrives without the notes (recorded); **When** notes are saved and
   status set to waitlisted, **Then** the email includes the notes.
8. **Given** an application, **When** status is set back to pending, **Then** no email is
   sent, by design.
9. **Given** the applicant email, **When** the vendor signs up on the vendor dashboard,
   **Then** their profile links to the existing vendor record and their applications and
   statuses are visible read-only.
10. **Given** the event with applications, **When** the organizer closes it and tries to
    delete it, **Then** deletion is refused; **When** they create a throwaway draft event
    and delete it, **Then** it is gone.
11. **Given** the finished run, **When** cleanup runs, **Then** the dev rows are left or
    cleared with the runbook steps and the findings log is committed.

---

### User Story 5 - Organizers exist on both projects and can sign in (Priority: P3)

The real organizer accounts exist on dev (for the M4 session) and on prod (for launch), with
the organizer role, and can sign in and land on the dashboard. Sign-up confirmation emails
on the hosted projects go through the organization's verified sender rather than the hosted
platform's restricted built-in mailer, and the auth redirect addresses point at the real
deployment addresses.

**Why this priority**: Needed by step 9 of the rehearsal and by M4, but it is dashboard
configuration with no code and it can be done any time after the sender domain is verified.

**Independent Test**: Sign in as each organizer on each project and reach the dashboard;
sign up a throwaway vendor on the preview and confirm the confirmation email arrives from
the verified domain and its link returns to the preview.

**Acceptance Scenarios**:

1. **Given** each hosted project, **When** the maintainer checks the auth mail settings,
   **Then** the built-in mailer restriction is confirmed and custom sending through the
   verified domain is configured, with the confirm-email setting recorded.
2. **Given** each hosted project, **When** the site and redirect addresses are inspected,
   **Then** they match the deployment addresses (preview for dev, production for prod).
3. **Given** an organizer account created on a project with the organizer role, **When**
   they sign in, **Then** they land on the organizer dashboard, not the vendor dashboard.
4. **Given** a vendor signing up on a hosted project, **When** they submit the form,
   **Then** they receive a confirmation email from the verified domain whose link returns
   them to that deployment.

---

### Edge Cases

- The sending-domain verification depends on another person (the DNS owner) and may be
  delayed. Only the strictly email-dependent proofs wait for it; the production-only build
  guard means preview builds are unaffected, and the rehearsal can run on the fallback
  sender (which delivers only to the account owner's mailbox) with the two email steps
  marked "passed on fallback" and re-run after verification.
- A project has paused before the keep-alive first runs: the keep-alive reports red, which
  is the intended signal; the project is restored by hand and the schedule resumes.
- The keep-alive must list production explicitly rather than inferring it, so a
  misconfigured target list cannot silently protect only one project.
- A restore drill leaves the CLI linked to the wrong project; the runbook ends by relinking
  to dev.
- The event created in the rehearsal cannot be deleted from the UI while it has
  applications; cleanup uses the runbook's database steps.
- Unsaved organizer notes are not included in the status email; the rehearsal records this
  deliberately and the decision (warn, auto-save, or accept) is an M4 organizer judgement.
- The CSV export omits questionnaire answers; expected finding, pre-triaged as a
  single-session fix if organizers want it.
- Closed events cannot be reopened (transitions are forward-only); likely backlog.
- A rehearsal finding that would need a schema, row-security or auth change is not fixed
  under this spec; it opens a new spec.
- Real vendor data must never be placed on dev; the preview is public-by-link on the hobby
  hosting plan and dev holds test data only.

## Requirements *(mandatory)*

### Functional Requirements

**Email (US1)**

- **FR-001**: All transactional email from production MUST be sent from the organization's
  verified sending domain with the configured from-name.
- **FR-002**: A production deployment MUST fail its build when the sender address is missing
  or still names the test-sender domain, and when the email provider key is missing; the
  failure message MUST name every missing or invalid variable at once.
- **FR-003**: Preview and local builds MUST NOT require the sender address or provider key
  (the strict check applies to production deployments only).
- **FR-004**: A failed confirmation email on the dynamic application form MUST surface a
  visible warning to the applicant while the application remains saved, matching the
  legacy form and the status-update flow.
- **FR-005**: Every environment variable the application reads MUST be validated in one
  place with a documented contract; the environment documentation (project guide, example
  env file, developer setup guide) MUST be current, including the sender address and the
  correct integration branch name.

**Uptime and backups (US2)**

- **FR-006**: A scheduled keep-alive MUST read from every listed hosted project (dev and
  prod, listed explicitly) at least once a day, MUST refuse callers without the scheduler's
  secret, and MUST report failure (non-success status naming the failed target) when any
  target cannot be read.
- **FR-007**: A backup/restore runbook MUST cover schema, data and the uploaded-files
  bucket for a hosted project, MUST require the database password interactively (never in
  a file), and MUST forbid restoring production data into dev.
- **FR-008**: One restore drill MUST be executed on dev data and its date, row-count
  comparison and file-download result recorded in the runbook and the ops record.

**Smoke test (US3)**

- **FR-009**: A read-only smoke check runnable with the deployment address and the public
  key MUST verify: the landing and apply pages respond; the four private tables return
  zero rows to the public key; every active event has a questionnaire with at least one
  question; the public submission operation exists and validates before writing; and the
  organizer-only operations refuse the public key. Each check MUST print pass/fail and the
  process MUST exit non-zero on any failure.
- **FR-010**: An event-week runbook MUST describe a ten-minute click-through (test
  submission, email, review, status change) and the cleanup steps for the rows it creates.
- **FR-011**: The obsolete always-passing database verification script MUST be removed and
  the admin-seeding script generalized to seed any role.

**Lifecycle rehearsal (US4)**

- **FR-012**: A rehearsal script MUST exist in the repository with the eleven lifecycle
  steps, each with an expected result written before the run and a column for the observed
  result, plus a findings template with severities: blocker (fix before M4), Tier 3 (fix
  in M3 if a single-session change), backlog (goes through the roadmap scope-line test).
- **FR-013**: The rehearsal MUST be run solo on the dev preview deployment, playing both
  roles, and its findings log committed under the spec directory.
- **FR-014**: Every blocker-severity finding MUST be fixed and merged before dev is promoted
  to main; any finding needing a schema, row-security or auth change MUST open a new spec
  rather than be fixed under this one.

**Accounts (US5)**

- **FR-015**: On both hosted projects the auth mailer MUST be confirmed and configured to
  send through the verified domain, the site and redirect addresses set to the matching
  deployment addresses, and the confirm-email setting recorded.
- **FR-016**: The real organizer accounts MUST exist with the organizer role on both hosted
  projects and be able to sign in to the organizer dashboard.

**Close-out (all)**

- **FR-017**: The database passwords on both hosted projects MUST be rotated at the end of
  the milestone and the CLI relinked to dev.
- **FR-018**: The four "Still owed on prod" items from spec 006 (manual probe, one live
  submission per form variant, storage-policy visual check, password rotation) MUST be
  completed and ticked; the prod smoke run satisfies the live-submission item.
- **FR-019**: Every manual (dashboard or terminal) task MUST be recorded with evidence in
  the spec's ops record before it is marked done, following the spec 005/006 precedent.
- **FR-020**: No schema, row-security or authentication change MUST be made under this
  spec; no new package dependency MUST be added.

### Key Entities

- **Environment contract**: The named set of configuration values each deployment tier
  (local, preview, production) must supply, with which are required where.
- **Keep-alive target**: A hosted project address plus its public key, listed explicitly
  for the daily read.
- **Backup set**: A schema dump, a data dump and a copy of the uploaded-files bucket for
  one hosted project at one time.
- **Rehearsal findings log**: The dated, committed record of the eleven-step run: expected
  vs observed per step, each deviation with a severity and a decision.
- **Ops evidence record**: Per-project (dev / prod) tables of what was configured or
  verified, when, and the observed proof — the spec's `quickstart.md`.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: All three email kinds (dynamic-form receipt, legacy-form receipt, status
  update) are delivered from the verified domain on production, observed during the prod
  smoke run.
- **SC-002**: The keep-alive has at least one green scheduled run, and the dev project does
  not pause in the seven days after it.
- **SC-003**: One restore drill is recorded with matching row counts on every table and one
  successful file download.
- **SC-004**: The smoke check passes against production and the whole event-day check
  (script plus click-through) takes ten minutes or less.
- **SC-005**: The rehearsal reaches all eleven steps with every expected result observed,
  zero maintainer interventions outside the script, zero browser console errors on the
  pages used, and zero open blocker findings at promotion time.
- **SC-006**: At close, `main` equals `dev`, every roadmap M3 checklist box and every spec
  006 "still owed" box is ticked with a PR or date beside it, and the passwords on both
  projects have a rotation date recorded.
- **SC-007**: Every manual task in the task list has its evidence row in the ops record.

## Assumptions

Decisions carried in from `docs/M3-PLAN.md` (2026-09-13/14) so the plan does not
relitigate them:

- **Solo-first**: Everything technical is done and verified by the maintainer alone. The
  organizer session is M4's entry gate (usability and judgement calls only), not an M3
  exit criterion.
- **Sending-domain delay**: The domain may be delayed by the DNS owner. Only the
  email-specific proofs wait for it; the build guard keys on production deployments (not on
  the build mode) so previews build without the sender, and the rehearsal may run on the
  fallback sender with the two email steps re-run after verification. Organizer accounts
  are created from the dashboard with auto-confirm and need no mailer.
- **Hosting tiers stay free/hobby**: no paid database or hosting tier; keep-alive is repo
  work on a daily schedule (weekly is too close to the seven-day pause rule); backups are
  a manual dump/restore routine; previews are public-by-link and dev holds test data only.
- **Two new file-level patterns, no dependency**: one environment-validation module (a
  public part and a server-only part) and one scheduled keep-alive endpoint with its
  schedule file. No new package dependencies; the smoke check uses what the repo has.
- **Spec vs branch**: This spec covers all M3 work; each repo task is one branch off `dev`
  and one PR, commits tagged `[007-Txx]`. A rehearsal finding needing schema, row-security
  or auth work opens a new spec.
- **Precedent for manual work**: Dashboard and terminal tasks are `[manual]` tasks with an
  "evidence:" clause recorded in `quickstart.md`, as spec 005 (T062) and spec 006 (T004,
  prod rollout record) did.
- **Out of scope**: the organizer invite backend (manual SQL suffices at two organizers),
  browser-automation tests, error monitoring or structured logging, deferred email sending,
  retiring the legacy form, and any builder extension the rehearsal suggests (roadmap
  scope-line table applies).
- **Commit hygiene**: No Claude co-authoring trailers or "Generated with" lines on any
  commit or PR.
