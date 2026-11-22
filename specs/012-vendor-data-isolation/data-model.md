# Data Model: Vendor Data Isolation

**Feature**: 012-vendor-data-isolation | **Date**: 2026-11-22
**Migration**: `016_vendor_data_isolation.sql` (exact SQL: `contracts/migration-016.md`)

One new table. No other table gains or loses a column. Everything else in this spec is a rule
about who may read or write what already exists.

## Entities

### `application_notes` (new)

The organizers' notes on one application, kept apart from the record the vendor reads.

| Column | Type | Rule |
|---|---|---|
| `application_id` | `uuid` | primary key; references `applications(id)` `ON DELETE CASCADE` |
| `notes` | `text` | not null; `CHECK (notes <> '')` |
| `updated_at` | `timestamptz` | not null; default `now()`; kept by the `update_updated_at_column()` trigger |

- One row per application at most. **No row means no note**; saving an empty note deletes the
  row.
- One-to-one with `applications`, so it embeds in an `applications` select as an object.
- Deleted with its application (cascade), so the reset runbook's order is unaffected.
- RLS enabled. Select, insert, update, delete: organizer or admin only. `anon` holds no
  privilege on the table.

### `applications` (one column retired)

| Column | Before | After |
|---|---|---|
| `organizer_notes` | the note; readable by the owning vendor | always NULL; `CHECK (organizer_notes IS NULL)` (`applications_organizer_notes_retired`); comment says where notes live |

Every other column, the unique `(event_id, vendor_id)` and the `updated_at` trigger are
unchanged. Existing notes move to `application_notes` in the migration, with the application's
`updated_at` as the note's.

### Uploaded file (no stored owner)

An object in the `attachments` bucket. Ownership is **derived**, never stored:

```
storage.objects.name
   = application_answers.value->>'path'   (where value->>'kind' = 'file')
  or attachments.file_path
        → applications → vendors.user_id = the signed-in account
```

| State | Who may read it |
|---|---|
| Uploaded, named by no application | organizers and admins |
| Named by exactly one application | that application's vendor; organizers and admins |
| Named by a second application | cannot happen through the submission path (`P0005`), and vendors have no other write path |

Nobody deletes, overwrites or moves an object from a session. Upload is unchanged.

### Account list (`users_with_roles`, a view)

Same six columns (`id`, `email`, `role`, `created_at`, `role_updated_at`, `invite_pending`).
The view now returns rows only when the caller is an admin session, or the service or owner
database role. It is a security-barrier view.

### Template creator (`template_creator_emails()`, a function)

Returns `(creator_id uuid, email text)` for each account that appears in
`questionnaire_templates.created_by`. Nothing else about the account. Organizer or admin
session only; no arguments.

### Event (rule only)

`events.application_deadline` (a `date`, nullable) is now read by the submission function:

```
open  ⇔  status = 'active'
      and (application_deadline is null
           or application_deadline >= today in America/Edmonton)
```

the same rule `getActiveEvents` applies to the public listing.

## Who may do what, before and after

`V own` = a vendor on what is theirs; `V other` = a vendor on another vendor's; `O/A` =
organizer or admin; `anon` = not signed in. **Bold** marks a change.

| Object | Action | V own | V other | O/A | anon |
|---|---|---|---|---|---|
| `vendors` | read | yes | no | yes | no |
| `applications` | read | yes, **without notes** | no | yes | no |
| `applications` | insert directly | **no** (was yes) | no | yes | no |
| `application_answers` | read | yes | no | yes | no |
| `application_answers` | insert directly | **no** (was yes) | **no** (was yes) | yes | no |
| `attachments` (rows) | read | yes | no | yes | no |
| `attachments` (rows) | insert directly | **no** (was yes) | no | yes | no |
| `application_notes` | read, write | **no** | **no** | yes | **no** |
| bucket object | read, sign | yes | **no** (was yes) | yes | no |
| bucket object | delete | **no** (was yes) | **no** (was yes) | **no** (was yes) | no |
| bucket object | upload | yes | n/a | yes | yes |
| `users_with_roles` | read | **no rows** (was all) | **no rows** | admin yes; **organizer no rows** (was all) | no |
| `template_creator_emails()` | call | **no** | **no** | **yes** | **no** |
| `submit_public_application` | call | yes | n/a | yes | yes |

## Policies after 016

| Table | Policy | For | Role | Rule |
|---|---|---|---|---|
| `storage.objects` | `attachments_anon_insert` (011) | INSERT | anon, authenticated | bucket is `attachments` |
| `storage.objects` | `attachments_select_own_or_organizer` | SELECT | authenticated | organizer/admin, or a reference owned by the caller |
| `applications` | `organizer_insert_applications` | INSERT | authenticated | organizer/admin |
| `attachments` | `organizer_insert_attachments` | INSERT | authenticated | organizer/admin |
| `application_answers` | `organizer_insert_application_answers` | INSERT | authenticated | organizer/admin, event active, question belongs to the event |
| `application_notes` | `organizer_{select,insert,update,delete}_application_notes` | each | authenticated | organizer/admin |

Dropped: `attachments_authenticated_select`, `attachments_authenticated_delete` (011);
`authenticated_insert_applications`, `authenticated_insert_attachments` (005);
`authenticated_insert_application_answers` (009). Every other policy is as it was.

## The submission payload

Unchanged from spec 011 (`event_id`, `vendor`, `answers`). Two more ways to be refused:

| Code | When |
|---|---|
| `P0001` | also when the event's deadline day has ended in Edmonton |
| `P0005` | a file answer names a file another application already refers to |

## State: a file's life

```
uploaded (nobody's)
   │  a submission names it and commits
   ▼
referred to by application X  ──►  readable by X's vendor
   │  another submission names it
   ▼
refused (P0005); nothing changes
```

A submission that is refused for any reason leaves the file where it was.
