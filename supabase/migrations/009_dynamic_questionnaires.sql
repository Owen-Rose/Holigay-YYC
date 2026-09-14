-- Holigay Vendor Market - Per-Event Dynamic Questionnaires
-- Migration: 009_dynamic_questionnaires.sql
-- Spec: specs/005-dynamic-questionnaires/
-- Adds five new entities: questionnaire_templates, template_questions,
-- event_questionnaires, event_questions, application_answers.
-- Also creates the lock-on-publish trigger and the auto-seed RPC function.

-- ============================================
-- Enum: question_type
-- 11 supported question types per spec (Q1 clarification)
-- ============================================
CREATE TYPE public.question_type AS ENUM (
  'short_text',
  'long_text',
  'email',
  'phone',
  'url',
  'number',
  'date',
  'single_select',
  'multi_select',
  'yes_no',
  'file_upload'
);

-- ============================================
-- Table: questionnaire_templates
-- Org-wide reusable question sets. Read by all organizers/admins;
-- mutable by creator or admin (ON DELETE SET NULL orphan semantics).
-- ============================================
CREATE TABLE public.questionnaire_templates (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name         text        NOT NULL CHECK (length(name) BETWEEN 1 AND 120),
  description  text,
  created_by   uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER update_questionnaire_templates_updated_at
  BEFORE UPDATE ON questionnaire_templates
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE public.questionnaire_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated_select_questionnaire_templates"
  ON questionnaire_templates FOR SELECT TO authenticated
  USING (get_user_role() IN ('organizer', 'admin'));

CREATE POLICY "authenticated_insert_questionnaire_templates"
  ON questionnaire_templates FOR INSERT TO authenticated
  WITH CHECK (
    get_user_role() IN ('organizer', 'admin')
    AND created_by = auth.uid()
  );

CREATE POLICY "authenticated_update_questionnaire_templates"
  ON questionnaire_templates FOR UPDATE TO authenticated
  USING (
    (created_by IS NOT NULL AND created_by = auth.uid())
    OR get_user_role() = 'admin'
  )
  WITH CHECK (
    (created_by IS NOT NULL AND created_by = auth.uid())
    OR get_user_role() = 'admin'
  );

CREATE POLICY "authenticated_delete_questionnaire_templates"
  ON questionnaire_templates FOR DELETE TO authenticated
  USING (
    (created_by IS NOT NULL AND created_by = auth.uid())
    OR get_user_role() = 'admin'
  );

-- ============================================
-- Table: template_questions
-- Questions belonging to a reusable template.
-- RLS mirrors parent template ownership.
-- ============================================
CREATE TABLE public.template_questions (
  id          uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid         NOT NULL REFERENCES questionnaire_templates(id) ON DELETE CASCADE,
  position    integer      NOT NULL CHECK (position >= 0),
  type        question_type NOT NULL,
  label       text         NOT NULL CHECK (length(label) BETWEEN 1 AND 200),
  help_text   text         CHECK (help_text IS NULL OR length(help_text) <= 500),
  required    boolean      NOT NULL DEFAULT false,
  options     jsonb        CHECK (options IS NULL OR jsonb_typeof(options) = 'array'),
  show_if     jsonb,

  UNIQUE (template_id, position)
);

ALTER TABLE public.template_questions ENABLE ROW LEVEL SECURITY;

-- SELECT: same predicate as the parent template
CREATE POLICY "authenticated_select_template_questions"
  ON template_questions FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM questionnaire_templates t
      WHERE t.id = template_id
        AND get_user_role() IN ('organizer', 'admin')
    )
  );

-- INSERT / UPDATE / DELETE: creator-or-admin ownership check via parent
CREATE POLICY "authenticated_insert_template_questions"
  ON template_questions FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM questionnaire_templates t
      WHERE t.id = template_id
        AND (
          (t.created_by IS NOT NULL AND t.created_by = auth.uid())
          OR get_user_role() = 'admin'
        )
    )
  );

CREATE POLICY "authenticated_update_template_questions"
  ON template_questions FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM questionnaire_templates t
      WHERE t.id = template_id
        AND (
          (t.created_by IS NOT NULL AND t.created_by = auth.uid())
          OR get_user_role() = 'admin'
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM questionnaire_templates t
      WHERE t.id = template_id
        AND (
          (t.created_by IS NOT NULL AND t.created_by = auth.uid())
          OR get_user_role() = 'admin'
        )
    )
  );

CREATE POLICY "authenticated_delete_template_questions"
  ON template_questions FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM questionnaire_templates t
      WHERE t.id = template_id
        AND (
          (t.created_by IS NOT NULL AND t.created_by = auth.uid())
          OR get_user_role() = 'admin'
        )
    )
  );

-- ============================================
-- Table: event_questionnaires
-- One row per event (1:1). locked_at is set by trigger on publish;
-- app code never issues an UPDATE on this table after INSERT.
-- ============================================
CREATE TABLE public.event_questionnaires (
  id                       uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id                 uuid        NOT NULL UNIQUE REFERENCES events(id) ON DELETE CASCADE,
  seeded_from_template_id  uuid        REFERENCES questionnaire_templates(id) ON DELETE SET NULL,
  locked_at                timestamptz,
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.event_questionnaires ENABLE ROW LEVEL SECURITY;

-- Public (anon + authenticated): unconditional read. Vendors at /apply need this.
CREATE POLICY "anon_select_event_questionnaires"
  ON event_questionnaires FOR SELECT TO anon
  USING (true);

CREATE POLICY "authenticated_select_event_questionnaires"
  ON event_questionnaires FOR SELECT TO authenticated
  USING (true);

-- INSERT only when event is still draft (data-layer lock-on-publish gate).
CREATE POLICY "authenticated_insert_event_questionnaires"
  ON event_questionnaires FOR INSERT TO authenticated
  WITH CHECK (
    get_user_role() IN ('organizer', 'admin')
    AND EXISTS (
      SELECT 1 FROM events e
      WHERE e.id = event_id AND e.status = 'draft'
    )
  );

-- No UPDATE or DELETE policies — locked_at is written by trigger only.

-- ============================================
-- Table: event_questions
-- Questions for one event's questionnaire. Immutable once
-- the parent questionnaire is locked (events.status = 'draft' gate in RLS).
-- ============================================
CREATE TABLE public.event_questions (
  id                     uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  event_questionnaire_id uuid         NOT NULL REFERENCES event_questionnaires(id) ON DELETE CASCADE,
  position               integer      NOT NULL CHECK (position >= 0),
  type                   question_type NOT NULL,
  label                  text         NOT NULL CHECK (length(label) BETWEEN 1 AND 200),
  help_text              text         CHECK (help_text IS NULL OR length(help_text) <= 500),
  required               boolean      NOT NULL DEFAULT false,
  options                jsonb        CHECK (options IS NULL OR jsonb_typeof(options) = 'array'),
  show_if                jsonb,

  UNIQUE (event_questionnaire_id, position)
);

ALTER TABLE public.event_questions ENABLE ROW LEVEL SECURITY;

-- Unconditional read — vendors at /apply read questions without auth.
CREATE POLICY "anon_select_event_questions"
  ON event_questions FOR SELECT TO anon
  USING (true);

CREATE POLICY "authenticated_select_event_questions"
  ON event_questions FOR SELECT TO authenticated
  USING (true);

-- Mutations allowed only while parent event is draft (lock-on-publish data layer).
CREATE POLICY "authenticated_insert_event_questions"
  ON event_questions FOR INSERT TO authenticated
  WITH CHECK (
    get_user_role() IN ('organizer', 'admin')
    AND EXISTS (
      SELECT 1
      FROM event_questionnaires eq
      JOIN events e ON e.id = eq.event_id
      WHERE eq.id = event_questionnaire_id
        AND e.status = 'draft'
    )
  );

CREATE POLICY "authenticated_update_event_questions"
  ON event_questions FOR UPDATE TO authenticated
  USING (
    get_user_role() IN ('organizer', 'admin')
    AND EXISTS (
      SELECT 1
      FROM event_questionnaires eq
      JOIN events e ON e.id = eq.event_id
      WHERE eq.id = event_questionnaire_id
        AND e.status = 'draft'
    )
  )
  WITH CHECK (
    get_user_role() IN ('organizer', 'admin')
    AND EXISTS (
      SELECT 1
      FROM event_questionnaires eq
      JOIN events e ON e.id = eq.event_id
      WHERE eq.id = event_questionnaire_id
        AND e.status = 'draft'
    )
  );

CREATE POLICY "authenticated_delete_event_questions"
  ON event_questions FOR DELETE TO authenticated
  USING (
    get_user_role() IN ('organizer', 'admin')
    AND EXISTS (
      SELECT 1
      FROM event_questionnaires eq
      JOIN events e ON e.id = eq.event_id
      WHERE eq.id = event_questionnaire_id
        AND e.status = 'draft'
    )
  );

-- ============================================
-- Table: application_answers
-- One row per (application × event_question) pair. Immutable once written.
-- No UPDATE or DELETE policies (cascade from parent application still works).
-- ============================================
CREATE TABLE public.application_answers (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id    uuid        NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  event_question_id uuid        NOT NULL REFERENCES event_questions(id) ON DELETE RESTRICT,
  value             jsonb       NOT NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),

  UNIQUE (application_id, event_question_id)
);

CREATE INDEX idx_application_answers_application_id    ON application_answers(application_id);
CREATE INDEX idx_application_answers_event_question_id ON application_answers(event_question_id);

ALTER TABLE public.application_answers ENABLE ROW LEVEL SECURITY;

-- INSERT: anon + authenticated (public submission). Two guards:
--   1. The application's event must be active.
--   2. The question must belong to that event's questionnaire.
CREATE POLICY "anon_insert_application_answers"
  ON application_answers FOR INSERT TO anon
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM applications a
      JOIN events e ON e.id = a.event_id
      WHERE a.id = application_id
        AND e.status = 'active'
    )
    AND EXISTS (
      SELECT 1
      FROM event_questions q
      JOIN event_questionnaires eq ON eq.id = q.event_questionnaire_id
      JOIN applications a ON a.event_id = eq.event_id
      WHERE q.id = event_question_id
        AND a.id = application_id
    )
  );

CREATE POLICY "authenticated_insert_application_answers"
  ON application_answers FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM applications a
      JOIN events e ON e.id = a.event_id
      WHERE a.id = application_id
        AND e.status = 'active'
    )
    AND EXISTS (
      SELECT 1
      FROM event_questions q
      JOIN event_questionnaires eq ON eq.id = q.event_questionnaire_id
      JOIN applications a ON a.event_id = eq.event_id
      WHERE q.id = event_question_id
        AND a.id = application_id
    )
  );

-- SELECT: organizers/admins see all; vendors see only their own (mirrors applications policy).
CREATE POLICY "authenticated_select_application_answers"
  ON application_answers FOR SELECT TO authenticated
  USING (
    get_user_role() IN ('organizer', 'admin')
    OR EXISTS (
      SELECT 1
      FROM applications a
      JOIN vendors v ON v.id = a.vendor_id
      WHERE a.id = application_id
        AND v.user_id = auth.uid()
    )
  );

-- No UPDATE or DELETE policies (immutable once written).

-- ============================================
-- Function: lock_event_questionnaire (SECURITY DEFINER)
-- Fired by trigger when an event transitions draft → active.
-- Sets locked_at on the event's questionnaire if not already set.
-- Bypasses RLS (table-owner context) — this is the sole writer of locked_at.
-- ============================================
CREATE OR REPLACE FUNCTION public.lock_event_questionnaire()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE event_questionnaires
  SET locked_at  = NOW(),
      updated_at = NOW()
  WHERE event_id = NEW.id
    AND locked_at IS NULL;
  RETURN NEW;
END;
$$;

CREATE TRIGGER lock_event_questionnaire_on_publish
  AFTER UPDATE ON events
  FOR EACH ROW
  WHEN (OLD.status = 'draft' AND NEW.status = 'active')
  EXECUTE FUNCTION lock_event_questionnaire();

-- ============================================
-- Function: create_event_with_default_questionnaire (SECURITY DEFINER)
-- Atomically inserts an event row, its questionnaire, and default questions
-- from the p_event JSONB argument. Called from createEvent server action (T011).
-- Returns the new event UUID.
-- ============================================
CREATE OR REPLACE FUNCTION public.create_event_with_default_questionnaire(p_event jsonb)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_event_id          uuid;
  v_questionnaire_id  uuid;
  v_question          jsonb;
  v_pos               int := 0;
BEGIN
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

GRANT EXECUTE ON FUNCTION public.create_event_with_default_questionnaire(jsonb) TO authenticated;
