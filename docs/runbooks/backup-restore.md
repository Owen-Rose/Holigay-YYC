# Runbook: Backup and restore

**Spec**: `specs/007-production-readiness/` (T009, T010) · **Research**: `research.md` R7

The Supabase free tier has no automatic backups, and `pg_dump` does not cover Storage
objects. A usable backup is therefore three parts — **schema**, **data**, **bucket** — and a
backup nobody has restored is not a backup, so the drill at the end is part of the routine,
not an optional extra.

Every command below was executed against Supabase CLI **2.65.6** on 2026-09-16/17, first
against a synthetic fixture and then against the real dev project. Where the CLI's behaviour
is surprising, the "Verified behaviour" table at the end records what was observed and what
to re-check on a newer CLI.

> **Production dumps are never restored into dev.** Dev previews are public-by-link and hold
> test data only; restoring prod there would put real vendor PII on a public preview. The
> drill restores a **dev** dump into the **local** stack.

---

## 0. Prerequisites

- Docker running, and for the drill the local stack up: `npx supabase start`
- The CLI logged in: `npx supabase login` (check with `npx supabase projects list`)
- The project's database password, typed interactively — **never written to a file**

Project refs:

| Project | Ref |
|---|---|
| Holigay-Dev | `kcokcufmzyckbodelqpb` |
| Holigay Events YYC (prod) | `hgmfjvjlxrhdojwlkgap` |

---

## 1. Link and export the password

```bash
npx supabase link --project-ref <ref>

# Typed, not stored. Both the db dumps and the storage copy need it.
read -s SUPABASE_DB_PASSWORD && export SUPABASE_DB_PASSWORD
```

`supabase storage --linked` needs `SUPABASE_DB_PASSWORD` too — it initialises a
`cli_login_postgres` role through the database before it will talk to the Storage API. Export
it before step 2.3, not just before the dumps.

---

## 2. Take the backup

```bash
PROJECT=dev                       # or prod
DATE=$(date -u +%F)
OUT="backup/$PROJECT/$DATE"
mkdir -p "$OUT"
```

`backup/` is git-ignored. **Treat it like a credentials file**: `data.sql` carries
`auth.users.encrypted_password` hashes and `auth.identities`, and the bucket copy is whatever
vendors uploaded. Keep it on an encrypted disk, do not sync it anywhere, delete old ones.

### 2.1 Schema

```bash
npx supabase db dump --linked -f "$OUT/schema.sql"
```

This is the **`public` schema only** — `auth`, `storage`, `supabase_migrations` and the other
platform schemas are excluded, because the platform owns them and `supabase db reset`
recreates them from `supabase/migrations/`. The output is rewritten to
`CREATE … IF NOT EXISTS` / `CREATE OR REPLACE`, so it is safe to re-run.

### 2.2 Data

```bash
npx supabase db dump --linked --data-only --use-copy -s auth,public \
  -x auth.refresh_tokens -x auth.sessions -x auth.flow_state -x auth.mfa_amr_claims \
  -f "$OUT/data.sql"
```

**`-s auth,public` is required, not optional.** Without it the CLI dumps `--schema '*'`, which
also pulls in `storage` and `supabase_functions`:

- `storage.buckets` collides on restore — migration `011` already inserts the `attachments`
  bucket, so the restore dies with
  `duplicate key value violates unique constraint "buckets_pkey"`.
- `storage.buckets_vectors` and friends are owned by `supabase_storage_admin`, so restoring as
  `postgres` dies with `permission denied for table buckets_vectors`.

`auth` **is** included and must be: `public.user_profiles.id` references `auth.users`, so a
`public`-only data dump cannot be restored. The four `-x` exclusions are live session state —
refresh tokens, sessions, in-flight auth flows, MFA claims — which is bound to the project's
JWT secret, useless anywhere else, and not something to copy around. `auth.users` and
`auth.identities` stay.

The dump file opens with `SET session_replication_role = replica;` and closes with
`RESET ALL;`, which keeps triggers (including `handle_new_user`) off during the restore.
Migration-history tables (`auth.schema_migrations`, `storage.migrations`, the
`supabase_migrations` schema) are excluded by the CLI — they belong to whichever stack you
restore into.

### 2.3 Attachments bucket

```bash
npx supabase storage cp -r ss:///attachments "$OUT/attachments" --linked --experimental
```

`--experimental` is **required** — without it the CLI answers
`must set the --experimental flag to run this command`.

Keep the destination directory named exactly `attachments`; step 3.4 depends on it.

### 2.4 Record what you got

```bash
ls -l "$OUT"
find "$OUT/attachments" -type f | wc -l          # object count
grep -oE 'COPY "[a-z_]+"\."[a-z_]+"' "$OUT/data.sql" | sort -u   # tables captured
```

---

## 3. Restore drill (dev dump → local stack)

### 3.1 Reset the local stack

```bash
npx supabase db reset
# If auth health returns 502 afterwards:
docker restart supabase_kong_Holigay
```

This applies every migration through `012`. `supabase/seed.sql` is intentionally empty, so
nothing is seeded that could collide with the restore.

### 3.2 Filter the dump, and take the source row counts from it

A hosted project runs a newer GoTrue than CLI 2.65.6's local stack, so its `auth` schema has
tables and columns the local one does not. Restoring a hosted dump straight into local fails —
first on a missing table, then on a missing column:

```
ERROR:  relation "auth.mfa_recovery_code_sets" does not exist
ERROR:  column "expires_at" of relation "one_time_tokens" does not exist
```

`scripts/filter-dump-for-local.mjs` strips exactly the COPY blocks whose table or columns are
absent locally, and **refuses to run if any such block holds rows** — a skew that would cost
data is an error, not something to paper over. It also prints every table's row count to
stderr; the dump is the only source the restore ever sees, so counting it is exact and needs
no access to the hosted project.

```bash
node scripts/filter-dump-for-local.mjs "$OUT/data.sql" \
  > /tmp/data-filtered.sql 2> /tmp/counts-source.txt
cat /tmp/counts-source.txt          # read the skipped list; it must say "all empty"
```

If the script refuses, the dump and the local stack have genuinely diverged: upgrade the CLI so
the local `auth` schema matches, or restore into a hosted project of the same generation. For
real disaster recovery the target is a **hosted** project, where this skew does not arise — it
is an artefact of drilling into an older local stack.

### 3.3 Restore the data

```bash
docker exec -i supabase_db_Holigay psql -U postgres -d postgres \
  --single-transaction -v ON_ERROR_STOP=1 < /tmp/data-filtered.sql
```

`psql` is **not installed on the host** — every SQL step goes through
`docker exec … supabase_db_Holigay`. `--single-transaction -v ON_ERROR_STOP=1` matters: a
restore that hits an error rolls back completely instead of leaving the database
half-populated. (Verified twice — a deliberately bad restore and the unfiltered hosted dump
both left the row counts untouched.)

### 3.4 Restore the bucket

```bash
npx supabase storage cp -r "$OUT/attachments" ss:/// --local --experimental
```

Note the destination is `ss:///`, **not** `ss:///attachments`. `cp -r` always nests
`basename(src)` under the destination, so `cp -r …/attachments ss:///attachments` would write
to `attachments/attachments/…` and every signed URL would 404. Because the source directory is
named `attachments` and the bucket is called `attachments`, copying to the root lands the
objects at the right paths.

This recreates both the files and their `storage.objects` rows, which is why step 2.2 excludes
the `storage` schema. Object ids differ from the source, and that is fine:
`public.attachments.file_path` is plain `text` with no foreign key to `storage.objects`.

### 3.5 Verify

**Row counts** — the restored side, in the same `table|rows` shape the script printed:

```bash
docker exec -i supabase_db_Holigay psql -U postgres -d postgres -At -F'|' <<'SQL' > /tmp/counts-restored.txt
SELECT table_schema || '.' || table_name,
       (xpath('/row/cnt/text()', query_to_xml(
          format('SELECT count(*) AS cnt FROM %I.%I', table_schema, table_name),
          false, true, '')))[1]::text::bigint
FROM information_schema.tables
WHERE table_schema IN ('public', 'auth') AND table_type = 'BASE TABLE'
ORDER BY 1;
SQL
diff <(grep -v '^#' /tmp/counts-source.txt | sort) <(sort /tmp/counts-restored.txt)
```

The only lines that may differ are the tables the script skipped (present in the dump, absent
locally), `auth.schema_migrations` (excluded from the dump; belongs to the local stack) and
`auth.audit_log_entries` (GoTrue appends to it on every sign-in, so any use of the restored
stack grows it). Everything else must match exactly.

**Object paths** — compare the paths, not just the count. A misplaced upload (3.4) keeps the
count right while breaking every link:

```bash
docker exec supabase_db_Holigay psql -U postgres -d postgres -Atc \
  "SELECT name FROM storage.objects ORDER BY name;"
```

Each one must match a `file_path` in `public.attachments`.

**One real download** — the end-to-end proof. Open the app against the local stack
(`npm run dev`), sign in as an organizer, open an application on
`/dashboard/applications/[id]` and download its attachment.

To check the same mechanism without the UI (`supabase status -o env` emits the local keys as
shell assignments):

```bash
eval "$(npx supabase status -o env | grep -E '^(API_URL|SERVICE_ROLE_KEY)=')"
P=<a file_path from public.attachments>
SIGNED=$(curl -s -X POST "$API_URL/storage/v1/object/sign/attachments/$P" \
  -H "apikey: $SERVICE_ROLE_KEY" -H "Authorization: Bearer $SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" -d '{"expiresIn":60}' \
  | sed -E 's/.*"signedURL":"([^"]+)".*/\1/')
curl -s -o /tmp/restored-file -w 'HTTP %{http_code}, %{size_download} bytes\n' \
  "$API_URL/storage/v1$SIGNED"
```

A `200` with a non-zero size means the row, the path and the object all line up.

### 3.6 Relink to dev and clean up

Always finish here. The drill may have left the CLI pointed elsewhere, and the local stack is
now holding a hosted project's `auth.users` rows, which it has no reason to keep:

```bash
npx supabase link --project-ref kcokcufmzyckbodelqpb
npx supabase projects list      # confirm Holigay-Dev shows as LINKED
npx supabase db reset
```

---

## Verified behaviour (CLI 2.65.6, 2026-09-16/17)

Re-check these if the CLI is upgraded; several contradict what `research.md` R7 assumed.

| # | Observed | Why it matters |
|---|---|---|
| 1 | `--data-only` defaults to `--schema '*'` minus internal schemas; `auth`, `storage` and `supabase_functions` are **included** | R7 expected `auth` might be excluded and the `user_profiles → auth.users` FK to break. The opposite is true — `auth` comes for free, and `storage` has to be excluded on purpose (2.2) |
| 2 | Data dumps open with `SET session_replication_role = replica;` and close with `RESET ALL;` | Triggers stay off during restore, so `handle_new_user` does not fire on restored `auth.users` rows |
| 3 | Migration-history tables are excluded by the CLI | The target stack keeps its own history |
| 4 | The schema dump excludes `auth`/`storage`/etc. and rewrites to `IF NOT EXISTS` / `OR REPLACE` | It is `public`-only and re-runnable |
| 5 | `supabase storage` **requires** `--experimental` | R7 read the help text as meaning it did not. It does |
| 6 | `supabase storage --linked` also needs `SUPABASE_DB_PASSWORD` (it initialises a `cli_login_postgres` role); `--local` does not | Export the password before the bucket copy. With it exported the copy works — if a future CLI breaks it, a throwaway `@supabase/supabase-js` script with the service-role key (`storage.from('attachments').list()` + `.download()`) is the fallback |
| 7 | `psql` is not installed on the host | Use `docker exec -i supabase_db_Holigay psql …`. R7's `psql postgresql://…` line does not run |
| 8 | `storage cp -r` nests `basename(src)` under the destination, in both directions | Upload to `ss:///` with a source dir named `attachments` (3.4) |
| 9 | `storage rm -r` prompts unless given `--yes` | Matters in scripts |
| 10 | Restoring a `--schema '*'` data dump fails twice: `buckets_pkey` duplicate, then `permission denied for table buckets_vectors` | The reason 2.2 uses `-s auth,public` |
| 11 | `supabase/seed.sql` is intentionally empty | Nothing seeded collides with a restore |
| 12 | The hosted `auth` schema is **ahead** of CLI 2.65.6's local stack (extra tables; `one_time_tokens.expires_at`) | A hosted dump will not restore into local unmodified — filter it (3.2). On 2026-09-17 five empty objects were skipped and no rows lost |

## Rehearsals

- **2026-09-16, synthetic fixture, local → local.** One `auth.users` row, one event, vendor,
  application, attachment and storage object were dumped, the stack reset, the data restored
  and the bucket re-uploaded. Row counts identical across all 43 tables in `public`, `auth` and
  `storage`; object path matched; signed-URL download byte-identical. The unfiltered
  `--schema '*'` dump was also restored on purpose to confirm it fails *and* rolls back.
- **2026-09-17, real dev project → local (T010).** 25 rows across 12 non-empty tables; the
  dump matched live dev on all 10 `public` tables (service-role REST cross-check). The raw
  restore aborted on the `auth` skew (row 12); after filtering, 31/31 tables matched, the
  signed-URL download of the bucket's one object was byte-identical, and anon was still blocked
  on all four private tables. Evidence rows: `specs/007-production-readiness/quickstart.md`.
