# Invite-only UAT environment — design

**Date**: 2026-09-27
**Status**: Design agreed in brainstorm; not yet a Speckit spec. Intended next spec number: 010.
**Kickoff**: `/speckit.specify` pointed at this file. It carries the decisions, the scope line and the acceptance behaviour; the spec should not relitigate §2.
**Related**: `docs/handoffs/2026-09-27-uat-findings.md` (the open fixes this sequences against); `specs/009-organizer-invites/` (the invite flow this builds on); `docs/ROADMAP.md` M3 checklist item "Preview-deployment access decided for UAT" (this closes it).

## 1. Problem

Two deployments run the same code against two Supabase projects:

| Deployment | Branch | Supabase project | Audience |
|---|---|---|---|
| Production, `vendors.holigayeventsyyc.ca` | `main` | prod | Real vendors and organizers. Anyone may sign up as a vendor. |
| UAT / training, `uat-holigay-yyc.vercel.app` | `dev` | dev | Invited organizers learning the app before event week. |

The UAT deployment is public by link with Vercel Deployment Protection off (a deliberate choice: testers must not need a Vercel login). Today anyone who finds the URL can create a vendor account through `/signup`, or call the auth server directly with the anon key that ships in the bundle. The training environment should be invite-only: **no account exists on UAT unless an admin invited it**, and testers get in through the app's own email invite, never through Vercel.

Prod must keep open vendor self sign-up. Nothing in this design changes prod behaviour.

## 2. Decisions made in the brainstorm

| # | Decision | Chosen | Why |
|---|---|---|---|
| D1 | Where enforcement lives | The dev Supabase project's **"Allow new users to sign up"** setting is turned **off** (Authentication → Sign In / Providers; `enable_signup` in the local `config.toml`). App code adds no allowlist. | This is the auth server refusing `signUp` for everyone, including a browser calling GoTrue directly with the anon key. `auth.admin.inviteUserByEmail` is unaffected, so spec 009's invite flow is the only door. An email allowlist in middleware or in the `signUp` action would guard only our UI and is the hand-rolled version of the same idea. |
| D2 | Scope of "invite-only" | **Accounts only.** `/`, `/apply` and the anonymous submission RPC stay public on UAT. | The point of the training env is that organizers see what vendors see, and the public form is the vendor experience. Gating it behind a session would make UAT exercise a flow prod never runs. The residual risk is a stranger pushing junk applications into a training database, which is low likelihood and deletable. |
| D3 | How the app knows | A new public env flag, `NEXT_PUBLIC_INVITE_ONLY`, parsed by `src/lib/env-public.ts` (literal access, same as the two Supabase values). `'true'` enables invite-only mode; unset or anything else is open mode. Set on Vercel **Preview** only. **Not** derived from `VERCEL_ENV`. | The middleware runs on the edge and already imports `env-public`. The value is not a secret. Keying on `VERCEL_ENV=preview` would silently flip every PR preview and is the same trap the 007 env contract avoided with `NODE_ENV`. An explicit flag is set once and read everywhere. |
| D4 | What the flag does | The sign-up link disappears from the login page, `/signup` answers **404** from the middleware, and the `signUp` server action refuses with "Sign-up is by invitation on this site" before calling Supabase. | Cosmetic and defensive only; D1 is the enforcement. Without this a tester who finds `/signup` sees GoTrue's raw "Signups not allowed for this instance". The action guard means a stale client can't produce that error either. |
| D5 | Vendor accounts on UAT | The Team page invite form gains a **role picker: Organizer (default) or Vendor.** `inviteOrganizerCore` takes the role and sets it after the invite call, as it does for organizers today. | With self sign-up off, this is the only way a tester gets a vendor account. It preserves the "apply, then get an account" flow: the tester submits at `/apply` with their email, the admin invites that address as a vendor, and the `handle_new_user` trigger links the existing vendor row by email on the invite exactly as it would on a self sign-up. |
| D6 | Site URL | The dev project's Site URL becomes `https://uat-holigay-yyc.vercel.app` before the first invite is sent. Redirect URLs keep both origins. | Invite and recovery links land on the Site URL host. Today that is the git-dev preview, so an invitee would finish on the wrong hostname. Same build, but the wrong address to bookmark and share. |
| D7 | Prod | Untouched: sign-up on, flag unset. The UAT findings items about self sign-up (2, 3, 9) move to a prod-only checklist. | Self sign-up no longer exists on UAT, so it cannot be re-tested there. |

## 3. User scenarios

**S1 — Stranger finds the UAT URL.** They can read the landing page and submit an application at `/apply`. The login page shows no sign-up link. `/signup` is a 404. A direct `auth.signUp` call with the anon key returns GoTrue's signups-disabled error. No account exists.

**S2 — Admin invites an organizer.** Unchanged from spec 009 S1, except the link now lands on the `uat-` host.

**S3 — Admin invites a tester as a vendor.** On `/dashboard/team`, the admin enters the email, picks **Vendor**, sends. The invitee's email link lands them signed in on Set your password, then on `/vendor-dashboard`. If they had already applied at `/apply` with that address, their application is there. The Team list shows them with a Vendor badge and Pending until they sign in.

**S4 — Admin invites a vendor address that already has an account.** Refused with spec 009's existing message. On UAT no self-signed accounts exist, so this only fires for a genuine duplicate.

**S5 — Vendor signs up on prod.** Unchanged. Flag unset, sign-up on, `/signup` renders, confirm-email link goes through `/auth/confirm`.

**S6 — Developer runs locally with the flag set.** Local stack still has `enable_signup = true`, so the auth server would accept a sign-up, but the app hides and refuses it (D4). This is the state the unit tests exercise; the security suite does not flip the local toggle.

## 4. Components

### 4.1 Env contract — `src/lib/env-public.ts`
- Add `NEXT_PUBLIC_INVITE_ONLY` as an optional string; export `inviteOnly: boolean` = value is exactly `'true'`.
- Literal `process.env.NEXT_PUBLIC_INVITE_ONLY` access (bundle inlining rule already documented in the file).
- Document in `specs/007-production-readiness/contracts/env-contract.md` and CLAUDE.md's env section: Preview `true`, Production unset, local unset.

### 4.2 Middleware — `src/middleware.ts`
- When `inviteOnly` and the path is `/signup` (or under it), rewrite to the 404 page. Do this before the session lookup so the page never renders.
- Everything else unchanged: `/apply`, `/`, `/login`, `/forgot-password`, `/set-password`, `/auth/confirm`, `/api/keepalive` all behave as today.

### 4.3 Sign-up surface
- `src/app/(auth)/login/page.tsx`: render the "Sign up" link only when not `inviteOnly`.
- `src/lib/actions/auth.ts` `signUp`: when `inviteOnly`, return `{ success: false, error: 'Sign-up is by invitation on this site.' }` before any Supabase call.
- `src/app/(auth)/signup/page.tsx`: no change needed once the middleware 404s it; keep the page for prod.

### 4.4 Invite role — `src/lib/team/invite-organizer-core.ts`, `src/lib/actions/team.ts`, `src/components/team/invite-form.tsx`
- Core signature gains `role: 'organizer' | 'vendor'`. The update after the invite call writes that role. Pending re-sends keep the stored role (spec 009 FR-003/FR-005 unchanged).
- Action validates `role` with Zod (enum of the two values; `admin` is never invitable) alongside the email. Still admin-only.
- Form: a select next to the email input, Organizer selected by default. The Team page's Resend button passes no role, and the core keeps the existing one.
- Team list already shows a role badge per row, so vendors invited here are visible without further UI.

### 4.5 Manual configuration, recorded in the spec's `quickstart.md`
Following spec 009's pattern, each is a `[manual]` task with an evidence row:
1. Dev Supabase: "Allow new users to sign up" → **off**. Evidence: an anon `signUp` against the dev API returns the signups-disabled error.
2. Dev Supabase: Site URL → `https://uat-holigay-yyc.vercel.app`. Evidence: config read-back.
3. Vercel Preview env: `NEXT_PUBLIC_INVITE_ONLY=true`. Evidence: `/signup` on the `uat-` host is a 404 and the login page has no sign-up link.
4. Prod Supabase: "Allow new users to sign up" confirmed **on**, Confirm email read (the unchecked item from the UAT findings).

## 5. Error handling

- Flag set but Supabase toggle still on: the app hides and refuses sign-up, the auth server would accept a direct call. Caught by 4.5 item 1's evidence, not by code. The quickstart says to flip the toggle first.
- Toggle off but flag unset: `/signup` renders and the action forwards to Supabase, which returns "Signups not allowed for this instance". The action surfaces that message as today. Ugly, harmless.
- Role update fails after a vendor invite: same path as spec 009 ("Invitation sent, but the role could not be set"); the trigger's default is `vendor`, so a failed vendor invite lands correctly anyway.

## 6. Testing

- **Unit (jsdom, existing project)**: login page hides the link when the flag is set and shows it when not; `signUp` refuses before calling Supabase when the flag is set; middleware returns 404 for `/signup` under the flag and passes it through otherwise; `env-public` parses `'true'`, unset and `'false'`. Tests that import the real env module use `// @vitest-environment node` per CLAUDE.md.
- **Security suite (real local stack)**: extend `src/test/security/invite-flow.test.ts`: inviting with `role: 'vendor'` creates a pending vendor; the trigger links a pre-existing `vendors` row by email; a re-send keeps the vendor role; `role: 'admin'` is rejected by the action's schema (unit-level, no stack needed).
- **Manual**: the four evidence rows in 4.5, then one vendor invite and one organizer invite on UAT, driven through the browser with Owen typing passwords.

## 7. Out of scope

- Gating `/apply` or the landing page (D2). If junk submissions become a problem, a later spec can add a session requirement behind the same flag.
- Any change to prod's sign-up posture.
- A captcha on `/apply`.
- Turning the Supabase toggle from the app or from a migration. It is project configuration, not schema; hosted projects expose it only through the dashboard and Management API.
- The other open items in the UAT findings. They are separate PRs, sequenced after this one: item 6 (status buttons), item 4 (UTC times), item 5 (reply-to copy).

## 8. Sequence to the first organizer invite

1. Dashboard toggles (4.5 items 1 and 2) — reversible, no code, can happen today.
2. This spec's single PR to `dev`, with the Preview env var set before merge so the `uat-` host picks it up on deploy.
3. UAT findings items 6, 4, 5 as their own PRs.
4. First invite.
