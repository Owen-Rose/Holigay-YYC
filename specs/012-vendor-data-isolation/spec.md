# Feature Specification: Vendor Data Isolation

**Feature Branch**: `012-vendor-data-isolation`
**Created**: 2026-11-21
**Status**: Draft
**Input**: User description: "Vendor data isolation. A signed-in vendor account can reach data that belongs to other vendors or to the organizers, and production has open vendor sign-up, so anyone can make such an account. Four gaps, found by reading the policies on 2026-11-21: any signed-in account can read or mint a link to any file in the attachments bucket; any signed-in account can delete any file in that bucket; any signed-in account can list the email address and role of every account through the users_with_roles view; a vendor can read the private organizer notes on their own applications by querying the API directly, because the notes are a column on a row the vendor may read. Nothing automated proves vendors are isolated from each other. Separately, the public submission function checks that an event is active but not that its application deadline has passed, so a form left open past the deadline still submits; it rides in the same migration. What it should do: a vendor reads only their own vendor record, applications, answers and uploaded files, never anything that belongs to another vendor, never organizer notes, never the account list. Organizers and admins keep everything they have today. A submission to an event whose deadline day has ended in Edmonton is refused; the deadline day itself stays open, the same rule the public listing uses. An automated suite against a real database proves each statement for two vendors, an organizer, an admin and an anonymous caller. Who relies on the current behaviour and must keep working: anonymous upload on the apply form, which happens before any vendor or application row exists and names files without an owner; organizers opening files from the review page through short-lived signed links; a vendor opening their own files from their application page; the admin Team page listing accounts with the pending-invite flag; the template list showing organizers who created each template; the invite flow reading the account view with the service role; the organizer review page and the CSV export reading organizer notes; the hosted-project reset runbook removing bucket objects. In scope: read and delete rules for the attachments bucket; who can read users_with_roles; keeping organizer notes from vendors at the database; refusing a submission past the deadline inside the submission function; a cross-vendor isolation suite under src/test/security; rolling the migration out to local, dev and prod; bringing the docs up to date. Out of scope: how uploads are named or when they happen; the anonymous upload rule; cleaning up orphaned uploads; role in JWT claims; any interface change a tightened rule does not force; making template updates atomic. Constraints: one append-only migration numbered 016; no new packages; the service-role client stays contained to the existing admin module; row level security stays the authority and application code never stands in for it; every rule ships with a real-database test that fails before the migration and passes after; the existing security suites keep passing, changed only where a test asserted the old broad behaviour; constitution 1.1.3. Background facts, the consumer list and the open design questions are in Track B of docs/superpowers/plans/2026-11-21-post-launch-hardening.md; leave those questions open for clarify."

## Context

Production has open vendor sign-up: anyone with an email address can create a vendor account on
`vendors.holigayeventsyyc.ca`. Spec 006 closed what an anonymous caller can reach. This spec
closes what a signed-in vendor can reach that is not theirs.

The 2026-11-21 status review read the access rules and found four gaps and one unrelated hole in
the submission path (`docs/superpowers/plans/2026-11-21-post-launch-hardening.md`, Track B):

| Gap | What a signed-in vendor account can do today |
| --- | --- |
| Read any file | Download, or create a working link to, any file in the uploads bucket, whoever uploaded it |
| Delete any file | Delete any file in the uploads bucket. Nothing in the app deletes files, so nobody needs this today |
| List all accounts | Read the email address and role of every account, including the organizers and the admin |
| Read organizer notes | Read the organizers' private notes on their own applications by asking the API directly. The vendor pages leave the notes out, but the database hands them over |
| Late submission | Submit to an event after its application deadline, from a form that was left open or a link that was kept. Only the event's status is checked |

None of the four is reachable through the app's own pages; each needs a signed-in vendor to
query the API directly. That is still anyone, because sign-up is open. And nothing automated
proves that one vendor is isolated from another, so a later change could reopen any of these
without a test failing.

The late-submission hole is not an isolation gap. Owen folded it in on 2026-11-21 so the same
migration carries it.

### What relies on today's behaviour

Each of these works today and must work the same afterwards:

- **Anonymous upload on the apply form.** A file is uploaded before the application is
  submitted, so before any vendor or application record exists, and the stored file name
  carries no owner.
- **Organizers opening files** from the application review page through short-lived links.
- **A vendor opening their own files** from their application page, the same way.
- **The admin Team page**, which lists every account with its role and its pending-invite flag.
- **The template list**, which shows organizers who created each template.
- **The invite flow**, which reads the account list with the service role to decide between a
  new invitation and a re-send.
- **The organizer review page and the CSV export**, which read organizer notes; organizers
  write them.
- **The hosted-project reset runbook**, which removes files from the bucket.

## Clarifications

### Session 2026-11-22

- Q: A stored file name carries no owner, and the submission stores whatever file path the
  browser sends. How is a file tied to its vendor? → A: By reference, first claim wins. A vendor
  may open a file only when one of their own submitted applications refers to it (a file answer
  or an attachment record), and the submission refuses a file that another application already
  refers to, so a known or leaked name cannot be claimed (FR-001, FR-002, story 1 scenarios 8
  to 10).
- Q: Who may delete a file through a signed-in session? → A: Nobody. No page deletes files, and
  the reset runbook works through the dashboard, the CLI or the service-role key, so it is
  unaffected. The existing storage case that asserts an organizer can delete changes to assert
  the refusal (FR-003, FR-023, story 1 scenarios 3 to 5).
- Q: Vendors lose the account list. What may an organizer read, given the template list shows
  each template's creator from that list? → A: The account list is admin-only. Organizers get a
  separate narrow read that returns only the email address of accounts that created a template,
  so the template page looks the same (FR-008, FR-010, story 2 scenarios 5 to 7).
- Q: Notes are a field on a record the vendor may read, and vendors and organizers query as the
  same kind of signed-in user. How are the notes withheld? → A: Notes move to their own store
  that only organizers and admins can read or write. Existing notes are carried over in the
  same migration and the application record a vendor reads no longer holds them. This is the
  table change Track B's guard rail said must come back to Owen; approved here, still one
  migration (FR-012, FR-013, story 3 scenario 7).
- Q (raised by `/speckit-plan`): three existing rules let a signed-in vendor add rows directly,
  around the submission path: an attachment record on their own application naming any file,
  an answer on any application of an active event, and an application to any event. With a
  file belonging to whichever application refers to it, the first two let one vendor claim
  another's file in a single request, and the third skips the deadline. Close them here? → A:
  Yes, in the same migration. A vendor and an anonymous caller add applications, answers and
  attachment records only through the submission path; organizers and admins keep adding them
  directly (FR-030, FR-021's added row). Nothing in the app used the direct route.

## User Scenarios & Testing _(mandatory)_

### User Story 1 - A vendor's uploaded files are theirs alone (Priority: P1)

A vendor uploads product photos and sometimes documents with their application. Only that
vendor and the organizing team can open those files. Another vendor, however they ask, cannot
download one, cannot create a link to one, cannot delete one and cannot make it theirs by
naming it in an application of their own. Nobody deletes a file from a signed-in session at
all. Nothing changes for the vendor looking at their own application, for an organizer
reviewing it, or for a visitor uploading a file on the apply form.

**Why this priority**: Files are the most sensitive thing a vendor hands over and the only data
another vendor can destroy today. A deleted file cannot be recovered from inside the app.

**Independent Test**: With two vendor accounts A and B that each have a submitted application
with a file, sign in as A and ask the storage service directly for B's file: download, link,
delete. All three are refused and B's file is still there. Still as A, submit an application
that names B's file: it is refused. Then, as A, open A's own application page and open the
file; as an organizer, open both files from the review page; signed out, upload a file on the
apply form. All of those work as before.

**Acceptance Scenarios**:

1. **Given** vendors A and B each with a submitted application that has a file, **When** A asks
   to download B's file by its stored name, **Then** the request is refused and no file content
   is returned.
2. **Given** the same two vendors, **When** A asks for a link to B's file, **Then** no working
   link is issued.
3. **Given** the same two vendors, **When** A asks to delete B's file, **Then** the file is
   still there and still opens for B and for an organizer.
4. **Given** vendor A's own submitted application, **When** A asks to delete their own file,
   **Then** it is refused and the file still opens.
5. **Given** any file, **When** an organizer or an admin asks to delete it from a signed-in
   session, **Then** it is refused and the file is still there.
6. **Given** vendor A's own submitted application, **When** A opens a file from their
   application page, **Then** it opens exactly as today.
7. **Given** any submitted application, **When** an organizer or an admin opens one of its
   files from the review page, **Then** it opens exactly as today.
8. **Given** a file that B's submitted application refers to, **When** A (or anyone) submits an
   application that names the same file, **Then** the submission is refused and nothing is
   stored.
9. **Given** that refused attempt, **When** A asks for the file afterwards, **Then** it is
   still refused to A and still opens for B.
10. **Given** a file that was uploaded but never attached to a submitted application, **When**
    any vendor asks for it, **Then** it is refused; an organizer's access to it is whatever it
    is today.
11. **Given** a visitor who is not signed in, **When** they pick a file on the apply form,
    **Then** the upload succeeds exactly as today, and the visitor still cannot download, link
    to or delete any file.
12. **Given** a signed-in vendor filling the apply form, **When** they pick a file and submit,
    **Then** the upload and the submission succeed as today and the file opens from their
    application page afterwards.
13. **Given** a signed-in account with no vendor record tied to it, **When** it asks for any
    file, **Then** it is refused.

---

### User Story 2 - The account list is not a vendor's to read (Priority: P2)

The list of accounts, with each person's email address and role, is for the admin who manages
the team. A vendor asking for it gets nothing: not the organizers' addresses, not the admin's,
not other vendors'. An organizer asking for it gets nothing either; what an organizer does get
is the email address of whoever created a template, which is all the template list needs. The
admin's Team page, the invitation flow and the template list keep working.

**Why this priority**: It exposes every account holder's email address and tells an attacker
exactly which accounts are organizers and admins. It ranks below files only because nothing can
be destroyed through it.

**Independent Test**: Sign in as a vendor and ask the API directly for the account list:
nothing comes back. Sign in as the admin and open the Team page: every account is listed with
its role and its pending-invite flag. Send an invitation to a new address and re-send one to a
pending address: both behave as today. Sign in as an organizer and open the template list: each
template still shows who created it. As that organizer, ask the API directly for the account
list: nothing comes back.

**Acceptance Scenarios**:

1. **Given** a signed-in vendor, **When** they ask for the account list directly, **Then** they
   receive no account's email address or role, including their own row through that list.
2. **Given** a visitor who is not signed in, **When** they ask for the account list, **Then**
   they are refused as today.
3. **Given** the admin, **When** they open the Team page, **Then** every account appears with
   its email address, role and pending-invite flag, as today.
4. **Given** the admin, **When** they invite a new address or re-send to a pending one, **Then**
   the flow reads what it needs and behaves as today.
5. **Given** an organizer, **When** they open the template list, **Then** each template still
   shows its creator's email address, exactly as today.
6. **Given** an organizer, **When** they ask for the account list directly, **Then** they
   receive no account's email address or role.
7. **Given** an organizer, **When** they ask for template creators directly, **Then** they
   receive the email address of accounts that created a template and nothing else: no role, no
   pending-invite flag, no account that created no template. A vendor or an anonymous caller
   asking the same receives nothing.
8. **Given** an account whose role was just changed, **When** it next asks for the account
   list, **Then** the answer follows its current role, not the one it had.

---

### User Story 3 - Organizer notes stay with the organizers (Priority: P3)

Organizers write private notes on an application while they review it. A vendor never receives
those notes, whichever way they ask, including a direct API request for their own application.
Organizers keep reading and writing notes on the review page, and the notes column stays in the
CSV export.

**Why this priority**: The notes are candid working remarks about a vendor, written on the
understanding that the vendor will not read them. The exposure is limited to a vendor's own
applications, which is why it ranks third.

**Independent Test**: As an organizer, write a note on vendor A's application. Sign in as A and
ask the API directly for that application with every field: the note is not in the answer. A's
application page renders as today. As the organizer, reopen the review page and export the CSV:
the note is in both.

**Acceptance Scenarios**:

1. **Given** an application of vendor A's with an organizer note, **When** A asks the API for
   that application and names the notes field, **Then** the note is not returned.
2. **Given** the same application, **When** A asks for it without naming fields, **Then** the
   note is not returned either.
3. **Given** the same application, **When** A opens their application list and detail pages,
   **Then** they render exactly as today.
4. **Given** the same application, **When** an organizer or an admin opens its review page,
   **Then** the note is shown and can be edited and saved, as today.
5. **Given** applications with notes, **When** an organizer exports the CSV, **Then** the
   Organizer Notes column carries them, as today.
6. **Given** any application, **When** a vendor tries to write a note on it, **Then** the write
   is refused, as today.
7. **Given** notes written before this change, **When** the change is applied, **Then** every
   one of them is still shown on the review page and in the export, and none of them is in
   anything a vendor can read.

---

### User Story 4 - A submission after the deadline day is refused (Priority: P4)

An event's application deadline is a calendar day. Once that day has ended in Edmonton, the
event no longer takes applications, even from a form that was opened before the deadline or
reached by a saved link. On the deadline day itself the form still submits. An event with no
deadline stays open for as long as it is active. This is the rule the public event listing
already uses to decide what to show.

**Why this priority**: It is a correctness hole, not a privacy one, and the organizers can
decline a late application by hand. It is here because the same migration replaces the
submission path.

**Independent Test**: With three active events (deadline yesterday, deadline today, no
deadline), submit an application to each directly: the first is refused with a message that
says the event is not accepting applications, the other two succeed.

**Acceptance Scenarios**:

1. **Given** an active event whose deadline day ended yesterday in Edmonton, **When** anyone
   submits an application to it, **Then** the submission is refused, nothing is stored, and no
   email is sent.
2. **Given** an active event whose deadline is today in Edmonton, **When** a vendor submits at
   any time before the day ends there, **Then** the submission succeeds as today.
3. **Given** an active event with no deadline, **When** a vendor submits, **Then** the
   submission succeeds as today.
4. **Given** a vendor who opened the form before the deadline and submits after the deadline
   day has ended, **When** the refusal comes back, **Then** the form shows it as the same
   on-screen message a refused submission shows today and keeps what the vendor entered.
5. **Given** an event that is draft or closed, **When** anyone submits, **Then** it is refused
   exactly as today, with the same message and code.

---

### User Story 5 - Isolation is proven on every change (Priority: P2)

The maintainer can see, on every pull request, that one vendor cannot reach another vendor's
data or the organizers', and that the organizers and the admin can still do their work. The
proof runs against a real database with two vendors, an organizer, an admin and an anonymous
caller. Each rule this spec adds has a test that fails on the database as it is today and
passes once the change is applied.

**Why this priority**: Without it the four fixes are one careless migration away from being
undone, and nobody would know. It ranks with story 2 because it is how every other story is
shown to be done.

**Independent Test**: Run the security suite against a local database without the new
migration: every new case for stories 1 to 4 fails. Apply the migration and run it again: every
case passes, and so does every suite that existed before.

**Acceptance Scenarios**:

1. **Given** the database before this change, **When** the new isolation cases run, **Then**
   each case that states a rule added by this spec fails.
2. **Given** the database after this change, **When** the whole security suite runs, **Then**
   every new case and every existing case passes.
3. **Given** an existing case that asserted the old broad behaviour (for example, that an
   organizer can delete a file), **When** this spec changes that behaviour, **Then** that case
   is changed to assert the new rule and no other existing case is edited.
4. **Given** a pull request that loosens any of these rules, **When** the checks run, **Then**
   at least one isolation case fails.

---

### Edge Cases

- **Upload that never becomes an application.** A visitor uploads a file and abandons the form.
  The file belongs to no vendor, so no vendor can open it. Removing such files is out of scope.
- **Between upload and submit.** Nothing reads a file back before the application is submitted,
  so a vendor not yet being able to open a file they just uploaded changes nothing they can see.
- **A file name that is guessed or leaked.** Names are long and random, but the rule does not
  rest on that: knowing a name lets a vendor neither open the file nor claim it, because a file
  an application already refers to cannot be named by another.
- **An upload claimed before its owner submits.** Someone who named a visitor's file in their
  own application before the visitor submitted would hold it, and the visitor's submission
  would be refused. That needs a file name only the visitor's browser has; accepted.
- **A refused or failed submission.** It stores nothing, so it leaves no reference behind and
  the same vendor's retry with the same file is not blocked by their own earlier attempt.
- **The status email.** When an organizer changes an application's status, the saved note goes
  to the vendor in that email, under "Note from the Organizer". The organizers chose this
  (spec 007, finding F-002) and it does not change. What this spec closes is a vendor reading
  notes through the database: a note saved since the last email, or one on an application
  whose status has not changed.
- **Links issued before the change.** They are short-lived and expire on their own; none is
  revoked.
- **Both kinds of stored file reference.** Files recorded as application attachments and files
  recorded as answers to a file question follow the same rule.
- **An organizer who also has a vendor record.** Spec 011 lets any account apply. Such an
  account keeps everything its organizer role gives it.
- **Role changes.** A vendor promoted to organizer gains organizer access on their next
  request; an organizer returned to vendor loses it on theirs.
- **A vendor record tied to no account.** Nobody reads it as a vendor; organizers see it as
  today.
- **The deadline day boundary.** The day is Edmonton's calendar day, including across the
  daylight-saving changes, never the server's or the visitor's.
- **A deadline set or moved while a form is open.** The rule is checked when the submission
  arrives, against the deadline stored at that moment.
- **The reset runbook.** It clears the bucket through the dashboard, the CLI or the
  service-role key, never a signed-in session, so removing delete does not touch it.
- **Notes during rollout.** Between the migration and the code that reads the new place
  reaching a hosted project, no note may be lost and none may become readable by a vendor; the
  plan states how.
- **Rollout order.** On each hosted project the migration and the code that goes with it land
  in an order that leaves every listed consumer working in between; the plan states that order.

## Requirements _(mandatory)_

### Functional Requirements

**Uploaded files**

- **FR-001**: A vendor MUST be able to download, and to obtain a link to, a file only when one
  of their own submitted applications refers to it, whether as an answer to a file question or
  as an attachment record. Every other file in the bucket MUST be refused to them, including
  files that no application refers to.
- **FR-002**: The submission path MUST refuse a submission that names a file another
  application already refers to. The check MUST be made inside the single transactional
  submission write, for every caller, and a refused submission MUST store nothing.
- **FR-003**: No signed-in session MUST be able to delete a file: not a vendor's own, not
  another vendor's, and not as an organizer or an admin. The reset runbook's ways of clearing
  the bucket (dashboard, CLI, service-role key) are not signed-in sessions and MUST keep
  working.
- **FR-004**: Organizers and admins MUST keep the ability to open any file through a
  short-lived link, as today.
- **FR-005**: Upload MUST be unchanged: a visitor who is not signed in and a signed-in vendor
  can both upload on the apply form, and files are named as today.
- **FR-006**: An anonymous caller MUST remain unable to download, link to or delete any file.
- **FR-007**: The file rules MUST apply equally to both kinds of stored file reference and to
  files uploaded before this change.

**The account list**

- **FR-008**: Only an admin MUST be able to read the account list. A vendor and an organizer
  MUST receive no account's email address, role or pending-invite flag from it, by any request.
- **FR-009**: The admin MUST keep reading the full list with role and pending-invite flag (the
  Team page), and the invite flow's service-role read MUST keep working.
- **FR-010**: Organizers and admins MUST have a separate, narrower read that returns only the
  email address of accounts that created a template, enough for the template list to show each
  creator as it does today. It MUST return no role, no pending-invite flag and no account that
  created no template, MUST return nothing to a vendor or an anonymous caller, and MUST decide
  who is asking from the signed-in session alone.
- **FR-011**: An anonymous caller MUST remain refused the account list, as spec 009 left it.

**Organizer notes**

- **FR-012**: Organizer notes MUST be held in their own store that only organizers and admins
  can read or write. A vendor MUST NOT receive notes for any application, their own included,
  through any read the database offers them.
- **FR-013**: Every note that exists when the migration runs MUST be carried into the new store
  by that migration, with none lost, and afterwards the application record a vendor can read
  MUST hold no notes.
- **FR-014**: A vendor MUST keep reading everything else about their own applications that the
  vendor pages show today.
- **FR-015**: Organizers and admins MUST keep reading notes on the application list, the review
  page and the CSV export, and MUST keep writing them, with nothing on those pages changing.
  Vendors MUST remain unable to write them.

**What a vendor reads**

- **FR-016**: A vendor MUST be able to read only their own vendor record, their own
  applications, the answers to those applications and the file references of those
  applications. The same records of any other vendor MUST return nothing.
- **FR-017**: Organizers and admins MUST keep every read and write they have today, with two
  deliberate removals: deleting a file from a signed-in session (FR-003), and an organizer's
  read of the account list (FR-008).

**The deadline**

- **FR-018**: The submission path MUST refuse a submission to an event whose application
  deadline day has ended in Edmonton, MUST accept one on the deadline day itself, and MUST
  treat an event with no deadline as open, matching the rule the public listing uses.
- **FR-019**: The check MUST be made inside the single transactional submission write, for
  anonymous and signed-in callers alike, so no caller can bypass it.
- **FR-020**: A late submission MUST be refused the way a submission to a non-active event is
  refused today, so the apply form shows its existing on-screen message with no interface
  change. Every other check and error the submission path has today MUST be unchanged.

**Proof**

- **FR-021**: A cross-vendor isolation suite MUST run against a real database, alongside the
  existing security suites, with five callers: vendor A, vendor B, an organizer, an admin and
  an anonymous caller, plus a signed-in account with no vendor record for story 1 scenario 13.
  It MUST state and check, per caller:

  | Statement | Vendor on their own | Vendor on another vendor's | Organizer / admin | Anonymous |
  | --- | --- | --- | --- | --- |
  | Read the vendor record | allowed | nothing | allowed | refused |
  | Read applications | allowed, without notes | nothing | allowed | refused |
  | Read answers | allowed | nothing | allowed | refused |
  | Read file references | allowed | nothing | allowed | refused |
  | Download a file | allowed | refused | allowed | refused |
  | Obtain a link to a file | allowed | refused | allowed | refused |
  | Delete a file | refused | refused | refused | refused |
  | Upload a file | allowed | n/a | allowed | allowed |
  | Submit naming a file another application refers to | n/a | refused | refused | refused |
  | Add an application, answer or attachment record directly | refused | refused | allowed | refused |
  | Read organizer notes | refused | refused | allowed | refused |
  | Write organizer notes | refused | refused | allowed | refused |
  | Read the account list | refused | refused | admin allowed; organizer refused | refused |
  | Read template creators' email addresses | refused | refused | allowed | refused |
  | Submit after the deadline day | refused | n/a | refused | refused |
  | Submit on the deadline day or with no deadline | allowed | n/a | allowed | allowed |

- **FR-022**: Every rule this spec adds or tightens MUST have at least one case in that suite
  that fails against the database before the migration and passes after it.
- **FR-023**: The existing security suites MUST keep passing. An existing case MAY be changed
  only where it asserted the old broad behaviour, or where it read organizer notes from the
  place they are moved out of (FR-012), and the change MUST be named in the pull request that
  makes it. Five are known. One asserted the old behaviour: the storage case asserting that an
  organizer can delete a file becomes a case asserting that the delete is refused. Four follow
  the notes, with what they assert unchanged: the shared fixture that seeds a note, the two
  anonymous-caller cases that check the note is still there, and the organizer list case that
  mirrors the application's own read.

**Constraints**

- **FR-024**: All database changes MUST ship in exactly one new append-only migration, number
  `016`, including the notes store and the carrying-over of existing notes. No earlier
  migration is edited.
- **FR-025**: Row Level Security MUST remain the authority for every rule above. Application
  code MUST NOT stand in for a rule the database does not enforce, and no rule on any touched
  object MUST be loosened to keep a consumer working; a consumer that would break gets a
  narrower read path of its own.
- **FR-026**: The service-role client MUST stay contained to the existing admin module; no
  page or loader gains it.
- **FR-027**: No new package MUST be added, and no interface MUST change unless a tightened
  rule forces it. The constitution's gates (version 1.1.3) apply to every task unchanged.

**Rollout and documentation**

- **FR-028**: The migration MUST be applied to the local stack, then to the dev project, then
  probed on the training deployment with two throwaway vendor accounts (A cannot open, delete
  or claim B's file, cannot list accounts, cannot read notes; a late submission is refused; an
  organizer does their usual work and still sees earlier notes and template creators), with
  the result recorded in this spec's `quickstart.md`, before it is applied to the production
  project (inventory, confirm, write, verify, on Owen's go) and before `dev` is promoted to
  `main`.
- **FR-029**: The same work MUST bring the documents up to date: the agent guidance (migration
  list, database state, recent changes), the architecture document's security section, the
  roadmap's Tier 3 items this closes, the specs index, the backlog's UAT-10 entry, the
  migrations map, and the reset runbook where it describes who can delete.

**Direct writes** (added in planning, 2026-11-22)

- **FR-030**: A vendor and an anonymous caller MUST NOT be able to add an application, an
  answer or an attachment record except through the single transactional submission write, so
  that the file rule (FR-002) and the deadline rule (FR-019) cannot be stepped around.
  Organizers and admins MUST keep adding them directly, as today.

### Key Entities

- **Account**: a signed-in identity with an email address and a role (vendor, organizer or
  admin). May be tied to one vendor record.
- **Account list**: the admin's view of every account: email address, role, when the role
  changed, and whether an invitation is still pending. Read by the admin only.
- **Template creator**: the account that created a questionnaire template. Organizers and
  admins can read its email address, and nothing else about it, apart from the account list.
- **Vendor record**: a business's contact details. Tied to at most one account; that account is
  the only vendor who may read it.
- **Application**: a vendor record's submission to one event. Carries its status, its answers
  and its file references. It no longer carries the organizers' notes.
- **Organizer notes**: private remarks about one application, kept apart from the application
  record, written and read by organizers and admins only.
- **Uploaded file**: a file in the uploads bucket, stored under a name that carries no owner.
  It becomes a vendor's when a submitted application of theirs refers to it, and at most one
  application may refer to it; until then it belongs to nobody. No signed-in session can delete
  it.
- **Event**: has a status and an optional application deadline, a calendar day read in
  Edmonton.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: With two vendor accounts on the training deployment, 0 of the attempts by one to
  download, link to or delete the other's file succeed, and the other's file is intact
  afterwards.
- **SC-002**: 0 submissions that name a file another application already refers to are
  accepted, and the first vendor still opens the file after each attempt.
- **SC-003**: A vendor account and an organizer account each receive 0 email addresses and 0
  roles from the account list; the organizer's template list shows the creator of every
  template that has one.
- **SC-004**: A vendor account receives organizer notes in 0 of its reads of its own
  applications, however the request is worded, and 100% of the notes that existed before the
  migration are shown to an organizer after it.
- **SC-005**: All eight consumers listed under "What relies on today's behaviour" work with no
  visible change, each checked once on the training deployment and recorded.
- **SC-006**: A submission to an event whose deadline day has ended is refused in 100% of
  attempts; one on the deadline day and one with no deadline succeed.
- **SC-007**: Every row of the FR-021 table has at least one automated case; all of them pass
  on every pull request, and each case for a new rule was seen failing before the change.
- **SC-008**: Exactly one new migration file exists, and no existing security case was changed
  other than the five FR-023 names.
- **SC-009**: The production migration is applied and verified, and the event-week smoke check
  passes before and after the promotion.

## Assumptions

- The five facts and the consumer list in Track B of
  `docs/superpowers/plans/2026-11-21-post-launch-hardening.md` were re-read against the
  migrations on 2026-11-21 and hold; the plan quotes them.
- The four design questions Track B left open were answered by Owen on 2026-11-22
  (Clarifications). Left to the plan, and settled in `research.md` (R1, R6 to R8, R11): the
  shape of the notes store and whether the old notes field is removed or emptied; the order of
  migration and code on each hosted project; the form of the narrow template-creator read; how
  a file reference is matched to a stored file.
- The notes store is the one table change in this spec, approved in Clarifications. If the plan
  finds it needs a second migration or another table change, that comes back to Owen instead of
  widening this spec.
- A vendor's reads of their own vendor record, applications, answers and file references are
  already limited to their own by the existing rules; this spec proves that with the suite and
  leaves those rules as they are.
- The write rules on vendor records and applications are not in scope, with one exception. If
  building the suite shows a vendor can write something that is not theirs, it is reported to
  Owen, not folded in silently. Planning found three such rules (direct adds of applications,
  answers and attachment records); they were reported and Owen folded them in on 2026-11-22
  (Clarifications, FR-030). Beyond those, the one write the suite asserts is that a vendor
  cannot write organizer notes.
- A file that no submitted application refers to is no vendor's. Organizers keep whatever
  access they have to such files today; removing them is out of scope.
- The app uploads a fresh file for every submission, so one application per file blocks nothing
  a vendor does through the form.
- Deleting a file is not something any page does today, so removing it changes nothing a person
  sees. If a delete button is ever wanted, it arrives with its own rule.
- The late-submission refusal reuses the wording and code of today's "not accepting
  applications" refusal, and the refusal for a file already referred to appears through the
  same on-screen message the form shows for any refused submission, so the apply form needs no
  change. Specific wording for either is a follow-up if Owen wants it.
- "Today in Edmonton" means the same calendar-day rule the public listing uses (shipped as
  BL-20): no deadline, or a deadline of today or later, is open.
- Out of scope, as given: how uploads are named or when they happen; the anonymous upload rule;
  cleaning up orphaned uploads; role in JWT claims; any interface change a tightened rule does
  not force; making template updates atomic.
- No constitution amendment is expected; the work runs under version 1.1.3.
- Each task is its own pull request off `dev` and starts only on Owen's go; the hosted-database
  steps happen with Owen present.
