-- ============================================================================
-- 014: let the default-questionnaire seed carry ids and show-if rules
--
-- UAT2-3 / UAT2-4 (docs/handoffs/2026-10-31-vendor-uat-findings.md): every new
-- event's default booth question gains a corner acknowledgement that is shown
-- only when "corner" is chosen. A show-if rule references the trigger question
-- by id, and until now `create_event_with_default_questionnaire` assigned ids
-- at insert time and ignored `show_if`, so the acknowledgement could not be
-- seeded in the same transaction as the event.
--
-- This replaces the function (last defined in 012) so each seed question may
-- carry an `id` (defaulted when absent) and a `show_if`, validated the way
-- `save_event_questionnaire` validates them: the rule must point at an EARLIER
-- element of the payload (P0004). Role gate (42501) unchanged. No table, RLS
-- or grant changes.
-- ============================================================================

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
  v_questions         jsonb := COALESCE(p_event->'questions', '[]'::jsonb);
BEGIN
  IF v_role IS NULL OR v_role NOT IN ('organizer', 'admin') THEN
    RAISE EXCEPTION 'Organizer role required' USING ERRCODE = '42501';
  END IF;

  IF jsonb_typeof(v_questions) <> 'array' THEN
    RAISE EXCEPTION 'questions must be a JSON array' USING ERRCODE = 'P0004';
  END IF;

  -- Ids are optional for the seed, but when given they must be unique.
  IF (
    SELECT count(q.value->>'id') <> count(DISTINCT q.value->>'id')
    FROM jsonb_array_elements(v_questions) AS q
  ) THEN
    RAISE EXCEPTION 'Duplicate question id in payload' USING ERRCODE = 'P0004';
  END IF;

  -- show_if must point at an EARLIER element of this payload (implies acyclic),
  -- mirroring save_event_questionnaire (012 §5).
  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(v_questions) WITH ORDINALITY AS q(value, ord)
    WHERE jsonb_typeof(q.value->'show_if') = 'object'
      AND NOT EXISTS (
        SELECT 1
        FROM jsonb_array_elements(v_questions) WITH ORDINALITY AS t(value, ord)
        WHERE t.value->>'id' = q.value->'show_if'->>'questionId'
          AND t.ord < q.ord
      )
  ) THEN
    RAISE EXCEPTION 'show_if must reference an earlier question' USING ERRCODE = 'P0004';
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

  INSERT INTO event_questions (
    id, event_questionnaire_id, position, type, label, help_text, required, options, show_if
  )
  SELECT
    COALESCE((q.value->>'id')::uuid, gen_random_uuid()),
    v_questionnaire_id,
    (q.ord - 1)::int,
    (q.value->>'type')::question_type,
    q.value->>'label',
    NULLIF(q.value->>'help_text', ''),
    COALESCE((q.value->>'required')::boolean, false),
    CASE WHEN jsonb_typeof(q.value->'options') = 'array'  THEN q.value->'options' END,
    CASE WHEN jsonb_typeof(q.value->'show_if') = 'object' THEN q.value->'show_if' END
  FROM jsonb_array_elements(v_questions) WITH ORDINALITY AS q(value, ord);

  RETURN v_event_id;
END;
$$;

COMMENT ON FUNCTION public.create_event_with_default_questionnaire(jsonb) IS
  'Atomically creates an event, its questionnaire and the default questions. '
  'Seed questions may carry an id and a show_if pointing at an earlier seed question (014). '
  'Organizer/admin only (42501). Errors: P0004 invalid payload (non-array, duplicate id, show_if not earlier).';
