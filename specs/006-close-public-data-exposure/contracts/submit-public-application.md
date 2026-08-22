# Contract: `public.submit_public_application(p_submission jsonb)`

**Feature**: 006-close-public-data-exposure
**Kind**: PostgreSQL function (PL/pgSQL), invoked via PostgREST
`POST /rest/v1/rpc/submit_public_application` / supabase-js
`.rpc('submit_public_application', { p_submission }).single()`
**Security**: `SECURITY DEFINER`, `SET search_path = public`;
`REVOKE ALL ... FROM PUBLIC; GRANT EXECUTE ... TO anon, authenticated;`

The function is anonymously callable by design and therefore trusts nothing in
its input: it re-checks event status and answer/question ownership itself.
App-layer validation (Zod schema, show-if re-evaluation, required-emptiness)
runs in the server actions *before* this call; the function is the
defense-in-depth and atomicity layer, not the primary validator.

## Input: `p_submission` (jsonb)

```jsonc
{
  "event_id": "uuid",                     // required
  "vendor": {                             // required
    "business_name": "text",              // required
    "contact_name": "text",               // required
    "email": "text",                      // required — upsert key
    "phone": "text | null",
    "website": "text | null",
    "description": "text | null"
  },
  "legacy": {                             // null/absent for dynamic submissions
    "booth_preference": "text | null",
    "product_categories": ["text"],       // or null
    "special_requirements": "text | null"
  },
  "answers": [                            // null/absent for legacy submissions
    {
      "event_question_id": "uuid",
      "value": { /* AnswerValue jsonb, e.g. {"kind":"text","value":"..."} */ }
    }
  ],
  "attachments": [                        // null/absent for dynamic submissions
    {
      "file_name": "text",
      "file_path": "text",                // storage path already uploaded by uploadFile
      "file_type": "text",
      "file_size": 12345                  // or null
    }
  ]
}
```

Empty-string `phone`/`website`/`description` are normalized to NULL
(`NULLIF`). Empty arrays are treated like null branches.

## Output

`RETURNS TABLE` — exactly one row on success (call with `.single()`):

| Column | Type | Meaning |
|---|---|---|
| `application_id` | uuid | The created application |
| `vendor_id` | uuid | The created-or-updated vendor |
| `vendor_created` | boolean | true = new vendor row, false = existing vendor updated (`xmax = 0` idiom) |
| `event_name` | text | For the confirmation email (saves a round-trip) |
| `event_date` | date | For the confirmation email |

Generated type lands in `Database['public']['Functions']['submit_public_application']`.

> Implementer note: `RETURNS TABLE` output names shadow plpgsql variables —
> table-qualify every column reference in the body (`e.event_date`, never bare
> `event_date`). Documented fallback if this bites: `RETURNS jsonb` + Zod
> parse in the actions (R1).

## Behavior (one transaction, in order)

1. **Event gate** (FR-007): event row must exist (`P0002`) and have
   `status = 'active'` (`P0001`). SECURITY DEFINER bypasses RLS, so this check
   is mandatory here, not inherited from policies.
2. **Answer-ownership gate** (edge case / R11): if `answers` is a non-empty
   array, the event must have a questionnaire and every `event_question_id`
   must belong to it, else `P0004`.
3. **Vendor upsert** (FR-005): `INSERT ... ON CONFLICT (email) DO UPDATE SET
   business_name, contact_name, phone, website, description, updated_at =
   now()`. Never writes `email` or `user_id`.
4. **Application insert** (FR-006): `status = 'pending'`, legacy fields from
   the `legacy` branch (NULL when absent); `ON CONFLICT (event_id, vendor_id)
   DO NOTHING`; a NULL returned id means duplicate → `P0003` (which rolls the
   vendor upsert back too).
5. **Answers bulk insert**: from `answers` (COALESCE to empty array).
   `UNIQUE(application_id, event_question_id)` backstops duplicate payload
   entries (23505 → rollback → generic error).
6. **Attachments insert** (FR-004): from `attachments` (COALESCE to empty
   array). Any failure rolls back the entire submission.

Any raise/violation at any step leaves **zero** partial records (FR-008).

## Errors

Raised via `RAISE EXCEPTION ... USING ERRCODE`; PostgREST surfaces the
SQLSTATE as `error.code`:

| ERRCODE | Condition | Friendly message (mapped by `mapSubmissionError`, `src/lib/submission/errors.ts`) |
|---|---|---|
| `P0002` | event id not found | "Event not found" |
| `P0001` | event not `active` | "This event is not currently accepting applications" |
| `P0003` | duplicate application (vendor+event) | "You have already submitted an application for this event" |
| `P0004` | answers present but event has no questionnaire, or an `event_question_id` is foreign to it | "Your submission contained invalid answers. Please reload the page and try again." |
| other | constraint violation / unexpected | "Failed to create application" |

Contract rule: server actions map by `error.code` **only** and return canned
strings; raw `error.message`/`details`/`hint` never cross to the caller (they
go to `console.error`). Duplicate-friendly message must match today's string
in `applications.ts`/`answers.ts` exactly (SC-005).

## Callers

- `submitApplication` (`src/lib/actions/applications.ts`): `legacy` +
  `attachments` populated, `answers: null`. Uses returned
  `event_name`/`event_date` for the confirmation email; returns
  `{ applicationId, vendorId }` in `data` as today.
- `submitDynamicApplication` (`src/lib/actions/answers.ts`): `answers`
  populated (visible ∩ known ∩ non-empty), `legacy: null`,
  `attachments: null`. Email remains fire-and-forget.

## Concurrency guarantees

- Two simultaneous submissions, same new email: serialize on the vendor row
  lock; exactly one vendor row (edge case).
- Two simultaneous duplicate applications: exactly one wins; the loser gets
  `P0003` and its transaction (vendor update included) rolls back.
