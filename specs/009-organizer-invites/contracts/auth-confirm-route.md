# Contract: `GET /auth/confirm`

**Feature**: 009-organizer-invites | **Date**: 2026-09-26
**Implemented by**: `src/app/auth/confirm/route.ts` | **Tested by**: `src/test/auth-confirm-route.test.ts` (unit), `src/test/security/invite-flow.test.ts` (real GoTrue), US1-S2 / US2-S5 / US4-S1 on the dev preview
**Requirements**: FR-009 – FR-014, FR-022; SC-002, SC-003

## Purpose

The one page that turns an emailed one-time link into a signed-in session. Every auth email
template on both hosted projects points here (`contracts/email-templates.md`), so it serves
invitations, password resets, signup confirmations and email changes, whether the app or the
Supabase console sent the mail.

## Request

```
GET /auth/confirm?token_hash=<hash>&type=<kind>&next=<path>
```

Unauthenticated. Not matched by any middleware redirect (`src/middleware.ts` protects only
`/dashboard*` and `/vendor-dashboard*` and bounces only `/login` and `/signup`).

| Query param | Required | Accepted values |
|---|---|---|
| `token_hash` | yes | non-empty string (opaque; passed straight to GoTrue) |
| `type` | yes | `invite` \| `recovery` \| `signup` \| `email` \| `email_change` |
| `next` | no | exactly `/set-password`, `/dashboard` or `/vendor-dashboard`; anything else is ignored |

Kind defaults when `next` is absent or not allow-listed:

| `type` | default destination |
|---|---|
| `invite`, `recovery` | `/set-password` |
| `signup`, `email`, `email_change` | `/vendor-dashboard` |

## Behaviour

1. Parse the three params with `confirmQuerySchema` (`safeParse`). Failure →
   redirect to `/login?reason=link-invalid` **without calling GoTrue**.
2. Resolve `destination`: `next` if allow-listed, else the kind default.
3. `const supabase = await createClient()` (the cookie-backed server client);
   `const { error } = await supabase.auth.verifyOtp({ token_hash, type })`.
4. `error` → `console.error('[auth/confirm] verify failed', error.code ?? error.name)` and
   redirect to `/login?reason=link-invalid`. No session exists.
5. Success → the SSR helper has written the session cookies; redirect to `destination`.

Redirects are `NextResponse.redirect(new URL(path, request.url))` (HTTP 307).

## Outcomes

| Situation | GoTrue called | Response | Session |
|---|---|---|---|
| valid `type`, valid unused hash, `next` allow-listed | yes | 307 → `next` | created |
| valid `type`, valid hash, `next` absent / not allow-listed / `//evil` / `https://…` / `/dashboard/x` | yes | 307 → kind default | created |
| `type` missing or not in the enum (incl. `magiclink`) | **no** | 307 → `/login?reason=link-invalid` | none |
| `token_hash` missing or empty | **no** | 307 → `/login?reason=link-invalid` | none |
| hash expired, already used, or unknown (`verifyOtp` error) | yes | 307 → `/login?reason=link-invalid` | none |
| any method other than GET | — | Next.js default 405 | none |

## Invariants

- **No other write.** `verifyOtp` is the only side effect; it is one-time and expiring.
- **Nothing from the query string is logged** — not the hash, not `next`, not the email
  GoTrue returns. Only the GoTrue error code on failure (FR-014).
- The allow-list is compared with string equality; there is no prefix or origin matching
  (research R3).
- The handler imports `@/lib/supabase/server` and `zod` only — never the admin client.
- `export const dynamic = 'force-dynamic'` so the response is never cached.

## Login page notices consumed from here

| `reason` | Copy shown on `/login` |
|---|---|
| `link-invalid` | That link has expired or was already used. Ask an admin to send a new invitation, or use Forgot password. |
| `session-required` | Please sign in first. *(set by `/set-password`, not by this route)* |
