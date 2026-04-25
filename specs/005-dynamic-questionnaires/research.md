# Phase 0 Research: Per-Event Dynamic Questionnaires

This document records the design decisions taken before Phase 1 design work, derived from spec.md (with `## Clarifications` already applied), the project constitution, the codebase inventory in plan.md, and the cleanup-roadmap.

All five clarification answers from the 2026-04-25 session are treated as fixed inputs and are not re-debated here.

---

## R1 — Application Answer value shape (FR-002)

**Decision**: A single `value` column of type `jsonb` on `application_answers`, with the shape determined by the answering question's `type`. All values are wrapped in a tagged object so consumers can distinguish a `null` "unanswered" from an explicit `false` boolean / empty string. Validated by a discriminated-union Zod schema at the server-action boundary.

Tagged shapes (per question type):
- `short_text`, `long_text`, `email`, `phone`, `url` → `{ kind: "text", value: string }`
- `number` → `{ kind: "number", value: number }`
- `date` → `{ kind: "date", value: string }` (ISO `YYYY-MM-DD`)
- `single_select` → `{ kind: "choice", value: string }` (one option key)
- `multi_select` → `{ kind: "choices", value: string[] }` (ordered by user-pick order — render order is option-list order, see R6)
- `yes_no` → `{ kind: "boolean", value: boolean }`
- `file_upload` → `{ kind: "file", path: string, name: string, mimeType: string, size: number }`

**Rationale**:
- One column matches FR-002 ("flexible enough to carry every supported question type").
- Discriminated `kind` makes the read-side renderer (and tests) trivial to dispatch.
- Storing `path` only (not signed URL) for `file_upload` matches existing `attachments` table behaviour (`upload.ts:120` writes the storage path string into a `string` column).
- `phone` and `url` are stored as plain strings; format validation lives in the Zod schema, not in the persisted shape.

**Alternatives considered**:
- Separate per-type columns on `application_answers` (`text_value`, `number_value`, `bool_value`, …) — rejected: schema bloat, breaks the "one row per (application, question)" cleanly, and `multi_select` / `file_upload` still need a side payload.
- Per-type child tables (`answer_text`, `answer_choice_set`, …) — rejected: 7+ joins per application read; cardinality cost not justified for ≤ 25 questions per typical questionnaire.
- Untagged JSON (raw string / array / number) — rejected: ambiguous when read back without the matching question type loaded; tagging keeps the renderer self-sufficient if the question row is missing.

---

## R2 — Show-if evaluator placement and shape

**Decision**: A single pure function `evaluateShowIf(rule, answersSoFar)` lives in `src/lib/questionnaire/show-if.ts` with NO React/Supabase imports. It is consumed by:
1. The client `DynamicApplicationForm` (live as the user types, to mount/unmount conditional questions and update validation).
2. The server-action submit handler (final pass — drops hidden answers and skips required-validation for hidden questions).
3. Vitest unit tests (`show-if-evaluator.test.ts`).

Function signature (sketch):
```ts
type ShowIfRule = { questionId: string; operator: "equals"; value: string };
type AnswerSnapshot = Record<string, AnswerValue | undefined>;
export function evaluateShowIf(rule: ShowIfRule | null, answers: AnswerSnapshot): boolean;
```

A `null` rule returns `true` (always shown). For a `single_select` trigger, `equals` compares the stored option key. For `yes_no`, `equals` compares the boolean against `"true"` / `"false"` string targets persisted in the rule. Any unsupported trigger type returns `false` (defensive — DB constraint already prevents invalid trigger types at save time per Edge-Cases bullet).

**Rationale**: One source of truth. The server cannot trust the client; running the same evaluator on submit closes that loophole. Pure function is trivially unit-testable.

**Alternatives considered**:
- SQL-side evaluation only (client just sends all answers, server filters) — rejected: client UI still needs to mount/hide questions, so the logic exists somewhere on the client either way; duplicating across SQL and TS is worse than one TS evaluator used twice.
- Generic predicate language (multiple operators) — rejected: out of scope per Q2 clarification (`equals` only).

---

## R3 — Lock-on-publish enforcement at the data layer

**Decision**: The lock is enforced in two places (matching FR-020 + Constitution I "RLS is the trust model"):

1. **Application layer**: Every mutation server action calls `requireDraftEvent(eventId)` (helper in `src/lib/actions/_internal/event-status.ts`) right after `requireRole`. Returns the failure response shape on non-draft.
2. **Data layer**: RLS policies on `event_questionnaires`, `event_questions` use `WITH CHECK (events.status = 'draft')` joined via `events.id = event_questions.event_questionnaire_id` (subquery). UPDATE/DELETE/INSERT on questions is rejected when the parent event is no longer draft.

The `locked_at` timestamp on `event_questionnaires` is set by a `BEFORE UPDATE` trigger on `events` that fires when `OLD.status = 'draft' AND NEW.status = 'active'` (defined in migration 009, see `data-model.md` trigger section). `updateEventStatus` in `events.ts` only updates the `events` row; the trigger handles the questionnaire lock atomically in the same transaction, in the table-owner context. `setQuestionnaireLock` is therefore not needed as a separate helper — the trigger replaces it. Idempotency is guaranteed by `WHERE locked_at IS NULL` in the trigger body.

**Rationale**:
- Defense-in-depth: even a hand-crafted SQL request via Supabase REST is rejected.
- `locked_at` is informational/displayable, but the authoritative gate is `events.status`.
- Postgres RLS `WITH CHECK` cannot compare `NEW` vs `OLD` row state, making an app-code "locked_at-only update" policy unimplementable. The trigger is the correct mechanism.
- **Note on earlier trigger rejection**: The earlier alternative considered "DB trigger BEFORE UPDATE on `event_questions`" was about gating `event_questions` mutations. That concern was correctly rejected (splits auth check across RLS + trigger). This trigger is on `events`, not `event_questions`, and handles a one-time side effect — a distinct concern that does not reintroduce the rejected pattern.

**Alternatives considered**:
- App-code `setQuestionnaireLock` helper called from `updateEventStatus` — rejected: requires `event_questionnaires` UPDATE policy that cannot be expressed in RLS without comparing OLD vs NEW.
- Application-layer guard only — rejected: violates "RLS-only authorization at the data layer" posture in Constitution I.

---

## R4 — Auto-seeding the three default questions

**Decision**: Auto-seeding happens inside a `SECURITY DEFINER` Postgres function `create_event_with_default_questionnaire(p_event jsonb)` defined in migration 009 and invoked via `supabase.rpc('create_event_with_default_questionnaire', { p_event })` from the `createEvent` server action. The function INSERTs the event row, one `event_questionnaires` row, and three `event_questions` rows in a single transaction and returns the new event UUID. `DEFAULT_EVENT_QUESTIONS` constants remain in `src/lib/questionnaire/default-questions.ts` in TypeScript and are passed in via the `p_event` JSONB argument to keep the option-list strings in one place.

Default questions:
1. **Booth Preference** — `single_select`, required, options `[indoor, outdoor, no_preference]`
2. **Product Categories** — `multi_select`, required, options = the existing 11 `PRODUCT_CATEGORIES` keys from `src/lib/validations/application.ts:33-45`
3. **Special Requirements** — `long_text`, optional

**Rationale**:
- App-side seeding keeps the migration purely structural (no DML for ongoing app behaviour) and lets the constants live in TypeScript where they're already maintained.
- Existing events have **no** questionnaire row — that's exactly how legacy detection works (FR-025, Assumption "Legacy event detection"). The auto-seed only fires for *new* events (post-migration-009).
- DB trigger seeding was considered (R4-alt-1) but rejected: makes the schema's behaviour invisible from TS, and the option-list strings would have to be duplicated in SQL.

**Rationale**:
- Transactional atomicity: if any INSERT fails, Postgres rolls back all three in the same transaction. The original compensating-delete approach was best-effort and could leave an orphaned event row permanently classified as legacy.
- Codebase already has `SECURITY DEFINER` precedent (`get_user_role`, `handle_new_user` in migration 003).

**Alternatives considered**:
- App-code compensating delete — rejected: not truly atomic; a network failure during the compensating delete orphans the event row as a permanent legacy event.
- DB trigger on `events` insert — rejected: makes the schema behaviour invisible from TypeScript; option-list strings would need to be duplicated in SQL.
- Lazy-seed when builder first opened — rejected: contradicts FR-011 ("the questionnaire MUST be pre-seeded with three default-but-removable questions"); fire-on-open creates a write-on-read pattern and a race with two organizers opening simultaneously.

---

## R5 — Cache invalidation pattern (introduced by this spec)

**Decision**: New mutation actions call `revalidatePath()` for the routes whose data changes:

| Action | Paths revalidated |
|---|---|
| `createTemplate` / `updateTemplate` / `deleteTemplate` | `/dashboard/templates`, `/dashboard/templates/[id]` |
| `addEventQuestion` / `updateEventQuestion` / `deleteEventQuestion` / `reorderEventQuestions` / `saveAsTemplate` | `/dashboard/events/[id]`, `/dashboard/templates` (saveAsTemplate only) |
| `submitDynamicApplication` | `/dashboard/applications`, `/dashboard/applications/[id]`, `/vendor-dashboard/applications` |

Existing actions (`createEvent`, `updateEventStatus`) are amended to revalidate `/dashboard/events` and `/dashboard/events/[id]` since they now also touch questionnaire state (lock-on-publish in `updateEventStatus`, auto-seed in `createEvent`). This is a small, scoped backfill — not a repo-wide sweep.

**Rationale**: Constitution Principle IV mandates `revalidatePath()` for any mutating action that changes data rendered by an existing route. The codebase inventory confirmed this pattern is currently absent — this spec introduces it. We do **not** retrofit `applications.ts` review-status mutations; that's tracked as a separate cleanup if needed, not bundled here.

**Alternatives considered**:
- `unstable_cache` + tag-based invalidation — rejected for now: more machinery than the project needs, and `revalidatePath` is the simpler entry point per Next 16 docs. Revisit if measured `/dashboard` LCP exceeds 2.5 s (Constitution IV trigger).

---

## R6 — Question-type representation in the database

**Decision**: A single `question_type` Postgres enum with 11 values matching the type names used in TS:
```sql
create type question_type as enum (
  'short_text', 'long_text', 'email', 'phone', 'url',
  'number', 'date', 'single_select', 'multi_select',
  'yes_no', 'file_upload'
);
```
Used by both `template_questions.type` and `event_questions.type` columns.

In TypeScript, the same list is exported as a `QUESTION_TYPES` const tuple in `src/components/questionnaire/question-types.ts`, and a Zod enum is derived from it. The shared list keeps the DB enum and TS literal in lockstep.

**Rationale**:
- Postgres enum prevents invalid values at the data layer; matches existing pattern (`user_role` enum).
- TS-side const tuple plus Zod enum gives the form builder a typed source of truth without duplicating the strings.
- Enum changes require a migration — appropriate friction given Q5 clarification (no new types in this version).

**Alternatives considered**:
- `text` column with CHECK constraint — rejected: Postgres enum is the established repo pattern and the type is closed per spec.
- Lookup table `question_types(id, key)` — rejected: pure overengineering for an 11-value closed set.

---

## R7 — Position/ordering semantics

**Decision**: Both `template_questions` and `event_questions` carry an `integer position not null` column with `unique (template_id, position)` / `unique (event_questionnaire_id, position)` constraints. Reorder action takes an ordered list of question IDs and updates positions atomically inside a single SQL `update ... from (values ...)` to avoid the unique-constraint collision during pairwise swap.

**Rationale**: Standard, well-understood. Avoids the "fractional indexing" pattern's complexity for a small-N UI where full re-issue is cheap.

**Alternatives considered**:
- Float-based sparse positions (`position numeric`) — rejected: solves a problem we don't have at this scale.
- Linked-list (`previous_question_id`) — rejected: O(N) reads to render in order, no advantage for small N.

---

## R8 — Template ownership soft-deletion semantics (Q4 clarification)

**Decision**: `questionnaire_templates.created_by` is `uuid references auth.users(id) on delete set null`. RLS for UPDATE/DELETE:
```
USING (
  (created_by is not null and created_by = auth.uid())
  OR get_user_role() = 'admin'
)
```
A template with `created_by = null` is editable / deletable only by admins. Read RLS is unconditional for organizers + admins.

**Rationale**: Direct mapping of Q4 clarification. `ON DELETE SET NULL` is the DB-level mechanism; the RLS predicate handles the role-downgrade case implicitly because `requireRole('organizer')` upstream prevents non-organizers from even reaching the action. The "creator demoted to vendor" case fails closed because they no longer pass the `requireRole` guard.

**Alternatives considered**:
- `created_by_email text` — rejected: emails can change, harder to JOIN.
- Cascade delete + audit log — rejected: loses the template (Q4 disallowed).

---

## R9 — Dynamic form validation at request time (FR-021)

**Decision**: `DynamicApplicationForm` (client) generates a per-questionnaire Zod schema at mount time using `buildAnswersSchema(questions)` from `src/lib/questionnaire/answer-coercion.ts`. The schema is keyed by question ID and uses the discriminated union from R1. Show-if-hidden questions are stripped from the validation set on submit via `evaluateShowIf` (R2).

The server-side `submitDynamicApplication` action **re-builds the schema from the stored questions** (does not trust client-supplied schema or shape) and revalidates everything before INSERT.

**Rationale**: Client schema gives instant feedback; server schema closes the trust gap. Both share `buildAnswersSchema` so they cannot drift.

**Alternatives considered**:
- Generic `z.record(z.unknown())` with manual checks per question — rejected: error messages would be uniformly bad; per-field path-based errors require a real schema.

---

## R10 — File-upload reuse for `file_upload` answers

**Decision**: The dynamic submit flow uploads each `file_upload` answer's File via the existing `uploadAttachment` action (`src/lib/actions/upload.ts`) **before** writing the `application_answers` row, and stores the returned storage path inside the JSONB `value` (R1's `{ kind: "file", path, name, mimeType, size }`). No new bucket. No schema change to the `attachments` table — that table continues to back legacy applications only; new dynamic file answers live entirely inside `application_answers.value`.

**Rationale**: Minimal scope. `attachments` table is preserved for legacy continuity (FR-027, FR-028). Answer-attached files are conceptually owned by their answer row, not by the application directly, so embedding the file metadata in the answer JSONB is the cleanest model.

**Alternatives considered**:
- Reuse the `attachments` table with a nullable `application_answer_id` foreign key — rejected: bifurcates ownership, requires schema migration, complicates legacy-vs-dynamic branching in renderers.

---

## R11 — Public submission action authorization (FR-024)

**Decision**: `submitDynamicApplication` is a public (unauthenticated) server action. It does **not** call `requireRole`. Its trust posture matches the existing legacy `submitApplication` in `applications.ts` (which also runs public). Validation is the only gate. The corresponding RLS policy permits `INSERT` on `applications` and `application_answers` to the `anon` role, gated on the event being `active` and (for answers) on the answer row matching a valid `event_questions.id` for that event.

**Rationale**: Consistent with FR-024 and the existing public-submit precedent. Constitution I requires `requireRole()` "for any mutation **or privileged read**" — public submission is by definition not privileged.

**Alternatives considered**:
- Anonymous magic-link or CAPTCHA — out of scope; not requested by the spec and would be a separate constitutional question (logging/observability).

---

## R12 — Renumbering / migration prefix

**Decision**: The new migration is `supabase/migrations/009_dynamic_questionnaires.sql`. (Migration `008_drop_user_roles.sql` is the most recent in `supabase/migrations/`, confirmed by inventory.) Header style mirrors `005_rbac_rls_policies.sql` and `008_drop_user_roles.sql`.

**Rationale**: Append-only; numerically next; matches FR-005 ("the next in sequence after migration 008").

---

## Open items rolled forward to Phase 1

None. All Phase 0 NEEDS-CLARIFICATION concerns are resolved by the spec's own Clarifications section (Q1–Q5) plus the decisions above. Phase 1 begins with `data-model.md`.
