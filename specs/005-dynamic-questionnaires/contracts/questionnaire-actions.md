# Contract: Event-questionnaire server actions

File: `src/lib/actions/questionnaires.ts`

All actions follow the project pattern (see `templates-actions.md` preamble).

---

## `getEventQuestionnaire(eventId: string)`

Read-side. Returns the questionnaire and its questions for one event. Falls back gracefully if no questionnaire row exists (legacy events — FR-025).

**Authorization**: `requireRole('organizer')`.

**Returns**:
```ts
type GetEventQuestionnaireResponse = {
  success: boolean;
  error: string | null;
  data: {
    eventId: string;
    questionnaire: {
      id: string;
      lockedAt: string | null;
      seededFromTemplateId: string | null;
    } | null;                            // null when legacy event (no auto-seed pre-migration-009)
    questions: EventQuestionRow[];       // ordered by position; empty array when questionnaire is null
  } | null;
};
```

**Used by**: `/dashboard/events/[id]/page.tsx` (RSC), passed to `<QuestionnaireBuilder>` client component as initial state.

---

## `saveEventQuestionnaire(eventId: string, questions: unknown)`

*Phase 11 (2026-09) — replaces the four per-question actions (`addEventQuestion`,
`updateEventQuestion`, `deleteEventQuestion`, `reorderEventQuestions`) that shipped with
the original spec. Their contracts are kept in git history; the builder no longer calls
them and they no longer exist.*

`questions` is the **complete** questionnaire in display order. Array index becomes
`position`; persisted questions carry their `id`, new ones carry a client-assigned UUID
(the builder assigns it in `addQuestion`, so a later question can already reference it in a
show-if rule). Validated by `questionnaireInputSchema` (`validations/questionnaire.ts`):
per-question field rules, option constraints, ≤ 200 questions, unique ids, and the full
`validateShowIfRules` pass (forward refs, cycles, trigger type, option keys).

**Authorization**: `requireRole('organizer')`, then `requireDraftEvent` (clearer message for
the common case). The RPC re-checks role, draft status and lock itself.

**Behavior**:
1. Zod `safeParse` — any failure returns before the database is touched.
2. One call to `save_event_questionnaire(p_event_id, p_questions, p_seeded_from_template_id := NULL)`
   via the shared helper `src/lib/actions/_internal/save-questionnaire.ts`.
3. `revalidatePath('/dashboard/events/[id]', 'page')` on success.

**Returns**: `{ success, error, data: EventQuestionRow[] | null }` — the saved rows ordered
by position, which the builder adopts as its new state.

**Error mapping** (`src/lib/questionnaire/save-errors.ts`; raw messages are logged, never
surfaced):

| SQLSTATE | Raised when | Message |
|---|---|---|
| `42501` | caller is not organizer/admin (or has no EXECUTE) | You do not have permission to edit this questionnaire |
| `P0002` | event or template not found | Event or template not found |
| `P0001` | event not draft, or `locked_at` set | This event has been published; its questionnaire is locked |
| `P0004` | non-array, > 200, missing/duplicate id, id belongs to another questionnaire, show_if not earlier in payload | Questionnaire payload is invalid. Reload the page and try again. |
| `23503` | a removed question already has `application_answers` | Cannot remove a question that already has answers |
| other | CHECK violations, transport | Failed to save questionnaire |

### RPC: `save_event_questionnaire(uuid, jsonb, uuid) RETURNS SETOF event_questions`

Migration `012_atomic_questionnaire_save.sql`. `SECURITY DEFINER`, `EXECUTE` granted to
`authenticated` only. One transaction:

1. Role gate: `get_user_role() IN ('organizer','admin')` else `42501`.
2. Payload shape checks (`P0004`).
3. `ensure_event_questionnaire(p_event_id)` — `P0002` / `P0001`, creates the row for legacy
   events — then `SELECT … FOR UPDATE` on the questionnaire row; `locked_at IS NOT NULL` → `P0001`.
4. Template existence when `p_seeded_from_template_id` is given (`P0002`).
5. Ownership: every payload id that already exists must belong to this questionnaire (`P0004`).
6. Every `show_if.questionId` must be an earlier element of the payload (`P0004`).
7. `SET CONSTRAINTS event_questions_event_questionnaire_id_position_key DEFERRED` (made
   `DEFERRABLE INITIALLY IMMEDIATE` by the same migration); `DELETE` rows not in the payload;
   `INSERT … ON CONFLICT (id) DO UPDATE` with `position = ordinal − 1`.
8. `UPDATE event_questionnaires SET seeded_from_template_id = COALESCE(p_seeded_from_template_id, seeded_from_template_id), updated_at = now()`.
9. `RETURN QUERY` the questionnaire's rows ordered by position.

Proven against a real stack by `src/test/security/questionnaire-save.test.ts` (Q1–Q16).

---

## `saveEventQuestionnaireAsTemplate(input)`

```ts
const saveAsTemplateSchema = z.object({
  eventId: z.string().uuid(),
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(2000).nullable(),
});
```

**Authorization**: `requireRole('organizer')`. Event status irrelevant (organizers can save a published questionnaire as a template too).

**Behavior**:
1. SELECT `event_questions` for the event (ordered).
2. INSERT `questionnaire_templates` row with `created_by = auth.uid()`.
3. Bulk INSERT corresponding `template_questions`, remapping show-if `questionId` references via the new template's question id map.
4. `revalidatePath('/dashboard/templates')`.

**Returns**: `{ success, error, data: { templateId: string } | null }`.

---

## `setQuestionnaireLock(eventId: string)` *(internal, called from updateEventStatus)*

Not directly exposed to the UI. Called inside `updateEventStatus` (existing in `events.ts`) when an event transitions `draft → active`.

**Behavior**:
1. UPDATE `event_questionnaires` SET `locked_at = now()` WHERE `event_id = $1` AND `locked_at IS NULL`.
2. Idempotent: a re-call on an already-locked questionnaire is a no-op (Edge Cases / FR-019).

**Returns**: `void` (failure surfaced via the parent action's response).

---

## `events.updateEventStatus` modifications

Existing action in `src/lib/actions/events.ts`. Modify so that on the `draft → active` transition:
1. UPDATE `events` row.
2. Call `setQuestionnaireLock(eventId)`.
3. `revalidatePath('/dashboard/events')`, `revalidatePath('/dashboard/events/[id]', 'page')`.

The order matters: lock must be set *after* the event row reaches `active` so the data-layer "draft only" gate fires correctly for any concurrent edit attempt.

---

## `events.createEvent` modifications

Existing action. Modify so that after a successful `events.insert`:
1. INSERT `event_questionnaires` row (`event_id` = new event id).
2. Bulk INSERT three `event_questions` from `DEFAULT_EVENT_QUESTIONS` (R4).
3. If either fails: DELETE the event row (compensation) and return failure.
4. `revalidatePath('/dashboard/events')`.

This keeps post-migration events ready for `/apply` immediately (Assumption "Auto-seeding on event creation").
