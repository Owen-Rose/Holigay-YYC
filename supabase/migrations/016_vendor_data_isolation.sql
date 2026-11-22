-- ============================================================================
-- 016: vendor data isolation
--
-- Spec 012 (specs/012-vendor-data-isolation/, 2026-11-22). A signed-in vendor
-- reads only what is theirs; organizer notes and the account list stay with
-- the organizers and admins; nobody deletes a file from a session; a
-- submission after the deadline day in Edmonton is refused.
--
--   §1 application_notes: organizer/admin-only notes store, one row per
--      application. Existing notes are carried over (the migration aborts if
--      the copy is not exact); applications.organizer_notes is emptied and
--      locked by a CHECK (FR-012, FR-013).
--   §2 storage.objects: the two broad authenticated policies (011) are
--      dropped; one read policy lets organizers/admins read every file and a
--      vendor read a file one of their own applications refers to. No delete
--      policy (FR-001, FR-003, FR-004).
--   §3 the three vendor-reachable INSERT policies on applications,
--      attachments and application_answers become organizer/admin-only;
--      vendors write only through submit_public_application (FR-030, FR-019).
--   §4 users_with_roles returns rows only to an admin session and the
--      service and owner roles; same columns and grants (FR-008, FR-009).
--   §5 template_creator_emails(): organizer/admin-only creator id + address
--      for the template list (FR-010).
--   §6 replaces submit_public_application(jsonb) from 015 in place: same
--      signature, return type and grants, plus a deadline gate (P0001), a
--      file-claim gate (P0005) behind one transaction lock, and a refusal of more
--      file answers than the form has file questions (P0004) (FR-002, FR-018 to
--      FR-020).
--
-- Append-only: no earlier migration is edited. Contracts:
-- contracts/migration-016.md, contracts/submit-public-application-v3.md.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- §1 Organizer notes store (FR-012, FR-013, FR-015)
-- ---------------------------------------------------------------------------

CREATE TABLE public.application_notes (
  application_id uuid        PRIMARY KEY REFERENCES public.applications(id) ON DELETE CASCADE,
  notes          text        NOT NULL CHECK (notes <> ''),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.application_notes IS
  'Organizer notes, one row per application; no row means no note. Readable and writable by '
  'organizers and admins only (spec 012, migration 016). Vendors read applications, never this.';

CREATE TRIGGER update_application_notes_updated_at
  BEFORE UPDATE ON public.application_notes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE public.application_notes ENABLE ROW LEVEL SECURITY;

-- Default privileges hand new tables to anon and authenticated in full.
REVOKE ALL ON public.application_notes FROM anon;
REVOKE TRUNCATE, REFERENCES, TRIGGER ON public.application_notes FROM authenticated;

CREATE POLICY "organizer_select_application_notes"
  ON public.application_notes FOR SELECT TO authenticated
  USING (public.get_user_role() IN ('organizer', 'admin'));

CREATE POLICY "organizer_insert_application_notes"
  ON public.application_notes FOR INSERT TO authenticated
  WITH CHECK (public.get_user_role() IN ('organizer', 'admin'));

CREATE POLICY "organizer_update_application_notes"
  ON public.application_notes FOR UPDATE TO authenticated
  USING (public.get_user_role() IN ('organizer', 'admin'))
  WITH CHECK (public.get_user_role() IN ('organizer', 'admin'));

CREATE POLICY "organizer_delete_application_notes"
  ON public.application_notes FOR DELETE TO authenticated
  USING (public.get_user_role() IN ('organizer', 'admin'));

-- Carry every note over, empty the old column and lock it, as one statement. A DO block is
-- one transaction however the file is applied (the Supabase CLI sends a migration statement
-- by statement), so the table lock holds from the copy to the CHECK: a note saved by the
-- old code in between cannot be lost (review of #89).
DO $$
DECLARE
  v_source bigint;
  v_copied bigint;
BEGIN
  -- Hold off every concurrent write to applications until this commits (reads still run).
  LOCK TABLE public.applications IN SHARE ROW EXCLUSIVE MODE;

  -- Carry every existing note over (FR-013). The note keeps the application's timestamp.
  INSERT INTO public.application_notes (application_id, notes, updated_at)
  SELECT a.id, a.organizer_notes, a.updated_at
  FROM public.applications a
  WHERE a.organizer_notes IS NOT NULL
    AND a.organizer_notes <> '';

  -- None lost: abort the whole migration if the copy is not exact.
  SELECT count(*) INTO v_source
  FROM public.applications
  WHERE organizer_notes IS NOT NULL AND organizer_notes <> '';

  SELECT count(*) INTO v_copied
  FROM public.application_notes n
  JOIN public.applications a ON a.id = n.application_id
  WHERE n.notes = a.organizer_notes;

  IF v_source <> v_copied THEN
    RAISE EXCEPTION '016: % notes to carry over, % copied', v_source, v_copied;
  END IF;

  -- Empty the old column without moving anyone's "Last Updated".
  ALTER TABLE public.applications DISABLE TRIGGER update_applications_updated_at;
  UPDATE public.applications SET organizer_notes = NULL WHERE organizer_notes IS NOT NULL;
  ALTER TABLE public.applications ENABLE TRIGGER update_applications_updated_at;

  ALTER TABLE public.applications
    ADD CONSTRAINT applications_organizer_notes_retired CHECK (organizer_notes IS NULL);
END $$;

COMMENT ON COLUMN public.applications.organizer_notes IS
  'Retired by spec 012 (migration 016): notes live in application_notes. Always NULL (CHECK).';

-- ---------------------------------------------------------------------------
-- §2 Storage rules (FR-001, FR-003, FR-004, FR-006, FR-007)
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "attachments_authenticated_select" ON storage.objects;
DROP POLICY IF EXISTS "attachments_authenticated_delete" ON storage.objects;

-- Organizers and admins read every file. A vendor reads a file only when one of their own
-- applications refers to it, as a file answer or as an attachment record (spec 012 FR-001).
-- The subqueries run as the caller, under the caller's own RLS on these tables.
CREATE POLICY "attachments_select_own_or_organizer"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'attachments'
    AND (
      public.get_user_role() IN ('organizer', 'admin')
      OR EXISTS (
        SELECT 1
        FROM public.application_answers aa
        JOIN public.applications a ON a.id = aa.application_id
        JOIN public.vendors v ON v.id = a.vendor_id
        WHERE v.user_id = auth.uid()
          AND aa.value->>'kind' = 'file'
          AND aa.value->>'path' = objects.name
      )
      OR EXISTS (
        SELECT 1
        FROM public.attachments t
        JOIN public.applications a ON a.id = t.application_id
        JOIN public.vendors v ON v.id = a.vendor_id
        WHERE v.user_id = auth.uid()
          AND t.file_path = objects.name
      )
    )
  );

-- ---------------------------------------------------------------------------
-- §3 Vendors write only through the RPC (FR-030, FR-019)
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "authenticated_insert_applications" ON public.applications;
CREATE POLICY "organizer_insert_applications"
  ON public.applications FOR INSERT TO authenticated
  WITH CHECK (public.get_user_role() IN ('organizer', 'admin'));

DROP POLICY IF EXISTS "authenticated_insert_attachments" ON public.attachments;
CREATE POLICY "organizer_insert_attachments"
  ON public.attachments FOR INSERT TO authenticated
  WITH CHECK (public.get_user_role() IN ('organizer', 'admin'));

DROP POLICY IF EXISTS "authenticated_insert_application_answers" ON public.application_answers;
CREATE POLICY "organizer_insert_application_answers"
  ON public.application_answers FOR INSERT TO authenticated
  WITH CHECK (
    public.get_user_role() IN ('organizer', 'admin')
    AND EXISTS (
      SELECT 1
      FROM public.applications a
      JOIN public.events e ON e.id = a.event_id
      WHERE a.id = application_id
        AND e.status = 'active'
    )
    AND EXISTS (
      SELECT 1
      FROM public.event_questions q
      JOIN public.event_questionnaires eq ON eq.id = q.event_questionnaire_id
      JOIN public.applications a ON a.event_id = eq.event_id
      WHERE q.id = event_question_id
        AND a.id = application_id
    )
  );

-- ---------------------------------------------------------------------------
-- §4 The account list (FR-008, FR-009, FR-011)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE VIEW public.users_with_roles
WITH (security_barrier = true) AS
SELECT
  u.id,
  u.email::text AS email,
  COALESCE(p.role, 'vendor'::user_role) AS role,
  u.created_at,
  p.updated_at AS role_updated_at,
  (u.email_confirmed_at IS NULL AND u.last_sign_in_at IS NULL) AS invite_pending
FROM auth.users u
LEFT JOIN public.user_profiles p ON p.id = u.id
WHERE public.get_user_role() = 'admin'
   OR current_user IN ('service_role', 'postgres', 'supabase_admin');

COMMENT ON VIEW public.users_with_roles IS
  'Every account with its role and pending-invite flag. Rows are returned only to an admin '
  'session and to the service and owner roles (spec 012, migration 016); any other caller '
  'gets none. anon has no privilege on it (migration 013).';

-- ---------------------------------------------------------------------------
-- §5 Template creators (FR-010)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.template_creator_emails()
RETURNS TABLE (creator_id uuid, email text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role user_role := get_user_role();
BEGIN
  IF v_role IS NULL OR v_role NOT IN ('organizer', 'admin') THEN
    RAISE EXCEPTION 'Organizer role required' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT u.id, u.email::text
  FROM auth.users u
  WHERE EXISTS (
    SELECT 1 FROM questionnaire_templates t WHERE t.created_by = u.id
  );
END;
$$;

COMMENT ON FUNCTION public.template_creator_emails() IS
  'Email address of each account that created a questionnaire template, for the template list. '
  'Organizer or admin session only (42501 otherwise); takes no input (spec 012 FR-010).';

REVOKE ALL ON FUNCTION public.template_creator_emails() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.template_creator_emails() TO authenticated;

-- ---------------------------------------------------------------------------
-- §6 Replacement `submit_public_application` (FR-002, FR-018 to FR-020)
-- ---------------------------------------------------------------------------

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

COMMENT ON FUNCTION public.submit_public_application(jsonb) IS
  'Transactional public application submission for the questionnaire form. Spec 012 '
  '(migration 016) added two gates to the 015 body: an event whose application deadline day '
  'has ended in Edmonton is refused like a non-active one, and a file another application '
  'already refers to cannot be named. Anonymously callable by design; trusts nothing from its '
  'caller. Errors: P0002 event not found, P0001 event not active or past its deadline, '
  'P0003 duplicate, P0004 foreign answer or too many files, P0005 file already attached elsewhere, '
  '22023 bad email or product links.';
