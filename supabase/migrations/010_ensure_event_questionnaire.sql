-- ensure_event_questionnaire(p_event_id uuid) → uuid
-- Returns the id of the event_questionnaires row for the given event,
-- creating one atomically if it does not yet exist.
-- Uses INSERT … ON CONFLICT (event_id) DO NOTHING + re-SELECT to be
-- race-safe when two sessions call this simultaneously (UNIQUE on event_id
-- guarantees exactly one winner; the loser simply re-reads the winning row).
-- Called from addEventQuestion and seedEventQuestionnaireFromTemplate to
-- support events created before migration 009 shipped ("legacy events").

CREATE OR REPLACE FUNCTION public.ensure_event_questionnaire(p_event_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_questionnaire_id uuid;
  v_event_status     text;
BEGIN
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

GRANT EXECUTE ON FUNCTION public.ensure_event_questionnaire(uuid) TO authenticated;
