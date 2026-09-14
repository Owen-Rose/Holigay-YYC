-- Holigay Vendor Market - Atomic Questionnaire Save
-- Migration: 012_atomic_questionnaire_save.sql
-- Spec: specs/005-dynamic-questionnaires/ (Phase 11, Tier 2 items 1 and 3 of docs/ROADMAP.md)
--
-- The questionnaire builder used to issue one PostgREST call per deleted,
-- updated and added question plus a reorder — each its own transaction, so a
-- failure mid-batch stranded half-saved state. Seeding from a template had the
-- same shape, and its write of seeded_from_template_id always no-op'd because
-- event_questionnaires has no UPDATE policy.
--
--   §1  Make the (event_questionnaire_id, position) UNIQUE constraint
--       deferrable so one upsert can write final positions directly.
--   §2  Create `save_event_questionnaire(uuid, jsonb, uuid)` — the single
--       transactional write path for the builder and the template seed.
--   §3  Add the same in-function role gate to the two existing organizer RPCs,
--       which were callable by any signed-in vendor (GRANT ... TO authenticated
--       with no role check inside).
--
-- Contract: specs/005-dynamic-questionnaires/contracts/questionnaire-actions.md

-- ============================================
-- §1  Deferrable position uniqueness
-- ============================================
--
-- INITIALLY IMMEDIATE keeps eager checking for every other writer; only the
-- RPC below runs SET CONSTRAINTS ... DEFERRED so its upsert may pass through
-- transient duplicates and be checked once at commit.

ALTER TABLE public.event_questions
  DROP CONSTRAINT event_questions_event_questionnaire_id_position_key,
  ADD  CONSTRAINT event_questions_event_questionnaire_id_position_key
       UNIQUE (event_questionnaire_id, position) DEFERRABLE INITIALLY IMMEDIATE;

-- ============================================
-- §2  save_event_questionnaire (SECURITY DEFINER)
-- ============================================
--
-- Full-state save: the payload is the complete, ordered questionnaire.
--   * rows whose id is absent from the payload are deleted (23503 if answered)
--   * rows whose id is present are upserted by id
--   * position = array index (0-based); any payload position is ignored
--   * p_seeded_from_template_id, when given, is recorded on the questionnaire
--
-- SECURITY DEFINER bypasses the status='draft' RLS gates on event_questions,
-- so everything RLS used to enforce is re-checked here: role, draft status,
-- lock, and that every existing id belongs to THIS questionnaire.
-- Show-if graph rules beyond "references an earlier question" (trigger type,
-- option key) stay in the Zod schema at the action layer.

CREATE OR REPLACE FUNCTION public.save_event_questionnaire(
  p_event_id                uuid,
  p_questions               jsonb,
  p_seeded_from_template_id uuid DEFAULT NULL
)
RETURNS SETOF public.event_questions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role             user_role := get_user_role();
  v_questionnaire_id uuid;
  v_locked_at        timestamptz;
  v_ids              uuid[];
BEGIN
  -- 0. Role gate first. Any authenticated JWT can reach this over PostgREST.
  IF v_role IS NULL OR v_role NOT IN ('organizer', 'admin') THEN
    RAISE EXCEPTION 'Organizer role required' USING ERRCODE = '42501';
  END IF;

  -- 1. Payload shape.
  IF p_questions IS NULL OR jsonb_typeof(p_questions) <> 'array' THEN
    RAISE EXCEPTION 'p_questions must be a JSON array' USING ERRCODE = 'P0004';
  END IF;
  IF jsonb_array_length(p_questions) > 200 THEN
    RAISE EXCEPTION 'Too many questions (max 200)' USING ERRCODE = 'P0004';
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_questions) AS q
    WHERE q.value->>'id' IS NULL
  ) THEN
    RAISE EXCEPTION 'Every question needs an id' USING ERRCODE = 'P0004';
  END IF;

  SELECT COALESCE(array_agg((q.value->>'id')::uuid), '{}')
  INTO v_ids
  FROM jsonb_array_elements(p_questions) AS q;

  IF (SELECT count(*) FROM unnest(v_ids)) <> (SELECT count(DISTINCT u) FROM unnest(v_ids) AS u) THEN
    RAISE EXCEPTION 'Duplicate question id in payload' USING ERRCODE = 'P0004';
  END IF;

  -- 2. Event exists and is draft (P0002 / P0001 raised by ensure_event_questionnaire,
  --    which also creates the questionnaire row for legacy events). The row lock
  --    serialises concurrent saves and the publish trigger's UPDATE.
  v_questionnaire_id := ensure_event_questionnaire(p_event_id);

  SELECT locked_at INTO v_locked_at
  FROM event_questionnaires
  WHERE id = v_questionnaire_id
  FOR UPDATE;

  IF v_locked_at IS NOT NULL THEN
    RAISE EXCEPTION 'Questionnaire is locked' USING ERRCODE = 'P0001';
  END IF;

  -- 3. Template must exist, so a later 23503 can only mean "answered question".
  IF p_seeded_from_template_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM questionnaire_templates WHERE id = p_seeded_from_template_id
  ) THEN
    RAISE EXCEPTION 'Template not found' USING ERRCODE = 'P0002';
  END IF;

  -- 4. Ownership: an existing id must belong to this questionnaire.
  IF EXISTS (
    SELECT 1 FROM event_questions
    WHERE id = ANY(v_ids)
      AND event_questionnaire_id <> v_questionnaire_id
  ) THEN
    RAISE EXCEPTION 'Question belongs to another questionnaire' USING ERRCODE = 'P0004';
  END IF;

  -- 5. show_if must point at an EARLIER element of this payload (implies acyclic).
  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_questions) WITH ORDINALITY AS q(value, ord)
    WHERE jsonb_typeof(q.value->'show_if') = 'object'
      AND NOT EXISTS (
        SELECT 1
        FROM jsonb_array_elements(p_questions) WITH ORDINALITY AS t(value, ord)
        WHERE t.value->>'id' = q.value->'show_if'->>'questionId'
          AND t.ord < q.ord
      )
  ) THEN
    RAISE EXCEPTION 'show_if must reference an earlier question' USING ERRCODE = 'P0004';
  END IF;

  -- 6. Write. Position uniqueness is checked once, at commit.
  SET CONSTRAINTS event_questions_event_questionnaire_id_position_key DEFERRED;

  DELETE FROM event_questions
  WHERE event_questionnaire_id = v_questionnaire_id
    AND id <> ALL(v_ids);

  INSERT INTO event_questions (
    id, event_questionnaire_id, position, type, label, help_text, required, options, show_if
  )
  SELECT
    (q.value->>'id')::uuid,
    v_questionnaire_id,
    (q.ord - 1)::int,
    (q.value->>'type')::question_type,
    q.value->>'label',
    NULLIF(q.value->>'help_text', ''),
    COALESCE((q.value->>'required')::boolean, false),
    CASE WHEN jsonb_typeof(q.value->'options') = 'array'  THEN q.value->'options' END,
    CASE WHEN jsonb_typeof(q.value->'show_if') = 'object' THEN q.value->'show_if' END
  FROM jsonb_array_elements(p_questions) WITH ORDINALITY AS q(value, ord)
  ON CONFLICT (id) DO UPDATE
    SET position  = EXCLUDED.position,
        type      = EXCLUDED.type,
        label     = EXCLUDED.label,
        help_text = EXCLUDED.help_text,
        required  = EXCLUDED.required,
        options   = EXCLUDED.options,
        show_if   = EXCLUDED.show_if;

  -- A plain builder save never clears an earlier seed record.
  UPDATE event_questionnaires
  SET seeded_from_template_id = COALESCE(p_seeded_from_template_id, seeded_from_template_id),
      updated_at              = now()
  WHERE id = v_questionnaire_id;

  RETURN QUERY
  SELECT * FROM event_questions
  WHERE event_questionnaire_id = v_questionnaire_id
  ORDER BY position;
END;
$$;

COMMENT ON FUNCTION public.save_event_questionnaire(uuid, jsonb, uuid) IS
  'Atomic full-state save of an event questionnaire: delete-missing, upsert-by-id, position = array index. '
  'Organizer/admin only; re-checks role, draft status, lock and row ownership itself. '
  'Errors: 42501 role, P0002 event/template not found, P0001 not draft or locked, '
  'P0004 invalid payload (non-array, >200, missing/duplicate/foreign id, show_if not earlier), '
  '23503 a removed question already has answers.';

REVOKE ALL    ON FUNCTION public.save_event_questionnaire(uuid, jsonb, uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.save_event_questionnaire(uuid, jsonb, uuid) TO authenticated;

-- ============================================
-- §3  Role gate on the existing organizer RPCs
-- ============================================
--
-- 011 §2 revoked anon EXECUTE, but `GRANT ... TO authenticated` stands and
-- neither body checked the caller's role, so a signed-in vendor could create
-- events and questionnaire rows through PostgREST. Same gate, first statement.
-- Bodies otherwise unchanged from 009 / 010.

CREATE OR REPLACE FUNCTION public.ensure_event_questionnaire(p_event_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role             user_role := get_user_role();
  v_questionnaire_id uuid;
  v_event_status     text;
BEGIN
  IF v_role IS NULL OR v_role NOT IN ('organizer', 'admin') THEN
    RAISE EXCEPTION 'Organizer role required' USING ERRCODE = '42501';
  END IF;

  SELECT status INTO v_event_status FROM events WHERE id = p_event_id;
  IF v_event_status IS NULL THEN
    RAISE EXCEPTION 'Event not found' USING ERRCODE = 'P0002';
  END IF;
  IF v_event_status <> 'draft' THEN
    RAISE EXCEPTION 'Event is not in draft status' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO event_questionnaires (event_id)
  VALUES (p_event_id)
  ON CONFLICT (event_id) DO NOTHING;

  SELECT id INTO v_questionnaire_id
  FROM event_questionnaires
  WHERE event_id = p_event_id;

  RETURN v_questionnaire_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_event_with_default_questionnaire(p_event jsonb)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role              user_role := get_user_role();
  v_event_id          uuid;
  v_questionnaire_id  uuid;
  v_question          jsonb;
  v_pos               int := 0;
BEGIN
  IF v_role IS NULL OR v_role NOT IN ('organizer', 'admin') THEN
    RAISE EXCEPTION 'Organizer role required' USING ERRCODE = '42501';
  END IF;

  INSERT INTO events (
    name, description, event_date, location,
    application_deadline, status, max_vendors
  ) VALUES (
    p_event->>'name',
    NULLIF(p_event->>'description', ''),
    (p_event->>'event_date')::date,
    p_event->>'location',
    NULLIF(p_event->>'application_deadline', '')::date,
    COALESCE(p_event->>'status', 'draft'),
    (NULLIF(p_event->>'max_vendors', ''))::int
  )
  RETURNING id INTO v_event_id;

  INSERT INTO event_questionnaires (event_id)
  VALUES (v_event_id)
  RETURNING id INTO v_questionnaire_id;

  FOR v_question IN SELECT value FROM jsonb_array_elements(p_event->'questions')
  LOOP
    INSERT INTO event_questions (
      event_questionnaire_id,
      position,
      type,
      label,
      help_text,
      required,
      options
    ) VALUES (
      v_questionnaire_id,
      v_pos,
      (v_question->>'type')::question_type,
      v_question->>'label',
      NULLIF(v_question->>'help_text', ''),
      COALESCE((v_question->>'required')::boolean, false),
      v_question->'options'
    );
    v_pos := v_pos + 1;
  END LOOP;

  RETURN v_event_id;
END;
$$;

COMMENT ON FUNCTION public.ensure_event_questionnaire(uuid) IS
  'Returns (creating if needed) the event_questionnaires row id for a draft event. '
  'Organizer/admin only (42501). Errors: P0002 event not found, P0001 not draft.';

COMMENT ON FUNCTION public.create_event_with_default_questionnaire(jsonb) IS
  'Atomically creates an event, its questionnaire and the default questions. '
  'Organizer/admin only (42501).';
