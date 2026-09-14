# Contract: Template server actions

File: `src/lib/actions/templates.ts`

All actions are `'use server'`. They follow the project pattern (matches `applications.ts`, `events.ts`):
- `requireRole('organizer')` first (admins are organizers + admin).
- Zod `safeParse` for input validation; surface `parsed.error.issues[0]?.message` on failure.
- Return literal shape `{ success: boolean; error: string | null; data: T | null }`.
- `revalidatePath()` on the routes affected.
- No throws across the server/client boundary.

Schemas live in `src/lib/validations/questionnaire.ts`.

---

## `listTemplates()`

Read-side. Lists templates visible to the caller (all organizers + admins read all — FR-008). Includes question count for the list page.

**Authorization**: `requireRole('organizer')`.

**Returns**:
```ts
type ListTemplatesResponse = {
  success: boolean;
  error: string | null;
  data:
    | Array<{
        id: string;
        name: string;
        description: string | null;
        createdBy: string | null;          // null when orphaned (Q4)
        createdByEmail: string | null;     // joined for display
        createdAt: string;
        updatedAt: string;
        questionCount: number;
      }>
    | null;
};
```

**Read query**: SELECT from `questionnaire_templates` LEFT JOIN `users_with_roles` view (existing) for email.

**Used by**: `/dashboard/templates/page.tsx`.

---

## `getTemplate(id: string)`

Read-side. Returns one template + its ordered questions.

**Authorization**: `requireRole('organizer')`.

**Returns**:
```ts
type GetTemplateResponse = {
  success: boolean;
  error: string | null;
  data: {
    template: TemplateRow;
    questions: TemplateQuestionRow[];   // ordered by position ASC
  } | null;
};
```

**Used by**: `/dashboard/templates/[id]/page.tsx`.

---

## `createTemplate(input: CreateTemplateInput)`

```ts
const createTemplateSchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(2000).nullable(),
  questions: z.array(questionInputSchema).min(0).max(200),  // soft cap matches Q5
});

type CreateTemplateInput = z.infer<typeof createTemplateSchema>;
```

**Authorization**: `requireRole('organizer')`.

**Behavior**:
1. Insert `questionnaire_templates` row with `created_by = auth.uid()`.
2. Insert all `template_questions` in a single bulk INSERT, with `position` = index in input.
3. Validate `show_if` references resolve to earlier questions (forward-ref + cycle + trigger-type guards) before INSERT.
4. `revalidatePath('/dashboard/templates')`.

**Returns**: `{ success, error, data: { id: string } | null }`.

**Failure modes**:
- 400-equivalent: schema parse failure; show-if guard failure (return per-question error).
- 403-equivalent: missing role.

---

## `updateTemplate(input: UpdateTemplateInput)`

```ts
const updateTemplateSchema = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(2000).nullable(),
  questions: z.array(questionInputSchema).min(0).max(200),
});
```

**Authorization**: `requireRole('organizer')`. RLS gates the row-level "creator or admin" rule (Q4).

**Behavior**:
1. Verify the row exists and the caller passes the RLS predicate (Supabase will reject implicitly otherwise).
2. UPDATE template name/description.
3. Reconcile questions:
   - DELETE existing `template_questions` for this template.
   - INSERT the new set with positions = input order.
   (Bulk replace is acceptable because templates are not referenced live by event questions — copy-on-attach.)
4. `revalidatePath('/dashboard/templates')`, `revalidatePath('/dashboard/templates/[id]', 'page')`.

**Returns**: `{ success, error, data: { id: string } | null }`.

---

## `deleteTemplate(id: string)`

**Authorization**: `requireRole('organizer')`. RLS handles "creator or admin" (Q4).

**Behavior**:
1. DELETE from `questionnaire_templates` — `template_questions` cascade.
2. `event_questionnaires.seeded_from_template_id` rows automatically SET NULL (data-model.md).
3. `revalidatePath('/dashboard/templates')`.

**Returns**: `{ success, error, data: null }`.

**Edge case enforced**: deleting a template does NOT remove event questions copied from it (per Edge Cases, FR-010).

---

## `seedEventQuestionnaireFromTemplate(input)`

```ts
const seedSchema = z.object({
  eventId: z.string().uuid(),
  templateId: z.string().uuid(),
  replaceExisting: z.boolean().default(false),  // safe default; UI must pass true explicitly
});
```

**Authorization**: `requireRole('organizer')`. Event must be `draft` (verified via app-layer guard + RLS).

**Behavior**:
1. Verify event exists and is in `draft` status (return failure if not).
2. Read `template_questions` for the given template (ordered).
3. If `replaceExisting`, DELETE existing `event_questions` for the event's questionnaire.
4. INSERT a copy of each template question into `event_questions`, preserving order; copy `show_if` rules verbatim (questionIds must be remapped: walk in position order, build oldId → newId map, rewrite show_if.questionId).
5. Set `event_questionnaires.seeded_from_template_id = templateId` (informational).
6. `revalidatePath('/dashboard/events/[id]', 'page')`.

**Returns**: `{ success, error, data: { eventQuestionnaireId, questionsCount } | null }`.

---

## Shared Zod fragment: `questionInputSchema`

```ts
const showIfSchema = z.object({
  questionIndex: z.number().int().min(0),  // index, remapped to id at INSERT time
  operator: z.literal('equals'),
  value: z.string().min(1).max(200),
});

const optionSchema = z.object({
  key: z.string().min(1).max(80),
  label: z.string().min(1).max(120),
});

const questionInputSchema = z.object({
  type: z.enum(QUESTION_TYPES),                 // 11 values
  label: z.string().trim().min(1).max(200),
  helpText: z.string().trim().max(500).nullable(),
  required: z.boolean().default(false),
  options: z.array(optionSchema).min(1).max(50).nullable(),
  showIf: showIfSchema.nullable(),
}).superRefine((q, ctx) => {
  if ((q.type === 'single_select' || q.type === 'multi_select') && (!q.options || q.options.length === 0)) {
    ctx.addIssue({ code: 'custom', path: ['options'], message: 'Choice questions require at least one option.' });
  }
  if (q.options) {
    const keys = q.options.map(o => o.key);
    if (new Set(keys).size !== keys.length) {
      ctx.addIssue({ code: 'custom', path: ['options'], message: 'Option keys must be unique.' });
    }
  }
});
```

Show-if validation across the question array (cycle + forward-ref + trigger-type guards) runs in a `.superRefine` on the wrapping schema (template / questionnaire).
