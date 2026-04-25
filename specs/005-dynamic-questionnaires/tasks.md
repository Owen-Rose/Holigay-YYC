---
description: "Implementation task list for spec 005 — Per-Event Dynamic Questionnaires"
---

# Tasks: Per-Event Dynamic Questionnaires

**Input**: Design documents from `/specs/005-dynamic-questionnaires/`
**Prerequisites**: `plan.md`, `spec.md`, `research.md`, `data-model.md`, `contracts/`, `quickstart.md`

**Tests**: Required per FR-029 (every new mutation: 1 success + 1 auth-or-validation failure path) and FR-030 (every new form component: render + validation-error + happy-submit). Test tasks are included accordingly.

**Organization**: Tasks are grouped by user story (P1 → P3). Foundational tasks block all stories. Each story phase ends in an independently verifiable checkpoint matching the story's `Independent Test`.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Different file from concurrent tasks; no inbound dependencies.
- **[Story]**: Maps task to user story (US1–US7); foundational + polish phases have no story label.
- File paths are absolute relative to repo root.

---

## Phase 1: Setup

(No setup tasks — Next.js / Supabase / Vitest / Tailwind v4 / Zod already configured. New code lives in established directories.)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Ship the migration, type bindings, and shared helpers every user story depends on.

**⚠️ CRITICAL**: No story-phase task may begin until this phase is complete.

- [x] T001 Create `supabase/migrations/009_dynamic_questionnaires.sql` — `question_type` enum (11 values per R6/data-model.md), tables `questionnaire_templates`, `template_questions`, `event_questionnaires`, `event_questions`, `application_answers` with all FK / unique / check constraints, all RLS policies (INSERT on `event_questionnaires` / `event_questions` gated on `events.status = 'draft'`; NO UPDATE policy on `event_questionnaires` from app code), `lock_event_questionnaire` SECURITY DEFINER function + `lock_event_questionnaire_on_publish` AFTER UPDATE trigger on `events` (data-model.md trigger section), `create_event_with_default_questionnaire(p_event jsonb)` SECURITY DEFINER function for transactional auto-seeding (R4); indexes per data-model.md §Indexes
- [x] T002 Regenerate Supabase types: run `npm run db:types:dev`, commit `src/types/database.ts` (FR-006); confirm new tables show up
- [x] T003 [P] Create `src/components/questionnaire/question-types.ts` — `QUESTION_TYPES` const tuple (11 values), `QuestionType` derived type, `QUESTION_TYPE_LABELS` lookup for UI
- [x] T004 [P] Create `src/lib/questionnaire/default-questions.ts` — `DEFAULT_EVENT_QUESTIONS` array with three entries (Booth Preference single_select required, Product Categories multi_select required reusing `PRODUCT_CATEGORIES` from `src/lib/validations/application.ts`, Special Requirements long_text optional) per FR-011 / R4
- [x] T005 [P] Create `src/lib/questionnaire/show-if.ts` — pure `evaluateShowIf(rule, answersSoFar): boolean` (R2 contract), plus `validateShowIfRules(questions): { ok: boolean; errors: ... }` covering: forward-reference, cycle, trigger-type-must-be-yes_no-or-single_select (Edge Cases + Q2), AND option-key resolution (`single_select` trigger: rule value MUST be a current option key; `yes_no` trigger: rule value MUST be `"true"` or `"false"`) — Edge Case "Show-if value becomes invalid after option edit"
- [x] T006 [P] Create `src/lib/questionnaire/answer-coercion.ts` — `buildAnswersSchema(questions)` returning a per-questionnaire Zod object keyed by `questionId` using the discriminated union from R1; helpers `coerceAnswerToJsonb(answer)` and `coerceJsonbToAnswer(value, type)` for read/write boundary
- [x] T007 [P] Create `src/lib/validations/questionnaire.ts` — Zod schemas: `optionSchema`, `showIfInputSchema`, `questionInputSchema` (with `superRefine` enforcing options-required-for-choice, unique option keys), `answerValueSchema` (discriminated union per R1), wrapping schemas for templates and questionnaires that run `validateShowIfRules` in a top-level `superRefine`
- [x] T008 [P] Create `src/lib/actions/_internal/event-status.ts` — `requireDraftEvent(supabase, eventId)` helper returning the project's literal `{ success, error, data }` failure shape when the event is not `draft` or not found (R3)
- [x] T009 [P] Add `src/test/show-if-evaluator.test.ts` — pure unit tests covering: null rule → true, equals match for `yes_no` + `single_select` triggers, mismatch returns false, unsupported trigger type returns false; plus `validateShowIfRules` cases: forward-ref rejection, two-question cycle, three-question cycle, trigger-type rejection, `single_select` rule value references an option key that no longer exists → rejection, `yes_no` rule value is not `"true"`/`"false"` → rejection

**Checkpoint**: Migration applied, types regenerated, all helpers + Zod schemas exported, evaluator unit tests pass. Story phases unblocked.

---

## Phase 3: User Story 1 — Organizer Builds a Per-Event Questionnaire (Priority: P1) 🎯 MVP

**Goal**: Organizer can open a draft event, see the three pre-seeded defaults, add/remove/reorder questions of varied types, mark required, save and reload to confirm persistence.

**Independent Test**: Create a draft event → open builder → add five questions covering `short_text` / `single_select` / `multi_select` / `yes_no` / `file_upload` → mark two required → save → reload → all five persist with correct settings and order.

- [x] T010 [US1] Create `src/lib/actions/questionnaires.ts` — exports `getEventQuestionnaire`, `addEventQuestion`, `updateEventQuestion`, `deleteEventQuestion`, `reorderEventQuestions` (contracts/questionnaire-actions.md). Each mutation: `requireRole('organizer')` → `requireDraftEvent` → `safeParse` against `questionInputSchema` (or wrapping schema) → DB op → `revalidatePath('/dashboard/events/[id]', 'page')`. `deleteEventQuestion` rejects if any sibling has a `show_if` referencing the target. `reorderEventQuestions` uses two-step (negative-temporary then final) update to dodge the unique constraint. Show-if rules are validated via `validateShowIfRules` over the post-mutation full set
- [x] T011 [US1] Modify `src/lib/actions/events.ts` `createEvent` — replace the direct `events.insert` with `supabase.rpc('create_event_with_default_questionnaire', { p_event: { ...eventData } })`; on RPC failure return failure; add `revalidatePath('/dashboard/events')` (R5 backfill). The RPC handles all three INSERTs atomically (R4); `DEFAULT_EVENT_QUESTIONS` data is passed in via the `p_event` argument
- [x] T012 [P] [US1] Create `src/components/forms/question-editor.tsx` — controlled client component for one question's editable fields (type select, label input, help_text textarea, required toggle, options editor for choice types). No show-if UI yet (US6 adds it). Uses existing `Input`, `Textarea`, `Select`, `Checkbox`, `Button` primitives — no inline styles
- [x] T013 [US1] Create `src/app/dashboard/events/[id]/questionnaire-builder.tsx` (client component) — orchestrates `<QuestionEditor>` per question, "Add question" button that opens a blank `QuestionEditor`, drag-or-button-based reorder, save button that calls T010 actions, surfaces errors via Sonner toast. Receives initial state as props from RSC parent
- [x] T014 [US1] Modify `src/app/dashboard/events/[id]/page.tsx` — call `getEventQuestionnaire(eventId)` server-side; render existing event-edit form plus a new "Questionnaire" section hosting `<QuestionnaireBuilder>` initial state. Hide builder if user lacks organizer role (defense in depth — middleware already gates the route)
- [x] T015 [P] [US1] Add `src/test/questionnaires-actions.test.ts` — happy paths for each of the five new actions, plus failure tests: `addEventQuestion` with vendor role rejected, `updateEventQuestion` against an `active` event rejected (draft-status guard), `reorderEventQuestions` with mismatched id set rejected. Uses the `auth-roles.test.ts` mock pattern
- [x] T016 [P] [US1] Add `src/test/questionnaire-builder.test.tsx` — initial render shows three default questions, adding a question opens a new editor, validation error displays when label empty, save success calls the action and shows toast

**Checkpoint**: Story 1 independent test passes. Builder is interactive on draft events; mutations rejected on non-draft events.

---

## Phase 4: User Story 2 — Vendor Submits a Dynamic Application (Priority: P1) 🎯 MVP

**Goal**: Public `/apply` page renders a dynamic form for events with a questionnaire; submitting writes one Application Answer per visible question, including a file upload.

**Independent Test**: Publish a five-question event questionnaire including one `file_upload` and one `multi_select` and one `yes_no` → submit at `/apply` → application created with one answer row per visible question.

- [x] T017 [US2] Create `src/lib/actions/answers.ts` — `submitDynamicApplication` per `contracts/public-submit-action.md`. No `requireRole` (public). Order: validate event is `active` → load `event_questionnaires` + `event_questions` → re-build server-side schema via `buildAnswersSchema` and re-validate input → run `evaluateShowIf` to determine visible set → enforce required on visible only → vendor lookup-or-insert by email → INSERT `applications` (legacy columns NULL) → bulk INSERT `application_answers` → fire `application-received` email best-effort → `revalidatePath('/dashboard/applications')` + `revalidatePath('/vendor-dashboard/applications')`
- [x] T018 [P] [US2] Create `src/components/forms/question-input.tsx` — type-dispatched answer input rendering one of 11 widgets (uses `Input`, `Textarea`, `Select`, multi-checkbox group, yes/no radio, date input, file input wired to `uploadAttachment`). Emits typed answer values matching the discriminated union from R1
- [x] T019 [US2] Create `src/app/(public)/apply/_components/dynamic-application-form.tsx` (client) — react-hook-form bound to `buildAnswersSchema(questions)`; reuses `<QuestionInput>`; runs `evaluateShowIf` reactively against current `watch()` snapshot to mount/unmount conditional questions and exclude them from validation; on submit, uploads each file via existing `uploadAttachment` then calls `submitDynamicApplication`; legacy vendor-contact fields (business_name, contact_name, email, phone, etc.) appear above the question list, mirroring the existing form
- [x] T020 [US2] Modify `src/app/(public)/apply/page.tsx` — for the selected event, call `getEventQuestionnaire(eventId)` (or equivalent public-safe read) RSC-side; if a questionnaire row exists (any question count, including zero), render `<DynamicApplicationForm>`; otherwise render the existing legacy `<ApplicationForm>` unchanged (FR-025 fallback — also satisfies US3 implementation). Branch is on `questionnaire !== null`, not on question count — an empty dynamic form is valid (spec Assumption "Legacy event detection")
- [x] T021 [P] [US2] Add `src/test/answers-actions.test.ts` — happy submit (mix of types incl. file payload), missing required answer rejected, hidden show-if question NOT included in answers and NOT failing required, file `value` shape coerced correctly, event-not-active rejected
- [x] T022 [P] [US2] Add `src/test/dynamic-application-form.test.tsx` — initial render of all 11 question types, validation error on missing required, file upload happy path with mocked `uploadAttachment`, submit success calls `submitDynamicApplication` with correctly shaped payload

**Checkpoint**: Story 2 independent test passes. Public submission writes the expected answer rows.

---

## Phase 5: User Story 3 — Legacy Events Keep Using the Static Form (Priority: P1) 🎯 MVP

**Goal**: Events with no `event_questionnaires` row keep rendering today's hard-coded form at `/apply` and the existing renderer in review pages — no regression.

**Independent Test**: An event row with no `event_questionnaires` companion renders the existing three static fields at `/apply`; its submitted application renders unchanged in both review pages.

> Implementation is shared with US2 (T020 already branches on questionnaire presence) and US4 (review pages branch on `dynamicAnswers`). This phase locks in the no-regression contract via tests.

- [x] T023 [P] [US3] Add `src/test/apply-legacy-event.test.tsx` — mock `getEventQuestionnaire` to return `null` for an event; verify `/apply` page renders the existing `<ApplicationForm>` (legacy three fields) and not `<DynamicApplicationForm>`
- [x] T024 [P] [US3] Add `src/test/application-detail-legacy.test.tsx` — for an application row whose `dynamicAnswers` resolve to `null`, both `/dashboard/applications/[id]` and `/vendor-dashboard/applications/[id]` continue using the existing hard-coded section showing booth_preference, product_categories, special_requirements (FR-027 / FR-028)

**Checkpoint**: Story 3 independent test passes. Tests fail if any future change accidentally swaps the legacy renderer for the dynamic one on legacy rows.

---

## Phase 6: User Story 4 — Organizer Reviews Dynamic Answers (Priority: P2)

**Goal**: Application detail pages render dynamic answers with a type-appropriate widget per question and fall back to legacy renderer for legacy rows.

**Independent Test**: Submit a dynamic application with at least four question types (incl. file upload). Open organizer review page — each answer shows label + appropriate rendering. Open vendor review page — same. Unknown question types fall back to plain text. Legacy applications still use the legacy renderer.

- [ ] T025 [P] [US4] Create `src/components/questionnaire/answer-renderer.tsx` (RSC) — type-dispatched read-only renderer: text → `<p>`, multi-select → pill list, date → formatted date, file_upload → signed-URL anchor, yes_no → badge ("Yes"/"No"), unknown type → plain text fallback (SC-007). Accepts `{ question, answer }` props; uses `coerceJsonbToAnswer` from T006
- [ ] T026 [US4] Create `src/app/dashboard/applications/[id]/dynamic-answers.tsx` (RSC) — iterates the answers array from `getApplicationDetail` and renders `<AnswerRenderer>` per visible question, hiding answers whose question's `show_if` evaluated false at submit time (those simply have no row → naturally hidden)
- [ ] T027 [US4] Modify `src/lib/actions/applications.ts` `getApplicationDetail` — also fetch `application_answers` LEFT JOIN `event_questions` ordered by `event_questions.position`; expose `dynamicAnswers: AnswerWithQuestion[] | null` (null when zero rows → legacy)
- [ ] T028 [US4] Modify `src/app/dashboard/applications/[id]/page.tsx` — branch on `dynamicAnswers`: if non-null, render `<DynamicAnswers>`; else render existing legacy section verbatim. Preserve all existing organizer controls (status, notes, attachments)
- [ ] T029 [US4] Modify `src/app/vendor-dashboard/applications/[id]/page.tsx` — same branching as T028 (read-only path); keep existing layout otherwise
- [ ] T030 [P] [US4] Add `src/test/answer-renderer.test.tsx` — render every supported `kind` correctly (text, number, date, choice, choices, boolean, file), unknown `kind` falls back to plain text, file payload renders as a link with the correct path

**Checkpoint**: Story 4 independent test passes. Legacy applications continue to render unchanged (re-affirmed by the US3 test).

---

## Phase 7: User Story 5 — Templates Library (Priority: P2)

**Goal**: Org-wide template library at `/dashboard/templates` with create/read/update/delete, copy-on-attach seeding, and admin-only management of orphaned templates.

**Independent Test**: Save current event questionnaire as named template → appears in `/dashboard/templates` for all organizers → seed second event from it → five questions copied → editing template does NOT change second event → editing second event does NOT change template.

- [ ] T031 [US5] Create `src/lib/actions/templates.ts` per `contracts/templates-actions.md` — exports `listTemplates`, `getTemplate`, `createTemplate`, `updateTemplate`, `deleteTemplate`, `seedEventQuestionnaireFromTemplate`. Mutations: `requireRole('organizer')` (RLS handles creator-or-admin row gate per Q4/R8), Zod parse, DB op, `revalidatePath('/dashboard/templates')` and `revalidatePath('/dashboard/templates/[id]', 'page')` where appropriate. `seedEventQuestionnaireFromTemplate` requires the target event to be `draft`, optionally replaces existing questions, remaps `show_if.questionId` references via the old→new id map (contract step 4)
- [ ] T032 [US5] Add `saveEventQuestionnaireAsTemplate` to `src/lib/actions/questionnaires.ts` — bulk-copy current event questions into a new template; remap `show_if.questionId`; `revalidatePath('/dashboard/templates')`
- [ ] T033 [P] [US5] Create `src/app/dashboard/templates/page.tsx` (RSC) — calls `listTemplates`, renders a card/table listing template name, description, creator email (with "—" when orphaned per Q4), question count, "Edit" / "Delete" buttons gated on creator-or-admin
- [ ] T034 [P] [US5] Create `src/app/dashboard/templates/loading.tsx`
- [ ] T035 [P] [US5] Create `src/app/dashboard/templates/new/page.tsx` — RSC shell + `<TemplateBuilder>` client form for new template
- [ ] T036 [P] [US5] Create `src/app/dashboard/templates/[id]/page.tsx` — RSC; loads via `getTemplate`; renders `<TemplateBuilder>` in edit mode
- [ ] T037 [P] [US5] Create `src/app/dashboard/templates/[id]/loading.tsx`
- [ ] T038 [US5] Create `src/app/dashboard/templates/[id]/template-builder.tsx` — wraps `<QuestionnaireBuilder>` with a name + description header and template-context save callbacks (`createTemplate` / `updateTemplate`); reuses the same `<QuestionEditor>` so behaviour matches the per-event builder
- [ ] T039 [P] [US5] Create `src/app/dashboard/events/[id]/save-as-template-button.tsx` — client button + name/description modal; calls `saveEventQuestionnaireAsTemplate`; surfaces toast and link to the new template
- [ ] T040 [US5] Add a "Seed from template" picker to `<QuestionnaireBuilder>` — disabled when questionnaire is locked or has any answer-bearing data; calls `seedEventQuestionnaireFromTemplate` and re-fetches questions on success
- [ ] T041 [P] [US5] Add `src/test/templates-actions.test.ts` — CRUD happy paths, creator-only edit/delete enforced (RLS-mock + role-mock), admin override works, orphaned template (created_by null) editable only by admin, `seedEventQuestionnaireFromTemplate` copies questions and remaps show-if ids
- [ ] T042 [P] [US5] Add `src/test/template-builder.test.tsx` — render new + edit modes, save invokes the right action, validation error display

**Checkpoint**: Story 5 independent test passes. Templates and event questionnaires are fully decoupled (no shared mutation paths).

---

## Phase 8: User Story 6 — Show-If Branching Rule (Priority: P3)

**Goal**: Organizers can attach an `equals`-only show-if rule referencing an earlier `yes_no` or `single_select` question; vendors only see/required-validate the question when the rule matches.

**Independent Test**: Add Q1 (`yes_no` "Are you selling food?") → add Q2 (`short_text` "List your certifications") with show-if "Q1 = yes". Submit Q1 = no → Q2 hidden, not required. Submit Q1 = yes → Q2 visible and required.

> Note: the evaluator + validators (T005) and the schema-level acceptance of show-if values (T007) already shipped in foundational. This phase adds the UI surface and tests the action-layer wiring.

- [ ] T043 [P] [US6] Create `src/components/forms/show-if-editor.tsx` — only renders when ≥1 earlier question exists in the parent context; "Show only if" toggle → trigger-question dropdown filtered to `yes_no` / `single_select` siblings with smaller position → operator pinned to `equals` → value selector (yes/no toggle for `yes_no`; option-key dropdown for `single_select`)
- [ ] T044 [US6] Wire `<ShowIfEditor>` into `<QuestionEditor>` and `<QuestionnaireBuilder>` so each question's show-if rule is editable; ensure the action calls already validate show-if (foundational T005 + T010 — confirm); surface friendly error messages from `validateShowIfRules` on save
- [ ] T045 [P] [US6] Add `src/test/show-if-validator.test.ts` — action-layer: `addEventQuestion` rejects forward-reference, `updateEventQuestion` rejects creating a cycle, `addEventQuestion` rejects trigger-type when trigger is `multi_select`/`long_text`/etc; `reorderEventQuestions` rejects a reorder that would invalidate an existing show-if (forward-ref appears post-reorder)

**Checkpoint**: Story 6 independent test passes including the three negative paths (forward-ref / cycle / wrong trigger type).

---

## Phase 9: User Story 7 — Lock-on-Publish (Priority: P3)

**Goal**: Publishing an event atomically sets `event_questionnaires.locked_at` and rejects all future questionnaire mutations at both application and data layers.

**Independent Test**: Build questionnaire → publish event → attempt add/edit/delete/reorder via UI: all blocked with clear error. Direct SQL UPDATE attempt also rejected by RLS.

- [ ] T046 [US7] Modify `src/lib/actions/events.ts` `updateEventStatus` — on `draft → active` transition, UPDATE `events` row only; the `lock_event_questionnaire_on_publish` trigger (migration 009) sets `event_questionnaires.locked_at` atomically. Add `revalidatePath('/dashboard/events')` + `revalidatePath('/dashboard/events/[id]', 'page')` (R5). No `setQuestionnaireLock` helper needed — the trigger replaces it
- [ ] T047 [US7] Update `<QuestionnaireBuilder>` to render a locked banner + disable all mutation controls when `locked_at` is non-null; the action-level guards already reject mutations server-side, but the UI lockout matches Story 7 scenarios 2 & 3
- [ ] T048 [P] [US7] Add `src/test/lock-on-publish.test.ts` — `updateEventStatus(active)` sets `locked_at` once and is idempotent on a re-publish call; subsequent `addEventQuestion` / `updateEventQuestion` / `deleteEventQuestion` / `reorderEventQuestions` all return failure with the draft-status error; verify the assertion that the existing RLS policy from migration 009 is the data-layer backstop (mock-test the supabase response shape that mimics RLS rejection)

**Checkpoint**: Story 7 independent test passes. Both layers reject post-publish edits.

---

## Phase 10: Polish & Cross-Cutting Concerns

- [ ] T049 Run `npm run lint && npm test && npm run build` — all green; fix any new TS strict / a11y warnings introduced by spec 005 components
- [ ] T050 Execute `specs/005-dynamic-questionnaires/quickstart.md` end-to-end against the local dev environment; record any deviations and resolve before merge
- [ ] T051 Update `CLAUDE.md` "Active Technologies" + "Recent Changes" sections to reference spec 005 once shipped; trim the spec 005 entry in "Active Technologies" to a single line matching the existing one-line-per-spec pattern; ensure `specs/README.md` index reflects spec 005 state

---

## Dependencies

- **Phase 2 → all stories**: Migration + types + helpers + Zod schemas + evaluator must land before any story phase.
- **US1 → US2 / US5 / US6**: `<QuestionnaireBuilder>` (T013), `<QuestionEditor>` (T012) and `questionnaires.ts` actions (T010) are reused by US5 (template builder) and US6 (show-if editor wiring) and by US7 (locked state UI). US2 reuses `<QuestionInput>` only after T018 ships in its own phase.
- **US2 ↔ US3**: T020 implements both the dynamic branch (US2) and the legacy fallback (US3). US3's tests (T023, T024) verify the branch.
- **US4 → US3 review tests**: T028/T029 wire the dynamic-vs-legacy branch for review pages; T024 (US3) tests the legacy branch.
- **US7 → US1**: `setQuestionnaireLock` lives in the same `questionnaires.ts` file that US1 created (T010); ordering ensures the file already exists.
- **Polish phase** depends on all earlier phases.

## Parallel execution examples

After foundational phase:

```text
# US1 implementation can fan out:
T010 (sequential — single file)
  ├── T012 [P] (forms/question-editor.tsx)
  └── T015 [P] (test, after T010)
T011 (events.ts modify, after T010)
T013 (questionnaire-builder.tsx, after T010, T012)
T014 (events/[id]/page.tsx, after T013)
T016 [P] (test, after T013)
```

```text
# Templates phase fan-out (after US1):
T031 (templates.ts — sequential single file)
T032 (questionnaires.ts append — sequential)
T033 [P] T034 [P] T035 [P] T036 [P] T037 [P]   # five different page files
T038 (template-builder.tsx, after T031)
T039 [P] (save-as-template-button, after T032)
T040 (builder integration, after T031, T013)
T041 [P] T042 [P] (tests)
```

## Implementation strategy

1. **Foundational (Phase 2)** is mandatory. No story work begins without it.
2. **MVP slice = US1 + US2 + US3** (P1 stories) — delivers the full vendor flow with no regression. Ship a PR at this checkpoint if scope needs splitting.
3. **US4 + US5** (P2) extend value: review-page polish + template library.
4. **US6 + US7** (P3) close out the spec: branching + lock semantics.
5. **Polish (Phase 10)** runs at the end of any merged slice.

The MVP can be delivered in a single PR by cherry-picking phases 2 → 5 + Polish; later P2 / P3 slices can layer on with their own PRs.
