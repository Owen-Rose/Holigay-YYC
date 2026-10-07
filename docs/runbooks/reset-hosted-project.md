# Runbook: Reset a hosted Supabase project

**Backlog**: `docs/backlog/2026-10-06-uat-and-go-live.md` (BL-04; executed by BL-05, BL-07,
BL-08) · **Precedents**: the 2026-09-19 prod wipe (007 quickstart, T012 row) and the
2026-09-28 dev cleanup (010 quickstart, row D8)

Returns a hosted project — dev or prod — to "admin plus the organizers you name, and nothing
else": no events, no vendors, no applications, no answers, no attachments, no objects in the
`attachments` bucket, no throwaway accounts. Questionnaire templates are kept. It is the
recipe for clearing UAT data before and after an organizer cohort, and for the go-live clean
slate on prod.

> **This runbook is destructive and irreversible. Every run needs Owen's explicit go, in
> chat, after he has seen the inventory and the exact statements.** There is no undo: the
> rows are gone, the bucket objects are gone, and the accounts are gone. Prod additionally
> needs the session in **default permission mode** — in auto mode every prod-touching command
> is denied, reads included, and that is a guard, not a tooling gap. If a backup is wanted,
> take it first with `docs/runbooks/backup-restore.md`; the 2026-09-19 prod wipe ran without
> one by decision, because prod had never been live.

The shape is always the same, and the order is the point:

1. **Inventory** (read-only) → 2. **Keep-list** (Owen decides) → 3. **Storage objects**
   (through Storage, never SQL) → 4. **SQL** (one transaction, FK order) → 5. **Verify**
   (the inventory again) → 6. **Record** the verify output under the backlog item.

---

## 0. Before you start

Project refs:

| Project | Ref |
|---|---|
| Holigay-Dev | `kcokcufmzyckbodelqpb` |
| Holigay Events YYC (prod) | `hgmfjvjlxrhdojwlkgap` |

Two execution paths. Either works; pick one and use it for the whole run.

- **SQL Editor** (dashboard → SQL Editor on the target project). Simplest when Owen runs
  it himself. The editor may reject an explicit `BEGIN … COMMIT`; if so, run the statements
  one at a time **in exactly the order given** — the order alone is what makes it safe.
- **Management API** from a terminal (section 7). The whole write runs as one request, which
  Postgres executes as one implicit transaction. This is how both precedents were run.

What `ON DELETE` does on this schema, so the order below makes sense:

| FK | On delete | Consequence |
|---|---|---|
| `applications.event_id → events` | CASCADE | deleting an event removes its applications |
| `applications.vendor_id → vendors` | CASCADE | deleting a vendor removes its applications |
| `attachments.application_id → applications` | CASCADE | attachment **rows** go with the application; the **bytes** do not |
| `application_answers.application_id → applications` | CASCADE | |
| `application_answers.event_question_id → event_questions` | **RESTRICT** | an answer blocks deleting its question — and therefore its questionnaire and event — unless the answers go first |
| `event_questionnaires.event_id → events` | CASCADE | |
| `event_questions.event_questionnaire_id → event_questionnaires` | CASCADE | |
| `user_profiles.id → auth.users` | CASCADE | deleting an account removes its profile |
| `user_profiles.vendor_id → vendors` | SET NULL | |
| `vendors.user_id → auth.users` | SET NULL | deleting an account **leaves its vendor row** behind, unlinked — delete vendors before users |

Nothing cascades *into* `vendors`. `vendors.email` is UNIQUE and matched case-sensitively.

---

## 1. Inventory — read-only, run first, keep the output

Run every block and paste the results into the chat. This is what Owen approves against,
and the only record of what was there.

### 1.1 Row counts

```sql
SELECT 'events' AS tbl, count(*) FROM events
UNION ALL SELECT 'event_questionnaires', count(*) FROM event_questionnaires
UNION ALL SELECT 'event_questions', count(*) FROM event_questions
UNION ALL SELECT 'vendors', count(*) FROM vendors
UNION ALL SELECT 'applications', count(*) FROM applications
UNION ALL SELECT 'application_answers', count(*) FROM application_answers
UNION ALL SELECT 'attachments', count(*) FROM attachments
UNION ALL SELECT 'questionnaire_templates', count(*) FROM questionnaire_templates
UNION ALL SELECT 'template_questions', count(*) FROM template_questions
UNION ALL SELECT 'user_profiles', count(*) FROM user_profiles
UNION ALL SELECT 'auth.users', count(*) FROM auth.users
UNION ALL SELECT 'storage.objects (attachments)', count(*) FROM storage.objects WHERE bucket_id = 'attachments';
```

### 1.2 Accounts — the keep-list is chosen from this

```sql
SELECT u.id, u.email, p.role, u.email_confirmed_at IS NOT NULL AS confirmed,
       u.last_sign_in_at, u.created_at
FROM auth.users u
LEFT JOIN user_profiles p ON p.id = u.id
ORDER BY u.created_at;
```

### 1.3 Events, vendors, applications, attachments

```sql
SELECT e.id, e.name, e.status, e.event_date, count(a.id) AS applications
FROM events e LEFT JOIN applications a ON a.event_id = e.id
GROUP BY e.id ORDER BY e.created_at;

SELECT v.id, v.business_name, v.email, v.user_id, count(a.id) AS applications
FROM vendors v LEFT JOIN applications a ON a.vendor_id = v.id
GROUP BY v.id ORDER BY v.created_at;

-- Keep this one. Once the attachments rows are gone the file_path values are gone with
-- them, and any object still in the bucket becomes an orphan you cannot locate.
SELECT att.id, att.application_id, att.file_path, att.uploaded_at
FROM attachments att ORDER BY att.uploaded_at;
```

### 1.4 Bucket objects — SQL for reading only

```sql
SELECT name, metadata->>'size' AS bytes, created_at
FROM storage.objects
WHERE bucket_id = 'attachments'
ORDER BY name;
```

The zero-byte `uploads/.emptyFolderPlaceholder` is the dashboard's folder marker. Leave it.

---

## 2. Decide the keep-list

Write down, before anything is deleted:

- **Accounts to keep** — an explicit list of `auth.users` email addresses. Always Owen's
  admin; usually the real organizers. Everything not on the list is deleted in step 4.6.
  Never express this as "delete X and Y": a throwaway you forgot to name would survive, and
  an address you mistyped would be deleted. The list is of what *stays*.
- **Rows to keep**, if any. The normal run keeps none: every event, vendor, application and
  attachment goes. If a run must keep an event, add `WHERE id <> '<uuid>'` guards to steps
  4.1–4.5 and say so in the record.
- **Templates** are kept unless Owen says otherwise. They carry no vendor data.

Owen's go is against the inventory **and** this list.

---

## 3. Storage objects — through Storage, never SQL

Do this before the SQL, while `attachments.file_path` can still tell you what to look for.

> **`DELETE FROM storage.objects` is the wrong tool.** On a hosted project it removes the
> metadata row while the bytes stay in the backing store: the file disappears from the
> dashboard, still counts against quota, and can no longer be found or removed. The Storage
> API deletes both. Use SQL against `storage.objects` only to *read*.

Three ways, in order of preference:

```bash
# A. Dashboard (Owen): Storage → attachments → uploads/ → select every file except
#    .emptyFolderPlaceholder → Delete. Simplest; this is how both precedents did it.

# B. CLI. Needs the CLI linked to the target AND SUPABASE_DB_PASSWORD exported —
#    `storage --linked` initialises a database role and fails without it
#    (backup-restore.md "Verified behaviour" rows 5, 6, 9). --experimental is required.
npx supabase link --project-ref <ref>
read -s SUPABASE_DB_PASSWORD && export SUPABASE_DB_PASSWORD   # in a real terminal, not via `!`
npx supabase storage ls ss:///attachments/uploads/ --linked --experimental
npx supabase storage rm ss:///attachments/uploads/<file> --linked --experimental --yes

# C. Storage REST API with the project's service-role key (from the dashboard, never
#    fetched by an agent — that fetch is denied in auto mode). One call removes a list.
curl -sS -X DELETE "https://<ref>.supabase.co/storage/v1/object/attachments" \
  -H "apikey: $SERVICE_ROLE_KEY" -H "Authorization: Bearer $SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{"prefixes": ["uploads/<file-1>", "uploads/<file-2>"]}'
```

Then re-run 1.4. Only the placeholder may remain.

---

## 4. SQL — one transaction, in this order

Run as one body through the Management API (section 7), or as one SQL Editor block, or
statement by statement in this order. Replace `<keep-list>` with the quoted, comma-separated
addresses from section 2 — **every** address on it, including Owen's.

```sql
BEGIN;

-- 4.1 REQUIRED, and it must be first. application_answers → event_questions is
--     ON DELETE RESTRICT (migration 009). Step 4.5's event delete cascades down two chains
--     at once — applications → answers, and questionnaires → questions — and RESTRICT is
--     enforced immediately, so answers left in place abort the event delete with
--     "violates foreign key constraint". Nothing else here has that property.
DELETE FROM application_answers;

-- 4.2 Belt and braces: rows cascade from applications. The objects were removed in
--     section 3; this only drops the metadata rows.
DELETE FROM attachments;

-- 4.3 Belt and braces: cascades from both events and vendors.
DELETE FROM applications;

-- 4.4 REQUIRED. Nothing cascades into vendors — not from events, not from applications,
--     and deleting an account only sets vendors.user_id to NULL.
DELETE FROM vendors;

-- 4.5 REQUIRED, and it must come after 4.1. Cascades to event_questionnaires and
--     event_questions. Templates are untouched: event_questionnaires.seeded_from_template_id
--     points at them, not the other way round.
DELETE FROM events;

-- 4.6 Accounts. The keep-list is what STAYS; everything else goes. user_profiles cascades.
--     GoTrue's own tables (identities, sessions, refresh_tokens, mfa_*, one_time_tokens)
--     cascade from auth.users on hosted projects, so a plain DELETE is enough.
DELETE FROM auth.users
WHERE email NOT IN (<keep-list>);   -- e.g. 'owner@example.com', 'organizer@example.com'

COMMIT;
```

If a run keeps named events, add `WHERE event_id <> '<uuid>'`-style guards to 4.1–4.3 and
`WHERE id <> '<uuid>'` to 4.5, keep the vendors those applications point at (4.4 gains a
`WHERE NOT EXISTS (SELECT 1 FROM applications a WHERE a.vendor_id = vendors.id)`), and say so
in the record.

---

## 5. Verify

Re-run section 1 in full. Expected after a normal run:

| Check | Expected |
|---|---|
| `events`, `event_questionnaires`, `event_questions`, `vendors`, `applications`, `application_answers`, `attachments` | 0 each |
| `questionnaire_templates`, `template_questions` | unchanged from the inventory |
| `auth.users` and `user_profiles` | exactly the keep-list, same count |
| 1.2 | every row's email is on the keep-list, with the role you expect |
| `storage.objects` (1.4) | only `uploads/.emptyFolderPlaceholder`, or nothing |

Anything else means a statement was skipped or ran out of order. Do not "fix forward" with an
ad-hoc delete — re-read the inventory, work out what happened, and only then run the missing
step on its own. A non-zero `storage.objects` with real names means an object was deleted by
SQL somewhere, or section 3 was skipped; go back to section 3.

---

## 6. Record

Paste the 1.1 counts and the 1.2 list from the verify run under the backlog item that
called for the reset (BL-05 / BL-07 / BL-08), with the date and the keep-list. That row is
the evidence; the chat is not.

---

## 7. Execution path: the Management API from a terminal

This is how the 2026-09-19 prod wipe and the 2026-09-28 dev cleanup were run. One HTTPS
request per block, authenticated with the Supabase CLI's own login token.

**Where the token lives.** `supabase login` on this machine stores it in the GNOME keyring
under the service name `Supabase CLI` — not in `~/.supabase/access-token`. `secret-tool`
and `gdbus` cannot read it in one go (a Secret Service session ends with the D-Bus
connection that opened it), but `/usr/bin/python3` with `gi.repository.Gio` can, over a
single connection: `OpenSession` (plain) → `SearchItems` → `Item.GetSecret`. Note
`/usr/bin/python3` explicitly — the `python3` on `PATH` may be a venv without `gi`. The
service-only search matches; adding a `username` attribute does not.

```bash
# Keep the token in a shell variable. Never echo it, never write it to a file, and redact
# anything that starts with sbp_ from any output you paste anywhere.
TOKEN=$(/usr/bin/python3 - <<'PY'
import gi
gi.require_version("Gio", "2.0")
from gi.repository import Gio, GLib

bus = Gio.bus_get_sync(Gio.BusType.SESSION, None)
def call(path, iface, method, params, sig):
    return bus.call_sync("org.freedesktop.secrets", path, iface, method,
                         GLib.Variant(sig, params), None, Gio.DBusCallFlags.NONE, -1, None)

_, session = call("/org/freedesktop/secrets", "org.freedesktop.Secret.Service",
                  "OpenSession", ("plain", GLib.Variant("s", "")), "(sv)").unpack()
unlocked, locked = call("/org/freedesktop/secrets", "org.freedesktop.Secret.Service",
                        "SearchItems", ({"service": "Supabase CLI"},), "(a{ss})").unpack()
items = unlocked or locked
if not items:
    raise SystemExit("no 'Supabase CLI' item in the keyring — run `npx supabase login` first")
secret = call(items[0], "org.freedesktop.Secret.Item", "GetSecret", (session,), "(o)").unpack()[0]
print(bytes(secret[2]).decode())
PY
)
test -n "$TOKEN" || { echo "no token"; exit 1; }

REF=kcokcufmzyckbodelqpb   # or hgmfjvjlxrhdojwlkgap — check twice, this is the whole risk

# One request per block. The body is JSON, so build it with jq from a file to avoid
# quoting mistakes. A multi-statement body runs as ONE implicit transaction: either every
# statement commits or none does. Leave the BEGIN/COMMIT out of the file for this path.
jq -Rs '{query: .}' < inventory.sql |
  curl -sS -X POST "https://api.supabase.com/v1/projects/$REF/database/query" \
    -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d @- \
  | jq .
```

Read requests return the rows as JSON. Write requests return `[]` on success; an error
returns `{"message": …}` and nothing was committed. Re-run the verify block afterwards
regardless.

For prod, every one of these commands prompts Owen for approval in default mode. That is
the intended shape: inventory read → his go → the one write request → verify read.

---

## Verified behaviour

| # | Observed | Why it matters |
|---|---|---|
| 1 | 2026-09-19, prod: 1 event, 3 vendors, 3 applications, 3 attachments deleted in one Management API request (each call approved by hand); the 3 test files were removed in the dashboard; every `public` table 0 afterwards and `auth.users` held only the admin (007 quickstart, T012 row) | The one-request transaction and the dashboard-for-objects split both work on prod |
| 2 | 2026-09-28, dev: one Management API transaction removed 2 answer sets, 2 applications, 2 auth users (profiles cascaded) and 2 vendors; read-back all 0 (010 quickstart, row D8) | Same path on dev; `auth.users` deletes cascade to `user_profiles` as expected |
| 3 | Same day: deleting the two T006 objects in the dashboard also took the UAT sample `uploads/1790547229133-j5uak4-uat-product.png`, leaving UAT application `2b703c47…` pointing at a missing object | Select objects one by one against 1.3's `file_path` list; do not "select all" when some rows are meant to survive |
| 4 | `application_answers → event_questions` is RESTRICT; everything else in the chain is CASCADE (migration 009; smoke runbook row 1) | Why 4.1 is first and 4.5 is last |
| 5 | Deleting a `storage.objects` row by SQL orphans the bytes on hosted projects (smoke runbook row 7) | Why section 3 never uses SQL to delete |
| 6 | Fetching a project's service-role key through the Management API from an agent session is denied in auto mode (010 memory, 2026-09-28) | Path C in section 3 needs the key pasted by Owen; path A needs nothing |

## Rehearsals

- **2026-10-06, dev (BL-05).** First run, Management API path. The project was free-tier
  paused (`status: INACTIVE`; every `database/query` timed out) until Owen restored it — check
  `GET /v1/projects/<ref>` first next time. Keyring snippet in §7 worked as written. Inventory →
  Owen's go → one write request (`[]`) → verify: every public table 0, templates untouched,
  `auth.users` = keep-list of one, bucket holds only the placeholder. Owen removed a stray
  1-byte `__probe-011/x.txt` (spec 006 probe) in the dashboard. Full record under BL-05 in
  `docs/backlog/2026-10-06-uat-and-go-live.md`.
