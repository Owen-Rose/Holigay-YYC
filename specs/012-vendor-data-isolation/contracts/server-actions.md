# Contract: Server Actions and Their Unit Tests

**Feature**: 012-vendor-data-isolation | **Date**: 2026-11-22
**Reasoning**: `research.md` R6, R7, R8.

Three action files change, and only because the notes moved and the organizer's read of the
account list closed. No page, component, form, route, string or response type changes
(FR-015, FR-027). No rule is enforced here that the database does not enforce (FR-025): every
function below keeps its `requireRole('organizer')` gate, and RLS on `application_notes` is the
authority behind it.

## What does not change

`upload.ts`, `answers.ts`, `src/lib/submission/errors.ts`, `admin.ts` (`getUsers`),
`src/lib/team/invite-organizer-core.ts`, `team.ts`, `vendor-dashboard.ts`, `vendors.ts`,
`events.ts`, `src/lib/supabase/admin.ts` (still imported only by `team.ts`, FR-026),
`file-answer-link.tsx`, `attachments-list.tsx`, every file under `src/app/`, the email
templates, `scripts/smoke-check.mjs`.

## 1. `src/lib/actions/applications.ts`

### Reads: `getApplications`, `getApplicationById`, `updateApplicationStatus`

In each select string, the line `organizer_notes,` becomes:

```
application_notes ( notes ),
```

`application_notes.application_id` is both the primary key and the foreign key to
`applications`, so PostgREST returns the embed as one object or `null`. Each function maps it
back to the field its callers already use:

```ts
organizer_notes: app.application_notes?.notes ?? null,
```

`ApplicationWithVendor.organizer_notes` and `ApplicationDetail.organizer_notes` keep their name
and type (`string | null`), so `src/app/dashboard/applications/[id]/page.tsx` and the list are
untouched. `updateApplicationStatus` passes the same value to `statusUpdateEmail` as
`organizerNotes`, so the status email still carries a saved note (spec Edge Cases, "The status
email").

### Write: `updateApplicationNotes(id, notes)`

Same signature and `UpdateApplicationResponse`. New body:

1. `applicationNotesSchema.safeParse({ id, notes })` (new, in
   `src/lib/validations/application.ts`: `id` a UUID, `notes` a string). On failure return
   `{ success: false, error: 'Invalid notes' }`. The action had no validation; a modified
   action gets one (constitution I).
2. `requireRole('organizer')`, as today.
3. If `notes` is not empty: `from('application_notes').upsert({ application_id: id, notes },
   { onConflict: 'application_id' })`. If it is empty: `from('application_notes').delete()
   .eq('application_id', id)`. This mirrors today's `notes || null`.
4. On an error from step 3: log, return `{ success: false, error: 'Failed to update notes' }`
   (the existing message).
5. `from('applications').update({ updated_at: now }).eq('id', id)`, so "Last Updated" on the
   review page moves when a note is saved, as it does today. If only this step fails, log it
   and still return success: the note is saved.
6. `revalidatePath('/dashboard/applications')` and
   `revalidatePath(`/dashboard/applications/${id}`)` once the note is saved, whether or not
   step 5 succeeded, so the list and the review page re-fetch (constitution IV). Not called
   when step 1, 2 or 3 fails.

The action had no `revalidatePath` before this spec. The review page is rendered per request
and the notes box keeps its own state, so the one visible difference expected is "Last
Updated" refreshing after a save; the calls are there because Principle IV requires them of a
mutating action whose data an existing route renders. `updateApplicationStatus` has the same
gap and its write is not touched here (`research.md`, "Found on the way, left alone").

## 2. `src/lib/actions/export.ts`

The select string changes the same way; the row builder reads
`app.application_notes?.notes ?? null` where it read `app.organizer_notes`. The eleven columns,
their order and the "Organizer Notes" header are untouched.

## 3. `src/lib/actions/templates.ts`: `listTemplates`

The read of `users_with_roles` (lines 89–98) becomes:

```ts
const emailMap = new Map<string, string>();
if (creatorIds.length > 0) {
  const { data: creators } = await supabase.rpc('template_creator_emails');
  (creators ?? []).forEach((c) => emailMap.set(c.creator_id, c.email));
}
```

The `UsersWithRolesRow` type alias in this file goes with it. The response shape
(`createdByEmail: string | null`) is unchanged; a failed or refused call leaves every creator
`null`, which the list already renders as `—`.

## 4. `src/types/database.ts`

Regenerated with `npm run db:types:local` after `016` is applied locally; never edited by hand.
Expected differences: a new `application_notes` table with a one-to-one relationship to
`applications`; a new `template_creator_emails` function. `applications.organizer_notes` stays
(the column is retained) and `users_with_roles` is unchanged.

## 5. Unit tests

| File | Change |
|---|---|
| `src/test/application-notes-action.test.ts` | **new**: non-empty note → one upsert on `application_notes` with `onConflict: 'application_id'`, then the timestamp bump; empty note → delete, not upsert; a caller below organizer → refused, no database call; a non-UUID id → "Invalid notes", no database call; upsert error → "Failed to update notes"; bump error only → success; with `next/cache` mocked, a successful save calls `revalidatePath` with `/dashboard/applications` and `/dashboard/applications/<id>`, and a refusal, a validation failure or an upsert error does not call it |
| `src/test/applications-readers.test.ts` | fixture row carries `application_notes: { notes: … }`; new case: the detail maps it to `organizer_notes`, and `null` when the embed is `null`; the select string names `application_notes` and not `organizer_notes` |
| `src/test/organizer-read-auth.test.ts` | fixture row shape only |
| `src/test/applications-email-warning.test.ts` | fixture row shape; new case: a saved note reaches `statusUpdateEmail` as `organizerNotes` |
| `src/test/export.test.ts` | fixture row shape; the existing "Organizer Notes" column assertion keeps passing; the select string names `application_notes` |
| `src/test/templates-actions.test.ts` | "returns templates with creator email…" now mocks `rpc('template_creator_emails')` returning `[{ creator_id, email }]`; new case: the RPC erroring leaves `createdByEmail` null and the action still succeeds |
| `src/test/admin-client-containment.test.ts` | unchanged; must still pass (FR-026) |

All follow the Arrange-Act-Assert pattern and the Supabase mock of
`src/test/auth-roles.test.ts`.

## Gate

`npm run format:check && npm run lint && npm test && npm run build`, and
`npm run test:security` with the local stack on `016`.
