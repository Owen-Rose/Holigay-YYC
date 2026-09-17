# Quickstart: Production Readiness (Milestone M3)

**Feature**: 007-production-readiness

This file is the **ops record** for M3. Every `[manual]` task in `tasks.md` is ticked
only when its evidence row below is filled in — the same discipline as spec 006's "Prod
rollout record" and spec 005's migration log. Reasoning lives in `docs/M3-PLAN.md`;
contracts in `contracts/`.

## Local development loop

```bash
# Start the local stack (all migrations through 012 apply on boot)
npx supabase start
# If auth health returns 502 after a reset:
docker restart supabase_kong_Holigay

# The constitution's gate before every PR
npm run lint && npm test && npm run build

# Smoke check against the local stack (after T011 lands)
SMOKE_APP_URL=http://localhost:3000 \
SMOKE_SUPABASE_URL=http://127.0.0.1:54321 \
SMOKE_SUPABASE_ANON_KEY=<local anon key from `npx supabase status`> \
npm run smoke

# Keep-alive route by hand (after T007 lands; values in the shell only)
CRON_SECRET=devsecret-devsecret KEEPALIVE_SUPABASE_TARGETS="http://127.0.0.1:54321|<anon>" npm run dev
curl -s -H "Authorization: Bearer devsecret-devsecret" http://localhost:3000/api/keepalive
```

Local `next build` has `VERCEL_ENV` unset, so the strict production env checks do not
apply — `contracts/env-contract.md` explains the rule.

## Evidence record

Fill the rows as the manual tasks complete. "Evidence" means what was actually observed:
the dashboard state, the log line, the command output, or the name of a screenshot kept
outside the repo. Dates are ISO. Nothing sensitive goes in this file — no keys, no
passwords, no vendor PII.

### Email (US1)

| Task | Project / env | Date | Evidence | Status |
|---|---|---|---|---|
| T002 Resend domain added; DNS records handed to the DNS owner | Resend | | Domain name; date records were sent | ☐ |
| T002 Domain shows **Verified** in Resend | Resend | | | ☐ |
| T003 `EMAIL_FROM_ADDRESS` + `RESEND_API_KEY` set | Vercel Preview | | | ☐ |
| T003 `EMAIL_FROM_ADDRESS` + `RESEND_API_KEY` set | Vercel Production | | | ☐ |
| T006 Test email from the verified domain received via local `/api/test-email` | local → real mailbox | | From-name shown by the mail client; not in spam | ☐ |

### Uptime and backups (US2)

| Task | Project / env | Date | Evidence | Status |
|---|---|---|---|---|
| T008a Interim GitHub Actions keep-alive added; four repo secrets set | GitHub | | Workflow file; secret names (no values) | ☐ |
| T008a First green run (`workflow_dispatch`, then a scheduled one) | GitHub Actions log | | Run timestamps; both targets 2xx | ☐ |
| T008 `CRON_SECRET` + `KEEPALIVE_SUPABASE_TARGETS` (dev **and** prod pairs) set | Vercel Production | | | ☐ |
| T008 First cron run green | Vercel Cron log | | Run timestamp; response `ok: true` | ☐ |
| T008 Dev project still active seven days after the first run (T008a's run counts while the Vercel cron waits on T020) | Supabase dev | | Dashboard status; preview `/apply` loads | ☐ |
| T010 Backup taken from dev (schema + data + bucket) | Supabase dev → local files | | Schemas included in the dump; file counts | ☐ |
| T010 Restore drill into the local stack | local | | Row counts per table (source vs restored); one signed-URL download OK | ☐ |
| T010 CLI relinked to dev after the drill | CLI | | `supabase projects list` shows dev linked | ☐ |

### Smoke and prod residuals (US3, spec 006 carry-overs)

| Task | Project / env | Date | Evidence | Status |
|---|---|---|---|---|
| T012 Prod probe checklist run by hand (curl block below) | Supabase prod, anon key | | Four private tables → `[]`; public reads → rows; RPCs denied | ☐ |
| T012 Storage → Policies visual check: exactly the three `attachments_*` policies, nothing dashboard-named | Supabase prod dashboard | | Policy names as displayed | ☐ |
| T021 `npm run smoke` passes against prod | terminal → prod | | Exit code 0; per-check output | ☐ |
| T021 One live submission per form variant on a test event; emails from the verified domain; dashboard review; signed-URL download; test rows cleaned up | prod | | Which variants; which three emails arrived | ☐ |
| T021 The four "Still owed on prod" boxes in `specs/006-close-public-data-exposure/quickstart.md` ticked | repo | | Commit | ☐ |

### Accounts (US5)

| Task | Project / env | Date | Evidence | Status |
|---|---|---|---|---|
| T013a Built-in auth mailer restriction wording recorded | Supabase dev | | Exact dashboard wording | ☐ |
| T013a Site URL + redirect URLs set; "Confirm email" state recorded | Supabase dev | | URLs entered; confirm-email on/off | ☐ |
| T013a Same | Supabase prod | | | ☐ |
| T013b Custom SMTP via Resend configured | Supabase dev | | Sender address; test sign-up mail from the verified domain | ☐ |
| T013b Same | Supabase prod | | | ☐ |
| T014 Organizer accounts created (dashboard Add user, auto-confirm) + role set via `scripts/seed-role.sql`; each signs in and lands on `/dashboard` | Supabase dev | | Number of accounts; sign-in observed | ☐ |
| T015 Same | Supabase prod | | | ☐ |

### Close-out

| Task | Project / env | Date | Evidence | Status |
|---|---|---|---|---|
| T019 Database password rotated | Supabase dev | | | ☐ |
| T019 Database password rotated | Supabase prod | | | ☐ |
| T019 Local password files confirmed absent; CLI relinked to dev | local | | | ☐ |
| T020 `dev` promoted to `main` | GitHub / Vercel | | Merge commit; Vercel Production build green | ☐ |
| T022 Roadmap M3 checkboxes, `specs/README.md`, `CLAUDE.md` phase note updated | repo | | Commit | ☐ |

## Solo rehearsal (US4)

- Script and findings template: written by T016 at
  `specs/007-production-readiness/rehearsal/<date>-solo-lifecycle.md` (shape in
  `research.md` R10). T017 fills the observed column and the findings table and commits it.
- Environment: the `dev` branch Vercel preview, dev Supabase, keep-alive live, organizer
  account from T014, the maintainer's own mailbox as the vendor email.
- Pass criteria (spec US4 / SC-005): all eleven steps' expected results observed; the
  three emails delivered (from the verified domain, or "passed on fallback sender" — see
  below); no browser console errors on the pages used; no step needed an intervention
  outside the script. Every deviation is a finding with a severity: **blocker** (fix
  before M4), **Tier 3** (fix in M3 if a single-session PR), **backlog** (roadmap
  scope-line table).
- Pre-triaged expected findings: CSV export lacks questionnaire answers; unsaved
  organizer notes are not in the status email; closed events cannot be reopened.
- Cleanup: dev is throwaway. Leave the rows or clear them with the SQL in
  `docs/runbooks/event-week-smoke.md` (the UI refuses to delete an event that has
  applications).

## While there is no Resend or DNS access (the operating plan from 2026-09-16)

The task list was re-sequenced so the four tasks that need the mail provider — T002, T003,
T013b, T006 — sit in Phase 8, after everything else. They gate only the email-specific
proofs: the two email steps of T017, T021's email check, and the promotion itself (T020),
because the env guard fails a Production build without the sender variables. Eighteen of
the twenty-four tasks, the M3 gate included, proceed without them. Three adjustments:

- **The env guard keys on `VERCEL_ENV === 'production'`, not `NODE_ENV`.** Preview builds
  pass without `EMAIL_FROM_ADDRESS`; only a Production deploy fails without it. T004 merges
  with no Vercel prerequisite.
- **The rehearsal runs on the fallback sender.** `onboarding@resend.dev` delivers only to
  the Resend account owner's address, so using the maintainer's own mailbox as the vendor
  email keeps steps 3 and 7 observable. Record them as "passed on fallback sender" and
  re-run those two steps after verification. Organizer accounts use dashboard Add User
  with auto-confirm, so they need no SMTP, and T013a sets the redirect URLs without it.
- **The Vercel cron stays dormant until the promotion**, since Vercel runs crons only on
  Production deploys. T008a (a GitHub Actions schedule hitting both projects' REST
  endpoints with anon keys in repo secrets) keeps them awake in the meantime and is
  deleted at T008.

## Prod probe checklist (T012; copied from spec 006 so this file is self-contained)

```bash
URL=https://hgmfjvjlxrhdojwlkgap.supabase.co
KEY=<prod anon key>            # anon only — never the service role

# Private tables → must all return []
for t in vendors applications attachments application_answers; do
  curl -s "$URL/rest/v1/$t?select=*" -H "apikey: $KEY" -H "Authorization: Bearer $KEY"; echo
done

# Public reads → must return rows
curl -s "$URL/rest/v1/events?status=eq.active&select=id,name" -H "apikey: $KEY" -H "Authorization: Bearer $KEY"

# Anon write → must fail
curl -s -X POST "$URL/rest/v1/vendors" -H "apikey: $KEY" -H "Authorization: Bearer $KEY" \
  -H "Content-Type: application/json" -d '{"business_name":"x","contact_name":"x","email":"probe@x.com"}'

# Organizer-only RPCs → must be denied (42501)
curl -s -X POST "$URL/rest/v1/rpc/create_event_with_default_questionnaire" \
  -H "apikey: $KEY" -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" -d '{"p_event":{}}'
```

After T011 lands, `npm run smoke` performs the same checks and this block is only the
fallback.

## Vercel Preview scoping (found by T004, 2026-09-16)

`NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` were scoped to
**Preview (dev branch only)**, so PR-branch previews had no Supabase credentials. That
went unnoticed because the old `process.env.X!` reads sat inside `createClient()` and were
never evaluated at build time — the previews deployed green and were broken at runtime.
T004's import-time validation turned it into a build failure on PR #10, which is how it
surfaced.

Fixed the same day: both variables added to Preview with **no branch filter** (dev project
values, matching `.env.local`); the older `Preview (dev)` rows were left in place and
Production was untouched. `RESEND_API_KEY` already had an all-branches entry, which is why
only the Supabase pair broke.

| Item | Evidence |
|---|---|
| Vars added to Preview, all branches | 2026-09-16, `vercel env add` ×2; confirmed by `vercel env ls` showing `Preview` with no branch filter |
| PR #10 preview rebuilt green | redeploy after the change |

## Where things live

| Thing | Path |
|---|---|
| Reasoning record (decisions, tracks, session plan) | `docs/M3-PLAN.md` |
| Env contract | `specs/007-production-readiness/contracts/env-contract.md` |
| Keep-alive contract | `specs/007-production-readiness/contracts/keepalive-route.md` |
| Env modules (T004) | `src/lib/env-public.ts`, `src/lib/env.ts` |
| Keep-alive route + schedule (T007) | `src/app/api/keepalive/route.ts`, `vercel.json` |
| Smoke check + runbook (T011) | `scripts/smoke-check.mjs`, `docs/runbooks/event-week-smoke.md` |
| Backup/restore runbook (T009) | `docs/runbooks/backup-restore.md` |
| Role seed script (T011) | `scripts/seed-role.sql` |
| Rehearsal script + findings (T016/T017) | `specs/007-production-readiness/rehearsal/` |
| Spec 006 residuals being closed | `specs/006-close-public-data-exposure/quickstart.md` "Still owed on prod" |
