# Contract: `submit_public_application(jsonb)` v3

**Feature**: 012-vendor-data-isolation | **Date**: 2026-11-22
**Replaces**: the 015 body (`specs/011-vendor-linking-and-contact-fields/contracts/submit-public-application-v2.md`)
**Reasoning**: `research.md` R3, R9.

Same name, argument, return type, `SECURITY DEFINER`, `search_path = public` and grants
(`anon`, `authenticated`). The payload is unchanged: no caller sends anything new. Two gates are
added, and the answer gate also caps the number of file answers (review of #89, `research.md`
"Review of the migration PR"); every other check, its order and its error are as in v2 (FR-020).

## Order of checks

| # | Step | Error | Change |
|---|---|---|---|
| 1 | Event exists | `P0002` Event not found | |
| 1a | Event is `active` | `P0001` Event is not accepting applications | |
| **1b** | **Deadline day has not ended in Edmonton** | **`P0001` Event is not accepting applications** | **new** |
| 2 | Every answer's question belongs to the event's questionnaire; **no more file answers than the form has file questions** | `P0004` | **file cap new** |
| 3 | Contact identity (a signed-in caller's account address wins) | `22023` | |
| 4 | Product links | `22023` | |
| 5 | Vendor upsert by email | | |
| 6 | Application insert; duplicate gate | `P0003` | |
| **7** | **File-claim gate** | **`P0005` A file in this submission is already attached to another application** | **new** |
| 8 | Account tie (`link_vendor_account_rows`) | | renumbered |
| 9 | Answers insert | | renumbered |

Any raise rolls the whole call back: no vendor row, no application, no answers (FR-002, story 4
scenario 1).

## 1b — the deadline gate (FR-018, FR-019)

```sql
SELECT e.name, e.event_date, e.status, e.application_deadline
  INTO v_event_name, v_event_date, v_event_status, v_event_deadline
FROM events e
WHERE e.id = v_event_id;

IF NOT FOUND THEN
  RAISE EXCEPTION 'Event not found' USING ERRCODE = 'P0002';
END IF;

IF v_event_status <> 'active' THEN
  RAISE EXCEPTION 'Event is not accepting applications' USING ERRCODE = 'P0001';
END IF;

-- The deadline is a calendar day, read in Edmonton. The day itself is open (BL-20's rule).
IF v_event_deadline IS NOT NULL
   AND v_event_deadline < (now() AT TIME ZONE 'America/Edmonton')::date THEN
  RAISE EXCEPTION 'Event is not accepting applications' USING ERRCODE = 'P0001';
END IF;
```

| `application_deadline` | Edmonton date now | Result |
|---|---|---|
| NULL | any | accepted |
| 2026-12-01 | 2026-11-30 | accepted |
| 2026-12-01 | 2026-12-01 (any time of day) | accepted |
| 2026-12-01 | 2026-12-02 00:00 | `P0001` |

The comparison is on dates in `America/Edmonton`, so it follows the daylight-saving changes
without the function knowing about them. `mapSubmissionError` already maps `P0001` to "This
event is not currently accepting applications"; the form shows it inline and keeps what the
vendor typed (BL-23). A caller cannot tell a late submission from a closed event.

## 2 — the file-answer cap (review of #89)

```sql
IF (
  SELECT count(*)
  FROM jsonb_array_elements(v_answers) AS a
  WHERE a.value->'value'->>'kind' = 'file'
) > (
  SELECT count(*)
  FROM event_questions q
  WHERE q.event_questionnaire_id = v_questionnaire_id
    AND q.type = 'file_upload'
) THEN
  RAISE EXCEPTION 'More file answers than the form has file questions'
    USING ERRCODE = 'P0004';
END IF;
```

Runs inside the answer gate, after the foreign-question check and before any write or lock, so
a payload names at most as many files as the form has file questions. The app sends at most
one answer per question, so it never trips this; `mapSubmissionError` maps `P0004` to its
existing invalid-answers message. A question answered twice with non-file values still fails
late at step 9 (`23505`, the `UNIQUE (application_id, event_question_id)` from 009), rolled
back whole, as `submission-rpc.test.ts` S8 expects.

## 7 — the file-claim gate (FR-002)

Runs after the application insert has succeeded, so the new application exists and has no
answers yet: any reference found belongs to another application.

```sql
SELECT array_agg(DISTINCT f.path)
  INTO v_file_paths
FROM (
  SELECT a.value->'value'->>'path' AS path
  FROM jsonb_array_elements(v_answers) AS a
  WHERE a.value->'value'->>'kind' = 'file'
) AS f
WHERE f.path IS NOT NULL
  AND f.path <> '';

IF v_file_paths IS NOT NULL THEN
  -- Serialize every file claim behind one transaction lock: a second submission naming the
  -- same file waits for the first to commit, then sees its row. One lock per call whatever
  -- the payload, so no call can exhaust the shared lock table.
  PERFORM pg_advisory_xact_lock(hashtextextended('submit_public_application:file_claim', 0));

  IF EXISTS (
       SELECT 1 FROM application_answers aa
       WHERE aa.value->>'kind' = 'file'
         AND aa.value->>'path' = ANY (v_file_paths)
     )
     OR EXISTS (
       SELECT 1 FROM attachments t
       WHERE t.file_path = ANY (v_file_paths)
     ) THEN
    RAISE EXCEPTION 'A file in this submission is already attached to another application'
      USING ERRCODE = 'P0005';
  END IF;
END IF;
```

New locals: `v_event_deadline date`, `v_file_paths text[]`.

**One lock, not one per path** (review of #89). The first draft took one advisory lock per
distinct path, sorted. Nothing bounded the number of paths, so one anonymous call naming
thousands of them exhausted Postgres's shared lock table, failing writes in every other
session until it ended. One fixed key serializes every file-bearing submission for the rest of
its transaction instead. At this app's volume the wait is nothing, and the per-call lock count
is one whatever the payload. The step-2 file-answer cap bounds the payload as well.

| Situation | Result |
|---|---|
| File named by nobody | accepted; the file is now this application's |
| File named by another application's file answer | `P0005`, nothing stored |
| File named by another application's `attachments` row | `P0005`, nothing stored |
| Same file named by two different questions in this one payload | accepted (one application) |
| More file answers than the form has file questions | `P0004` at step 2, nothing stored, no lock taken |
| Two submissions name a file at the same moment | the second waits on the lock; if it names the first's file it then sees the first's row: `P0005` |
| Vendor resubmits to the same event with the same files | `P0003` at step 6, as today; the claim gate is never reached |
| A refused submission (any code) named the file, then the vendor retries | accepted; the refused one left no reference |
| Payload has no file answers | gate skipped |

`P0005` is deliberately **not** added to `MESSAGE_BY_CODE` in `src/lib/submission/errors.ts`:
the form shows its generic "Failed to create application", as the spec's Assumptions state.
Specific wording is a follow-up if Owen wants it.

## Function comment

```sql
COMMENT ON FUNCTION public.submit_public_application(jsonb) IS
  'Transactional public application submission for the questionnaire form. Spec 012 '
  '(migration 016) added two gates to the 015 body: an event whose application deadline day '
  'has ended in Edmonton is refused like a non-active one, and a file another application '
  'already refers to cannot be named. Anonymously callable by design; trusts nothing from its '
  'caller. Errors: P0002 event not found, P0001 event not active or past its deadline, '
  'P0003 duplicate, P0004 foreign answer or too many files, P0005 file already attached elsewhere, '
  '22023 bad email or product links.';
```

## Callers

- `submitDynamicApplication` (`src/lib/actions/answers.ts`): no change.
- `scripts/smoke-check.mjs`: no change. Its one call sends the nil event id and expects
  `P0002`, which is raised before either new gate.
- The apply page lists only events the gate would accept (`getActiveEvents`), so the gate is
  reached only from a form opened before the deadline or a kept link (story 4 scenario 4).

## Full body

The migration file carries this function verbatim, followed by the comment above. It is the
015 body with the two gates, the file-answer cap, two new locals and renumbered step
comments; nothing else differs. The 2026-11-22 dry run passed the first draft (one lock per
path, no file-answer cap). This text replaced it after the review of #89 and is proven by the
security suite (I17–I20, I35–I38) rather than by the dry run.

```sql
CREATE OR REPLACE FUNCTION public.submit_public_application(p_submission jsonb)
RETURNS TABLE (
  application_id  uuid,
  vendor_id       uuid,
  vendor_created  boolean,
  event_name      text,
  event_date      date
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
  v_event_id      uuid  := (p_submission->>'event_id')::uuid;
  v_vendor        jsonb := p_submission->'vendor';
  v_answers       jsonb := CASE
                             WHEN jsonb_typeof(p_submission->'answers') = 'array'
                               THEN p_submission->'answers'
                             ELSE '[]'::jsonb
                           END;
  -- `legacy` and `attachments` keys are ignored (spec 011 FR-019).

  v_uid           uuid  := auth.uid();
  v_account_email text;
  v_email         text;
  v_website       text  := NULLIF(btrim(COALESCE(v_vendor->>'website', '')), '');
  v_links         text[];

  v_event_name        text;
  v_event_date        date;
  v_event_status      text;
  v_event_deadline    date;
  v_questionnaire_id  uuid;
  v_vendor_id         uuid;
  v_vendor_created    boolean;
  v_application_id    uuid;
  v_file_paths        text[];
BEGIN
  -- 1. Event gate (006 FR-007) + deadline day (012 FR-018)
  SELECT e.name, e.event_date, e.status, e.application_deadline
    INTO v_event_name, v_event_date, v_event_status, v_event_deadline
  FROM events e
  WHERE e.id = v_event_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Event not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_event_status <> 'active' THEN
    RAISE EXCEPTION 'Event is not accepting applications' USING ERRCODE = 'P0001';
  END IF;

  IF v_event_deadline IS NOT NULL
     AND v_event_deadline < (now() AT TIME ZONE 'America/Edmonton')::date THEN
    RAISE EXCEPTION 'Event is not accepting applications' USING ERRCODE = 'P0001';
  END IF;

  -- 2. Answer-ownership gate (006 R11), plus the file-answer cap (012)
  IF jsonb_array_length(v_answers) > 0 THEN
    SELECT eq.id INTO v_questionnaire_id
    FROM event_questionnaires eq
    WHERE eq.event_id = v_event_id;

    IF v_questionnaire_id IS NULL THEN
      RAISE EXCEPTION 'Event has no questionnaire' USING ERRCODE = 'P0004';
    END IF;

    IF EXISTS (
      SELECT 1
      FROM jsonb_array_elements(v_answers) AS a
      WHERE NOT EXISTS (
        SELECT 1
        FROM event_questions q
        WHERE q.id = (a.value->>'event_question_id')::uuid
          AND q.event_questionnaire_id = v_questionnaire_id
      )
    ) THEN
      RAISE EXCEPTION 'Answer references a question outside this event''s questionnaire'
        USING ERRCODE = 'P0004';
    END IF;

    -- No more file answers than the form has file questions (012). Checked here, before any
    -- write or lock, so a payload cannot carry an unbounded number of file paths.
    IF (
      SELECT count(*)
      FROM jsonb_array_elements(v_answers) AS a
      WHERE a.value->'value'->>'kind' = 'file'
    ) > (
      SELECT count(*)
      FROM event_questions q
      WHERE q.event_questionnaire_id = v_questionnaire_id
        AND q.type = 'file_upload'
    ) THEN
      RAISE EXCEPTION 'More file answers than the form has file questions'
        USING ERRCODE = 'P0004';
    END IF;
  END IF;

  -- 3. Contact identity: a signed-in caller's account address wins (011 FR-002)
  IF v_uid IS NOT NULL THEN
    SELECT lower(u.email) INTO v_account_email
    FROM auth.users u
    WHERE u.id = v_uid;
  END IF;

  v_email := COALESCE(v_account_email, lower(btrim(v_vendor->>'email')));

  IF v_email IS NULL OR v_email = '' THEN
    RAISE EXCEPTION 'Email is required' USING ERRCODE = '22023';
  END IF;

  -- 4. Product links (011 FR-011/FR-012): unchanged
  v_links := CASE
    WHEN jsonb_typeof(v_vendor->'product_links') = 'array' THEN
      ARRAY(
        SELECT btrim(l.value)
        FROM jsonb_array_elements_text(v_vendor->'product_links') AS l(value)
        WHERE btrim(l.value) <> ''
      )
    WHEN v_website IS NOT NULL THEN
      ARRAY[CASE WHEN v_website ~* '^https?://' THEN v_website ELSE 'https://' || v_website END]
    ELSE '{}'::text[]
  END;

  IF cardinality(v_links) > 3 OR EXISTS (
    SELECT 1 FROM unnest(v_links) AS l(value)
    WHERE l.value !~* '^https?://\S+$' OR length(l.value) > 500
  ) THEN
    RAISE EXCEPTION 'Invalid product links' USING ERRCODE = '22023';
  END IF;

  -- 5. Vendor upsert by email (006 FR-005): unchanged
  INSERT INTO vendors (business_name, contact_name, email, description, product_links)
  VALUES (
    v_vendor->>'business_name',
    v_vendor->>'contact_name',
    v_email,
    NULLIF(v_vendor->>'description', ''),
    v_links
  )
  ON CONFLICT (email) DO UPDATE
    SET business_name = EXCLUDED.business_name,
        contact_name  = EXCLUDED.contact_name,
        description   = EXCLUDED.description,
        product_links = CASE
                          WHEN cardinality(EXCLUDED.product_links) = 0 THEN vendors.product_links
                          ELSE EXCLUDED.product_links
                        END,
        updated_at    = now()
  RETURNING id, (xmax = 0) INTO v_vendor_id, v_vendor_created;

  -- 6. Application insert with the duplicate gate (006 FR-006): unchanged
  INSERT INTO applications (event_id, vendor_id, status)
  VALUES (v_event_id, v_vendor_id, 'pending')
  ON CONFLICT (event_id, vendor_id) DO NOTHING
  RETURNING id INTO v_application_id;

  IF v_application_id IS NULL THEN
    RAISE EXCEPTION 'You have already submitted an application for this event'
      USING ERRCODE = 'P0003';
  END IF;

  -- 7. File-claim gate (012 FR-002): a file another application refers to cannot be named.
  --    After the duplicate gate, so a resubmission still answers P0003. The new application
  --    has no answers yet, so any reference found is another application's.
  SELECT array_agg(DISTINCT f.path)
    INTO v_file_paths
  FROM (
    SELECT a.value->'value'->>'path' AS path
    FROM jsonb_array_elements(v_answers) AS a
    WHERE a.value->'value'->>'kind' = 'file'
  ) AS f
  WHERE f.path IS NOT NULL
    AND f.path <> '';

  IF v_file_paths IS NOT NULL THEN
    -- Serialize every file claim behind one transaction lock: a second submission naming the
    -- same file waits for the first to commit, then sees its row. One lock per call whatever
    -- the payload, so no call can exhaust the shared lock table.
    PERFORM pg_advisory_xact_lock(hashtextextended('submit_public_application:file_claim', 0));

    IF EXISTS (
         SELECT 1 FROM application_answers aa
         WHERE aa.value->>'kind' = 'file'
           AND aa.value->>'path' = ANY (v_file_paths)
       )
       OR EXISTS (
         SELECT 1 FROM attachments t
         WHERE t.file_path = ANY (v_file_paths)
       ) THEN
      RAISE EXCEPTION 'A file in this submission is already attached to another application'
        USING ERRCODE = 'P0005';
    END IF;
  END IF;

  -- 8. Link at submit (011 FR-002): unchanged
  IF v_uid IS NOT NULL THEN
    PERFORM link_vendor_account_rows(v_vendor_id, v_uid);
  END IF;

  -- 9. Answers bulk insert: unchanged
  IF jsonb_array_length(v_answers) > 0 THEN
    INSERT INTO application_answers (application_id, event_question_id, value)
    SELECT
      v_application_id,
      (a.value->>'event_question_id')::uuid,
      a.value->'value'
    FROM jsonb_array_elements(v_answers) AS a;
  END IF;

  RETURN QUERY
  SELECT v_application_id, v_vendor_id, v_vendor_created, v_event_name, v_event_date;
END;
$$;
```
