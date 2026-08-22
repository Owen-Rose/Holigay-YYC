-- Holigay Vendor Market - Close the Public Data Exposure
-- Migration: 011_close_public_data_exposure.sql
-- Spec: specs/006-close-public-data-exposure/
--
-- Seven broad `anon` RLS policies currently grant blanket read/write on the
-- four private tables, so anyone holding the public anon key can dump vendor
-- PII, application records (including organizer_notes), attachment paths, and
-- application answers straight through PostgREST.
--
-- This migration replaces that posture, in order:
--
--   §1  Create `submit_public_application(jsonb)` — one transactional
--       SECURITY DEFINER entry point serving both the legacy static form and
--       the dynamic questionnaire form.
--   §2  Revoke the default PUBLIC EXECUTE on the two existing SECURITY DEFINER
--       RPCs (both are anon-callable today — verified, research.md R6).
--   §3  Drop the seven broad anon policies, keeping the three intentionally
--       public read policies.
--   §4  Codify the `attachments` storage bucket and its policies.
--
-- §1 comes first so the file never leaves the database in a state where public
-- submission is broken, even mid-apply (research.md R7).
--
-- Contract: specs/006-close-public-data-exposure/contracts/submit-public-application.md

-- ============================================
-- §1  Transactional public submission RPC
-- ============================================

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
-- RETURNS TABLE output names (application_id, vendor_id, event_date, …) are
-- also plpgsql variables and collide with real column names on applications,
-- application_answers, and events. `use_column` resolves every ambiguous
-- reference to the column; all locals below are v_-prefixed so nothing else
-- is affected, and the final RETURN QUERY reads only locals.
#variable_conflict use_column
DECLARE
  v_event_id     uuid  := (p_submission->>'event_id')::uuid;
  v_vendor       jsonb := p_submission->'vendor';
  v_legacy       jsonb := p_submission->'legacy';
  -- Normalize the optional branches: absent, JSON null, and non-array all
  -- collapse to an empty array so the length checks below are always safe.
  v_answers      jsonb := CASE
                            WHEN jsonb_typeof(p_submission->'answers') = 'array'
                              THEN p_submission->'answers'
                            ELSE '[]'::jsonb
                          END;
  v_attachments  jsonb := CASE
                            WHEN jsonb_typeof(p_submission->'attachments') = 'array'
                              THEN p_submission->'attachments'
                            ELSE '[]'::jsonb
                          END;

  v_event_name        text;
  v_event_date        date;
  v_event_status      text;
  v_questionnaire_id  uuid;
  v_vendor_id         uuid;
  v_vendor_created    boolean;
  v_application_id    uuid;
BEGIN
  -- ---------------------------------------------------------------
  -- 1. Event gate (FR-007)
  --    SECURITY DEFINER bypasses RLS, so this check is mandatory here
  --    rather than inherited from the (now dropped) anon policies.
  -- ---------------------------------------------------------------
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

  -- ---------------------------------------------------------------
  -- 2. Answer-ownership gate (research.md R11)
  --    The RPC is anonymously callable and must not trust its caller.
  -- ---------------------------------------------------------------
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

  -- ---------------------------------------------------------------
  -- 3. Vendor upsert by email (FR-005)
  --    Never writes email or user_id: email is the conflict key, and
  --    user_id must survive for handle_new_user()'s email linking.
  -- ---------------------------------------------------------------
  INSERT INTO vendors (business_name, contact_name, email, phone, website, description)
  VALUES (
    v_vendor->>'business_name',
    v_vendor->>'contact_name',
    v_vendor->>'email',
    NULLIF(v_vendor->>'phone', ''),
    NULLIF(v_vendor->>'website', ''),
    NULLIF(v_vendor->>'description', '')
  )
  ON CONFLICT (email) DO UPDATE
    SET business_name = EXCLUDED.business_name,
        contact_name  = EXCLUDED.contact_name,
        phone         = EXCLUDED.phone,
        website       = EXCLUDED.website,
        description   = EXCLUDED.description,
        updated_at    = now()
  RETURNING id, (xmax = 0) INTO v_vendor_id, v_vendor_created;

  -- ---------------------------------------------------------------
  -- 4. Application insert with the duplicate gate (FR-006)
  --    A conflict yields no RETURNING row -> NULL id -> P0003, which
  --    rolls the vendor upsert back with it (FR-008).
  -- ---------------------------------------------------------------
  INSERT INTO applications (
    event_id, vendor_id, status,
    booth_preference, product_categories, special_requirements
  )
  VALUES (
    v_event_id,
    v_vendor_id,
    'pending',
    NULLIF(v_legacy->>'booth_preference', ''),
    CASE
      WHEN jsonb_typeof(v_legacy->'product_categories') = 'array'
        THEN ARRAY(SELECT jsonb_array_elements_text(v_legacy->'product_categories'))
      ELSE NULL
    END,
    NULLIF(v_legacy->>'special_requirements', '')
  )
  ON CONFLICT (event_id, vendor_id) DO NOTHING
  RETURNING id INTO v_application_id;

  IF v_application_id IS NULL THEN
    RAISE EXCEPTION 'You have already submitted an application for this event'
      USING ERRCODE = 'P0003';
  END IF;

  -- ---------------------------------------------------------------
  -- 5. Answers bulk insert
  --    UNIQUE(application_id, event_question_id) backstops duplicate
  --    payload entries (23505 -> rollback -> generic error).
  -- ---------------------------------------------------------------
  IF jsonb_array_length(v_answers) > 0 THEN
    INSERT INTO application_answers (application_id, event_question_id, value)
    SELECT
      v_application_id,
      (a.value->>'event_question_id')::uuid,
      a.value->'value'
    FROM jsonb_array_elements(v_answers) AS a;
  END IF;

  -- ---------------------------------------------------------------
  -- 6. Attachments insert (FR-004)
  --    Inside the transaction now: a failure here fails the whole
  --    submission instead of silently committing an attachment-less
  --    application (research.md R4).
  -- ---------------------------------------------------------------
  IF jsonb_array_length(v_attachments) > 0 THEN
    INSERT INTO attachments (application_id, file_name, file_path, file_type, file_size)
    SELECT
      v_application_id,
      t.value->>'file_name',
      t.value->>'file_path',
      t.value->>'file_type',
      NULLIF(t.value->>'file_size', '')::integer
    FROM jsonb_array_elements(v_attachments) AS t;
  END IF;

  RETURN QUERY
  SELECT v_application_id, v_vendor_id, v_vendor_created, v_event_name, v_event_date;
END;
$$;

COMMENT ON FUNCTION public.submit_public_application(jsonb) IS
  'Transactional public application submission for both form variants. '
  'Anonymously callable by design; re-checks event status and answer ownership itself. '
  'Errors: P0002 event not found, P0001 event not active, P0003 duplicate, P0004 foreign answer.';

REVOKE ALL    ON FUNCTION public.submit_public_application(jsonb) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.submit_public_application(jsonb) TO anon, authenticated;

-- ============================================
-- §2  Harden the existing SECURITY DEFINER RPCs
-- ============================================
--
-- PostgreSQL grants EXECUTE to PUBLIC by default on new functions, so 009's and
-- 010's `GRANT ... TO authenticated` were additive no-ops: both functions are
-- anon-callable over PostgREST today. Confirmed empirically against the local
-- stack (research.md, T004 results) — neither returned 42501.
--
-- Deliberately NOT revoked: get_user_role() (returns only the caller's own role,
-- and is referenced by the RLS policies that must keep evaluating for anon) and
-- handle_new_user() (returns trigger; not exposed by PostgREST).

REVOKE EXECUTE ON FUNCTION public.create_event_with_default_questionnaire(jsonb)
  FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.ensure_event_questionnaire(uuid)
  FROM PUBLIC, anon;

-- ============================================
-- §3  Drop the seven broad anon policies
-- ============================================
--
-- Their jobs move into §1's RPC: vendor lookup/create, duplicate detection,
-- application + answer + attachment writes all happen inside one SECURITY
-- DEFINER transaction now.

DROP POLICY IF EXISTS "anon_insert_vendors"             ON vendors;
DROP POLICY IF EXISTS "anon_select_vendors"             ON vendors;
DROP POLICY IF EXISTS "anon_insert_applications"        ON applications;
DROP POLICY IF EXISTS "anon_select_applications"        ON applications;
DROP POLICY IF EXISTS "anon_insert_attachments"         ON attachments;
DROP POLICY IF EXISTS "anon_select_attachments"         ON attachments;
DROP POLICY IF EXISTS "anon_insert_application_answers" ON application_answers;

-- Intentionally KEPT — the public apply page reads these:
--   anon_select_active_events          (events,               status = 'active')
--   anon_select_event_questionnaires   (event_questionnaires, USING true)
--   anon_select_event_questions        (event_questions,      USING true)

-- ============================================
-- §4  Storage: attachments bucket + policies
-- ============================================
--
-- Moves the bucket rules out of the dashboard and into version control
-- (FR-011), and closes anonymous download.
--
-- storage.objects is owned by supabase_storage_admin while migrations run as
-- `postgres`, which is neither that role nor a superuser. Policy creation
-- still succeeds because Supabase's supautils extension grants `postgres`
-- policy management on the storage and auth tables
-- (`supautils.policy_grants`) — the carve-out preserved by the April-2025
-- storage lockdown. Verified empirically on the local stack; research.md R19.
--
-- Deliberately NOT emitted: ALTER TABLE storage.objects ENABLE ROW LEVEL
-- SECURITY. RLS is already on, and altering storage tables is outside the
-- carve-out — that statement is what breaks other projects' `db reset`.

INSERT INTO storage.buckets (id, name, public)
VALUES ('attachments', 'attachments', false)
ON CONFLICT (id) DO NOTHING;

-- Drop EVERY existing policy on storage.objects: prod's were created in the
-- dashboard under unknown names, and `attachments` is this project's only
-- bucket, so drop-all-then-recreate is the only deterministic reset (R8).
DO $$
DECLARE
  v_policy record;
BEGIN
  FOR v_policy IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON storage.objects', v_policy.policyname);
  END LOOP;
END $$;

-- Anonymous upload stays open: the apply flow uploads before the vendor has
-- any session, and uploadFile() never uses upsert, so INSERT alone suffices.
CREATE POLICY "attachments_anon_insert"
  ON storage.objects FOR INSERT TO anon, authenticated
  WITH CHECK (bucket_id = 'attachments');

-- Download becomes authenticated-only. The dashboard's createSignedUrl()
-- authorizes against the calling role's SELECT policy and runs under an
-- authenticated organizer session, so it keeps working (research.md R9).
CREATE POLICY "attachments_authenticated_select"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'attachments');

CREATE POLICY "attachments_authenticated_delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'attachments');
