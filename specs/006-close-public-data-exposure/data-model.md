# Data Model: Close the Public Data Exposure

**Feature**: 006-close-public-data-exposure | **Date**: 2026-08-21

No new tables or columns. This feature changes *access rules* around the
existing schema and introduces one privileged operation. Entities below are
described in terms of what this feature changes about them.

## Entities

### Vendor (`vendors`)

The PII being exposed today: `business_name`, `contact_name`, `email`
(UNIQUE), `phone`, `website`, `description`, plus `user_id` (nullable FK →
`auth.users`).

- **Access change**: `anon_insert_vendors` and `anon_select_vendors` dropped.
  The anon role loses all direct table access; authenticated policies
  (`vendor_select_own`, `vendor_update_own`, organizer/admin reads) unchanged.
- **Write path change**: created or updated only via the RPC's
  `INSERT ... ON CONFLICT (email) DO UPDATE`. The upsert updates
  `business_name`, `contact_name`, `phone`, `website`, `description`,
  `updated_at`; it **never** touches `email` or `user_id` (preserving the
  `handle_new_user` email-linking behavior).
- **Invariant**: at most one vendor row per email, enforced by the existing
  UNIQUE constraint even under concurrent submissions (row-lock
  serialization).

### Application (`applications`)

Links vendor → event; carries `status` (`pending` on creation),
`booth_preference`, `product_categories`, `special_requirements`, and
`organizer_notes` (the internal notes exposed today).

- **Access change**: `anon_insert_applications` and
  `anon_select_applications` dropped. Organizer/admin and vendor-own policies
  unchanged.
- **Write path change**: created only via the RPC. Legacy fields come from the
  `legacy` branch of the payload (NULL for dynamic submissions — same as
  today's dynamic insert).
- **Invariant**: `UNIQUE(event_id, vendor_id)` is the duplicate gate; the RPC
  converts conflict into error `P0003` and the whole transaction (including
  the vendor upsert) rolls back — no partial records (FR-006, FR-008).
- **State**: only `pending` is ever written by this feature; the
  organizer-driven status workflow is untouched.

### Application answer (`application_answers`)

`application_id` FK, `event_question_id` FK (ON DELETE RESTRICT), `value`
jsonb NOT NULL, `UNIQUE(application_id, event_question_id)`.

- **Access change**: `anon_insert_application_answers` dropped (the policy's
  two guard conditions — event active, question belongs to event — move into
  the RPC as explicit checks). `authenticated_insert_application_answers` and
  the organizer/own SELECT policy unchanged; still no UPDATE/DELETE policies
  (immutable once written).
- **Write path change**: bulk-inserted by the RPC from the `answers` array.
  Only visible, known, non-empty answers reach the payload (empty optional
  answers are skipped — R10). Every `event_question_id` is validated against
  the event's questionnaire (`P0004` on mismatch — R11).

### Attachment (`attachments`)

`application_id` FK, `file_name`, `file_path`, `file_type`, `file_size` —
points at an object in the `attachments` storage bucket.

- **Access change**: `anon_insert_attachments` and `anon_select_attachments`
  dropped.
- **Write path change**: rows created by the RPC (legacy variant) inside the
  transaction — an attachment-row failure now rolls back the whole submission
  (was: silently swallowed).
- **Note**: storage *objects* uploaded before a failed/abandoned submission
  still orphan in the bucket (accepted, out of scope); only database
  consistency is guaranteed.

### Event / questionnaire content (`events`, `event_questionnaires`, `event_questions`)

The intentionally public surface.

- **Unchanged policies (kept, by name)**: `anon_select_active_events`
  (`status = 'active'` only), `anon_select_event_questionnaires`,
  `anon_select_event_questions` — the public apply page renders exactly as
  before (FR-003).
- **RPC reads**: the function re-checks `events.status = 'active'` itself
  (SECURITY DEFINER bypasses RLS; FR-007) and resolves the event's
  questionnaire for answer validation.

### Submission operation (`submit_public_application`) — NEW

The single privileged transactional unit. Not a table — a
`SECURITY DEFINER` function, EXECUTE granted to `anon, authenticated` (and
revoked from PUBLIC).

- **Inputs**: `p_submission jsonb` — see
  `contracts/submit-public-application.md` for the full shape.
- **Outputs**: `application_id`, `vendor_id`, `vendor_created`, `event_name`,
  `event_date` (single row).
- **Steps (one transaction)**: event exists+active check → answers-belong
  check → vendor upsert by email → application insert with duplicate gate →
  answers bulk insert → attachments insert.
- **Failure modes**: `P0002` / `P0001` / `P0003` / `P0004` (contract doc), or
  any constraint violation — every failure rolls back all steps (FR-008).

### Storage bucket (`attachments` in `storage.buckets` / `storage.objects`) — policies NEW in SQL

- Bucket: id/name `attachments`, private (`public = false`), created
  idempotently by migration 011 (also gives the local stack the bucket on
  `db reset`).
- Policy model after 011 (all previous `storage.objects` policies dropped):

| Policy | Command | Roles | Predicate |
|---|---|---|---|
| `attachments_anon_insert` | INSERT | anon, authenticated | `bucket_id = 'attachments'` |
| `attachments_authenticated_select` | SELECT | authenticated | `bucket_id = 'attachments'` |
| `attachments_authenticated_delete` | DELETE | authenticated | `bucket_id = 'attachments'` |

- Consequences: anonymous upload for the apply flow keeps working (plain
  upload = INSERT only); anonymous download and signed-URL creation fail;
  the authenticated dashboard's `createSignedUrl` flow keeps working (R9).

## Access-rule delta summary (migration 011)

**Dropped (7)**: `anon_insert_vendors`, `anon_select_vendors`,
`anon_insert_applications`, `anon_select_applications`,
`anon_insert_attachments`, `anon_select_attachments`,
`anon_insert_application_answers`.

**Kept (3)**: `anon_select_active_events`, `anon_select_event_questionnaires`,
`anon_select_event_questions`.

**Function grants**: `submit_public_application` → EXECUTE to anon +
authenticated (revoked from PUBLIC); `create_event_with_default_questionnaire`
and `ensure_event_questionnaire` → EXECUTE revoked from PUBLIC and anon (R6).

**Storage**: bucket codified; three policies above replace all
dashboard-configured policies.
