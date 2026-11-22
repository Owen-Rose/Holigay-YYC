# Contract: Migration `016_vendor_data_isolation.sql`

**Feature**: 012-vendor-data-isolation | **Date**: 2026-11-22
**File**: `supabase/migrations/016_vendor_data_isolation.sql` (new; append-only, FR-024)
**Reasoning**: `research.md` R1–R9, R12. **Function body detail**:
`submit-public-application-v3.md`.

One file, six sections, applied as one transaction. No earlier migration is edited. One new
table (`application_notes`, approved in the spec's Clarifications); no other table gains or
loses a column.

| § | Does | Requirements |
|---|---|---|
| 1 | `application_notes` + RLS; carries existing notes over; empties and locks `applications.organizer_notes` | FR-012, FR-013, FR-015 |
| 2 | Storage: drops the two broad policies, creates the scoped read | FR-001, FR-003, FR-004, FR-006, FR-007 |
| 3 | Replaces the three vendor-reachable INSERT policies | FR-030, FR-019 |
| 4 | `users_with_roles` filters itself | FR-008, FR-009, FR-011 |
| 5 | `template_creator_emails()` | FR-010 |
| 6 | `submit_public_application` replaced in place: deadline gate, file-claim gate | FR-002, FR-018–FR-020 |

## §1 Organizer notes store

```sql
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

-- Carry every existing note over (FR-013). The note keeps the application's timestamp.
INSERT INTO public.application_notes (application_id, notes, updated_at)
SELECT a.id, a.organizer_notes, a.updated_at
FROM public.applications a
WHERE a.organizer_notes IS NOT NULL
  AND a.organizer_notes <> '';

-- None lost: abort the whole migration if the copy is not exact.
DO $$
DECLARE
  v_source bigint;
  v_copied bigint;
BEGIN
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
END $$;

-- Empty the old column without moving anyone's "Last Updated".
ALTER TABLE public.applications DISABLE TRIGGER update_applications_updated_at;
UPDATE public.applications SET organizer_notes = NULL WHERE organizer_notes IS NOT NULL;
ALTER TABLE public.applications ENABLE TRIGGER update_applications_updated_at;

ALTER TABLE public.applications
  ADD CONSTRAINT applications_organizer_notes_retired CHECK (organizer_notes IS NULL);

COMMENT ON COLUMN public.applications.organizer_notes IS
  'Retired by spec 012 (migration 016): notes live in application_notes. Always NULL (CHECK).';
```

| Before | After |
|---|---|
| `applications.organizer_notes` holds the note; a vendor may read their own row | column is NULL on every row and cannot be set; the note is a row of `application_notes` |
| organizers write notes with `UPDATE applications` | organizers upsert or delete the `application_notes` row |
| a vendor's `UPDATE` of the column: zero rows (policy) | unchanged, and the CHECK refuses any role that tries, service role included |

## §2 Storage rules

```sql
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
```

`attachments_anon_insert` (INSERT for `anon` and `authenticated`) is untouched (FR-005). After
this section `storage.objects` has exactly two policies. There is no DELETE and no UPDATE
policy, so no signed-in or anonymous session can delete, overwrite or move an object; the
service role bypasses RLS (reset runbook, harness cleanup).

As in 011 §4: no `ALTER TABLE storage.objects`; policy changes rely on the supautils carve-out
that lets `postgres` manage policies on storage tables.

## §3 Vendors write only through the RPC

```sql
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
```

The answers policy keeps 009's two guards and adds the role check. `submit_public_application`
is `SECURITY DEFINER` and does not pass through these policies.

## §4 The account list

```sql
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
```

Same columns, same order, same grants as 013. The select list is restated because
`CREATE OR REPLACE VIEW` requires it.

| Caller | Before | After |
|---|---|---|
| anon | `42501` | `42501` |
| vendor, organizer session | every account | zero rows |
| admin session | every account | every account |
| service role | every account | every account |

## §5 Template creators

```sql
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
```

## §6 `submit_public_application`

`CREATE OR REPLACE` with the same signature and return type, so 011's grants (`anon`,
`authenticated`) carry over. The body is 015's with two gates added and the comment updated.
Full text and behaviour: `submit-public-application-v3.md`.

## SQLSTATE contract after 016

| Code | Raised by | Meaning | New |
|---|---|---|---|
| `P0001` | submit RPC | event not active, **or its deadline day has ended in Edmonton** | widened |
| `P0002` | submit RPC | event not found | |
| `P0003` | submit RPC | duplicate application | |
| `P0004` | submit RPC | answer for a question outside the event's questionnaire, or no questionnaire | |
| `P0005` | submit RPC | a named file is already referred to by another application | yes |
| `22023` | submit RPC | bad email or product links | |
| `42501` | `template_creator_emails()` | caller is not an organizer or admin | yes |
| `42501` | PostgREST | `anon` on `application_notes`, `users_with_roles`, `template_creator_emails()` | |
| `23514` | `applications` | any write of a non-null `organizer_notes` | yes |

## Read-back checks (after applying to any database)

```sql
-- §1
SELECT count(*) FROM public.application_notes;                         -- = with_notes from the inventory
SELECT count(*) FROM public.applications WHERE organizer_notes IS NOT NULL;   -- 0
SELECT conname FROM pg_constraint WHERE conname = 'applications_organizer_notes_retired';  -- 1 row
SELECT has_table_privilege('anon', 'public.application_notes', 'SELECT');     -- false
SELECT policyname, cmd FROM pg_policies
 WHERE schemaname = 'public' AND tablename = 'application_notes' ORDER BY cmd; -- 4 rows
-- §2
SELECT policyname, cmd FROM pg_policies
 WHERE schemaname = 'storage' AND tablename = 'objects' ORDER BY policyname;
 -- attachments_anon_insert INSERT, attachments_select_own_or_organizer SELECT; nothing else
-- §3
SELECT tablename, policyname FROM pg_policies
 WHERE schemaname = 'public' AND cmd = 'INSERT'
   AND tablename IN ('applications', 'attachments', 'application_answers') ORDER BY 1;
 -- organizer_insert_applications, organizer_insert_application_answers, organizer_insert_attachments
-- §4
SELECT reloptions FROM pg_class WHERE relname = 'users_with_roles';   -- {security_barrier=true}
SELECT count(*) FROM public.users_with_roles;                         -- as postgres: every account
-- §5
SELECT has_function_privilege('anon', 'public.template_creator_emails()', 'EXECUTE');          -- false
SELECT has_function_privilege('authenticated', 'public.template_creator_emails()', 'EXECUTE'); -- true
-- §6
SELECT obj_description('public.submit_public_application(jsonb)'::regprocedure);  -- mentions spec 012, P0005
SELECT has_function_privilege('anon', 'public.submit_public_application(jsonb)', 'EXECUTE');   -- true
```

## Rollback (run by hand, Owen's go, code reverted first)

One transaction. It restores the 015 state; it does not remove `016` from
`supabase_migrations.schema_migrations` unless the last line is included.

```sql
BEGIN;

-- §6: restore the 015 function body
--   paste `CREATE OR REPLACE FUNCTION public.submit_public_application` and its COMMENT from
--   supabase/migrations/015_vendor_links_and_account_linking.sql §5 here, unchanged.

-- §5
DROP FUNCTION IF EXISTS public.template_creator_emails();

-- §4: the 013 view (no filter, no barrier)
CREATE OR REPLACE VIEW public.users_with_roles WITH (security_barrier = false) AS
SELECT u.id, u.email::text AS email, COALESCE(p.role, 'vendor'::user_role) AS role,
       u.created_at, p.updated_at AS role_updated_at,
       (u.email_confirmed_at IS NULL AND u.last_sign_in_at IS NULL) AS invite_pending
FROM auth.users u LEFT JOIN public.user_profiles p ON p.id = u.id;

-- §3: the 005 and 009 INSERT policies
DROP POLICY IF EXISTS "organizer_insert_applications" ON public.applications;
CREATE POLICY "authenticated_insert_applications" ON public.applications FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM vendors WHERE vendors.id = applications.vendor_id AND vendors.user_id = auth.uid())
    OR get_user_role() IN ('organizer', 'admin'));
DROP POLICY IF EXISTS "organizer_insert_attachments" ON public.attachments;
CREATE POLICY "authenticated_insert_attachments" ON public.attachments FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM applications JOIN vendors ON vendors.id = applications.vendor_id
            WHERE applications.id = attachments.application_id AND vendors.user_id = auth.uid())
    OR get_user_role() IN ('organizer', 'admin'));
DROP POLICY IF EXISTS "organizer_insert_application_answers" ON public.application_answers;
CREATE POLICY "authenticated_insert_application_answers" ON public.application_answers FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM applications a JOIN events e ON e.id = a.event_id
            WHERE a.id = application_id AND e.status = 'active')
    AND EXISTS (SELECT 1 FROM event_questions q
                JOIN event_questionnaires eq ON eq.id = q.event_questionnaire_id
                JOIN applications a ON a.event_id = eq.event_id
                WHERE q.id = event_question_id AND a.id = application_id));

-- §2: the 011 storage policies
DROP POLICY IF EXISTS "attachments_select_own_or_organizer" ON storage.objects;
CREATE POLICY "attachments_authenticated_select" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'attachments');
CREATE POLICY "attachments_authenticated_delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'attachments');

-- §1: notes back onto applications, then drop the store
ALTER TABLE public.applications DROP CONSTRAINT IF EXISTS applications_organizer_notes_retired;
ALTER TABLE public.applications DISABLE TRIGGER update_applications_updated_at;
UPDATE public.applications a SET organizer_notes = n.notes
FROM public.application_notes n WHERE n.application_id = a.id;
ALTER TABLE public.applications ENABLE TRIGGER update_applications_updated_at;
DROP TABLE public.application_notes;
COMMENT ON COLUMN public.applications.organizer_notes IS NULL;

-- only if the history row should go too:
-- DELETE FROM supabase_migrations.schema_migrations WHERE version = '016';

COMMIT;
```

Rolling back reopens all five gaps. It exists so a broken rollout can be undone in one step,
not as a state to stay in.
