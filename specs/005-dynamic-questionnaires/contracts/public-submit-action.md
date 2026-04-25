# Contract: Public dynamic application submission

File: `src/lib/actions/answers.ts`

The single action exposed to anonymous (`anon`) callers from `/apply`. Mirrors the existing legacy `submitApplication` in `applications.ts` for the auth posture (FR-024, R11). Differs by writing one `application_answers` row per visible question rather than the three legacy columns.

---

## `submitDynamicApplication(input: SubmitDynamicApplicationInput)`

```ts
const submitDynamicApplicationSchema = z.object({
  eventId: z.string().uuid(),
  vendor: vendorContactSchema,            // mirrors legacy: business_name, contact_name, email, phone, …
  answers: z.array(z.object({
    questionId: z.string().uuid(),
    value: answerValueSchema,             // discriminated-union, R1
  })),
});
```

**Authorization**: NONE — public action. Validation is the only gate.

**Behavior** (in this exact order):
1. SELECT `events` row for `eventId`. Reject if not found, or `status != 'active'`. (Same first-line check as the legacy submit.)
2. SELECT `event_questionnaires` for the event:
   - **Branch A (no questionnaire)**: should not happen for post-migration events; the legacy form route (`apply/legacy-form.tsx` or whatever exists today) still uses `submitApplication`. If `submitDynamicApplication` is invoked against a legacy event, return failure ("This event uses the legacy form").
   - **Branch B (questionnaire exists)**: SELECT `event_questions` ordered.
3. Server-side rebuild the answers Zod schema from the selected questions (R9). Re-validate `input.answers` against it. Reject on parse failure.
4. Apply `evaluateShowIf` (R2) over `input.answers` to determine the visible-question set:
   - Walk in `position` order; track `answersSoFar` as a running snapshot.
   - For each question, if its `show_if` evaluates to `false`, mark hidden.
   - Hidden questions: their `required` flag is ignored, and their submitted answer (if any) is dropped.
5. Required-validation: every visible required question MUST have a non-empty answer; reject otherwise (per-question error path, surfaced as "answers.<questionId>: required").
6. For each `file_upload` answer:
   - The client uploaded the file separately via `uploadAttachment` (existing) before submit.
   - The `value` payload arrives as `{ kind: "file", path, name, mimeType, size }`. Validate `path` is non-empty; trust the prior upload.
   - (Re-uploading server-side is not needed.)
7. Insert/find `vendors` row by email (mirrors existing legacy submit logic):
   - If a vendor exists with this `email`, reuse its id.
   - Else INSERT a new vendor with `user_id = null`.
8. INSERT `applications` row with `status = 'pending'`, `event_id = input.eventId`, `vendor_id = …`, `user_id = null` (public submission). The three legacy columns (`booth_preference`, `product_categories`, `special_requirements`) are written as `NULL` — they only carry data for legacy submissions (FR-028).
9. Bulk INSERT `application_answers` (one row per *visible* question). Use a single multi-row INSERT for atomicity.
10. Trigger the existing `application-received` email (best-effort; matches legacy behaviour).
11. `revalidatePath('/dashboard/applications')`, `revalidatePath('/vendor-dashboard/applications')`.

**Returns**:
```ts
type SubmitDynamicApplicationResponse = {
  success: boolean;
  error: string | null;
  data: { applicationId: string } | null;
};
```

**Failure modes** (return shape — never throws):
- 400: schema parse failure (per-field path returned in error message), missing required answers, invalid file payload.
- 409: event not active.
- 500-equivalent: DB write failure (rolled back; partial inserts cleaned up via Postgres transaction or compensating delete).

**Trust boundary notes**:
- The client-side `evaluateShowIf` decides which inputs to render but the server is authoritative; the server runs the same evaluator and uses *its* visible-set as the truth.
- `application_answers` UNIQUE (application_id, event_question_id) prevents duplicate rows even under retry.

---

## File-upload pre-step (for `file_upload` answers)

Lives in `src/lib/actions/upload.ts` — already exists; **no contract change**. The dynamic form invokes `uploadAttachment(file)` per file before submit, receives `{ path, name, mimeType, size }`, and stuffs it into the answer's `value` payload. Re-using existing upload semantics:
- 10 MB limit, images + PDFs only (existing `MAX_FILE_SIZE`, `ALLOWED_FILE_TYPES`).
- Storage bucket: `attachments`.
- Path format: `uploads/{timestamp}-{random}-{sanitized-filename}`.

---

## Read paths (no new actions)

For the review page rendering, the existing `getApplicationDetail` action in `applications.ts` is extended to **also** fetch `application_answers` rows for the application (LEFT JOIN onto `event_questions`), and the response shape gains a `dynamicAnswers: AnswerWithQuestion[] | null` field. When `null`, the application predates the feature (legacy renderer used). The Phase-2 task list will spell out the exact signature change.
