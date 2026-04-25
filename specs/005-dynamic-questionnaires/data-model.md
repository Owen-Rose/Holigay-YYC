# Phase 1 Data Model: Per-Event Dynamic Questionnaires

Migration: `supabase/migrations/009_dynamic_questionnaires.sql` (single file).
All tables ship with RLS enabled and policies in the same migration (Constitution I; FR-004).

---

## Enum: `question_type`

```sql
create type public.question_type as enum (
  'short_text', 'long_text', 'email', 'phone', 'url',
  'number', 'date', 'single_select', 'multi_select',
  'yes_no', 'file_upload'
);
```

11 values total (Q1 clarification). Closed set per Q5; future additions require a new migration.

---

## Table: `questionnaire_templates`

Org-wide reusable question set. Read by all organizers/admins; written by creator or admin (Q4).

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | `uuid` | PK, `default gen_random_uuid()` | |
| `name` | `text` | NOT NULL, `length(name) between 1 and 120` | Display name |
| `description` | `text` | nullable | Free-form |
| `created_by` | `uuid` | `references auth.users(id) on delete set null` | Q4: orphan templates allowed |
| `created_at` | `timestamptz` | NOT NULL, `default now()` | |
| `updated_at` | `timestamptz` | NOT NULL, `default now()` | App-set on UPDATE |

**RLS**:
- SELECT (authenticated): `using (get_user_role() in ('organizer','admin'))`
- INSERT (authenticated): `with check (get_user_role() in ('organizer','admin') and created_by = auth.uid())`
- UPDATE / DELETE (authenticated): `using ( (created_by is not null and created_by = auth.uid()) or get_user_role() = 'admin' ) with check (same)`

Unique-name constraint **not** added: organizers may legitimately have similarly-named templates.

---

## Table: `template_questions`

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | `uuid` | PK | |
| `template_id` | `uuid` | NOT NULL, `references questionnaire_templates(id) on delete cascade` | |
| `position` | `integer` | NOT NULL, `unique (template_id, position)`, `check (position >= 0)` | 0-indexed |
| `type` | `question_type` | NOT NULL | |
| `label` | `text` | NOT NULL, `length(label) between 1 and 200` | |
| `help_text` | `text` | nullable, `length(help_text) <= 500` | |
| `required` | `boolean` | NOT NULL, `default false` | |
| `options` | `jsonb` | nullable, `check (options is null or jsonb_typeof(options) = 'array')` | Required for `single_select`/`multi_select`; ignored for others |
| `show_if` | `jsonb` | nullable | Shape: `{ "questionId": uuid, "operator": "equals", "value": string }` |

**Index**: `(template_id, position)` (covered by unique constraint).

**RLS**:
- SELECT: same as parent template.
- INSERT/UPDATE/DELETE: `using ( exists ( select 1 from questionnaire_templates t where t.id = template_id and ((t.created_by is not null and t.created_by = auth.uid()) or get_user_role() = 'admin') ) )` (mirrored in `with check`).

---

## Table: `event_questionnaires`

One per event, 1:1.

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | `uuid` | PK | |
| `event_id` | `uuid` | NOT NULL, `unique`, `references events(id) on delete cascade` | 1:1 |
| `seeded_from_template_id` | `uuid` | nullable, `references questionnaire_templates(id) on delete set null` | Informational only (FR-010) |
| `locked_at` | `timestamptz` | nullable | Set on event publish (FR-019) |
| `created_at` | `timestamptz` | NOT NULL, `default now()` | |
| `updated_at` | `timestamptz` | NOT NULL, `default now()` | |

**RLS**:
- SELECT (`anon` + `authenticated`): unconditional — public `/apply` reads questionnaires for active events (FR-021); attempts on inactive events still pass RLS but UI gating prevents access. (Same posture as the existing public read on `events`.)
- INSERT (`authenticated`): `with check (get_user_role() in ('organizer','admin') and exists (select 1 from events e where e.id = event_id and e.status = 'draft'))`. The `events.status = 'draft'` clause is the data-layer gate (FR-020, R3).
- UPDATE / DELETE (`authenticated`): no policy → forbidden for app code. The `locked_at` column is written exclusively by the `lock_event_questionnaire_on_publish` trigger defined in migration 009 (see trigger section below), which runs in the table-owner context and bypasses RLS. App code never touches this table after INSERT.

---

## Table: `event_questions`

Same shape as `template_questions`, immutable once parent questionnaire is locked.

| Column | Type | Constraints |
|---|---|---|
| `id` | `uuid` | PK |
| `event_questionnaire_id` | `uuid` | NOT NULL, `references event_questionnaires(id) on delete cascade` |
| `position` | `integer` | NOT NULL, `unique (event_questionnaire_id, position)`, `check (position >= 0)` |
| `type` | `question_type` | NOT NULL |
| `label` | `text` | NOT NULL |
| `help_text` | `text` | nullable |
| `required` | `boolean` | NOT NULL, default false |
| `options` | `jsonb` | nullable |
| `show_if` | `jsonb` | nullable |

**RLS**:
- SELECT (`anon` + `authenticated`): unconditional (vendors at `/apply` need to read these without login).
- INSERT/UPDATE/DELETE (`authenticated`): `using ( get_user_role() in ('organizer','admin') and exists ( select 1 from event_questionnaires eq join events e on e.id = eq.event_id where eq.id = event_questionnaire_id and e.status = 'draft' ) )` (mirrored in `with check`). This is the lock-on-publish gate at the data layer for question rows (FR-020).

**Application-layer `show_if` validation** (enforced in server action, not RLS):
- `show_if.questionId` MUST refer to an `event_questions.id` whose `position < this.position` (forward-reference rejection — Edge Cases).
- The referenced question's `type` MUST be `yes_no` or `single_select` (Q2 / new Edge Case).
- Cycle detection across the chain (Edge Cases) — runs on save.

---

## Table: `application_answers`

One row per (application × event_question) pair (FR-023).

| Column | Type | Constraints |
|---|---|---|
| `id` | `uuid` | PK |
| `application_id` | `uuid` | NOT NULL, `references applications(id) on delete cascade` |
| `event_question_id` | `uuid` | NOT NULL, `references event_questions(id) on delete restrict` |
| `value` | `jsonb` | NOT NULL — discriminated-union shape per R1 |
| `created_at` | `timestamptz` | NOT NULL, default `now()` |

**Unique constraint**: `unique (application_id, event_question_id)` — prevents duplicate answers (defense in depth; happy path inserts atomically with the application).

**Immutability**: Spec says "Immutable once written" — no UPDATE policy is granted. INSERT only.

**RLS**:
- INSERT (`anon`): `with check ( exists ( select 1 from applications a join events e on e.id = a.event_id where a.id = application_id and e.status = 'active' ) and exists ( select 1 from event_questions q join event_questionnaires eq on eq.id = q.event_questionnaire_id where q.id = event_question_id and eq.event_id = (select event_id from applications where id = application_id) ) )` — answer must reference a question that belongs to the same event the application targets, and the event must be currently active.
- INSERT (`authenticated`): same as `anon` (vendors may be logged in).
- SELECT (`authenticated`): `using ( exists ( select 1 from applications a where a.id = application_id and ( get_user_role() in ('organizer','admin') or a.user_id = auth.uid() or a.vendor_id in (select id from vendors where user_id = auth.uid()) ) ) )` — organizers/admins read all; vendors read only their own (matches existing `applications` policies).
- UPDATE / DELETE: no policy → effectively forbidden (RLS denies by default). Cascade DELETE on application removal still works because the FK fires inside the system role.

**No `attachments`-table changes**: dynamic file answers store everything in `value` (R10). The legacy `attachments` table continues to back legacy applications.

---

## Relationship diagram

```
auth.users
    │  (1) created_by ON DELETE SET NULL
    ▼
questionnaire_templates ─── (1)──< template_questions
    │ (0..1)  seeded_from_template_id  ON DELETE SET NULL
    ▼
event_questionnaires (1:1 events) ── (1)──< event_questions
                                                │
                                                │ (1)──< application_answers >── (M:1) applications
events (1)──(0..1) event_questionnaires
applications (1)──< application_answers
```

Cardinality:
- `events 1:1 event_questionnaires` (UNIQUE on `event_id`).
- `event_questionnaires 1:N event_questions`.
- `applications M:N event_questions` via `application_answers` with UNIQUE composite.
- `templates 1:N template_questions`. Templates and event_questions are decoupled — `seeded_from_template_id` is informational only (FR-010, copy-on-attach).

---

## Trigger: `lock_event_questionnaire_on_publish`

Fires `AFTER UPDATE ON events FOR EACH ROW WHEN (OLD.status = 'draft' AND NEW.status = 'active')`. Sets `event_questionnaires.locked_at = NOW()` for the event's questionnaire if not already set (idempotent via `WHERE locked_at IS NULL`). Runs in the table-owner security context, so it bypasses RLS. This is the sole writer of `locked_at` — app code never issues an UPDATE on `event_questionnaires`.

```sql
CREATE OR REPLACE FUNCTION lock_event_questionnaire()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE event_questionnaires
  SET locked_at = NOW(), updated_at = NOW()
  WHERE event_id = NEW.id AND locked_at IS NULL;
  RETURN NEW;
END;
$$;

CREATE TRIGGER lock_event_questionnaire_on_publish
AFTER UPDATE ON events
FOR EACH ROW
WHEN (OLD.status = 'draft' AND NEW.status = 'active')
EXECUTE FUNCTION lock_event_questionnaire();
```

**Rationale**: Postgres RLS `WITH CHECK` cannot compare `NEW` vs `OLD` row state, making an app-code "locked_at-only update" policy unimplementable without a trigger. The trigger approach is consistent with existing patterns in migration 003 (`handle_new_user`, `update_updated_at_column`). R3's earlier rejection of triggers applied to `event_questions` mutation gating (a different concern); this trigger handles a one-time side effect on `event_questionnaires` when the parent event transitions.

---

## Lifecycle / state transitions

**Event → Questionnaire lifecycle**:

```
event.status = 'draft'
  └── questionnaire mutable (organizer can add/edit/delete/reorder questions)
event.status transitions to 'active'
  └── event_questionnaires.locked_at = now()  (idempotent)
  └── all event_questions become read-only (RLS draft-status gate denies further writes)
event.status = 'closed'
  └── still locked; no behavior change for questionnaire
```

**Application Answer lifecycle**:

```
INSERT only (during submitDynamicApplication)
  └── never UPDATE'd, never DELETE'd directly
  └── cascaded only when parent application is deleted
```

**Template lifecycle**:

```
INSERT (creator becomes ON DELETE SET NULL'd)
  ├── (Q4) creator's account deleted → created_by = null → admin-only
  └── seeded_from_template_id on event_questionnaires is informational only;
      template DELETE clears those pointers but does not delete event questions.
```

---

## Indexes (beyond uniques)

- `template_questions(template_id, position)` — already covered by UNIQUE.
- `event_questions(event_questionnaire_id, position)` — already covered by UNIQUE.
- `application_answers(application_id)` — for application-detail reads.
- `application_answers(event_question_id)` — for analytics (low priority, may defer).
- `event_questionnaires(event_id)` — already covered by UNIQUE.

---

## Validation rules (application layer, mirrored in Zod)

Captured here for traceability; full Zod schemas live in `src/lib/validations/questionnaire.ts` and are sketched in `contracts/`.

- `questionnaire_templates.name`: 1–120 chars.
- `template_questions.label` / `event_questions.label`: 1–200 chars.
- `help_text`: ≤ 500 chars.
- `options`: required when `type in ('single_select','multi_select')`, must be a non-empty array of `{ key: string, label: string }` with unique keys.
- `show_if`: `operator` MUST equal `"equals"`; `questionId` MUST resolve to a sibling question with smaller `position`; trigger question's `type` MUST be `yes_no` or `single_select`.
- `application_answers.value`: discriminated-union per R1; for `file_upload`, file size ≤ 10 MB and MIME type ∈ `ALLOWED_FILE_TYPES` (existing constants).
