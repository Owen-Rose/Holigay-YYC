# Contract: Migration `015_vendor_links_and_account_linking.sql`

**Feature**: 011-vendor-linking-and-contact-fields | **Date**: 2026-10-31
**Kind**: PostgreSQL migration (DDL + one data move + three PL/pgSQL functions)
**Applies to**: local stack (`supabase db reset`), then the dev project, then the prod project
(quickstart rows D1 and P1). Append-only; nothing earlier is edited.

This is the SQL the migration task writes, verbatim except for the header comment. Reasoning in
`research.md` R1, R3, R4, R5.

## §1 — Storage for the product links

```sql
ALTER TABLE public.vendors
  ADD COLUMN product_links text[] NOT NULL DEFAULT '{}';

ALTER TABLE public.vendors
  ADD CONSTRAINT vendors_product_links_shape CHECK (
    cardinality(product_links) <= 3
    AND array_position(product_links, NULL) IS NULL
    AND NOT ('' = ANY (product_links))
  );

COMMENT ON COLUMN public.vendors.product_links IS
  'Up to three ordered, gap-free http(s) URLs where the organizers can view the vendor''s '
  'products (spec 011, migration 015). Replaces website, which is retained but no longer read.';
COMMENT ON COLUMN public.vendors.website IS
  'Retired by spec 011 (migration 015): copied into product_links[1]; no longer read or written.';
COMMENT ON COLUMN public.vendors.phone IS
  'Retired by spec 011 (migration 015): no longer collected, shown or written.';
```

## §2 — Website → Link 1 (FR-016)

```sql
UPDATE public.vendors
SET product_links = ARRAY[
  CASE
    WHEN btrim(website) ~* '^https?://' THEN btrim(website)
    ELSE 'https://' || btrim(website)
  END
]
WHERE NULLIF(btrim(website), '') IS NOT NULL
  AND cardinality(product_links) = 0;
```

Idempotent (the `cardinality = 0` guard). A former website value that is not a web address after
prefixing (none exist on either hosted project; prod was reset 2026-10-08) would still pass the
CHECK — the CHECK is about shape, the URL rule lives in the app and the RPC.

## §3 — Private helper: tie one account to one vendor row, never re-point

```sql
CREATE OR REPLACE FUNCTION public.link_vendor_account_rows(p_vendor_id uuid, p_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile_vendor_id uuid;
  v_updated           uuid;
BEGIN
  IF p_vendor_id IS NULL OR p_user_id IS NULL THEN
    RETURN false;
  END IF;

  -- An account already tied to a different vendor row is never re-pointed (FR-004).
  SELECT vendor_id INTO v_profile_vendor_id
  FROM user_profiles
  WHERE id = p_user_id;

  IF v_profile_vendor_id IS NOT NULL AND v_profile_vendor_id <> p_vendor_id THEN
    RETURN false;
  END IF;

  -- Claim the vendor row only while it is untied.
  UPDATE vendors
     SET user_id = p_user_id
   WHERE id = p_vendor_id
     AND user_id IS NULL
  RETURNING id INTO v_updated;

  IF v_updated IS NULL THEN
    -- No row changed: either already this account's (fine) or someone else's (refuse).
    IF NOT EXISTS (
      SELECT 1 FROM vendors WHERE id = p_vendor_id AND user_id = p_user_id
    ) THEN
      RETURN false;
    END IF;
  END IF;

  UPDATE user_profiles
     SET vendor_id = p_vendor_id
   WHERE id = p_user_id
     AND vendor_id IS NULL;

  RETURN true;
END;
$$;

COMMENT ON FUNCTION public.link_vendor_account_rows(uuid, uuid) IS
  'Ties one account to one vendor row in both directions (vendors.user_id, user_profiles.vendor_id). '
  'Never re-points an existing tie on either side. Internal: called only by submit_public_application '
  'and link_vendor_account; not executable by any API role (spec 011).';

REVOKE ALL ON FUNCTION public.link_vendor_account_rows(uuid, uuid) FROM PUBLIC, anon, authenticated;
```

Outcomes:

| State before | Result | Writes |
|---|---|---|
| both untied | `true` | both columns |
| vendors row untied, profile already → this row (half-tied) | `true` | `vendors.user_id` only |
| vendors row → this user, profile NULL (half-tied) | `true` | `user_profiles.vendor_id` only |
| fully tied to each other | `true` | none |
| profile → another vendor | `false` | none |
| vendors row → another user | `false` | none |
| either id NULL / no such row | `false` | none |

## §4 — Self-heal RPC (FR-001, FR-003, FR-022)

```sql
CREATE OR REPLACE FUNCTION public.link_vendor_account()
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid       uuid := auth.uid();
  v_email     text;
  v_vendor_id uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  -- Already tied: heal a half-tied pair if needed, change nothing otherwise.
  SELECT vendor_id INTO v_vendor_id
  FROM user_profiles
  WHERE id = v_uid;

  IF v_vendor_id IS NOT NULL THEN
    PERFORM link_vendor_account_rows(v_vendor_id, v_uid);
    RETURN v_vendor_id;
  END IF;

  -- The caller's own verified address is the only input (FR-003).
  SELECT lower(u.email) INTO v_email
  FROM auth.users u
  WHERE u.id = v_uid;

  IF v_email IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT v.id INTO v_vendor_id
  FROM vendors v
  WHERE lower(v.email) = v_email
    AND (v.user_id IS NULL OR v.user_id = v_uid)
  ORDER BY (v.email = v_email) DESC, v.created_at
  LIMIT 1;

  IF v_vendor_id IS NULL THEN
    RETURN NULL;
  END IF;

  IF link_vendor_account_rows(v_vendor_id, v_uid) THEN
    RETURN v_vendor_id;
  END IF;

  RETURN NULL;
END;
$$;

COMMENT ON FUNCTION public.link_vendor_account() IS
  'Ties the calling account to the untied vendor row whose email matches the account''s address '
  '(case-insensitive). Returns the tied vendor id, or NULL when nothing matches. Signed-in only '
  '(42501). Acts only on the caller (spec 011 FR-001/FR-003).';

REVOKE ALL ON FUNCTION public.link_vendor_account() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.link_vendor_account() TO authenticated;
```

Outcomes (the `security-test-matrix.md` L-rows):

| Caller | State | Returns | Writes |
|---|---|---|---|
| anon | — | error `42501` (permission denied on the function; PostgREST surfaces the grant refusal before the body runs) | none |
| signed in | profile already tied | that `vendor_id` | none, unless half-tied (unreachable from the app — the resolver short-circuits; hand edits only) |
| signed in | untied row with `lower(email)` = account address | that row's id | both columns |
| signed in | matching row tied to another account | `NULL` | none |
| signed in | no row matches | `NULL` | none |

## §5 — Replacement `submit_public_application` (FR-002, FR-019, FR-021)

Same signature, same `RETURNS TABLE`, same `#variable_conflict use_column` note as 011. Grants are
not restated (unchanged from 011: `REVOKE ALL FROM PUBLIC; GRANT EXECUTE TO anon, authenticated`).

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
  v_questionnaire_id  uuid;
  v_vendor_id         uuid;
  v_vendor_created    boolean;
  v_application_id    uuid;
BEGIN
  -- 1. Event gate (006 FR-007) — unchanged
  SELECT e.name, e.event_date, e.status
    INTO v_event_name, v_event_date, v_event_status
  FROM events e
  WHERE e.id = v_event_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Event not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_event_status <> 'active' THEN
    RAISE EXCEPTION 'Event is not accepting applications' USING ERRCODE = 'P0001';
  END IF;

  -- 2. Answer-ownership gate (006 R11) — unchanged
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

  -- 4. Product links: ≤ 3 absolute http(s) URLs, blanks dropped (011 FR-011/FR-012).
  --    `website` is accepted as a one-element fallback only while a deploy that still
  --    sends it may be live (research R3); the app never sends it after spec 011.
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

  -- 5. Vendor upsert by email (006 FR-005). Never writes user_id here: that is the
  --    helper's job in step 7. Links sent empty keep whatever is stored (deploy window).
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

  -- 6. Application insert with the duplicate gate (006 FR-006) — fixed-form columns no longer written
  INSERT INTO applications (event_id, vendor_id, status)
  VALUES (v_event_id, v_vendor_id, 'pending')
  ON CONFLICT (event_id, vendor_id) DO NOTHING
  RETURNING id INTO v_application_id;

  IF v_application_id IS NULL THEN
    RAISE EXCEPTION 'You have already submitted an application for this event'
      USING ERRCODE = 'P0003';
  END IF;

  -- 7. Link at submit (011 FR-002): the upserted row's email is the account's address.
  --    The helper never re-points an existing tie (FR-004) and returns false silently.
  IF v_uid IS NOT NULL THEN
    PERFORM link_vendor_account_rows(v_vendor_id, v_uid);
  END IF;

  -- 8. Answers bulk insert — unchanged
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

COMMENT ON FUNCTION public.submit_public_application(jsonb) IS
  'Transactional public application submission for the questionnaire form (spec 011 replaced the '
  '006 body: product_links instead of phone/website, fixed-form and attachments branches dropped, '
  'a signed-in caller''s account address wins and the account is tied to the vendor row). '
  'Anonymously callable by design; re-checks event status and answer ownership itself. '
  'Errors: P0002 event not found, P0001 event not active, P0003 duplicate, P0004 foreign answer, '
  '22023 bad email or product links.';
```

Ordering note: the link step (7) runs after the duplicate gate (6) on purpose — a duplicate
submission rolls everything back including the tie, so a refused submission changes nothing
(story 1 scenario 10 by extension; the dashboard self-heal catches the tie on the next read).

## SQLSTATE contract

| Code | Raised by | Meaning | App message (`mapSubmissionError`) |
|---|---|---|---|
| `P0002` | submit §1 | event not found | `Event not found` |
| `P0001` | submit §1 | event not active | `This event is not currently accepting applications` |
| `P0003` | submit §6 | duplicate application | `You have already submitted an application for this event` |
| `P0004` | submit §2 | answer outside the questionnaire / no questionnaire | `Your submission contained invalid answers…` |
| `22023` | submit §3, §4 | email missing; more than three links; a link not `http(s)` or over 500 chars | generic `Failed to create application` (Zod refuses first with a field message) |
| `42501` | `link_vendor_account` | no session | not mapped — the resolver treats any error as "not linked" and logs the code |
| `23514` | CHECK `vendors_product_links_shape` | defence in depth; unreachable through the RPC after §4 | generic |

## Verification on the local stack (part of the migration PR)

```bash
npx supabase db reset                 # 001 → 015 apply cleanly
npm run db:types:local                # database.ts gains product_links + the two functions
npm run test:security                 # vendor-linking.test.ts + the updated suites pass
```

Read-back after reset, as the service role:

```sql
SELECT conname FROM pg_constraint WHERE conrelid = 'public.vendors'::regclass AND conname = 'vendors_product_links_shape';
SELECT proname, prosecdef FROM pg_proc WHERE proname IN ('link_vendor_account', 'link_vendor_account_rows', 'submit_public_application');
SELECT has_function_privilege('anon', 'public.link_vendor_account()', 'EXECUTE');             -- false
SELECT has_function_privilege('authenticated', 'public.link_vendor_account()', 'EXECUTE');    -- true
SELECT has_function_privilege('authenticated', 'public.link_vendor_account_rows(uuid, uuid)', 'EXECUTE'); -- false
```
