# Quickstart: Close the Public Data Exposure

**Feature**: 006-close-public-data-exposure

## Local development loop

```bash
# 1. Start the local stack (applies all migrations incl. 011 on boot;
#    the migration itself creates the attachments bucket + policies)
npx supabase start

# 2. Reset after editing the migration
npx supabase db reset

# 3. Regenerate types from the local schema (new script)
npm run db:types:local

# 4. Run everything (unit + security; security self-skips if the stack is down)
npm test

# 5. Run just the security suite
npm run test:security

# 6. The usual gates before a PR
npm run lint && npm test && npm run build
```

To confirm the local skip behavior (US4-AC4): `npx supabase stop`, then
`npm test` — the unit project runs, the security project reports skipped, exit
code 0.

## Manual exposure probe (local or hosted)

```bash
URL=http://127.0.0.1:54321        # or the hosted project URL
KEY=<anon key>

# Private tables → must all return []
curl -s "$URL/rest/v1/vendors?select=*"              -H "apikey: $KEY" -H "Authorization: Bearer $KEY"
curl -s "$URL/rest/v1/applications?select=*"         -H "apikey: $KEY" -H "Authorization: Bearer $KEY"
curl -s "$URL/rest/v1/attachments?select=*"          -H "apikey: $KEY" -H "Authorization: Bearer $KEY"
curl -s "$URL/rest/v1/application_answers?select=*"  -H "apikey: $KEY" -H "Authorization: Bearer $KEY"

# Public reads → must return rows
curl -s "$URL/rest/v1/events?status=eq.active&select=*" -H "apikey: $KEY" -H "Authorization: Bearer $KEY"
curl -s "$URL/rest/v1/event_questions?select=*"         -H "apikey: $KEY" -H "Authorization: Bearer $KEY"

# Anon writes → must fail / affect 0 rows
curl -s -X POST "$URL/rest/v1/vendors" -H "apikey: $KEY" -H "Authorization: Bearer $KEY" \
  -H "Content-Type: application/json" -d '{"business_name":"x","contact_name":"x","email":"probe@x.com"}'

# Privileged RPCs → must be denied for anon
curl -s -X POST "$URL/rest/v1/rpc/create_event_with_default_questionnaire" \
  -H "apikey: $KEY" -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" -d '{"p_event":{}}'

# Storage: anon download of a known path → denied
curl -s "$URL/storage/v1/object/attachments/<known-path>" -H "apikey: $KEY" -H "Authorization: Bearer $KEY"
```

## CI

Two parallel jobs in `.github/workflows/ci.yml`:

- `lint-test-build` (unchanged): format → lint → test (unit; security skips —
  no stack) → build.
- `security-tests` (new): `supabase/setup-cli@v1` (pinned 2.65.6) →
  `supabase start -x <heavy services>` → `npm run test:security` with
  `CI_REQUIRE_SECURITY_TESTS=1` (a down stack fails the job instead of
  skipping). No secrets required — the harness falls back to the CLI's
  deterministic local demo keys. Budget: under 5 minutes (SC-004).

## Rollout (dev first, then prod)

> **Status: dev ✅ done 2026-08-22 · prod ⬜ outstanding.**
>
> Lessons from the dev rollout, which apply to prod:
> 1. **Both Supabase projects were auto-paused** (free-tier idle). Restore the project
>    from the dashboard first; until then the CLI fails with a connection timeout while
>    "Initialising login role".
> 2. **The pinned CLI (2.65.6) can't create its `cli_login_postgres` role** on the current
>    hosted platform — `permission denied to alter role`. Set `SUPABASE_DB_PASSWORD` to
>    connect directly. Use `read -s SUPABASE_DB_PASSWORD; export SUPABASE_DB_PASSWORD` so
>    the password never reaches shell history.
> 3. **`supabase_migrations.schema_migrations` was empty on dev**, so `db push` offered to
>    apply all eleven migrations. Do **not** accept. Verify what the database actually has,
>    then `supabase migration repair --status applied <versions>` to record the already-applied
>    ones — it writes history rows without executing SQL — and push only what's genuinely
>    missing. Pass versions on ONE line: a wrapped paste drops the arguments and the CLI
>    silently falls back to repairing *every* migration, including ones not yet applied.
> 4. Dev turned out to already have `009`/`010`; only `011` was missing. **Check prod's real
>    state the same way rather than trusting the "through 008" note below.**

Prod has migrations through 008; `009`, `010`, and `011` land together, in
order. Old app code + new policies = broken submissions, so apply migrations
and deploy the app back-to-back (barely-used app; no window needed).

1. **Dev project** (`kcokcufmzyckbodelqpb`):
   - `npx supabase link` → `npx supabase db push`.
   - **Watch the storage section apply** — this was R8's flagged risk. It is
     proven locally (research.md R19: `supautils.policy_grants` lets `postgres`
     manage `storage.objects` policies despite not owning the table), and
     hosted ships the same supautils config, but confirm rather than assume:
     check the three `attachments_*` policies actually exist after the push.
     If they are absent, use the documented fallback (dashboard policies +
     migration comment + time-boxed exception).
   - `npm run db:types:dev` → the diff vs the committed `database.ts` must contain
     **only** two cosmetic differences: the hosted generator's `__InternalSupabase`
     / `PostgrestVersion` block and a trailing-newline change. The committed file is
     generated by `db:types:local` (`--schema public`), which omits that block, so an
     *empty* diff is not achievable — what proves dev matches the migration set is
     that `submit_public_application` is present and nothing else differs.
   - Deploy the app build to the dev environment.
   - Click through: legacy form and dynamic form × (new vendor, returning
     vendor with changed phone, duplicate submission); confirm emails;
     dashboard list/detail; attachment download via signed URL.
   - Run the manual probe checklist above against the dev URL.
2. **Prod** (`hgmfjvjlxrhdojwlkgap`):
   - `npx supabase link` to prod → `npx supabase db push` → deploy app
     immediately after.
   - Run the full manual probe checklist against prod (SC-001).
   - One real submission per form variant against a test event; confirm email
     + dashboard + signed-URL download; clean up test rows.
   - Dashboard → Storage → Policies: confirm exactly the three
     migration-named policies exist (`attachments_anon_insert`,
     `attachments_authenticated_select`, `attachments_authenticated_delete`)
     and the old dashboard-named ones are gone.

## Where things live

| Thing | Path |
|---|---|
| Migration | `supabase/migrations/011_close_public_data_exposure.sql` |
| RPC contract | `specs/006-close-public-data-exposure/contracts/submit-public-application.md` |
| Test matrix | `specs/006-close-public-data-exposure/contracts/security-test-matrix.md` |
| Security suite | `src/test/security/` (`harness.ts` + 5 suites) |
| Error mapper | `src/lib/submission/errors.ts` |
| Emptiness helper | `src/lib/questionnaire/answer-coercion.ts` (`isAnswerEmpty`) |
| Refactored actions | `src/lib/actions/applications.ts`, `src/lib/actions/answers.ts` |
| Deleted | `deleteFile` in `src/lib/actions/upload.ts`; `src/app/test-upload/` |
