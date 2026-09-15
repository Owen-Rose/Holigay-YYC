# Contract: Environment Variables

**Feature**: 007-production-readiness | **Date**: 2026-09-14
**Implemented by**: `src/lib/env-public.ts` + `src/lib/env.ts` (T004), `scripts/smoke-check.mjs` (T011), `src/app/api/keepalive/route.ts` (T007)

This is the single place that says which variables the app reads, where each must be
set, and what happens when one is missing. Anyone configuring a deployment should not
need to read code.

## Strictness rule

Strict checks apply only when **`VERCEL_ENV === 'production'`** — a Vercel Production
deploy of `main`. Preview deploys (`VERCEL_ENV=preview`) and local builds (`VERCEL_ENV`
unset) are lenient so work continues while the sending domain is pending. `NODE_ENV` is
**not** used for this decision: Vercel builds previews with `NODE_ENV=production`, and
keying on it would break every preview.

## Variables

| Variable | Read by | Local | Preview | Production | Validation |
|---|---|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `env-public` → `src/middleware.ts`, `src/lib/supabase/{client,server,middleware}.ts` | required | required | required | valid URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | same | required | required | required | non-empty |
| `RESEND_API_KEY` | `env` → `src/lib/email/client.ts` | optional — emails are logged, not sent | optional | **required** | non-empty |
| `EMAIL_FROM_ADDRESS` | `env` → `src/lib/email/client.ts` | optional — falls back to the test sender | optional | **required** | `Name <local@domain>` or bare address; **must not contain `resend.dev`** |
| `CRON_SECRET` | `env` → `/api/keepalive` | unset | unset | required for keep-alive | non-empty, ≥ 16 characters |
| `KEEPALIVE_SUPABASE_TARGETS` | `env` → `/api/keepalive` | unset | unset | required for keep-alive | comma-separated `url\|anonKey` pairs; each `url` a valid URL, each key non-empty; at least one pair |
| `VERCEL_ENV` | `env` | unset | `preview` (set by Vercel) | `production` (set by Vercel) | one of `development`, `preview`, `production`, or unset |
| `SUPABASE_SERVICE_ROLE_KEY` | nothing yet (Epic 4 placeholder) | — | — | — | not parsed by the env module; documented in `.env.example` only |
| `NODE_ENV` | `src/app/api/test-email/route.ts`, `src/app/api/preview-email/route.ts` (404 gate) | — | — | — | unchanged; not part of the module |
| `SMOKE_APP_URL` | `scripts/smoke-check.mjs` | shell only | never on Vercel | never on Vercel | valid URL |
| `SMOKE_SUPABASE_URL` | `scripts/smoke-check.mjs` | shell only | never | never | valid URL |
| `SMOKE_SUPABASE_ANON_KEY` | `scripts/smoke-check.mjs` | shell only | never | never | non-empty |

"Required for keep-alive" means the route answers `401` (no `CRON_SECRET`) or `500`
`misconfigured` (no targets) rather than failing the build — the app must still deploy if
the keep-alive is not configured yet. The build-time hard requirements in production are
exactly two: `RESEND_API_KEY` and `EMAIL_FROM_ADDRESS`.

## Failure behaviour

Both modules parse at first import with a Zod `safeParse`. On failure they throw one
`Error` that names every problem at once, so a misconfigured deploy fails with a single
readable message in the build log:

```
Invalid environment: RESEND_API_KEY (required when VERCEL_ENV=production);
EMAIL_FROM_ADDRESS (must not use the resend.dev test sender in production)
```

`env-public.ts` reads `process.env.NEXT_PUBLIC_SUPABASE_URL` and
`process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY` as **literal property accesses** so Next.js
inlines them into the client bundle; a dynamic lookup would be `undefined` in the browser.
It is importable from client components, server code and the middleware. `env.ts` is
server-only and must never be imported from a client component.

Outside production, when `RESEND_API_KEY` is unset, `sendEmail` keeps its existing
log-and-pretend behaviour; when `EMAIL_FROM_ADDRESS` is unset it keeps the existing
fallback `Holigay Vendor Market <onboarding@resend.dev>`, which Resend delivers only to
the account owner's mailbox.

## Where each deployment sets them

| Variable | Vercel Preview | Vercel Production | Local `.env.local` |
|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` / `_ANON_KEY` | dev project | prod project | local stack or dev project |
| `RESEND_API_KEY` | set (same key) | set | optional |
| `EMAIL_FROM_ADDRESS` | set once the domain is verified | set once the domain is verified — **before the next `dev → main` promotion** | optional |
| `CRON_SECRET` | not set (crons run on production only) | set | not set |
| `KEEPALIVE_SUPABASE_TARGETS` | not set | set: dev pair **and** prod pair, explicitly | not set |
| `SMOKE_*` | never | never | shell session only, per target |

`docs/DEV-ENVIRONMENT-SETUP.md` Part 8 carries the same table for the setup walkthrough;
`.env.example` documents the local shape.

## Ordering rule for the next promotion

The env-module PR (T004) merges to `dev` with no Vercel prerequisite because previews are
lenient. The **first `dev → main` promotion after it** requires `EMAIL_FROM_ADDRESS` and
`RESEND_API_KEY` on Vercel Production, or the production build fails — which is the
intended behaviour, not a bug. T003 records the date they were set in `quickstart.md`.
