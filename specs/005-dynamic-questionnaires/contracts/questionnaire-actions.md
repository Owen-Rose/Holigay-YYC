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

## `addEventQuestion(input)`

```ts
const addQuestionSchema = z.object({
  eventId: z.string().uuid(),
  question: questionInputSchema,
  position: z.number().int().min(0),     // insert position (existing siblings shift right)
});
```

**Authorization**: `requireRole('organizer')`. Event status MUST be `draft` (FR-017).

**Behavior**:
1. App-layer guard: SELECT `events.status` for `eventId`; if not `draft`, return failure (defense in depth + clearer error than the RLS denial).
2. SELECT existing positions; shift positions ≥ `input.position` up by 1.
3. INSERT new question at `input.position`.
4. Validate show-if (forward-ref / cycle / trigger-type) over the new full question set.
5. `revalidatePath('/dashboard/events/[id]', 'page')`.

**Returns**: `{ success, error, data: { questionId: string } | null }`.

---

## `updateEventQuestion(input)`

```ts
const updateQuestionSchema = z.object({
  questionId: z.string().uuid(),
  question: questionInputSchema,
});
```

**Authorization**: `requireRole('organizer')`. Parent event MUST be `draft`.

**Behavior**:
1. Resolve `event_questionnaire_id` and `event_id` for the question.
2. App-layer guard on event status.
3. UPDATE the row in place (position unchanged).
4. Re-validate show-if over the full sibling set after the update is applied (in-memory).
5. `revalidatePath('/dashboard/events/[id]', 'page')`.

**Returns**: `{ success, error, data: null }`.

---

## `deleteEventQuestion(questionId: string)`

**Authorization**: `requireRole('organizer')`. Parent event MUST be `draft`.

**Behavior**:
1. App-layer guard on event status.
2. Reject if any sibling question has a `show_if.questionId` referencing this question — surface a "this question is referenced by Q3 ('…') — remove that rule first" error. (Cycle prevention is the stronger behavior than auto-clearing the dependent rule, which would silently change unrelated questions.)
3. DELETE the row.
4. Re-pack `position` of remaining siblings (no gaps).
5. `revalidatePath('/dashboard/events/[id]', 'page')`.

**Returns**: `{ success, error, data: null }`.

---

## `reorderEventQuestions(input)`

```ts
const reorderSchema = z.object({
  eventId: z.string().uuid(),
  orderedQuestionIds: z.array(z.string().uuid()).min(1),
});
```

**Authorization**: `requireRole('organizer')`. Event MUST be `draft`.

**Behavior**:
1. App-layer guard on event status.
2. Verify `orderedQuestionIds` is exactly the current set for that event's questionnaire (size + identity match) — return failure on mismatch.
3. UPDATE positions atomically via `UPDATE … FROM (VALUES …) AS …` (or two-step: set to negatives then to final positives) to avoid the unique-constraint collision.
4. Re-run `validateShowIfRules` over the full question set with updated positions applied (positions changed → previously-valid forward-refs may have flipped; any violation rejects the entire reorder).
5. `revalidatePath('/dashboard/events/[id]', 'page')`.

**Returns**: `{ success, error, data: null }`.

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
