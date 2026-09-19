# Runbook: Event-week smoke check

**Spec**: `specs/007-production-readiness/` (T011, T021) · **Research**: `research.md` R6

Two halves, and they prove different things. `npm run smoke` proves the machine is up and
still locked down — it is read-only, takes seconds, and can be run as often as you like. The
click-through proves a real vendor can get all the way through and a real organizer can
answer them, which no automated check can establish, because it depends on email actually
arriving in a mailbox. Target for both together: ten minutes (SC-004).

Run this before event week, after every promotion to `main`, and whenever a hosted project
has just woken from a free-tier pause.

> **The click-through writes real rows into whichever project you point it at.** One event,
> one vendor, one application, one answer set, one file in the `attachments` bucket, and two
> emails. Use the reserved test identity in section 0 for every field that takes one —
> section 3's cleanup finds the rows by that identity, and anything typed off-script it will
> not find.

---

## 0. Before you start

- The three `SMOKE_*` values for the target environment (section 1). They are documented,
  commented out, in `.env.example`.
- An organizer login on that project (T014 for dev, T015 for prod).
- A mailbox you can read, for the vendor side, and one small PDF (under 1 MB).

Project refs:

| Project | Ref |
|---|---|
| Holigay-Dev | `kcokcufmzyckbodelqpb` |
| Holigay Events YYC (prod) | `hgmfjvjlxrhdojwlkgap` |

The test identity, fixed so the cleanup can be exact:

| Field | Value |
|---|---|
| Event name | `SMOKE TEST — DELETE ME <YYYY-MM-DD>` |
| Vendor business name | `Smoke Test Co` |
| Vendor email | `smoke+<YYYY-MM-DD>@<your domain>` |

The vendor email is the cleanup key, and it must be an address no real vendor uses.
`vendors.email` is UNIQUE and `submit_public_application` upserts the vendor by address, so
reusing a real vendor's address would attach the test application to their record — and the
cleanup would then try to delete a real vendor.

---

## 1. `npm run smoke`

```bash
SMOKE_APP_URL=https://<production host> \
SMOKE_SUPABASE_URL=https://hgmfjvjlxrhdojwlkgap.supabase.co \
SMOKE_SUPABASE_ANON_KEY=<prod anon key> \
npm run smoke
```

Shell only — never `.env.local`, never committed. The script loads no env file precisely so
that a production host cannot end up in the repo by way of a checked-in `.env`.

Use the **anon** key, never the service role key. These five checks prove what an anonymous
visitor can and cannot reach; a service key would pass all five while proving nothing.

For the local stack, with `npm run dev` running in another shell:

```bash
SMOKE_APP_URL=http://localhost:3000 \
SMOKE_SUPABASE_URL=http://127.0.0.1:54321 \
SMOKE_SUPABASE_ANON_KEY=$(npx supabase status -o env | sed -n 's/^ANON_KEY="\(.*\)"/\1/p') \
npm run smoke
```

### 1.1 What each check proves

| Check | Proves | Usual cause when it fails |
|---|---|---|
| `app-pages` | `/` and `/apply` answer 200 | The deploy failed, or the production env guard refused the build (`resend.dev` sender, missing key) |
| `private-tables-closed` | anon reads nothing from `vendors`, `applications`, `attachments`, `application_answers` | A policy re-added by hand in the dashboard; migration 011 missing on this project |
| `questionnaire-invariant` | every active event has a questionnaire with at least one question | An event flipped to `active` from SQL, bypassing the builder |
| `submit-rpc-event-gate` | `submit_public_application` exists, anon may call it, and it rejects an unknown event before writing | Migration 011 not applied, or anon's EXECUTE revoked — either way the public form is down |
| `organizer-rpcs-denied` | anon cannot call the two organizer-only RPCs | Migration 011 not applied on this project |

### 1.2 Exit codes

`0` every check passed · `1` at least one failed, and the failed names are repeated on the
last line · `2` one of the three variables is missing.

`PASS questionnaire-invariant (no active events)` is a real pass and a real warning: the
check is a statement about active events, and there were none, so nothing was verified. The
populated form carries the count — `(2 active events)` — for the same reason. Read the note,
not just the word PASS.

---

## 2. The ten-minute click-through

Start a timer. Each step names the rows it creates; section 3 deletes them in that order.

### 2.1 Create the test event as a **draft** (organizer)

`/dashboard/events/new`. Name it from the test identity, give it a date a few weeks out, and
leave the status at **Draft**.

Draft is not optional here, and getting it wrong is the most common way to get stuck: the RLS
policies on `event_questionnaires` and `event_questions` only permit writes while the parent
event is `status = 'draft'` (migration 009), so an event created straight to Active can never
be given a questionnaire. Build first, publish second.

*Creates:* one `events` row.

### 2.2 Give it a questionnaire, still as a draft (organizer)

On the event's edit page, add at least one question of each kind you care about, including
one `file_upload`, and save.

*Creates:* one `event_questionnaires` row and one `event_questions` row per question.

### 2.3 Publish it (organizer)

Set the status to **Active** — a draft event is not offered at `/apply`.

The draft → active transition fires `lock_event_questionnaire`, which stamps `locked_at` on
the questionnaire. That is intentional and one-way: from here the questions are frozen, so if
you find a mistake, fix it before publishing rather than after.

### 2.4 Submit as a vendor, with a PDF (public, signed out)

Use a private window — signed in as an organizer you would be testing a different path.
`/apply` → pick the test event → fill the dynamic form with the test identity → attach the
PDF → submit.

*Creates:* one `vendors` row, one `applications` row, one `application_answers` row per
answered question, one `attachments` row, and one object under `uploads/` in the
`attachments` bucket.

### 2.5 The confirmation email

It must arrive **from the verified domain**, not `onboarding@resend.dev`. A `resend.dev`
sender means `EMAIL_FROM_ADDRESS` is unset on that environment — check the Vercel project's
variables, not the code. Resend's test sender delivers only to the Resend account owner's
mailbox, so in production it means every vendor email silently vanishes.

### 2.6 Review it and download the attachment (organizer)

`/dashboard/applications/[id]` → the attachment list → download. The link is a short-lived
signed URL minted when you click, so a link copied out of an old tab expiring is not a
failure. A 404 on a fresh click is: it means the `attachments` row and the storage object
have diverged.

### 2.7 Change the status and read the status email (organizer)

Set the status to Approved (or Rejected) and confirm the status-update email arrives, again
from the verified domain. Stop the timer and record it against SC-004's ten minutes.

---

## 3. Cleanup

### 3.1 Find everything the run created

```sql
-- Run this FIRST and keep the output. Once the attachments rows are gone you have lost the
-- file_path values, and the object in the bucket becomes an orphan you cannot locate.
SELECT e.id   AS event_id,
       e.name AS event_name,
       v.id   AS vendor_id,
       v.email,
       a.id   AS application_id,
       att.id AS attachment_id,
       att.file_path
FROM vendors v
JOIN applications a ON a.vendor_id = v.id
JOIN events e       ON e.id = a.event_id
LEFT JOIN attachments att ON att.application_id = a.id
WHERE v.email = 'smoke+<YYYY-MM-DD>@<your domain>';
```

```sql
-- Does this vendor have applications OTHER than the test one? If this returns any row, the
-- address was reused: delete the application but KEEP the vendor (3.3 leaves it alone).
SELECT a.id, e.name
FROM applications a
JOIN events e  ON e.id = a.event_id
JOIN vendors v ON v.id = a.vendor_id
WHERE v.email = 'smoke+<YYYY-MM-DD>@<your domain>'
  AND e.name <> 'SMOKE TEST — DELETE ME <YYYY-MM-DD>';
```

### 3.2 Delete the storage object — through Storage, not SQL

> **`DELETE FROM storage.objects` is the wrong tool.** On a hosted project it removes the
> metadata row while the bytes stay in the backing store: the file disappears from the
> dashboard, still counts against quota, and can no longer be found or removed. The Storage
> API deletes both. Use SQL against `storage.objects` only to *read* — to confirm a path
> exists, or to confirm it is gone.

Pick one, using the `file_path` from 3.1:

```bash
# Dashboard: Storage → attachments → uploads/ → select the file → Delete. Simplest for one file.

# CLI. --experimental is required (not optional, despite the help text) and --yes suppresses
# the confirmation prompt. See backup-restore.md's "Verified behaviour" rows 5 and 9.
npx supabase storage rm ss:///attachments/<file_path> --linked --experimental --yes
```

### 3.3 Delete the rows, in this order

```sql
-- Supabase SQL Editor, on the project you just tested. Replace both placeholders throughout.
-- If the editor rejects the explicit transaction, run the statements one at a time in
-- exactly this order; the order alone is what makes it safe.
BEGIN;

-- 1. REQUIRED, and it must be first.
--    application_answers.event_question_id references event_questions ON DELETE RESTRICT
--    (migration 009). Step 5's event delete cascades down two chains at once —
--    applications → answers, and questionnaires → questions — and RESTRICT is enforced
--    immediately, so leaving the answers in place can abort the event delete with
--    "violates foreign key constraint". Nothing else in this script has that property.
DELETE FROM application_answers
WHERE application_id IN (
  SELECT a.id FROM applications a
  JOIN vendors v ON v.id = a.vendor_id
  WHERE v.email = 'smoke+<YYYY-MM-DD>@<your domain>'
);

-- 2. Belt and braces: attachments cascades from applications. Explicit so the row count
--    tells you whether the upload in 2.4 actually recorded a row, and so this stays
--    visibly paired with 3.2's object delete.
DELETE FROM attachments
WHERE application_id IN (
  SELECT a.id FROM applications a
  JOIN vendors v ON v.id = a.vendor_id
  WHERE v.email = 'smoke+<YYYY-MM-DD>@<your domain>'
);

-- 3. Belt and braces: cascades from both events and vendors. Explicit so you can stop here,
--    keeping the event for a second run.
DELETE FROM applications
WHERE vendor_id IN (
  SELECT id FROM vendors WHERE email = 'smoke+<YYYY-MM-DD>@<your domain>'
);

-- 4. REQUIRED. Nothing cascades into vendors — not from events, not from applications. The
--    NOT EXISTS is the guard for a reused address: if this vendor still has any application
--    left, it is not a test vendor and this deletes nothing.
DELETE FROM vendors v
WHERE v.email = 'smoke+<YYYY-MM-DD>@<your domain>'
  AND NOT EXISTS (SELECT 1 FROM applications a WHERE a.vendor_id = v.id);

-- 5. REQUIRED, and it must be last. This cascades to event_questionnaires and
--    event_questions, which step 1 made safe. Do it in SQL, not the UI: the UI refuses to
--    delete an event that has applications and offers "set the status to Closed" instead —
--    right for a real event, not for this one. By now the applications are gone, so the UI
--    would work too.
DELETE FROM events
WHERE name = 'SMOKE TEST — DELETE ME <YYYY-MM-DD>';

COMMIT;
```

### 3.4 Confirm nothing is left

```sql
SELECT 'vendors' AS what, count(*) FROM vendors
  WHERE email = 'smoke+<YYYY-MM-DD>@<your domain>'
UNION ALL
SELECT 'events', count(*) FROM events
  WHERE name = 'SMOKE TEST — DELETE ME <YYYY-MM-DD>'
UNION ALL
SELECT 'objects', count(*) FROM storage.objects
  WHERE bucket_id = 'attachments' AND name = '<file_path>';
-- All three must be 0. A non-zero `objects` after 3.2 means the delete went through SQL
-- somewhere, or the CLI path was wrong.
```

Then re-run `npm run smoke`. `questionnaire-invariant` should be back to its pre-run count.

---

## 4. When a check fails

| Symptom | Look here |
|---|---|
| `app-pages` fails, everything else passes | The deployment, not the database. Vercel's build log — the production env guard refuses a missing `RESEND_API_KEY`/`EMAIL_FROM_ADDRESS` or a `resend.dev` sender |
| Every Supabase check fails with `PGRST301` / HTTP 401 | The anon key is wrong or belongs to another project |
| Every Supabase check fails with an empty code | The request never reached PostgREST: DNS, connection refused, or the 10 s timeout. A paused free-tier project presents as NXDOMAIN |
| `private-tables-closed` names a table | A policy was added by hand. Compare against `011_close_public_data_exposure.sql`; the probe in `specs/006-close-public-data-exposure/quickstart.md` narrows it |
| `questionnaire-invariant` names an event | Open that event in the builder and add a question, or set it back to draft. It is reachable at `/apply` right now with nothing to fill in |
| `submit-rpc-event-gate` returns `PGRST202` or `42883` | Migration 011 is not applied to this project — the public form cannot submit at all |
| `organizer-rpcs-denied` reports anon was allowed | Stop and treat it as an incident: anon can create events. Check migration 011's REVOKE and migration 012's in-function role gate |

---

## Verified behaviour

Observed while building this runbook (2026-09-18). Re-check if the schema or CLI changes.

| # | Observed | Why it matters |
|---|---|---|
| 1 | `application_answers.event_question_id` is `ON DELETE RESTRICT`; every other FK in the chain (`applications → events`, `applications → vendors`, `attachments → applications`, `event_questionnaires → events`, `event_questions → event_questionnaires`) is CASCADE | The answers must be deleted before the event. An event-first delete can abort mid-cascade, which is why 3.3 step 1 is not optional |
| 2 | Nothing cascades into `vendors` | 3.3 step 4 is load-bearing; steps 2 and 3 are not, and are kept only for auditability and the stop-early case |
| 3 | `vendors.email` is UNIQUE and the submission RPC upserts the vendor by address | A real address turns the test into a mutation of a real vendor record |
| 4 | The UI refuses to delete an event that has applications, offering "Closed" instead (`src/lib/actions/events.ts`) | The cleanup is SQL by necessity, not preference |
| 4a | The write policies on `event_questionnaires` and `event_questions` require the parent event to be `status = 'draft'`, and the draft → active transition fires `lock_event_questionnaire` | An event created straight to Active can never be given a questionnaire. Section 2 builds the questionnaire first and publishes second for this reason — and it is also how an active event ends up with no questions, which is precisely what `questionnaire-invariant` catches |
| 5 | Deleting a `storage.objects` row by SQL orphans the bytes on hosted projects | Use the dashboard or `supabase storage rm`; SQL for reading only |
| 6 | Attachment download links are signed URLs minted per click | A stale tab's expired link is not a failure; a 404 on a fresh click is |
| 7 | `submit_public_application`'s event gate is its first executable statement, ahead of all other validation | The smoke check's nil-uuid probe reliably returns `P0002` without writing anything |
| 8 | Anon has unrestricted SELECT on `event_questionnaires` and `event_questions`, and sees only `status = 'active'` rows in `events` | The questionnaire invariant is checkable with the anon key alone, in one embedded query |
| 9 | `PASS questionnaire-invariant (no active events)` is vacuous | Read the note, not just the word PASS |

---

## Rehearsals

- **2026-09-18, local stack (T011).** The five checks were exercised against the real local
  stack: a green run exited 0, a bogus app port exited 1 with the other four still green, and
  a missing variable exited 2. The questionnaire invariant was proved in all three directions
  against a temporary local-only fixture — healthy, a questionnaire with no questions, and no
  questionnaire at all — because an empty database exercises only its vacuous path. The
  click-through in section 2 has not yet been run end to end; T021 is the first live run.
