# Quickstart: Organizer Invites, Link Consumption and Password Reset

**Feature**: 009-organizer-invites

This file is the **ops and evidence record** for spec 009. Every `[manual]` task in
`tasks.md` is ticked only when its evidence row below is filled in — the discipline of spec
005's migration log, 006's "Prod rollout record" and 007's evidence record. Reasoning lives
in `research.md`; the exact strings, links and template bodies in `contracts/`.

## Local development loop

```bash
# Full local stack (mailpit included, so invite and reset mails are visible)
npx supabase start
# If auth health returns 502 after a reset:
docker restart supabase_kong_Holigay

# Apply migration 013 and regenerate types (foundation task)
npx supabase db reset
npm run db:types:local

# Run the app with a service-role key so Send Invite works locally.
# `npx supabase status` prints the local service_role key; put it in the shell, not .env.local.
SUPABASE_SERVICE_ROLE_KEY=<local service_role key> npm run dev

# Then: sign in as a local admin (scripts/seed-role.sql), /dashboard/team → Send Invite to
# anyone@example.com → open http://127.0.0.1:54324 (mailpit) → click the link → /set-password.
# Reset: /forgot-password with an existing local address → mailpit → link → /set-password.

# The constitution's gate before every PR (security suite self-skips if the stack is down)
npm run lint && npm test && npm run build
npm run test:security          # invite-flow.test.ts against the real local GoTrue
```

Local `next build` has `VERCEL_ENV` unset, so `SUPABASE_SERVICE_ROLE_KEY` is optional; without
it the invite form answers "Invites are not configured on this deployment" and nothing else
changes. Local templates are the CLI defaults (their links point at
`http://127.0.0.1:54321/auth/v1/verify`, which GoTrue then redirects to the Site URL with a
hash) — so **local mail links do not exercise `/auth/confirm`**; the security suite and the dev
preview do. To test the route locally by hand, copy `hashed_token` from
`auth.admin.generateLink` (or the `token_hash` GoTrue prints in mailpit's raw view) into
`http://localhost:3000/auth/confirm?token_hash=…&type=invite`.

## Evidence record

Fill the rows as the manual tasks complete. "Evidence" is what was actually observed: the
console state, the toast text, the mail's sender and link host, the command output. Dates
are ISO. Nothing sensitive goes here — no keys, no passwords, no real vendor addresses; use
`<maintainer>+009-…` throwaways and delete them afterwards.

Task IDs are filled in by `/speckit-tasks`; the rows are fixed now so `tasks.md` can cite them.

### Verification of carried-forward assumptions

| Row | Item | Where | Date | Evidence | Done |
|---|---|---|---|---|---|
| V1 | Minimum password length read (research R17); expected 6 | Supabase dev → Authentication → Sign In / Providers → Email | 2026-09-27 | 6 — read by the maintainer; matches `min(6)`, no schema change | ☑ |
| V2 | Same | Supabase prod | 2026-09-27 | 6 — read by the maintainer; matches `min(6)`, no schema change | ☑ |
| V3 | Site URL re-read = `dev`-branch preview origin alone (research R18) | Supabase dev → Authentication → URL Configuration | 2026-09-27 | `site_url` = `https://holigay-yyc-git-dev-owen-roses-projects.vercel.app` alone; Redirect URLs unchanged (that origin + `uat-holigay-yyc`). Read via the Management API (`GET`/`PATCH /v1/projects/kcokcufmzyckbodelqpb/config/auth`, CLI login token) from the maintainer-approved implementation session; sender `noreply@holigayeventsyyc.ca` / "Holigay Events YYC", `password_min_length` 6 | ☑ |
| V4 | Site URL = `https://vendors.holigayeventsyyc.ca` | Supabase prod | | | ☐ |

### Dev project and preview

| Row | Item | Where | Date | Evidence | Done |
|---|---|---|---|---|---|
| D1 | Migration `013` applied (`supabase db push` against dev); `users_with_roles` has `invite_pending` | Supabase dev | 2026-09-27 | `supabase migration list --linked` showed 001–012 on both sides and 013 local-only; `db push --dry-run` offered only 013; `db push` applied it (maintainer's terminal, CLI 2.65.6). Anon-key `GET /rest/v1/users_with_roles` on dev → `401` / `42501 permission denied for view users_with_roles` (research R20 closed on dev); the same key → `events` 200 as a control. The column itself is not yet seen through an admin session (T009 exercises it) | ☑ |
| D2 | `SUPABASE_SERVICE_ROLE_KEY` = dev project's key, **Preview** scope, all branches | Vercel → Settings → Environment Variables | 2026-09-27 | Added by the maintainer as the dev project's `sb_secret_…` key, Preview scope, no branch filter. The first paste was the **prod** project's secret by mistake; the preview log showed `[inviteOrganizer] lookup Invalid API key` and the value was replaced with the dev key. `dev` preview redeployed (c1a0c09, no build cache); inviting the maintainer's own admin address on the preview Team page → toast "That email already has an account. Change their role on the Admin page instead." — the admin client reads `users_with_roles` on dev | ☑ |
| D3 | Invite template set per `contracts/email-templates.md` §1 | Supabase dev → Email Templates | 2026-09-27 | `mailer_subjects_invite` + `mailer_templates_invite_content` PATCHed from the contract's §1 subject and HTML block via the Management API (`GET`/`PATCH /v1/projects/kcokcufmzyckbodelqpb/config/auth`, CLI login token) from the maintainer-approved implementation session; read back character-for-character equal. Replaced the console defaults ("You have been invited"). A real invite mail is checked in D6 | ☑ |
| D4 | Reset-password template set per §2 | Supabase dev | 2026-09-27 | Same method as D3 for `mailer_subjects_recovery` / `mailer_templates_recovery_content`; read back equal. T011's real reset mail from the preview (sender, link host) is still owed and rides with D9 | ☑ |
| D5 | Confirm-signup template set per §3 (no visible effect: confirmations off) | Supabase dev | 2026-09-27 | Same method as D3 for `mailer_subjects_confirmation` / `mailer_templates_confirmation_content`; read back equal. `mailer_autoconfirm` is still `true` on dev, so it never sends there (US4 scenario 3) | ☑ |
| D6 | **Story 1 walkthrough**: Send Invite to a throwaway → toast "Invitation sent" → row Pending/Organizer → mail in Inbox from the branded sender → link lands signed in on `/set-password` (no landing page, no login form) → password set → `/dashboard` as organizer; Team page shows Organizer, no Pending | dev preview + mailbox | | | ☐ |
| D7 | Story 1 refusals: invite the maintainer's own admin address → FR-002 message, no mail; invite the same throwaway again after acceptance → FR-002 message | dev preview | | | ☐ |
| D8 | **Story 3 walkthrough**: invite a second throwaway, do not click → Pending badge + Resend → Resend → second mail, toast "Invitation re-sent" → submit the same address in the form → same → click link → badge gone | dev preview + mailbox | | | ☐ |
| D9 | **Story 2 walkthrough**: `/login` shows "Forgot password?" → request for an existing vendor → neutral message → mail → link → `/set-password` → new password → `/vendor-dashboard` → sign out, sign in with the new password. Then request for a nonexistent address → identical on-screen response | dev preview + mailbox | | | ☐ |
| D10 | **Edge cases**: reuse an already-used link → `/login` with the expired/used notice, signed out; open `/auth/confirm?type=magiclink&token_hash=x` → same notice; open `/set-password` signed out → `/login` with "Please sign in first."; open `/set-password` and `/forgot-password` while signed in → both render | dev preview | | | ☐ |
| D11 | **Abandoned set-password** (documented, not a bug): invite a third throwaway, click the link, close the tab without setting a password → Team page shows no Pending, Resend absent, re-invite refused with FR-002; recover via `/forgot-password` | dev preview + mailbox | | | ☐ |
| D12 | Throwaway users deleted | Supabase dev → Authentication → Users | | | ☐ |

### Production

| Row | Item | Where | Date | Evidence | Done |
|---|---|---|---|---|---|
| P1 | Migration `013` applied to prod | Supabase prod | 2026-09-27 | Pushed early, ahead of the rest of T017, to close the anon read (research R20) — safe alone because prod's code never reads the new column. `supabase migration list --linked` showed 001–012 on both sides and 013 local-only; `db push --dry-run` offered only 013; `db push` applied it (maintainer's terminal, CLI 2.65.6; CLI re-linked to dev afterwards). Anon-key `GET /rest/v1/users_with_roles` on prod → `401` / `42501 permission denied for view users_with_roles`; the same key → `events` 200 as a control | ☑ |
| P2 | `SUPABASE_SERVICE_ROLE_KEY` = prod project's key, **Production** scope | Vercel | | | ☐ |
| P3 | Invite template set per §1 | Supabase prod → Email Templates | | | ☐ |
| P4 | Reset-password template set per §2 | Supabase prod | | | ☐ |
| P5 | Confirm-signup template set per §3 | Supabase prod | | | ☐ |
| P6 | `dev` promoted to `main`; Production deploy green (env guard satisfied) | GitHub / Vercel | | | ☐ |
| P7 | **Story 1 on production** with a real organizer's address — the first real onboarding: mail received, link → `/set-password` signed in → `/dashboard`; Team page shows Organizer | production + the organizer's mailbox | | | ☐ |
| P8 | **Story 4 on production**: sign up a throwaway vendor → confirmation mail → link lands signed in on `/vendor-dashboard`; signup page copy no longer says "sign in"; throwaway deleted | production + mailbox | | | ☐ |
| P9 | Placeholder organizer from 007 T015 replaced or removed (it can never receive mail) | Supabase prod → Authentication → Users | | | ☐ |

## Rollout order

1. **Local**: migration `013`, types, every repo task green (`npm run lint && npm test &&
   npm run build`, security suite included).
2. **Dev**: rows V1, V3, D1–D12. Every story clicked through once with a real mailbox
   (SC-006).
3. **Prod**: rows V2, V4, P1–P9. Story 1 once with a real organizer; story 4 once with a
   throwaway.
4. **Close**: docs per FR-031 (`CLAUDE.md`, `docs/ARCHITECTURE.md`, `docs/ROADMAP.md`,
   `specs/README.md`, 007 env-contract and quickstart backlog note, 008 tasks follow-up, the
   migrations README, the constitution PATCH removing the acknowledged invite-stub note).

## Known behaviours worth not filing as bugs

- **An invitee who clicked the link but never set a password** is confirmed and has signed
  in once. The Pending badge clears, Resend is refused with "That email already has an
  account…", and the recovery is Forgot password (spec edge case; research R5).
- **A console-created account with "Auto Confirm User"** is not Pending and cannot be
  re-invited; it signs in with the password the admin set or uses Forgot password.
- **Local mail links** go through GoTrue's `/auth/v1/verify` and the hash-fragment flow, not
  `/auth/confirm` — only the hosted projects' templates point at the app (see the local loop).
