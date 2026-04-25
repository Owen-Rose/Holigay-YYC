# Feature Specification: Per-Event Dynamic Questionnaires

**Feature Branch**: `005-dynamic-questionnaires`  
**Created**: 2026-04-25  
**Status**: Draft  
**Input**: User description: "Add per-event dynamic questionnaires to the vendor application form, plus a reusable questionnaire-template library. Organizers need typed question building blocks (11 question types, required toggles, options, ordering, basic show-if branching) so each event's application form can be tailored. Templates are saved org-wide and copy-on-attach. Epic 7 deferred in docs/archive/TASKS.md — this is greenfield."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Organizer Builds a Per-Event Questionnaire (Priority: P1)

An organizer opens a draft event and uses the questionnaire builder to design the application form for that event. They can add questions of various types (text, selects, file upload, etc.), mark questions required, set answer options for choice questions, and reorder questions. When they save, the questionnaire is persisted for that event.

**Why this priority**: Without a persisted questionnaire, vendors have no form to fill out. This story is the foundation everything else depends on.

**Independent Test**: Create a draft event, open the questionnaire builder, add five questions of varied types (short_text, single_select, multi_select, yes_no, file_upload), mark two required, save, reload the builder — all five questions appear in the saved order with the correct settings.

**Acceptance Scenarios**:

1. **Given** a draft event with the default three pre-seeded questions, **When** the organizer adds a new `yes_no` question labeled "Are you a first-time vendor?", **Then** the question appears in the builder and is persisted on save.
2. **Given** a builder with three questions, **When** the organizer removes the "Special Requirements" question, **Then** the question is permanently removed and the remaining two persist in the correct order.
3. **Given** a `single_select` question, **When** the organizer enters option labels, **Then** those options appear as choices to vendors at `/apply`.
4. **Given** an organizer with the `vendor` role, **When** they attempt to access the questionnaire builder, **Then** they are denied access.

---

### User Story 2 - Vendor Submits a Dynamic Application (Priority: P1)

A vendor visits `/apply`, picks an active event, and sees a form built from that event's questionnaire. They answer all visible questions (including any file-upload questions), see validation errors for missing required answers, and submit successfully. One row of answers is recorded per question.

**Why this priority**: This is the primary vendor-facing workflow — without it, the feature has no end-to-end value.

**Independent Test**: Publish a five-question event questionnaire including one `file_upload` question, one `multi_select` question, and one `yes_no` question; submit a vendor application at `/apply`; verify the submission creates an application record linked to one answer per visible question.

**Acceptance Scenarios**:

1. **Given** a published event with a five-question questionnaire, **When** a vendor submits the form with all required fields answered, **Then** the application is created and one answer record is stored per visible question.
2. **Given** a required question, **When** the vendor submits without answering it, **Then** a validation error is shown and no application is created.
3. **Given** a `file_upload` question, **When** the vendor attaches a valid image or PDF, **Then** the file is accepted and its reference is stored with the answer.
4. **Given** a `file_upload` question, **When** the vendor attaches a file exceeding 10 MB, **Then** an error is displayed and submission is blocked.
5. **Given** an event with a `multi_select` question, **When** the vendor selects three options and submits, **Then** all three selections are stored as the answer.

---

### User Story 3 - Legacy Events Keep Using the Static Form (Priority: P1)

An event created before this feature ships has no questionnaire attached. When a vendor applies to that event, they see today's hard-coded form fields (booth preference, product categories, special requirements). The organizer reviews those answers in the existing renderer. No regression occurs.

**Why this priority**: Any regression on the existing application flow blocks live vendor operations.

**Independent Test**: Confirm that an event record without an attached questionnaire renders the existing static form fields at `/apply` and that the application review pages display the legacy fields unchanged.

**Acceptance Scenarios**:

1. **Given** a legacy event (no questionnaire), **When** a vendor opens `/apply` and selects that event, **Then** the existing three static fields are rendered (booth preference, product categories, special requirements) — not a dynamic form.
2. **Given** a submitted legacy application, **When** an organizer opens its review page, **Then** the three legacy fields display using the existing hard-coded renderer.
3. **Given** a submitted legacy application, **When** the vendor opens their application detail page, **Then** the same legacy renderer displays their answers unchanged.

---

### User Story 4 - Organizer Reviews Dynamic Answers (Priority: P2)

After vendors submit applications against a dynamic questionnaire, an organizer opens an application detail page. They see each question label and a type-appropriate rendering of the answer (text for text fields, pills for multi-select, a file link for file uploads, etc.). If the application was submitted before the feature existed, the legacy renderer is used instead.

**Why this priority**: The questionnaire has no value if organizers cannot read the answers clearly.

**Independent Test**: Submit a dynamic application with answers covering at least four question types; open the application at `/dashboard/applications/[id]`; verify each answer is rendered in a manner appropriate to its question type, with no blank or crashing sections.

**Acceptance Scenarios**:

1. **Given** a dynamic application with answers across multiple question types, **When** an organizer opens the review page, **Then** each answer is displayed with a label and type-appropriate presentation (text, list, date, file link, yes/no indicator).
2. **Given** a dynamic application, **When** the vendor opens their own application detail page, **Then** the same answers are shown in a read-only view with the same type-appropriate renderer.
3. **Given** a question type the renderer does not specifically recognize, **When** the answer is displayed, **Then** a graceful fallback (plain text) is shown rather than a crash or blank.
4. **Given** a legacy application (no questionnaire), **When** either review page loads, **Then** the existing hard-coded renderer is used for the three legacy fields.

---

### User Story 5 - Organizer Saves a Questionnaire as a Reusable Template (Priority: P2)

An organizer finishes building a questionnaire for one event and saves it as a named template visible to all organizers. Later, they can start a new event's questionnaire from that template (seeding the event with a copy of its questions). Editing either the template or the event copy afterward does not affect the other.

**Why this priority**: Without templates, organizers recreate the same form for every event — the primary time-saving feature for recurring events.

**Independent Test**: Build a five-question event questionnaire, click "Save as template," confirm the template appears in the templates library. Start a second event, seed from the template, confirm the five questions are copied. Edit a question in the template — confirm the second event's questionnaire is unchanged. Edit a question on the second event — confirm the template is unchanged.

**Acceptance Scenarios**:

1. **Given** a questionnaire in the builder, **When** the organizer clicks "Save as template" and provides a name, **Then** the template appears in `/dashboard/templates` visible to all organizers.
2. **Given** a saved template, **When** a second organizer seeds a new event from it, **Then** all questions are copied into the new event's questionnaire.
3. **Given** a template used to seed an event, **When** the template is edited, **Then** the seeded event's questions are not changed.
4. **Given** an event seeded from a template, **When** the event questionnaire is edited, **Then** the original template is not changed.
5. **Given** a template created by Organizer A, **When** Organizer B views `/dashboard/templates`, **Then** Organizer B can read it; but only Organizer A or an admin can edit or delete it.

---

### User Story 6 - Organizer Adds a Show-If Branching Rule (Priority: P3)

An organizer editing a questionnaire selects a question and adds a "Show only if…" rule pointing to an earlier question with a specific answer value. Vendors filling out the form only see the conditional question when the trigger condition is met; the hidden question is also excluded from validation.

**Why this priority**: Nice-to-have for avoiding confusing irrelevant questions; not required for the core value of dynamic forms.

**Independent Test**: Add Q1 (yes_no: "Are you selling food?"), add Q2 (short_text: "List your certifications") with a show-if rule "Q1 = yes". Submit the form with Q1 = no — confirm Q2 is not rendered and its answer is not required. Submit with Q1 = yes — confirm Q2 is rendered and can be required.

**Acceptance Scenarios**:

1. **Given** two questions exist, **When** the organizer opens the show-if panel on Q2 and sets "Show only if Q1 equals yes", **Then** the rule is saved.
2. **Given** a show-if rule where Q2 depends on Q1, **When** a vendor sets Q1 = no, **Then** Q2 is hidden and not required.
3. **Given** a show-if rule where Q2 depends on Q1, **When** a vendor sets Q1 = yes, **Then** Q2 is shown and required (if marked required).
4. **Given** a vendor with Q2 hidden, **When** they submit, **Then** no answer record is written for Q2.
5. **Given** an attempt to create a show-if rule where Q2 references Q3 (a later question), **When** saved, **Then** the save is rejected with an error explaining forward references are not allowed.

---

### User Story 7 - Questionnaire Is Locked When Event Is Published (Priority: P3)

An organizer who publishes an event (transitions it from draft to active) can no longer modify its questionnaire. Any attempt to edit questions after publication is blocked. The questionnaire and its questions remain readable.

**Why this priority**: Lock-on-publish guarantees form consistency for all in-flight applications. Without it, organizers could mutate questions that vendors have already answered.

**Independent Test**: Build a questionnaire, publish the event, attempt to add/edit/delete a question — all mutation attempts fail with a clear error. Questions remain visible in the builder.

**Acceptance Scenarios**:

1. **Given** a draft event with a questionnaire, **When** the organizer publishes the event, **Then** a lock timestamp is recorded on the questionnaire.
2. **Given** a published event, **When** the organizer attempts to add a new question via the builder, **Then** the action is blocked and an error is shown.
3. **Given** a published event, **When** the organizer attempts to delete an existing question, **Then** the deletion is blocked.
4. **Given** a published event, **When** an API request directly attempts to mutate the questionnaire bypassing the UI, **Then** the mutation is still blocked at the server level.

---

### Edge Cases

- **Show-if cycle**: An attempt to create a circular show-if chain (Q2 depends on Q3, Q3 depends on Q2) must be rejected at save time.
- **Forward reference**: A show-if rule on Q1 that points to Q2 (a later question) must be rejected.
- **Questionnaire never created**: If a new event is published without the organizer ever opening the builder, the three default pre-seeded questions should still be present and locked (because they were auto-created when the event was created).
- **Concurrent publish + edit**: If an organizer edits a question at the exact moment another session publishes the event, the questionnaire-edit action must check current event status and reject the edit if it is no longer draft.
- **Re-publishing an already-active event**: Setting the lock timestamp must be idempotent — a second transition attempt on an already-active event must not overwrite the original lock time.
- **Template deletion after seeding**: Deleting a template that was used to seed events must not affect those events' question copies.
- **Unanswered optional show-if question**: A question hidden by a show-if rule must not be treated as a missing required answer during submission validation.
- **File upload on a dynamic form**: The file upload reuses existing infrastructure (10 MB max, images and PDFs only). Other file types or oversized files produce the existing error message — no new handling needed.
- **Show-if trigger type guard**: a show-if rule whose trigger question is not `yes_no` or `single_select` MUST be rejected at save time.
- **Show-if value becomes invalid after option edit**: if a `single_select` trigger question's options are edited and a dependent show-if rule's `value` no longer matches any current option key, the save MUST be rejected with a per-rule error identifying the affected question (e.g., "Show-if rule on Q2 references option 'yes' which no longer exists on Q1"). For `yes_no` triggers, `value` must be `"true"` or `"false"`; any other value is rejected at save time regardless of prior state.
- **Concurrent organizer edits**: two organizers editing the same draft questionnaire follow last-write-wins; the system does NOT detect or reject mid-air collisions while both sessions remain in draft status.
- **Orphaned template**: a template whose creator's account has been deleted (or whose creator's role has dropped below organizer) MUST remain readable by all organizers/admins; only admins may edit or delete it.

---

## Clarifications

### Session 2026-04-25

- Q: Does FR-013's list of "11 question types" treat "phone URL" as one type or two? → A: Two types — phone and URL are separate.
- Q: Which operators and trigger types does the show-if rule support? → A: equals only; trigger must be yes_no or single_select.
- Q: How are concurrent edits by two organizers on the same draft questionnaire handled? → A: Last-write-wins; no conflict detection.
- Q: What happens to a template when its creator's account is deleted or their role is downgraded? → A: Template stays; only admins may edit or delete it from that point on.
- Q: Is there a hard cap on questions per questionnaire? → A: No hard limit at MVP; revisit if performance issues surface.

---

## Requirements *(mandatory)*

### Functional Requirements

**Data Model**

- **FR-001**: System MUST introduce five new data entities: Questionnaire Template, Template Question, Event Questionnaire (one per event), Event Question, and Application Answer (one per application-question pair).
- **FR-002**: An Application Answer MUST store its value in a format flexible enough to carry every supported question type: plain text, numbers, booleans, ordered lists, dates, and file references.
- **FR-003**: An Event Questionnaire MUST carry a nullable lock timestamp that, once set, signals the questionnaire is frozen and immutable.
- **FR-004**: All five new entities MUST be secured with access control rules in the same database migration that creates them.
- **FR-005**: The five new entities and all access control rules MUST be introduced in a single, append-only, numbered migration (the next in sequence after migration 008).
- **FR-006**: The auto-generated database type definitions MUST be regenerated and committed in the same pull request as the migration.

**Templates Library (`/dashboard/templates`)**

- **FR-007**: Organizers and admins MUST be able to create, read, update, and delete questionnaire templates and their questions via `/dashboard/templates`.
- **FR-008**: All organizers and admins MUST be able to read every template (org-wide visibility; no per-template access control beyond authorship for mutations).
- **FR-009**: Only the template creator or an admin MAY edit or delete a given template.
- **FR-009a**: When a template creator's account is deleted, OR their role is reduced below organizer, the template MUST remain available for read by all organizers and admins; from that point on, only admins MAY edit or delete the template.
- **FR-010**: Editing a template MUST NOT retroactively change any event questions previously copied from that template.

**Per-Event Builder (`/dashboard/events/new`, `/dashboard/events/[id]`)**

- **FR-011**: When an organizer opens a brand-new event in the builder for the first time, the questionnaire MUST be pre-seeded with three default-but-removable questions that mirror the existing legacy form fields: Booth Preference (single choice: indoor, outdoor, no preference), Product Categories (multi-select: 11 existing category options), and Special Requirements (long text).
- **FR-012**: The builder MUST provide options to start blank (with defaults), start blank (empty), or seed from a saved template.
- **FR-013**: The builder MUST support 11 question types: short text, long text, email, phone, URL, number, date, single-select, multi-select, yes/no, and file upload.
- **FR-014**: File-upload questions MUST reuse the existing file-upload infrastructure (10 MB limit, images and PDFs only) with no new storage setup.
- **FR-015**: Each question MAY carry one "show only if" rule referencing exactly one earlier question (lower position) using the `equals` operator against a target value. The trigger question MUST be of type `yes_no` or `single_select`.
- **FR-016**: The "Show only if" rule editor MUST only appear in the builder once at least one earlier question exists in the questionnaire.
- **FR-017**: All questionnaire-mutation operations MUST verify the event is still in draft status before applying any change, regardless of how the request was made.
- **FR-018**: The builder MUST expose a "Save as template" action that creates a new named template whose questions are a copy of the current event questions.

**Lock-on-Publish**

- **FR-019**: When an event is published (transitions from draft to active), the system MUST atomically set the lock timestamp on its questionnaire. If a lock timestamp already exists, it MUST NOT be overwritten.
- **FR-020**: Once a questionnaire is locked, all attempts to add, edit, delete, or reorder its questions MUST be rejected — both at the application layer and at the data layer.

**Public `/apply` Page**

- **FR-021**: For events with an attached questionnaire, `/apply` MUST build a validated form dynamically from that event's question definitions at request time.
- **FR-022**: Questions hidden by a show-if rule based on current answer state MUST be excluded from validation and MUST NOT generate an answer record on submission.
- **FR-023**: Each submission against a dynamic questionnaire MUST produce one answer record per visible question, stored under the application and the specific question.
- **FR-024**: The dynamic application submission action is a public (unauthenticated) operation and MUST follow the same pattern as the existing static submission — no authentication requirement, but with full input validation.
- **FR-025**: Events without an attached questionnaire (legacy events) MUST continue to render the existing hard-coded vendor application form at `/apply` without modification.

**Application Review**

- **FR-026**: The application detail pages for both organizers and vendors MUST render dynamic answers generically, with each answer presented in a way appropriate to its question type.
- **FR-027**: Applications submitted against a legacy form (no questionnaire) MUST continue to render using the existing hard-coded section for the three legacy fields.
- **FR-028**: The three legacy columns (booth preference, product categories, special requirements) on the applications table MUST be retained as read-only for historical rows and MUST NOT be migrated into the new answers structure.

**Quality and Completeness**

- **FR-029**: All new data-mutation operations MUST have automated tests covering at least one success path and at least one authorization or validation failure path.
- **FR-030**: All new form components MUST have automated tests covering initial render, validation error display, and successful submission flow.
- **FR-031**: All new UI elements MUST use established design tokens and existing UI primitives; no ad-hoc inline style values.
- **FR-032**: All mutations that affect data rendered on existing routes MUST trigger a cache invalidation so those routes reflect the latest data without a full page reload.

### Key Entities

- **Questionnaire Template**: An org-wide reusable question set. Has a name, optional description, and a creator. Editable only by the creator or an admin. Detached from any event copies (changes to the template do not propagate to events already seeded from it).
- **Template Question**: A single typed question belonging to a template. Has a position, type (one of 11), label, optional help text, required flag, answer options (for choice types), and an optional single-condition show-if rule.
- **Event Questionnaire**: The questionnaire attached to one specific event (one-to-one). Has an optional reference to the template it was seeded from (informational only). Has a nullable lock timestamp set when the event is published.
- **Event Question**: A single typed question belonging to an event questionnaire. Same shape as Template Question. Immutable once the parent questionnaire is locked.
- **Application Answer**: One record per (application, event question) pair. Carries a flexible value field that stores the answer payload in a format suited to the question type. Immutable once written (no answer editing after submission).

---

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: An organizer can build a 10-question event questionnaire from scratch and publish the event in under 5 minutes.
- **SC-002**: An organizer can seed a new event's questionnaire from a saved template and begin editing in under 30 seconds.
- **SC-003**: A vendor can submit a fully validated application against a 10-question questionnaire — including one file-upload question and one show-if branching question — without encountering an unhandled error, measured across 100% of automated happy-path test runs.
- **SC-004**: After an event is published, zero successful mutations to its questionnaire can occur through any path (UI, direct server action, or API), verified by automated tests covering both the application layer and the data layer.
- **SC-005**: 100% of existing legacy events (no attached questionnaire) continue to render the existing static form and accept vendor submissions without regression, verified by the existing test suite passing unmodified.
- **SC-006**: Editing a saved template zero times changes the questions on any event previously seeded from it, verified by an automated test that records question state before and after a template edit.
- **SC-007**: Every question type's answer renders without a crash or blank in the organizer and vendor review pages; unrecognized types fall back to plain text.

---

## Assumptions

- **Single-tenant org visibility**: All organizers see all templates. There is no per-organizer template library — only authorship-based edit/delete permissions.
- **Conditional-required is out of scope**: A question can only be shown or hidden conditionally; making a question conditionally required is not supported in this version.
- **Single show-if rule per question**: Each question may have at most one show-if rule. Multi-condition branching (AND/OR of multiple rules) is out of scope.
- **No per-question file constraints**: File-upload questions reuse the existing global limits (10 MB, images and PDFs). Per-question overrides are out of scope.
- **No question-type migration**: Historical application records store booth preference, product categories, and special requirements in three dedicated columns. Those columns are kept as-is; they are not migrated into the new answers structure.
- **Legacy event detection**: An event whose questionnaire record does not exist was created before this feature. It uses the legacy static form at `/apply` and in review pages. The transition to a dynamic form is opt-in (organizer must open the builder and save at least once).
- **Auto-seeding on event creation**: Events created after this feature ships are automatically given a questionnaire record with the three default questions at creation time, so they are immediately dynamic-form-ready without requiring the organizer to open the builder first.
- **Public submission**: Vendor application submission is unauthenticated. The dynamic submission action follows the same public pattern as the existing static submission.
- **File-upload reuse**: The dynamic `file_upload` question type reuses existing upload infrastructure. No new storage buckets or upload policies are needed.
- **Out of scope for this version**: multi-page forms; rating, scale, matrix, address, and rich-text question types; migrating historical applications into the new answers structure; multi-condition branching DAGs.
- **Show-if scope (this version)**: the only supported operator is `equals`, and only `yes_no` and `single_select` questions may serve as triggers. Other operators (`not_equals`, `contains`, `gt`, `lt`) and triggers from other question types are out of scope.
- **No optimistic locking**: concurrent organizer edits on the same draft questionnaire resolve via last-write-wins. The draft-status guard (FR-017) still rejects edits attempted after a publish transition.
- **Templates outlive their creator**: the `created_by` foreign key uses `ON DELETE SET NULL` semantics (or equivalent) so a template remains usable when its creator leaves; admin-only management applies thereafter.
- **No question count cap at MVP**: there is no hard limit on questions per questionnaire. SC-001's 10-question benchmark reflects an expected typical size; performance bounds may be added in a later revision if needed.
