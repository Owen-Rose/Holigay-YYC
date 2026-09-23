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
| T002 Resend domain added; DNS records handed to the DNS owner | Resend | 2026-09-20 | Domain `holigayeventsyyc.ca`, region US East. No hand-off needed: the organizer granted GoDaddy **Delegate Access** ("Products & Domains") to the maintainer's own GoDaddy account on 2026-09-20, so the maintainer added the three records (DKIM `TXT resend._domainkey`, `CNAME rsend`, `CNAME send`) directly. `dig @ns65.domaincontrol.com` showed all three within a minute | ☑ |
| T002 Domain shows **Verified** in Resend | Resend | 2026-09-20 | "DNS verified, domain verified" a minute after **I've already added the records** | ☑ |
| T003 `EMAIL_FROM_ADDRESS` + `RESEND_API_KEY` set | Vercel Preview | 2026-09-20 | One `RESEND_API_KEY` (type Secret) scoped to Production + Preview, holding a fresh key created in Resend → API Keys with **Sending access** limited to `holigayeventsyyc.ca`. The two pre-existing entries (`All Environments` from 2025-12-25 and a `dev`-branch one from 2026-02-07, both flagged **Needs Attention**) were replaced: the first edited in place, the second deleted. `EMAIL_FROM_ADDRESS` (type Config) = `<display name> <noreply@holigayeventsyyc.ca>` | ☑ |
| T003 `EMAIL_FROM_ADDRESS` + `RESEND_API_KEY` set | Vercel Production | 2026-09-20 | Same two entries (each ticked for both environments). Production redeployed from `main` (`66fc1dd`) afterwards so the variables took effect: **Ready** in 1m 2s, so the production env guard accepted them | ☑ |
| T006 Test email from the verified domain received via local `/api/test-email` | local → real mailbox | 2026-09-20 | Route returned `success: true` with a Resend message id and `fromAddress: "Holigay Events YYC <noreply@holigayeventsyyc.ca>"`. Gmail showed it in **Inbox**, From line `Holigay Events YYC <noreply@holigayeventsyyc.ca>`, no "via" or unverified-sender marker. First attempt failed with `API key is invalid` because the key had been pasted into `.env.local` with the variable name duplicated; corrected and re-run | ☑ |

### Uptime and backups (US2)

| Task | Project / env | Date | Evidence | Status |
|---|---|---|---|---|
| T008a Interim GitHub Actions keep-alive added; four repo secrets set | GitHub | 2026-09-16 | `.github/workflows/keepalive.yml` on **`main`** (PR [#14](https://github.com/Owen-Rose/Holigay-YYC/pull/14)); `KEEPALIVE_DEV_URL`, `KEEPALIVE_DEV_ANON_KEY`, `KEEPALIVE_PROD_URL`, `KEEPALIVE_PROD_ANON_KEY`; both pairs probed 200 before storing | ☑ |
| T008a First green run (`workflow_dispatch`, then a scheduled one) | GitHub Actions log | 2026-09-17 | Dispatch [35187768073](https://github.com/Owen-Rose/Holigay-YYC/actions/runs/35187768073) 05:57Z and first scheduled run 15:58Z, both `success`; dev `[]`, prod one row | ☑ |
| T008 `CRON_SECRET` + `KEEPALIVE_SUPABASE_TARGETS` (dev **and** prod pairs) set | Vercel Production | | | ☐ |
| T008 First cron run green | Vercel Cron log | | Run timestamp; response `ok: true` | ☐ |
| T008 Dev project still active seven days after the first run (T008a's run counts while the Vercel cron waits on T020) | Supabase dev | | Dashboard status; preview `/apply` loads | ☐ |
| T010 Backup taken from dev (schema + data + bucket) | Supabase dev → local files | 2026-09-17 | `backup/dev/2026-09-18/`: schema (`public`), data (`auth` + `public`, 25 rows), bucket 1 object (`__probe-011/x.txt`, a spec 006 leftover — dev has no real attachments). Dump matched live dev on all 10 public tables | ☑ |
| T010 Restore drill into the local stack | local | 2026-09-17 | 31/31 tables matched; signed-URL download 200, byte-identical; anon still blocked on the four private tables. Hosted `auth` is ahead of local — 5 empty objects filtered, no rows lost (runbook 3.3) | ☑ |
| T010 CLI relinked to dev after the drill | CLI | 2026-09-17 | `supabase projects list` shows Holigay-Dev LINKED (the drill used `--local`; the link never moved) | ☑ |

### Smoke and prod residuals (US3, spec 006 carry-overs)

| Task | Project / env | Date | Evidence | Status |
|---|---|---|---|---|
| T012 Prod probe checklist run by hand (curl block below) | Supabase prod, anon key | 2026-09-18 | `vendors`, `applications`, `attachments`, `application_answers` → `[]`; `events?status=eq.active` → one row (*Winter Holigay Market 2025*, dated 2025-02-15, deadline 2026-02-01 — stale, no questionnaire row, legacy form); anon `INSERT` into `vendors` → HTTP 401 `42501`; `create_event_with_default_questionnaire` and `ensure_event_questionnaire` → `42501`. Migration 011 confirmed live on prod. **Prod wiped 2026-09-19**: 1 event, 3 vendors (*Test*, *user123*, *Owen*), 3 applications, 3 attachments deleted in one atomic batch through the Management API `database/query` endpoint from the maintainer's session, each call approved by hand; 3 five-byte test files removed from the `attachments` bucket in the dashboard, leaving only the zero-byte `.emptyFolderPlaceholder`; every `public` table now 0, `auth.users` holds only the admin. No backup by decision — prod was never live | ☑ |
| T012 Storage → Policies visual check: exactly the three `attachments_*` policies, nothing dashboard-named | Supabase prod dashboard | 2026-09-18 | `attachments_anon_insert` (INSERT, anon + authenticated), `attachments_authenticated_delete` (DELETE, authenticated), `attachments_authenticated_select` (SELECT, authenticated) — exactly three, names match migration 011, nothing dashboard-named. Prod project confirmed by the maintainer; screenshot kept outside the repo | ☑ |
| T021 `npm run smoke` passes against prod | terminal → prod | | Exit code 0; per-check output | ☐ |
| T021 One live submission per form variant on a test event; emails from the verified domain; dashboard review; signed-URL download; test rows cleaned up | prod | | Which variants; which three emails arrived | ☐ |
| T021 The four "Still owed on prod" boxes in `specs/006-close-public-data-exposure/quickstart.md` ticked | repo | | Commit | ☐ |

### Accounts (US5)

| Task | Project / env | Date | Evidence | Status |
|---|---|---|---|---|
| T013a Built-in auth mailer restriction wording recorded | Supabase dev | 2026-09-19 | Authentication → Emails, amber banner, verbatim: **"Set up custom SMTP — You're using the built-in email service. This service has rate limits and is not meant to be used for production apps."** Identical wording on prod | ☑ |
| T013a Site URL + redirect URLs set; "Confirm email" state recorded | Supabase dev | 2026-09-19 | Site URL = the `dev`-branch Vercel preview origin; Redirect URLs = that origin `/**` plus the `uat-` branch alias `/**` (list was empty before; Total URLs: 2). **"Confirm email" = OFF** — left unchanged per R8 | ☑ |
| T013a Same | Supabase prod | 2026-09-19 | Site URL = the production origin; Redirect URLs = that origin `/**` plus the `main`-branch alias `/**`. **"Confirm email" = ON** — left unchanged per R8. No custom domain existed yet at the time, so the production origin was the Vercel-assigned host. **Re-pointed 2026-09-20**: Site URL = `https://vendors.holigayeventsyyc.ca`, Redirect URLs = the two earlier entries plus `https://vendors.holigayeventsyyc.ca/**` (Total URLs: 3) — see "Custom domain" below | ☑ |
| T013b Custom SMTP via Resend configured | Supabase dev | 2026-09-23 | Same settings as prod (`smtp.resend.com`:465, user `resend`, the T003 key, sender `noreply@holigayeventsyyc.ca` / "Holigay Events YYC"). Dev has "Confirm email" OFF and the app has no forgot-password page, so the test used the dashboard's **Add user → Send invitation** to a throwaway `+devinvite` address — the same mail an organizer-invite feature would send. **First attempt exposed a broken Site URL**: the link's `redirect_to` was `https://holigay-yyc-git-dev-….vercel.apphttp://localhost:3000`, two origins pasted into one field (present since T013a; not caught then because no mail was ever sent). Fixed to the `dev`-branch preview origin alone; second invite arrived in **Inbox** from the branded sender (the first, bad one had gone to spam) and its link landed on the preview. Throwaway user deleted | ☑ |
| T013b Same | Supabase prod | 2026-09-20 | Authentication → Emails → SMTP Settings: Custom SMTP enabled, host `smtp.resend.com`, port 465, user `resend`, password = the T003 key, sender `noreply@holigayeventsyyc.ca` / "Holigay Events YYC". Signed up a throwaway `+smtp` vendor on `https://vendors.holigayeventsyyc.ca/signup`: confirmation mail arrived in Inbox from the branded address; its link landed on `http://vendors.holigayeventsyyc.ca/?code=…` (Vercel 308s to https); signing in afterwards reached `/vendor-dashboard`. Throwaway user deleted from Authentication → Users | ☑ |
| T014 Organizer accounts created (dashboard Add user, auto-confirm) + role set via `scripts/seed-role.sql`; each signs in and lands on `/dashboard` | Supabase dev | 2026-09-19 | **Partial — maintainer's organizer access only; the real organizer accounts do not exist yet.** No account needed: dev already held 2 users, the maintainer's `admin` and a pre-existing `organizer@test.com` whose `user_profiles.role` was already `organizer` (confirmed). Signed in on the `dev` preview → landed on `/dashboard`. Enough for T017, which needs one organizer who can sign in | ☐ |
| T015 Same | Supabase prod | 2026-09-19 | **Partial — same scope as T014.** Prod held only the maintainer's `admin`. Created one organizer via Add user with **Auto Confirm User** ticked (required here — prod has "Confirm email" ON and no working mailer until T013b), then `UPDATE user_profiles … RETURNING id, role` returned one row showing `organizer`. Signed in on the production deployment → landed on `/dashboard`, UI showed the organizer role. The address is a placeholder on a domain the maintainer does not control, so **it can never receive mail** — a password reset would have to go through the dashboard, and it should be replaced when the real organizers are added | ☐ |

**Recorded while running T013a — two consequences of the settings above, neither changed:**

- **Vendor sign-up on prod cannot complete today** (resolved 2026-09-20 by T013b on prod — see its row). "Confirm email" is ON there and the only
  sender is the built-in service, which is rate-limited and delivers to project team members
  only — a real vendor's confirmation mail never arrives. This is exactly what T013b fixes, so
  it is a sequencing fact rather than a defect, and it does **not** touch `/apply`: public
  submissions go through `submit_public_application` and need no account. It does mean US5
  scenario 4 stays unprovable until T013b lands.
- **Nothing exchanges the confirmation link's code** (and, seen 2026-09-23 on dev, nothing consumes the `#access_token=…` hash that a dashboard **invite** link returns either — the invitee lands on the public landing page signed out, with no way to set a password. Any organizer-invite feature must ship an auth callback route plus a set-password page first). `@supabase/ssr` defaults to PKCE and the
  app has no auth callback route, so a confirmation link returns `?code=…` to the Site URL and
  the address is confirmed but the visitor is left signed out. `src/app/(auth)/signup/page.tsx`
  already tells them to sign in afterwards, so the flow completes — it is a rough edge, logged
  for T017 at severity **backlog**, not a blocker. On dev it never triggers at all, since
  "Confirm email" is OFF and `signUp` returns a session directly.

### Custom domain (2026-09-20)

Not a task in `tasks.md` — it was the prerequisite for the Phase 8 email tasks and landed the
same afternoon. Recorded here because the ordering rule in `contracts/env-contract.md` and the
T013a rows above both assumed it did not exist.

| Item | Where | Evidence |
|---|---|---|
| Domain | GoDaddy, owned by an organizer | `holigayeventsyyc.ca`. Before today it resolved to GoDaddy's "coming soon" parking IPs with no MX; `www` was a CNAME to the root. Nothing was preserved because nothing was in use |
| Access | GoDaddy Delegate Access | Granted to the maintainer's own GoDaddy account ("Products & Domains"). No credentials or ownership changed hands |
| App hostname | Vercel → Domains | `vendors.holigayeventsyyc.ca` on the **Production** environment. The root is deliberately left free for the organizer's brand site (currently the Carrd page). GoDaddy record: `CNAME vendors → 2dca14a070d5bcca.vercel-dns-017.com` (Vercel's per-project target; `cname.vercel-dns.com` also works). Valid Configuration + certificate within two minutes; `curl -L` returned 200 over https |
| Old hosts | Vercel | `holigay-yyc.vercel.app` (Production) and `uat-holigay-yyc.vercel.app` (`dev` previews) still exist and still serve. Nothing in `src/` references either |
| Not done | Supabase custom domain | Deliberately skipped: paid add-on, only rebrands the API URL |
| Not done | DMARC | GoDaddy's default `_dmarc` record (`p=quarantine`) was already present and left alone |
| Note | DNS ownership | The `send` / `rsend` CNAMEs and `resend._domainkey` TXT belong to Resend; the `vendors` CNAME belongs to Vercel. Anyone re-doing the root later must leave those four records in place |

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
  deleted at T008. It lives on `main`, not `dev`: GitHub fires schedules only for workflow
  files on the default branch, so a copy on `dev` would never run. `main` was merged back
  into `dev` afterwards, so T020's fast-forward is unaffected.

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

`npm run smoke` (T011) performs every check in this block except the anon `INSERT`
attempt: the script is read-only by construction (R6), and if that policy had regressed the
attempt itself would write a junk vendor row into prod. Run this block when the write
posture specifically is in question; the script covers the rest.

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
