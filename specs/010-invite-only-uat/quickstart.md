# Quickstart: Invite-Only UAT Environment

**Feature**: 010-invite-only-uat

This file is the **ops and evidence record** for spec 010. Every `[manual]` task in
`tasks.md` is ticked only when its evidence row below is filled in (spec 009's pattern,
FR-017). Reasoning lives in `research.md`; exact strings and code shapes in `contracts/`.

## Local development loop

```bash
# Full local stack; its sign-up toggle stays ON (config.toml) — tests never flip it (research R12)
npx supabase start
# If auth health returns 502 after a reset:
docker restart supabase_kong_Holigay

# Open mode (the default): /signup renders, the Login page shows "Sign up"
npm run dev

# Invite-only mode against the local stack — the app hides and refuses sign-up while the
# local auth server would still accept a direct call (design S6). Shell only, not .env.local:
NEXT_PUBLIC_INVITE_ONLY=true SUPABASE_SERVICE_ROLE_KEY=<local service_role key> npm run dev
# Then: /signup → the 404 page; /login has no "Sign up"; sign in as a local admin
# (scripts/seed-role.sql) → /dashboard/team → pick Vendor → Send Invite → mailpit
# (http://127.0.0.1:54324) → link → /set-password → /vendor-dashboard.

# The constitution's gate before every PR (security suite self-skips if the stack is down)
npm run lint && npm test && npm run build
npm run test:security          # invite-flow.test.ts: vendor invite + trigger link (FR-012)
```

`NEXT_PUBLIC_*` values are inlined at build, so a changed flag needs a restart of `next dev`
or a fresh `next build` (research R10).

## Setting names (research R9)

Dev project ref `kcokcufmzyckbodelqpb`. Read or change through the Management API
(`GET`/`PATCH https://api.supabase.com/v1/projects/<ref>/config/auth`, CLI login token, the
spec 009 D3 method — needs a default-mode session) or in the dashboard.

| Dashboard (Authentication →) | API field | Note |
|---|---|---|
| Sign In / Providers → "Allow new users to sign up" | `disable_signup` | **`true` = sign-up OFF** |
| URL Configuration → Site URL | `site_url` | |
| URL Configuration → Redirect URLs | `uri_allow_list` | comma-separated |
| Sign In / Providers → Email → "Confirm email" | `mailer_autoconfirm` | **`true` = confirmations OFF** |

Enforcement probe (FR-013, row D1) — an anonymous sign-up straight at the auth service:

```bash
curl -s -o /dev/stderr -w '\nHTTP %{http_code}\n' -X POST "$SUPABASE_URL/auth/v1/signup" \
  -H "apikey: $SUPABASE_ANON_KEY" -H "Content-Type: application/json" \
  -d '{"email":"probe+010@example.com","password":"probe-pass-010"}'
# sign-up OFF → HTTP 422 {"code":422,"error_code":"signup_disabled","msg":"Signups not allowed for this instance"}
# sign-up ON  → HTTP 200 and a user object: delete probe+010@example.com and fix the setting
```

## Evidence record

"Evidence" is what was actually observed: the read-back value, the HTTP status, the toast
text, the mail's link host. Dates are ISO. Nothing sensitive: no keys, no passwords, no real
vendor addresses; use `<maintainer>+010-…` throwaways and delete them afterwards (row D8).

Task IDs are filled in by `/speckit-tasks`; the rows are fixed now so `tasks.md` can cite them.

### Dev project and the training deployment

Rows D1–D3 are done **before** the code reaches the training deployment (FR-017); D1 and D2
need no code and are reversible.

| Row | Item | Where | Date | Evidence | Done |
|---|---|---|---|---|---|
| D1 | Dev "Allow new users to sign up" → **off** (`disable_signup: true`) — FR-013 | Supabase dev | 2026-09-27 | Was `false`; PATCHed through the Management API; read back `disable_signup: true`. Probe against `kcokcufmzyckbodelqpb` with the anon key → `HTTP 422` `{"error_code":"signup_disabled","msg":"Signups not allowed for this instance"}` — no account created (T002) | ☑ |
| D2 | Dev Site URL → `https://uat-holigay-yyc.vercel.app`; Redirect URLs keep `https://holigay-yyc-git-dev-owen-roses-projects.vercel.app` **and** the `uat-` origin — FR-014 | Supabase dev → URL Configuration | 2026-09-27 | `site_url` was the git-`dev` origin; PATCHed through the Management API; read back `https://uat-holigay-yyc.vercel.app`. `uri_allow_list` unchanged, read back `https://holigay-yyc-git-dev-owen-roses-projects.vercel.app/**,https://uat-holigay-yyc.vercel.app/**` (T003) | ☑ |
| D3 | `NEXT_PUBLIC_INVITE_ONLY=true`, **Preview** scope, all branches — FR-015 | Vercel → Settings → Environment Variables | 2026-09-27 | Added as a Config variable, value `true`, environment **Preview** only (no branch filter; Production and Development unticked); listed as `NEXT_PUBLIC_INVITE_ONLY · Preview`. PR #39 preview (`holigay-yyc-git-010-t005-invite-only-mode-…`): first build served the not-found page with **200** — fixed with `{ status: 404 }`; after that, `/signup` navigation status 404 with "Page not found", `/signup/x` 404, `/login` without "Sign up", `/apply` 200 (T004) | ☑ |
| D4 | **Story 1 on the `uat-` host** after the US1 merge and redeploy: `/` loads; `/apply` submits with a file; `/login` has no "Sign up" but has "Forgot password?"; `/signup` is the standard 404; probe → `422`; no new row in Authentication → Users | training deployment, signed out | 2026-09-27 | After #39 reached `dev` (uat host redeployed), signed out in Chrome: `/` 200; `/apply` → UAT Market 2026, submitted with a PNG as `owenconnorrose+010-t006@…` → "Application Submitted!" (id `5db204bb…`, 3 answers stored); `/login` shows "Forgot password?" and no "Sign up"; `/signup` navigation status 404 "Page not found", `/signup/x` 404; probe → `HTTP 422 signup_disabled`; dev `auth.users` created in the last 3 h: **0** (T006) | ☑ |
| D5 | **Story 2 walkthrough**: submit `/apply` with `<maintainer>+010-v@…` (lower-case) → as admin, Team page → Vendor → Send Invite → toast "Invitation sent to …"; Team page list unchanged (organizers/admins only — research R6); Admin page lists the address as Vendor → mail from `noreply@holigayeventsyyc.ca`, link host `uat-holigay-yyc.vercel.app` → `/set-password` signed in → `/vendor-dashboard` lists the application → re-submit the address with Organizer selected while pending (before clicking) → "Invitation re-sent", role still Vendor on the Admin page | training deployment + mailbox | | | ☐ |
| D6 | **Story 3 walkthrough**: invite `<maintainer>+010-o@…` as Organizer → mail link host is `uat-holigay-yyc.vercel.app` → `/set-password` → `/dashboard` on the same host; Team page shows Organizer, no Pending | training deployment + mailbox | | | ☐ |
| D7 | Password reset link host: `/forgot-password` for `+010-o` → mail link host `uat-…`; open one link on the git-`dev` origin instead → still works (US3 scenarios 2–3) | training deployment + mailbox | | | ☐ |
| D8 | Throwaways deleted: `+010-v`, `+010-o` auth users (profiles cascade), the `+010-v` vendor row and its application and any bucket object; the `probe+010` address never had an account | Supabase dev | | | ☐ |

### Production (nothing changes; read-backs and one non-regression run)

Also the **production-only checklist** for UAT-findings items 2, 3 and 9, which can no longer
be tested on the training deployment (spec D7 / FR-018).

| Row | Item | Where | Date | Evidence | Done |
|---|---|---|---|---|---|
| P1 | Prod "Allow new users to sign up" confirmed **on** (`disable_signup: false`); "Confirm email" read and recorded (`mailer_autoconfirm`) — FR-016; closes UAT-findings item 2's unchecked prod note | Supabase prod | | `disable_signup` = … ; `mailer_autoconfirm` = … | ☐ |
| P2 | `NEXT_PUBLIC_INVITE_ONLY` **absent** from Production scope; after the next `dev → main`, production `/login` shows "Sign up" and `/signup` renders — FR-015, US4 scenario 1 | Vercel + production | | | ☐ |
| P3 | **Story 4 on production**: sign up `<maintainer>+010-p@…` → confirmation mail arrives → link lands signed in on `/vendor-dashboard` (UAT-findings item 2); the success copy matches what actually happened given P1's confirm setting (item 3); the signup subtitle speaks to vendors (item 9 — if still organizer-flavoured, note it for its own PR); throwaway deleted | production + mailbox | | | ☐ |

## Rollout order

1. **Dev project first** (no code): D1, D2.
2. **Vercel**: D3 — before the US1 PR merges.
3. **Code**: US1 PR, then US2 PR, each gated by `npm run lint && npm test && npm run build`
   with the local stack up; `dev` preview redeploys; D4.
4. **Walkthroughs**: D5, D6, D7, then D8.
5. **Production**: P1 now (read-only); P2 and P3 after the next `dev → main` promotion, which
   spec 009's T017 still gates (its Production key must be set first).
6. **Close**: docs per FR-018 — `docs/ROADMAP.md` M3 item "Preview-deployment access decided
   for UAT" ticked with the decision; `specs/README.md` 010 row; the UAT findings handoff (items
   2/3/9 → this table; item 11 email casing added); `CLAUDE.md`; 007 env-contract; 009 quickstart
   V3 note (research R11); 008 tasks note (research R14); `docs/ARCHITECTURE.md` wording.

## Known behaviours worth not filing as bugs

- **Invited vendors are not on the Team page.** By decision (research R6): the Team page lists
  organizers and admins; the Admin page lists everyone. Re-send a pending vendor by submitting the
  address again in the invite form.
- **A mixed-case application email is not linked to the invited account** (research R8). The
  vendor sees an empty dashboard and applies again, or the address is fixed in the follow-up
  (UAT findings item 11).
- **Every PR preview is invite-only**, not just the `uat-` host — they share the dev project and
  the Preview-scope flag (spec edge case).
- **Flag on, toggle still on**: the app refuses but the probe returns `200`. Fix the toggle (D1);
  the code cannot detect this.
