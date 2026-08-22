# Feature Specification: Close the Public Data Exposure

**Feature Branch**: `006-close-public-data-exposure`
**Created**: 2026-08-21
**Status**: Draft
**Input**: User description: "Close the public data exposure: move public application submission into a transactional SECURITY DEFINER RPC, drop the broad anon RLS policies, codify storage policies in SQL, remove the ungated deleteFile action, fix required-answer semantics, and add the first RLS integration test suite with CI."

## Context

Anyone holding the app's public API key — which ships in the JavaScript bundle to
every browser — can today read three tables directly through the database's public
REST endpoint: every vendor's name, **email, and phone**; every application's status
and **internal organizer notes**; and every attachment path. The same root cause
produces two silent-failure bugs in the public application flow: returning
applicants' contact updates are silently discarded, and a failed submission strands
an orphaned application record.

This exposure is live in production now. The fix approach was decided in the
2026-07 architecture review (`docs/ROADMAP.md` Tier 1) and pressure-tested in the
006 brainstorming session; this spec records the requirements and acceptance
criteria for that work.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Vendor data is private again (Priority: P1)

A member of the public (or a malicious actor) holding the app's public API key can
no longer read vendor contact details, application records, internal organizer
notes, submitted answers, or attachment paths by querying the data API directly.
They also cannot delete stored files. What is *meant* to be public — the list of
active events and their published application questions — remains publicly
readable, so the application form still renders for anonymous visitors.

**Why this priority**: This is the live data exposure — real vendor PII and
internal notes are dumpable today. Everything else in this spec exists to make
closing it safe.

**Independent Test**: With no app involved, issue direct data-API requests using
only the public key against the private tables and confirm zero records come back;
confirm the active-events and published-questions reads still return data; confirm
no file-deletion pathway is publicly invocable.

**Acceptance Scenarios**:

1. **Given** only the public API key, **When** a direct read is issued against the
   vendors, applications, attachments, or application-answers tables, **Then** zero
   records are returned.
2. **Given** only the public API key, **When** a direct write (insert, update, or
   delete) is attempted against those tables, **Then** no data is created, changed,
   or removed.
3. **Given** an anonymous visitor on the public apply page, **When** the page loads
   for an active event, **Then** the event details and its published questions
   display exactly as before.
4. **Given** any unauthenticated caller, **When** they attempt to invoke a
   file-deletion capability, **Then** no such capability exists (the ungated
   `deleteFile` action and its dev-only `/test-upload` page are removed).

---

### User Story 2 - Applying still works, and is now all-or-nothing (Priority: P1)

A vendor applying through the public form — via either the legacy static form or
the dynamic questionnaire — has an unchanged experience: they submit, get a
confirmation, and their application (with answers and any uploaded files) reaches
the organizers. Behind the scenes the entire submission now succeeds or fails as a
single unit, and a returning applicant's updated contact details are actually
saved instead of being silently discarded.

**Why this priority**: Dropping the public policies without a privileged
submission path would break the app's core function. This story is the other half
of story 1 — they ship together.

**Independent Test**: Complete public submissions end-to-end on both form variants
(new vendor, returning vendor with changed contact info, with and without file
uploads) and verify the records land; force a mid-submission failure and verify no
partial records remain.

**Acceptance Scenarios**:

1. **Given** a brand-new vendor on an active event's form, **When** they submit a
   valid application, **Then** the vendor record, application, and any answers or
   attachment records are all created, and the confirmation email flow behaves as
   before.
2. **Given** a returning vendor whose phone number changed, **When** they submit a
   new application with the updated details, **Then** the stored vendor contact
   info reflects the change (fixes the silent-discard bug).
3. **Given** a vendor who has already applied to an event, **When** they submit
   again, **Then** the submission is rejected with the same friendly
   "already applied" message as today, and no duplicate records are created.
4. **Given** an event that is not accepting applications (draft or closed),
   **When** a submission is forced at it, **Then** it is rejected at the data
   layer, not just by the UI.
5. **Given** a submission that fails partway (e.g., an answers write fails),
   **When** the failure occurs, **Then** no orphaned application, vendor, answer,
   or attachment records remain (fixes the orphaned-row bug).

---

### User Story 3 - Required questions actually require answers (Priority: P2)

An organizer reviewing applications can trust that every question marked
"required" has a real answer. Today an empty string or an empty choice list
slips through because the check only tests that an answer key is present.

**Why this priority**: A data-integrity bug in the same submission code the P1
work rewrites — folding it in avoids touching that code twice. Not itself a
security issue.

**Independent Test**: Submit dynamic applications with present-but-empty answers
for each answer kind and confirm rejection; confirm genuinely answered
submissions still pass.

**Acceptance Scenarios**:

1. **Given** a required text question, **When** the submitted answer is an empty
   or whitespace-only string, **Then** submission is rejected with a clear
   per-question message, both in the browser and at the server.
2. **Given** a required multi-choice question, **When** the submitted answer is an
   empty selection list, **Then** submission is rejected the same way.
3. **Given** a required file-upload question, **When** no file reference is
   included, **Then** submission is rejected the same way.
4. **Given** an optional question left empty, **When** the form is submitted,
   **Then** submission succeeds.

---

### User Story 4 - Security rules are version-controlled and continuously proven (Priority: P2)

The maintainer can see every access rule — database policies *and* file-storage
policies — in the migration history, and a test suite that exercises the real
database proves the guarantees in stories 1–3 on every pull request, so a future
change that reopens the hole fails CI instead of shipping.

**Why this priority**: This is how the spec proves itself and stays proven. It
depends on stories 1–2 existing but is independently testable.

**Independent Test**: Run the security test suite against a freshly reset local
database and see it pass; check that file-storage access rules exist in a
migration file rather than only in dashboard configuration; open a PR and see the
suite run in CI.

**Acceptance Scenarios**:

1. **Given** a freshly reset local database with all migrations applied, **When**
   the security test suite runs, **Then** it verifies: private tables return zero
   rows to public-key reads; public-key direct writes fail; submission succeeds
   end-to-end for new and returning vendors, with and without answers and
   attachments; duplicates are rejected; a forced mid-submission failure leaves no
   orphans; and the intentionally public reads still work.
2. **Given** the file-storage bucket, **When** its access rules are inspected,
   **Then** they are defined in a migration file and match the previously
   dashboard-configured behavior (public uploads for the apply flow keep working).
3. **Given** any pull request, **When** CI runs, **Then** the security suite runs
   against a disposable local database stack and must pass.
4. **Given** a developer without the local database stack running, **When** they
   run the normal unit-test command, **Then** the security suite is skipped
   rather than failing.

---

### Edge Cases

- A submission naming question IDs that don't belong to the event's questionnaire
  is rejected and leaves no partial records.
- A returning vendor matched by email with *unchanged* details submits again to a
  different event: exactly one new application, no vendor duplication.
- Files uploaded to storage before a submission that never completes remain
  orphaned in storage (accepted, pre-existing behavior; database records stay
  consistent — see Assumptions).
- Two near-simultaneous submissions from the same new vendor email must not
  create two vendor records or bypass the duplicate-application check.
- An authenticated organizer's dashboard reads of applications, answers, and
  attachments (including the two browser-side reads) continue to work unchanged
  after the public policies are dropped.
- The legacy static form and the dynamic form remain behaviorally identical to
  today from the applicant's perspective.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Direct data-API reads using only the public key against the vendors,
  applications, attachments, and application-answers tables MUST return zero
  records.
- **FR-002**: Direct data-API writes (insert, update, delete) using only the
  public key against those tables MUST NOT create, modify, or remove any data.
- **FR-003**: Active events and their published questionnaire content MUST remain
  publicly readable (the intentionally public reads are preserved).
- **FR-004**: Public application submission (both the legacy static form and the
  dynamic questionnaire form) MUST execute as a single all-or-nothing operation
  covering vendor create-or-update, duplicate check, application creation, and
  answers/attachment record creation.
- **FR-005**: A returning applicant's changed contact details MUST be persisted on
  submission.
- **FR-006**: A duplicate application (same vendor and event) MUST be rejected
  with the existing friendly message and MUST NOT create records.
- **FR-007**: Submissions MUST be accepted only for events open for applications,
  enforced at the data layer itself (the privileged submission path re-checks
  event status rather than relying on the dropped public policies).
- **FR-008**: A submission failure at any step MUST leave no partial database
  records.
- **FR-009**: Required questions MUST reject present-but-empty answers, with
  emptiness defined per answer kind (text, choice list, file reference), enforced
  both client-side and server-side.
- **FR-010**: No publicly invocable file-deletion capability may exist; the
  `deleteFile` server action and the `/test-upload` dev page are removed.
- **FR-011**: File-storage bucket access rules MUST be defined in version-
  controlled migrations, preserving current behavior (anonymous uploads for the
  apply flow continue to work).
- **FR-012**: An automated security test suite exercising a real database (not
  mocks) MUST verify FR-001 through FR-008 and MUST run in CI on every pull
  request, while being skippable locally when the database stack isn't running.
- **FR-013**: All schema and policy changes MUST ship as new append-only
  migrations, and generated database types MUST be regenerated afterward.

### Key Entities

- **Vendor**: A business applying to events; holds the PII being exposed today
  (contact name, email, phone). Created or updated during public submission.
- **Application**: Links a vendor to an event; carries status and internal
  organizer notes (exposed today). Created during public submission.
- **Application answer**: A vendor's response to one questionnaire question;
  created in bulk during dynamic submission.
- **Attachment**: A record pointing at an uploaded file in storage; created
  during legacy submission and readable today by anyone.
- **Event / questionnaire content**: The intentionally public data — active
  events and their published questions.
- **Submission operation**: The new single privileged, transactional unit that
  performs the whole public submission on behalf of an anonymous applicant.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Direct data-API probes with the public key against each of the four
  private tables return zero records — verified in production after deployment
  via the rollout checklist, and permanently by the automated suite.
- **SC-002**: 100% of the end-to-end submission matrix passes on both form
  variants: new vendor, returning vendor with changed contact info, with and
  without file uploads, duplicate rejection.
- **SC-003**: A forced mid-submission failure leaves zero orphaned records,
  verified by an automated test.
- **SC-004**: The security suite runs on every pull request and completes in
  under five minutes of CI time.
- **SC-005**: Zero behavior change is observable to a legitimate applicant or an
  organizer using the dashboard (aside from previously-lost contact updates now
  being saved and empty required answers now being rejected).

## Assumptions

Decisions carried in from ROADMAP Tier 1 and the 006 brainstorming session
(2026-08-21) — recorded here so the plan doesn't relitigate them:

- **Branching**: This branch is cut from the `005-dynamic-questionnaires` tip;
  merge order is 005 → 006 → `dev`. The privileged submission path must cover the
  dynamic form, so building on 005 avoids two overlapping migrations.
- **Approach**: One privileged transactional database function (following the
  existing `create_event_with_default_questionnaire` pattern) serving both form
  variants, with optional answers and attachments inputs — not a service-role
  client in the request path, and not two parallel functions. App-layer
  validation (schema validation, conditional-visibility re-evaluation) stays in
  the server actions, ahead of the database call.
- **Tier 2 boundary**: Only the required-answer-semantics fix is folded in from
  spec 005's outstanding work (it lives in the code this spec rewrites). The
  builder atomic-save, template-column decision, and manual walkthrough remain
  spec 005 work.
- **Scope of anon policy removal**: Seven policies are dropped — six broad
  vendor/application/attachment policies plus the single anonymous
  application-answers insert policy (the handoff's mention of two was off by
  one). The three intentionally public read policies are kept.
- **`deleteFile` is deleted, not gated**: Its only caller is the dev-only
  `/test-upload` page, which is removed with it. If organizers ever need file
  deletion, it returns as a role-checked action.
- **Storage-file orphans are out of scope**: Files uploaded before an abandoned
  or failed submission already orphan in storage today; this spec guarantees
  database consistency only. A cleanup job is a future nicety.
- **Dashboard reads are safe**: The organizer dashboard's browser-side reads run
  as authenticated users and are covered by existing authenticated policies,
  verified as part of the security suite.
- **Rollout**: Dev environment first (apply migrations, run the suite, click
  through both forms), then production with a manual probe checklist. The app is
  barely used, so no maintenance window is needed.
- **Prod state**: Production has migrations through 008 applied; the 005-branch
  migration (009) and this spec's migration land together during rollout, in
  order.
