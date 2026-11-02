# Feature Specification: Vendor Account Linking and Contact Fields

**Feature Branch**: `011-vendor-linking-and-contact-fields`
**Created**: 2026-10-31
**Status**: Draft
**Input**: User description: "Vendor account linking and contact fields. What and why: a vendor who creates or accepts an account before applying, or who applies while signed in, never sees that application in the vendor dashboard, because an account is linked to its vendor record only once, at account creation, by exact email. The empty dashboard then tells them to apply, which still does not link. The organizers also want the application contact block changed: no phone number, and a Where can we view your products heading with up to three product links, the first required, shown the same way on the vendor profile, the organizer review page and the CSV export. The old fixed application form is retired, leaving one apply form. Owen decided the details on 2026-10-31. They are in docs/handoffs/2026-10-31-vendor-uat-findings.md under UAT2-1, UAT2-2, UAT2-5, Also decided and Spec 011 outline. Honour them rather than reopening them. Consumers: vendors on the public apply page and the vendor dashboard. Organizers on the review page and the export. In scope: linking in every order of account and application, email prefilled and locked when signed in, clear empty-state copy, the contact block on all four surfaces, legacy form removal, rollout to dev then prod. Out of scope: email body copy, the booth question, CRM, claiming an application by id. Constraints: one new append-only migration, next free number 015. Public submission stays a single transactional server-side write. The security suite covers the new behaviour. Constitution gates apply."

## Context

The organizers tested the vendor side of the training deployment on 2026-10-11. Three of their
findings are this spec (`docs/handoffs/2026-10-31-vendor-uat-findings.md`, triaged with Owen on
2026-10-31):

- **UAT2-5.** A tester applied, got the confirmation email, then opened the vendor dashboard and
  found nothing. An account is tied to its vendor record exactly once, when the account is
  created, and only when the two addresses match exactly. If the account exists first, or the
  application used a different address, nothing ever links them. The empty dashboard then says
  "Submit an application to create your vendor profile", and doing so still does not link.
- **UAT2-1.** The organizers do not want vendors' phone numbers.
- **UAT2-2.** They want the single "Website" field replaced by "Where can we view your products?
  Website, Instagram, Facebook…" with up to three links, the first required.

Also decided: the original fixed application form is retired. No event on either hosted project
can reach it (every event since spec 005 has a questionnaire), and while it exists every
contact-block change is made twice.

The handoff is the decision record. This spec distils it into testable stories and
requirements; the decisions below are settled and not reopened here.

## Clarifications

### Session 2026-10-31

- Q: When a signed-in person submits an application but the browser sends an address other than
  the account's (only possible by tampering, since the field is locked), what happens? → A: The
  account address wins: the server replaces the sent address with the account's, then submits
  and ties (FR-002, story 1 scenario 8).
- Q: Is Link 1 required on the vendor profile form as on the apply form, even for a record
  migrated with no website? → A: Yes, required on both forms; one rule, one validation. A vendor
  with no link adds one before another profile edit saves (FR-010, FR-015, story 2 scenario 8).
- Q: Do prefill-and-lock and link-at-submit apply to every signed-in account or only vendor-role
  accounts? → A: Every signed-in account, any role, mirroring the sign-up trigger; an organizer
  who applies is tied to the vendor record and still redirected away from the vendor dashboard
  (edge case "Signed-in organizer or admin on the apply page").

### Session 2026-11-02

- Q: A signed-in vendor who already has a tied vendor record opens the apply page for another
  event. Are the business fields prefilled from the record? → A: No. Only the email is prefilled
  and locked; the business fields start empty and the submission updates the stored record, as
  today (story 1 scenario 11, FR-006).
- Q: Scenario 5 says a case-only address difference matches on both the signed-in submission
  and the dashboard self-heal, but the submission write path upserts by exact address. Which
  guarantee holds? → A: The self-heal only. The submission path keeps its exact-address upsert;
  the apply form lower-cases on the way in, so mixed-case rows arise only by hand entry (story 1
  scenario 5, edge case "Mixed-case addresses").
- Q: Is the organizers' feedback on the three-link contact block, given on the training site,
  a gate for the production migration? → A: No. Production proceeds on Owen's go once the
  training walkthrough is recorded; feedback, if any, becomes a follow-up item (FR-025,
  Assumptions).

## Decisions carried in from the handoff

Owen, 2026-10-31. The plan does not relitigate them.

- **Self-heal on match.** When a signed-in vendor whose account is not yet tied to a vendor
  record opens the vendor dashboard, the app ties it to the vendor record whose address equals
  the account's address (compared case-insensitively), in both directions, in one step.
- **Link at submit.** When a signed-in person submits an application and the account's address
  matches the application's address, the vendor record and the account are tied together inside
  the same transaction as the submission itself.
- **Prefill and lock the address.** On the public apply page a signed-in person sees their
  account address in the email field and cannot change it, so the two can never drift apart.
- **Say so.** The empty dashboard states: "Applications are matched to the email address they
  were submitted with. You are signed in as <address>."
- **Not doing:** letting a vendor claim an application by its identifier. Anyone could claim
  anyone's.
- **Phone.** Remove the input and the display from the apply form, the profile form, the
  organizer review page and the export. The stored column stays, unused. The questionnaire
  builder's phone question type stays, so an organizer can still ask for a number on a specific
  event.
- **Product links.** One heading, "Where can we view your products? Website, Instagram,
  Facebook…", above three plain inputs: Link 1 required, Link 2 and Link 3 optional. Not three
  labelled boxes, so a vendor on Etsy or TikTok never has to pick a wrong box. Links are
  normalized on save (a missing `https://` is added) so every stored value opens. The organizer
  page lists them as links; the export gets Link 1–3 columns; existing website values become
  Link 1; the profile form edits the same three slots. The organizers give feedback on the shape
  once it is on the training site.
- **Legacy form.** Retired together with its submission action and validation rules, the fixed
  branch of the submission write path, and the three always-blank legacy export columns. The
  rest of exporting questionnaire answers (roadmap F-001) stays deferred.
- **One migration,** number `015` (`014` went to the booth-question seed).

## User Scenarios & Testing _(mandatory)_

### User Story 1 - A vendor sees their application whichever came first (Priority: P1)

A vendor who has an account, however they got it (self sign-up on production, an invitation
on the training deployment, or an account created after an earlier application), opens the
vendor dashboard and sees every application submitted with their account's email address. It
does not matter whether the account or the application came first, or whether they were signed
in when they applied. If they apply while signed in, the email field already holds their account
address and cannot be edited, so the application can only land under that address. If an
application genuinely used a different address, the dashboard says which address the account
is signed in with and that applications are matched by the address they were submitted with,
so the vendor knows why it is missing and what to do.

**Why this priority**: This is the reason the spec exists. A vendor whose application is
invisible to them cannot track its status, and the dashboard's own advice ("submit an
application") makes it worse by creating a second application under the same address that is
also invisible. It is the only finding that cost the testers an afternoon of confusion.

**Independent Test**: On the training deployment, with three throwaway addresses: (a) invite
address A as a vendor, accept, sign in, apply from the apply page and confirm the email field is
locked to A and the application appears on the dashboard immediately; (b) apply signed out as B,
then invite B and accept, confirm the application is listed (existing behaviour, still works);
(c) invite C and accept, then apply signed out in another browser as C, sign in and confirm the
application appears on the first dashboard load. Finally sign in as A and look at an
application submitted under a fourth address D: it is not listed and the empty-state text names
address A.

**Acceptance Scenarios**:

1. **Given** a signed-in vendor whose account has no vendor record yet, **When** they open the
   apply page for an active event, **Then** the email field shows the account address, is not
   editable, and the rest of the form is unchanged.
2. **Given** that signed-in vendor submits the application, **When** the submission succeeds,
   **Then** the application is listed on the vendor dashboard on the next load, the profile page
   shows the submitted business details, and the confirmation email is sent as today.
3. **Given** an application submitted while signed out under address X, **When** an account
   for X is created afterwards (self sign-up or invitation), **Then** that application is listed
   on the first visit to the vendor dashboard. (Existing behaviour; must keep working.)
4. **Given** an account for address X that is not tied to any vendor record, and a vendor
   record for X that was created by a signed-out submission after the account existed, **When**
   the account holder opens any vendor dashboard page, **Then** the two are tied together and
   the application is listed on that same load, with no manual step.
5. **Given** an account `jane@…` and a vendor record stored as `Jane@…` with no tie, **When**
   the holder opens the vendor dashboard (scenario 4), **Then** they still match. A signed-in
   submission always lands under the account's lower-cased address, so no case difference can
   arise on that path.
6. **Given** an account whose address matches no vendor record, **When** the holder opens the
   vendor dashboard, **Then** they see "No vendor profile linked", the sentence "Applications
   are matched to the email address they were submitted with. You are signed in as <address>."
   with their account address, and a link to the apply page.
7. **Given** an account tied to a vendor record, **When** the holder opens the dashboard,
   **Then** nothing about the record changes and the page renders exactly as today.
8. **Given** a signed-in person whose browser sends an application with an address other than
   the account's, **When** the submission is processed, **Then** the account address is used,
   never the one the browser sent.
9. **Given** a vendor record already tied to a different account, **When** any linking step
   runs for a second account with the same address, **Then** the existing tie is left alone and
   the second account is not tied to it.
10. **Given** an anonymous visitor, **When** they submit an application, **Then** no account is
    tied to anything and the submission behaves exactly as today.
11. **Given** a signed-in vendor whose account is already tied to a vendor record, **When** they
    open the apply page for another active event, **Then** the email field is prefilled and
    locked as in scenario 1 and the business fields are empty; on submit the stored record is
    updated with what they entered, as today.

---

### User Story 2 - The contact block asks what the organizers want (Priority: P2)

A vendor filling the apply form is not asked for a phone number. Under the heading "Where can
we view your products? Website, Instagram, Facebook…" they see three plain link fields; the
first is required, the other two optional. They can type `instagram.com/myshop` without a
protocol and it is stored as a working web address. The same three link fields appear on the
vendor's profile page, where they can be edited. An organizer reviewing the application sees
the links as clickable links, in order, and no phone number. The CSV export has Link 1, Link 2
and Link 3 columns and no Phone column. A vendor whose record had a website before this change
sees it as Link 1 everywhere.

**Why this priority**: It is the organizers' direct request and the change they will notice
first on the training site. It is independent of story 1 and carries the data change (the
migration) that story 3 also needs.

**Independent Test**: On the training deployment, apply with Link 1 as `etsy.com/shop/x` and
Link 2 blank, Link 3 as `https://instagram.com/x`; confirm no phone field; confirm the
organizer review page shows two clickable links that open the right pages in a new tab and no
phone row; confirm the profile page shows the same two links in slots 1 and 2 and lets the
vendor add a third; export the CSV and confirm the column set.

**Acceptance Scenarios**:

1. **Given** the apply form for any active event, **When** it renders, **Then** there is no
   phone field, and the contact block shows the heading "Where can we view your products?
   Website, Instagram, Facebook…" above three link inputs with the first marked required.
2. **Given** Link 1 is blank, **When** the vendor submits, **Then** the form shows a validation
   message on Link 1 and nothing is sent.
3. **Given** Link 1 is `instagram.com/myshop` (no protocol), **When** the vendor submits,
   **Then** it is stored and shown everywhere as `https://instagram.com/myshop`.
4. **Given** a link already starting with `http://` or `https://`, **When** submitted, **Then**
   it is stored unchanged.
5. **Given** a value that is not a web address (for example `not a link` or a `mailto:`
   address), **When** submitted, **Then** the form rejects it with a message naming the field.
6. **Given** Link 1 and Link 3 filled and Link 2 blank, **When** submitted, **Then** the two
   links are stored as the first and second links, with no gap, and shown in that order.
7. **Given** an application with two links, **When** an organizer opens its review page,
   **Then** both appear as clickable links that open the stored address in a new tab, in order,
   and there is no Phone row.
8. **Given** the vendor profile page, **When** it renders, **Then** it shows the same three
   link slots with the vendor's current links, no phone field, and saving with Link 1 blank is
   refused with a validation message; saving valid links updates what the organizer page and
   export show.
9. **Given** vendor records that held a website before this change, **When** the change is
   rolled out, **Then** each former website value appears as that vendor's Link 1 on the
   profile page, the review page and the export.
10. **Given** the CSV export, **When** it is generated, **Then** its columns are exactly:
    Business Name, Contact Name, Email, Link 1, Link 2, Link 3, Status, Submitted Date, Event,
    Organizer Notes, Business Description; links are written as stored.
11. **Given** the questionnaire builder, **When** an organizer adds a question, **Then** the
    phone question type is still offered.

---

### User Story 3 - One apply form (Priority: P3)

Every event reaches the same apply form, the per-event questionnaire form. The original fixed
form (booth preference dropdown, product category checkboxes, special requirements, photo
upload), its submission path and its export columns are gone. An event that somehow has no
questionnaire shows a clear "not accepting applications" message instead of the old form.

**Why this priority**: No vendor can reach the old form today, so retiring it changes nothing
they see. Its value is to the maintainer: stories 1 and 2 otherwise have to be built twice, and
a second write path is a second place for the linking rules to be wrong.

**Independent Test**: Search the codebase for the fixed form, its submission action, its
validation rules and the fixed branch of the submission write path; none exist. Open the apply
page for an event with a questionnaire: the questionnaire form renders. Export the CSV: no Booth
Preference, Product Categories or Special Requirements columns.

**Acceptance Scenarios**:

1. **Given** an active event with a questionnaire, **When** a visitor opens its apply page,
   **Then** the questionnaire form renders exactly as today.
2. **Given** an active event without a questionnaire, **When** a visitor opens its apply page,
   **Then** they see a message that the event is not accepting applications and no form.
3. **Given** the codebase after this change, **When** inspected, **Then** the fixed form
   component, the fixed-form submission action and its validation rules, the fixed-form client
   branch of the apply page, and the fixed branch of the submission write path no longer exist,
   and their tests are removed or rewritten against the questionnaire form.
4. **Given** the submission write path, **When** it receives a payload carrying the old
   fixed-form fields, **Then** those fields are ignored and the submission otherwise proceeds
   or fails on its own rules.
5. **Given** the organizer review page, **When** it renders any application, **Then** the
   fixed-form block (booth preference, product categories, special requirements) is gone and
   questionnaire answers render as today.

---

### Edge Cases

- **Signed-in organizer or admin on the apply page.** The address is prefilled and locked like
  anyone else's and, on a match, their account is tied to the vendor record (the sign-up trigger
  already does this for any role). The vendor dashboard still redirects them, so nothing is
  shown. Accepted; it is what the tester's own case was.
- **Two accounts, one address.** Impossible: the authentication service keeps addresses unique.
- **One account, two vendor records.** Impossible: vendor records are unique by address.
- **Vendor record tied to another account.** Never re-pointed (story 1, scenario 9). This can
  only arise by hand-editing data; it is left for the admin.
- **Signed-in submission whose account address has no vendor record.** The record is created
  by the submission and tied in the same transaction, as scenario 2.
- **Account address changed later.** Out of scope; addresses are not editable in the app.
- **Mixed-case addresses.** New matching in the dashboard self-heal is case-insensitive. The
  submission path upserts by exact address; the apply form lower-cases on the way in and a
  signed-in submission uses the account's lower-cased address, so a mixed-case row can arise
  only by hand entry. The sign-up trigger's exact match is left as it is. A vendor record
  hand-entered in mixed case and already tied: a signed-in submission creates a second,
  lower-case record that stays untied, because a tie is never re-pointed. Hand entry only;
  left for the admin.
- **Blank middle link slot.** Compacted (story 2, scenario 6), so "Link 2" always means the
  second stored link.
- **Duplicate links.** Allowed; not worth a rule.
- **Very long or non-web links.** Each link is capped (500 characters) and must be an
  `http`/`https` web address after normalization; anything else is refused with a field
  message.
- **Legacy data.** The stored phone values and the fixed-form columns stay in the database but
  are never read or written again. Both hosted projects hold none that matter (production was
  reset to a clean slate on 2026-10-08).
- **Rollout order.** The data change lands on each hosted project before the code that reads
  the new shape is promoted there, so a deploy never reads a column that is not there yet.

## Requirements _(mandatory)_

### Functional Requirements

**Linking an account to its vendor record**

- **FR-001**: When a signed-in account that is not tied to a vendor record opens any vendor
  dashboard page, the system MUST tie it to the vendor record whose address equals the
  account's address, compared case-insensitively, setting the tie in both directions in one
  step, before the page's data is read. If no such record exists, nothing changes.
- **FR-002**: When a signed-in person submits an application, the system MUST use the
  account's address as the application address regardless of what the browser sent, and MUST
  tie the account and the resulting vendor record together inside the same transaction as the
  submission. The vendor record is found or created by exact match on that lower-cased
  address, as today.
- **FR-003**: Linking MUST rely only on the signed-in identity and its verified address, never
  on a caller-supplied address or identifier, and MUST only ever tie the caller's own account.
- **FR-004**: Linking MUST NOT alter a vendor record that is already tied to a different
  account, and MUST NOT alter an account that is already tied to a vendor record.
- **FR-005**: An anonymous submission MUST behave exactly as today: no tie is created, and the
  sign-up trigger's link-on-account-creation keeps working.
- **FR-006**: On the apply page, a signed-in person MUST see their account address in the email
  field, MUST NOT be able to edit it, and the page MUST explain in one line that the address
  comes from their account. A signed-out visitor sees the editable field as today. For a
  signed-in person who already has a vendor record, only the email is prefilled; the business
  fields start empty and the submission updates the record.
- **FR-007**: Every vendor dashboard page that today shows "No vendor profile linked" MUST add
  the sentence "Applications are matched to the email address they were submitted with. You are
  signed in as <address>." with the account's address, and keep the link to the apply page.
- **FR-008**: The system MUST NOT offer any way to claim an application by its identifier.

**The contact block**

- **FR-009**: The apply form and the vendor profile form MUST NOT ask for a phone number, the
  organizer review page and the export MUST NOT show one, and no code path MUST write the phone
  column again. The column itself and the questionnaire builder's phone question type stay.
- **FR-010**: The apply form and the profile form MUST show the heading "Where can we view your
  products? Website, Instagram, Facebook…" above three plain link inputs labelled Link 1, Link 2
  and Link 3, with Link 1 required and the others optional, on both forms.
- **FR-011**: Each link MUST be trimmed, MUST have `https://` prepended when it has no
  `http://` or `https://` prefix, MUST then be a valid web address of at most 500 characters,
  and MUST be refused with a field-level message otherwise.
- **FR-012**: Stored links MUST be ordered and gap-free: blank slots are dropped and later
  links move up, so at most three links are stored and the first is always present.
- **FR-013**: The organizer review page MUST list the stored links in order as clickable links
  that open the stored address in a new tab, in place of the single Website row.
- **FR-014**: The CSV export MUST emit the columns Business Name, Contact Name, Email, Link 1,
  Link 2, Link 3, Status, Submitted Date, Event, Organizer Notes, Business Description, in that
  order, with links written as stored and blank where absent.
- **FR-015**: The vendor profile form MUST edit the same three link slots under the same
  heading, with the same validation and normalization as the apply form.
- **FR-016**: Existing website values MUST become each vendor's Link 1 as part of the data
  change, before any code reads the new shape.

**One apply form**

- **FR-017**: The fixed application form component, the apply page's fixed-form client branch,
  the fixed-form submission action and its validation schemas, and the fixed branch of the
  submission write path MUST be removed. Tests that exist only for them MUST be removed; tests
  of shared behaviour MUST be rewritten against the questionnaire form.
- **FR-018**: An active event with no questionnaire MUST show a "not accepting applications"
  message on the apply page instead of a form.
- **FR-019**: The submission write path MUST ignore fixed-form fields if a payload still carries
  them, and MUST keep its existing event, duplicate and answer-ownership checks and its error
  codes for the questionnaire form unchanged.
- **FR-020**: The organizer review page MUST stop rendering the fixed-form block.

**Data, security and tests**

- **FR-021**: All schema and write-path changes MUST ship in exactly one new append-only
  migration, number `015`: storage for the three links, the website-to-Link-1 move, the
  replacement submission write path (new contact fields, link-at-submit, fixed branch dropped),
  and the self-heal step of FR-001. Row Level Security on every touched table MUST be unchanged
  or tightened, never loosened.
- **FR-022**: Public submission MUST remain a single transactional server-side write callable
  by anonymous and signed-in visitors; the self-heal step MUST be callable only by signed-in
  users and MUST act only on the caller's own account.
- **FR-023**: The security suite MUST prove, against a real local stack: the three orderings
  (apply signed in; apply signed out then account; account then apply signed out and self-heal
  on the next dashboard read), the mixed-case match, the mixed-address non-match, the
  already-tied record left alone (FR-004), an anonymous caller refused by the self-heal step,
  a signed-in caller unable to tie any account but their own, the browser-sent address ignored
  for signed-in submissions (FR-002), and the fixed-form payload fields ignored (FR-019). The
  existing submission and invite suites MUST be updated for the new contact fields and still
  pass.
- **FR-024**: Unit tests MUST cover the apply form's locked address, the link validation and
  normalization, the three-slot profile form, the organizer page's link list, and the export
  column set.

**Rollout and documentation**

- **FR-025**: Migration `015` MUST be applied to the dev project, then the three orderings and
  the contact block walked through on the training deployment with real mailboxes and
  recorded in this spec's `quickstart.md`, before the migration is applied to the production
  project (inventory, confirm, write, verify, on Owen's go), before `dev` is promoted to
  `main` (BL-17). The organizers' feedback on the contact block, gathered from the training
  deployment, is not a gate for the production migration; any requested change is a follow-up
  item.
- **FR-026**: The same work MUST update the agent guidance (migration list, server-action list,
  route notes), the architecture document, the roadmap (the "Retire the legacy form" item), the
  specs index, the backlog Phase 5 rows and the handoff's UAT2-1/2/5 entries.

### Key Entities

- **Account**: a signed-in identity with a verified email address and a role. May be tied to
  at most one vendor record.
- **Vendor record**: a business's contact details, unique by email address: business name,
  contact name, email, description, and one to three ordered product links. May be tied to at
  most one account. The phone value is retained but no longer collected or shown.
- **Tie** (called *linking* in the plan, contracts and code): the two-way association between
  an account and a vendor record. Created at account
  creation (today), at a signed-in submission, or on the first vendor dashboard read after a
  match appears (new). Never created by a caller-supplied identifier.
- **Application**: a vendor record's submission to one event, with its questionnaire answers
  and attachments. Unchanged, except that the fixed-form fields are no longer written or shown.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: On the training deployment, in each of the three orderings (apply signed in;
  apply signed out then account; account then apply signed out), the application is listed on
  the vendor dashboard on the first load after the last step, with zero manual steps, in 3 of 3
  walkthroughs.
- **SC-002**: A vendor whose application used a different address sees, on the empty dashboard,
  the address they are signed in with and the sentence explaining the match rule.
- **SC-003**: A signed-in vendor cannot change the email on the apply page, and a tampered
  submission still lands under the account address, in 100% of attempts in the automated suite.
- **SC-004**: 100% of stored product links open as absolute web addresses from the organizer
  review page; none renders as a relative link.
- **SC-005**: No phone field, phone row or Phone column remains on the apply form, profile form,
  review page or export; the export has exactly the eleven columns of FR-014.
- **SC-006**: Exactly one new migration file exists; the security suite's new linking cases and
  the updated submission and invite cases pass in CI.
- **SC-007**: The fixed form and its submission path are absent from the codebase, and every
  active event on both hosted projects renders the questionnaire form.
- **SC-008**: Production vendors who applied before the change keep their website as Link 1
  after the migration, verified by one read-back on each hosted project.

## Assumptions

- The handoff's decisions (UAT2-1, UAT2-2, UAT2-5, "Also decided", "Spec 011 outline") are
  final; the plan decides only storage shape and mechanics.
- Email addresses on both hosted projects are verified before an account can sign in
  (confirm-email on production, invitation on the training deployment, recorded under spec 010
  FR-016), so matching on the account's address is safe. The existing sign-up trigger already
  relies on this.
- The stored phone column and the fixed-form columns on applications stay (no destructive
  schema change); nothing reads or writes them after this change. The organizer review page's
  fixed-form block goes with the form because no row on either hosted project carries that data.
- New address matching is case-insensitive; the sign-up trigger is left unchanged.
- Links are accepted only as `http`/`https` web addresses after normalization; blank middle
  slots are compacted.
- Exporting questionnaire answers (roadmap F-001) and the email body copy (UAT2-6), the booth
  question (UAT2-3/4, shipped), a CRM, and claiming an application by identifier are out of
  scope.
- Rollout follows the backlog's Phase 5 order: migration `015` to dev, training walkthrough,
  migration to prod on Owen's go, promotion in BL-17. Each task is its own PR off `dev`
  and starts only on Owen's go.
- The organizers' feedback on the link shape (handoff UAT2-2) is welcome but does not gate
  production; it is tracked as a follow-up if it arrives.
