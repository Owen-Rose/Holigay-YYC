# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Holigay Vendor Market is a vendor application platform for the Holigay Events YYC marketplace. Vendors can apply to participate in events, upload product photos, and track their application status. Organizers manage events, review applications, and control event status workflows. Built with Next.js 16 (App Router), Supabase, and TypeScript.

## Development Commands

```bash
npm run dev              # Start development server (localhost:3000)
npm run build            # Production build
npm start                # Start production server
npm run lint             # Run ESLint
npm run lint:fix         # Fix ESLint issues
npm run format           # Format with Prettier
npm run format:check     # Check formatting without writing
npm test                 # Run tests once
npm run test:watch       # Run tests in watch mode
npm run test:coverage    # Generate coverage report
npm run test:security    # Run only the security suite (needs a local Supabase stack)
npm run smoke            # Smoke-check a deployment (needs the three SMOKE_* shell vars)
npm run db:types         # Regenerate Supabase types (production)
npm run db:types:dev     # Regenerate Supabase types (dev)
npm run db:types:local   # Regenerate Supabase types (local stack)
```

## Architecture

Full architectural documentation (request flow, authorization layers, data model, service seams, known weak points): `docs/ARCHITECTURE.md`. Prioritized improvement plan: `docs/ROADMAP.md`.

### Tech Stack
- **Framework**: Next.js 16 with App Router, React 19, TypeScript
- **Database**: Supabase (PostgreSQL) with Row Level Security
- **Auth**: Supabase Auth (email/password) with cookie-based sessions
- **Forms**: React Hook Form + Zod validation
- **Styling**: Tailwind CSS v4
- **Email**: Resend (transactional emails for application status updates)
- **Testing**: Vitest (two projects — `unit` in jsdom with React Testing Library, `security` in node against a real local Supabase stack)
- **CI**: GitHub Actions (`.github/workflows/ci.yml`)

### Key Directories
```
src/
├── app/                        # Next.js App Router pages
│   ├── (auth)/                # Auth pages (login, signup) - redirect if logged in
│   ├── (public)/              # Public pages (landing, apply)
│   ├── dashboard/             # Organizer/admin routes - require organizer+ role
│   │   ├── admin/             # Admin management page
│   │   ├── applications/      # Application review (list + [id] detail)
│   │   ├── events/            # Event CRUD (list, new, [id] edit)
│   │   └── team/              # Team management (admin only)
│   ├── vendor-dashboard/      # Vendor routes - require vendor role
│   │   ├── applications/      # Vendor's applications (list + [id] detail)
│   │   └── profile/           # Vendor profile editing
│   ├── api/                   # API routes (email preview/test, keep-alive cron)
│   ├── unauthorized/          # Unauthorized access page
│   ├── error.tsx              # Global error boundary
│   ├── not-found.tsx          # 404 page
│   └── loading.tsx            # Root loading state
├── components/
│   ├── admin/                 # Admin components (user-role-select)
│   ├── auth/                  # Login/signup form components
│   ├── dashboard/             # Dashboard components (tables, filters, export, role-badge)
│   ├── forms/                 # Form components (event, vendor application, vendor profile)
│   ├── team/                  # Team invite form
│   └── ui/                    # Reusable UI primitives (button, card, input, select, etc.)
├── lib/
│   ├── actions/               # Server actions (auth, applications, events, vendors, etc.)
│   ├── auth/                  # Role checking utilities (roles.ts)
│   ├── constants/             # App constants (application-status, roles)
│   ├── context/               # React context providers (role-context)
│   ├── email/                 # Email client + templates (application-received, status-update)
│   ├── supabase/              # Supabase clients (client, server)
│   ├── validations/           # Zod schemas (auth, application, event, vendor)
│   └── utils.ts               # Shared utilities (cn for class merging)
├── test/                       # Unit tests and setup
│   └── security/              # RLS/RPC/storage suite — runs against a real local stack
└── types/
    └── database.ts            # Auto-generated Supabase types (do not edit manually)
```

### Database Schema
Core tables with RLS enabled:
- `events` - Marketplace events with dates, location, status (`draft`/`active`/`closed`)
- `vendors` - Business info (name, contact, description) + `user_id` link to auth.users
- `applications` - Vendor applications linking vendors to events
- `attachments` - File uploads for applications (stored in Supabase Storage)
- `user_profiles` - Links auth.users to roles (`vendor`/`organizer`/`admin`) with auto-creation trigger

Supporting objects:
- `user_role` enum type
- `get_user_role()` SQL function — no-arg, returns `user_role` (used in RLS policies). The earlier two-arg `get_user_role(uuid)` and `user_has_role(uuid, text)` were dropped by spec 004 (`007_role_system_cleanup.sql`).
- `handle_new_user` trigger (auto-creates profile on signup, links existing vendors by email)
- `users_with_roles` view (joins auth.users with profiles for admin queries)
- `public.user_roles` table — superseded by `user_profiles` and dropped by `008_drop_user_roles.sql`.
- `SECURITY DEFINER` RPCs for atomic multi-table writes: `submit_public_application(jsonb)` (the only public-submission write path — `anon`/`authenticated` may execute it), `save_event_questionnaire(uuid, jsonb, uuid)` (the only write path for the questionnaire builder and the template seed — migration 012), `create_event_with_default_questionnaire(jsonb)` and `ensure_event_questionnaire(uuid)`. The three organizer RPCs check `get_user_role()` inside the function (migration 012) in addition to having `anon` EXECUTE revoked (migration 011).

### Authentication & Authorization Flow
1. Middleware (`src/middleware.ts`) checks auth state and fetches role on every request
2. **Unauthenticated** users on protected routes → redirect to `/login?redirectTo=...`
3. **Authenticated vendors** accessing `/dashboard` → redirect to `/vendor-dashboard`
4. **Non-admins** accessing `/dashboard/team` → redirect to `/dashboard`
5. Auth routes (`/login`, `/signup`) redirect authenticated users to their role-appropriate dashboard
6. Server actions in `src/lib/actions/` validate role with `requireRole()` before mutations

### Server Actions Pattern
All server actions use this pattern:
```typescript
'use server'
import { createServerClient } from '@/lib/supabase/server'

export async function actionName(data: ValidatedInput): Promise<ActionResponse> {
  const supabase = await createServerClient()
  // Check role authorization
  // Validate input with Zod schema
  // Perform database operation
  // Return typed response
}
```

Server action files:
- `auth.ts` - signIn, signUp, signOut
- `applications.ts` - status updates, notes, listing
- `events.ts` - CRUD, status transitions (draft→active→closed)
- `vendors.ts` - vendor profile updates
- `vendor-dashboard.ts` - vendor-specific data fetching
- `team.ts` - organizer/vendor invitations over the contained admin client (`src/lib/supabase/admin.ts`, its only importer — spec 009/010)
- `admin.ts` - admin operations
- `upload.ts` - file upload handling
- `export.ts` - data export

### Form Validation
Zod schemas in `src/lib/validations/` define validation rules and infer TypeScript types:
- `auth.ts` - Login/signup validation
- `application.ts` - Vendor application with file upload validation (max 10MB, images/PDFs)
- `event.ts` - Event creation/editing validation
- `vendor.ts` - Vendor profile validation

### Supabase Clients
- `client.ts` - Browser client for client components
- `server.ts` - Server client for server actions and RSC

### Email System
- `src/lib/email/client.ts` - Resend client configuration
- `src/lib/email/templates/` - HTML email templates
  - `application-received.ts` - Sent when vendor submits an application
  - `status-update.ts` - Sent when application status changes
- API routes at `/api/preview-email` and `/api/test-email` for development testing

## Environment Variables

Variables are parsed and validated at first import by two Zod modules — a missing
or malformed value fails with one error naming every problem, not eight scattered
`undefined`s. Full contract: `specs/007-production-readiness/contracts/env-contract.md`.

- `src/lib/env-public.ts` — the `NEXT_PUBLIC_*` values (the Supabase pair and `inviteOnly`). Safe to import from client
  components, server code and the edge middleware. Reads `process.env.NEXT_PUBLIC_X`
  as **literal property accesses** so Next.js inlines them into the browser bundle;
  a dynamic lookup would be `undefined` there.
- `src/lib/env.ts` — server-only (throws if `window` exists). Exports `isProduction`,
  `resendApiKey`, `emailFromAddress`, `cronSecret`, `keepaliveTargets`.

Required in `.env.local` (and for `npm run build`):
```
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
```

Optional:
```
RESEND_API_KEY=re_...              # Email sending (logged to console if unset)
SUPABASE_SERVICE_ROLE_KEY=eyJ...   # Server-only; required on Production; Preview holds the dev project's key — spec 009
EMAIL_FROM_ADDRESS=Holigay Vendor Market <noreply@yourdomain.com>  # Custom sender
NEXT_PUBLIC_INVITE_ONLY=true       # Vercel Preview only (spec 010): hide/404/refuse sign-up; on iff exactly `true`
```

Vercel Production only, never in `.env.local` (set in the shell to try the route
locally — see `specs/007-production-readiness/quickstart.md`):
```
CRON_SECRET=...                    # >= 16 chars; sent as the cron's Authorization: Bearer
KEEPALIVE_SUPABASE_TARGETS=https://dev-ref.supabase.co|eyJ...,https://prod-ref.supabase.co|eyJ...
```
Both feed `/api/keepalive` (`src/app/api/keepalive/route.ts`), which a daily
`vercel.json` cron calls to read one row from **every** listed project — the free
tier pauses a project after about seven days of no API activity, and listing both
explicitly stops a half-filled list from silently protecting only one. Neither is a
build-time requirement: unset, the route answers `401` (no secret) or `500`
`misconfigured` (no targets) and the app deploys fine. Contract:
`specs/007-production-readiness/contracts/keepalive-route.md`.

**Production strictness keys on `VERCEL_ENV === 'production'`, never `NODE_ENV`.**
Vercel builds previews with `NODE_ENV=production`, so keying on it would break every
preview. On a Production deploy of `main`, `RESEND_API_KEY`, `EMAIL_FROM_ADDRESS` and
`SUPABASE_SERVICE_ROLE_KEY` (spec 009) are required and a sender containing `resend.dev` is refused — that test sender
delivers only to the Resend account owner's mailbox, so using it in production means
every vendor email silently vanishes. Previews and local builds stay lenient.

Tests that import the real env modules need `// @vitest-environment node` (the unit
project runs jsdom, where the server-only guard would always fire).

## Path Alias

Use `@/` prefix for imports from `src/`:
```typescript
import { cn } from '@/lib/utils'
import { createServerClient } from '@/lib/supabase/server'
```

## Current Development Phase

**Production is live.** `vendors.holigayeventsyyc.ca` runs `main` on Vercel against the prod Supabase project — `dev` was promoted on 2026-10-07 (`66fc1dd..94e6f6d`), the prod smoke check passed 5/5 with one live dynamic-form submission and both emails on 2026-10-08, and the test data was removed afterwards (0 events / 0 vendors / 0 bucket objects). Prod users are the maintainer's admin plus one rehearsal organizer; the real organizers are invited from the Team page under backlog BL-12. The training deployment `uat-holigay-yyc.vercel.app` (Vercel Preview of `dev`, dev Supabase project) has been invite-only since spec 010 (2026-09-27): dev sign-up off, `NEXT_PUBLIC_INVITE_ONLY=true` on Preview, vendors and organizers invited from the Team page; production keeps open vendor sign-up.

**Where the work is tracked.** Specs 001, 002, 004, 005, 006, 007, 009 and 010 are shipped (`specs/README.md`); spec 008 (self-hosting) is designed and deferred to post-launch. M3 (production-ready) closed 2026-10-08; M4 (live) is entered. The live order of remaining work is `docs/backlog/2026-10-06-uat-and-go-live.md` — Phase 4 (docs truth-up, prod clean slate, real organizer invites) is in progress. `main` = `dev` since the 2026-10-08 promotion (`e342cf6`); the prod clean-slate inventory (BL-08), the final smoke (BL-09, 5/5) and the `/forgot-password` live mail (BL-13) are done. Open: the spec 007 T008 seven-day dev-still-active check (2026-10-15) followed by the PR deleting the interim GitHub keep-alive workflow, and BL-12 (the real organizers' invites, Owen, UI).

**Database state.** Migrations `009`–`013` are applied to both hosted projects (`011` on prod 2026-09-13, `012` 2026-09-14, `013` 2026-09-27) and `dev` = `main` schema-wise. Spec 005's T050 manual walkthrough was waived, not executed (reasoning in its `tasks.md`); its Phase 11 real-database suites retired the waiver's main gap. `docs/cleanup-roadmap.md` is historical — current planning lives in `docs/ROADMAP.md`.

### Epic status snapshot
- **Epic 1** (Complete): RBAC database layer
- **Epic 2** (Complete): RBAC application layer
- **Epic 3** (Complete): Vendor dashboard
- **Epic 4** (Complete): Organizer invite system — delivered by spec 009 (`/auth/confirm`, `/set-password`, `/forgot-password`, invites over the contained admin client in `src/lib/supabase/admin.ts`); on prod since 2026-10-07
- **Epic 5** (Complete): Event management
- **Epic 6** (Substantially complete): Brand re-skin — stories 6.1–6.8 shipped; 6.9 (file previews) and 6.10 (mobile polish) outstanding
- **Epic 7** (Complete): Dynamic application forms — delivered by spec 005 (per-event questionnaires with templates and show-if branching)

Brand reference: [holigayeventsyyc.carrd.co](https://holigayeventsyyc.carrd.co/) — dark `#1C171C` background, Quicksand font, violet (`#A78BFA`) primary, rainbow accents.

Historical Epic task detail lives in `docs/archive/TASKS.md`. New work is tracked as Speckit specs under `specs/`.

### Role System (Complete)

**Database:**
- `user_profiles` table links `auth.users` to roles (canonical role source)
- `get_user_role()` no-arg SQL function for RLS policies (the two-arg variant and `user_has_role` were dropped by spec 004)
- `handle_new_user` trigger auto-creates profile on signup with `role='vendor'`
- Trigger also links existing vendors by matching email

**Application:**
- `src/lib/auth/roles.ts` - `getCurrentUserRole()`, `requireRole()`
- `src/lib/constants/roles.ts` - Role constants
- `src/lib/context/role-context.tsx` - React context for client-side role access
- Middleware checks role for route protection
- Server actions validate role before mutations

### Route Structure

```
/                           # Public landing page
/apply                      # Public vendor application form
/login, /signup             # Auth (redirect if logged in)
/auth/confirm               # Consumes emailed links (invite, signup, recovery) server-side via verifyOtp — spec 009
/set-password               # Set a password after an invite or reset link (requires a session)
/forgot-password            # Request a password reset (neutral response either way)
/vendor-dashboard           # Vendor home (status cards, recent applications)
/vendor-dashboard/applications      # Vendor's application list
/vendor-dashboard/applications/[id] # Vendor's application detail (read-only)
/vendor-dashboard/profile           # Vendor profile editing
/dashboard                  # Organizer home (stats, recent activity)
/dashboard/applications             # All applications (filterable table)
/dashboard/applications/[id]        # Application review (status, notes, attachments)
/dashboard/events                   # Events list with status management
/dashboard/events/new               # Create new event
/dashboard/events/[id]              # Edit event
/dashboard/team                     # Team management (admin only)
/dashboard/admin                    # Admin page
/unauthorized               # Shown when role doesn't match route
/api/preview-email          # Dev: preview email templates
/api/test-email             # Dev: send test emails
/api/keepalive              # Daily Vercel cron; reads one row per Supabase project
```

### Database Migrations

Migrations in `supabase/migrations/` (applied in alphabetical order; see `supabase/migrations/README.md` for the authoritative file map and which duplicate-prefix files are superseded):
1. `001_initial_schema.sql` — Core tables (events, vendors, applications, attachments)
2. `002_rls_policies.sql` — Initial RLS policies
3. `003_user_profiles.sql` (active) / `003_user_roles.sql` (superseded) — User profiles table and role enum
4. `004_vendors_user_link.sql` (active) / `004_user_roles_rls.sql` (superseded) — Vendor-user linking, role RLS
5. `005_rbac_rls_policies.sql` (active) / `005_users_with_roles_view.sql` (superseded) — Full RBAC policies, admin view
6. `006_users_with_roles_view.sql` (active) / `006_rbac_rls_updates.sql` (effectively dead post-007) — RBAC refinements
7. `007_role_system_cleanup.sql` — Drops 006's superseded policies + the two-arg `get_user_role(uuid)` + `user_has_role(uuid, text)`. See `specs/004-consolidate-role-migrations/`.
8. `008_drop_user_roles.sql` — Drops the superseded `public.user_roles` table.
9. `009_dynamic_questionnaires.sql` — Questionnaire tables (`event_questionnaires`, `event_questions`, `application_answers`, templates) + their RLS and the lock-on-publish trigger. See `specs/005-dynamic-questionnaires/`.
10. `010_ensure_event_questionnaire.sql` — `ensure_event_questionnaire(uuid)` RPC for upgrading legacy events.
11. `011_close_public_data_exposure.sql` — Security posture change: adds the `submit_public_application(jsonb)` RPC (the single transactional write path for public submissions), drops the seven broad `anon` policies on `vendors` / `applications` / `attachments` / `application_answers`, revokes `anon` EXECUTE on the two organizer-only RPCs, and brings the `attachments` bucket + its three `storage.objects` policies under version control. See `specs/006-close-public-data-exposure/`.
12. `012_atomic_questionnaire_save.sql` — Adds `save_event_questionnaire(uuid, jsonb, uuid)`, the single transactional write path for the questionnaire builder and the template seed (delete-missing / upsert-by-id / position = index; sets `seeded_from_template_id`); makes the `event_questions` position UNIQUE constraint `DEFERRABLE INITIALLY IMMEDIATE`; adds an in-function `get_user_role()` gate to `ensure_event_questionnaire` and `create_event_with_default_questionnaire`. See `specs/005-dynamic-questionnaires/` Phase 11.
13. `013_users_with_roles_invite_pending.sql` — Adds `invite_pending` to the `users_with_roles` view (Team page Pending badge and Resend) and closes the view's `anon` read. See `specs/009-organizer-invites/`.

### Admin Bootstrap

After applying all migrations, create the first admin:

1. Sign up at `/signup` (auto-creates a `vendor` profile)
2. Run in Supabase SQL Editor:
```sql
UPDATE user_profiles
SET role = 'admin'
WHERE id = (SELECT id FROM auth.users WHERE email = 'your-email@example.com');
```

Or use `scripts/seed-role.sql`, which sets any role: replace `<role>`
(`vendor | organizer | admin`) and both `<email>` placeholders first.

### Runbooks

Operational procedures live in `docs/runbooks/`, written to be followed by someone who
has not read the code:

| Runbook | When to run it |
|---|---|
| `event-week-smoke.md` | Before event week and after every promotion to `main` — `npm run smoke`, a ten-minute click-through, and the SQL that cleans up after it |
| `backup-restore.md` | The three-part backup (schema, data, `attachments` bucket) and the restore drill |
| `reset-hosted-project.md` | Returning a hosted project (dev or prod) to admin-plus-organizers only: inventory → keep-list → bucket objects through Storage → SQL in FK order → verify. Destructive; needs Owen's go per run |

### Task Workflow

New work is scoped via a Speckit spec under `specs/<nnn>-<slug>/`:

1. `spec.md` defines intent and acceptance criteria
2. `plan.md` captures the implementation approach
3. `tasks.md` breaks the plan into executable tasks
4. Implement; commit with spec or task ID (e.g., `feat(auth): consolidate role helpers [001-consolidate-role-helpers]`)
5. Run `npm run lint && npm test && npm run build` before opening a PR

See `.specify/memory/constitution.md` for full governance rules.

## Active Technologies
- TypeScript 5.x, `strict: true` (`tsconfig.json` unchanged). + Next.js 16 (App Router), React 19, `@supabase/ssr`, Vitest — all unchanged. (002-consolidate-vendor-portal)
- N/A — no schema, RLS, or data changes. (002-consolidate-vendor-portal)
- PostgreSQL 15 (Supabase hosted) — SQL DDL only; no TypeScript authored + Supabase CLI (`supabase db reset`, `supabase link`), `npm run db:types:dev`, `npm run db:types` (004-consolidate-role-migrations)
- Supabase PostgreSQL — `public.user_profiles` (canonical role table), `public.user_roles` (superseded; expected empty; targeted for drop) (004-consolidate-role-migrations)
- Next.js 16 (App Router/RSC), React 19, `react-hook-form` + `zod`, `sonner` (005-dynamic-questionnaires)
- Supabase PostgreSQL — migration `009_dynamic_questionnaires.sql` adds questionnaires, templates, and answers tables; `attachments` bucket reused for `file_upload` answers (005-dynamic-questionnaires)
- TypeScript 5.x, `strict: true` (unchanged) + PL/pgSQL for the RPC + Next.js 16 (App Router), React 19, `@supabase/ssr`, `@supabase/supabase-js` ^2.86 (already a direct dependency — used by the new test harness), Supabase CLI ^2.65.6 (devDependency), Vitest ^4 (006-close-public-data-exposure)
- Supabase PostgreSQL (hosted dev + prod; local stack via `supabase/config.toml`) + Supabase Storage bucket `attachments` (006-close-public-data-exposure)
- TypeScript 5.x, `strict: true` (unchanged) + two plain-ESM Node scripts (`scripts/smoke-check.mjs`, `scripts/filter-dump-for-local.mjs`) + Markdown runbooks; Next.js 16 Route Handler for `/api/keepalive` + `vercel.json` cron; `zod` env modules (`src/lib/env-public.ts`, `src/lib/env.ts`); Supabase CLI 2.65.6 `db dump` / `storage cp` in the backup runbook — no new packages (007-production-readiness)
- Supabase PostgreSQL unchanged — no migration; backups are local files under `backup/` (git-ignored) plus a copy of the `attachments` bucket (007-production-readiness)
- TypeScript 5.x, `strict: true` (unchanged); plain-ESM Node for `scripts/smoke-check.mjs`; POSIX shell (`bash`, shellcheck-clean) for `deploy/bin/*`; YAML for Compose, GitHub Actions and Ansible; Caddyfile; Markdown runbooks + Next.js 16.0.7 (App Router; `output: 'standalone'`, `experimental.serverActions.bodySizeLimit`), React 19, `@supabase/ssr` ^0.8 (`cookieOptions`), `zod` ^4 (env schema), **`nodemailer` (new runtime dep) + `@types/nodemailer` (new dev dep)**, `resend` removed in US6; Supabase CLI 2.65.6 (`db push --db-url`, `gen types --local`); Docker Engine + Compose v2 on both hosts; Caddy 2 (official image, pinned); `supabase/postgres` 17.6.1.063, `gotrue` v2.196.0, `postgrest` v14.1, `storage-api` v1.73.1 (the local CLI stack's tags — research R5); restic (Debian package); WireGuard (`wireguard-tools`); `ddclient` (Debian package); Uptime Kuma 2.x (container, desktop only); Ansible ≥ 2.16 with `community.docker`, `community.general`, `ansible.posix` (008-self-hosted-infrastructure)
- Postgres 17 on the Pi's NVMe under `/srv/holigay/db/data`; storage-api `file` backend under `/srv/holigay/storage`; `db-config` (pgsodium key) under `/srv/holigay/db/config`; backups in `/srv/backup/latest/` then restic → SFTP on the desktop + Backblaze B2 (008-self-hosted-infrastructure)
- TypeScript 5.9, `strict: true` (unchanged); PL/pgSQL for one view migration + Next.js 16.0.7 App Router (Route Handler + RSC page), React 19, `@supabase/ssr` ^0.8 (cookie-backed server client), `@supabase/supabase-js` ^2.86 (`auth.verifyOtp`, `auth.admin.inviteUserByEmail`, `auth.admin.generateLink` in tests), `react-hook-form` + `zod` ^4 + `@hookform/resolvers`, `sonner`. **No new packages** (009-organizer-invites)
- Supabase PostgreSQL — migration `013_users_with_roles_invite_pending.sql` (additive column on the `users_with_roles` view). No new tables, no RLS changes, `attachments` bucket untouched (009-organizer-invites)
- TypeScript 5.9, `strict: true` (unchanged); no SQL + Next.js 16.0.7 App Router (edge middleware `NextResponse.rewrite`, client page, server action), React 19, `zod` ^4 (`z.enum().default()`, `z.string().trim().optional()`), `@supabase/supabase-js` ^2.86 (`auth.admin.inviteUserByEmail`, unchanged), `sonner`. **No new packages** (010-invite-only-uat)
- none changed — `auth.users`, `user_profiles`, `vendors`, `users_with_roles` read and written exactly as spec 009 left them; `handle_new_user` (migration `003`) does the vendor link (010-invite-only-uat)

## Recent Changes
- 007-production-readiness (M3; closed 2026-10-08): env contract keyed on `VERCEL_ENV` (production-only strictness, `resend.dev` refused — PR #10); email-warning parity for the dynamic form; `/api/keepalive` daily Vercel cron reading one row from both Supabase projects (first green run 2026-10-08); `npm run smoke` + the event-week and backup/restore runbooks; Resend sending domain verified 2026-09-20; organizer session 2026-10-06/07 with its fixes in PRs #55–#57; `dev` → `main` 2026-10-07; prod smoke + live submission 2026-10-08. Evidence: `specs/007-production-readiness/quickstart.md`.
- 010-invite-only-uat (shipped 2026-09-28; prod checks 2026-10-07): the training deployment becomes invite-only — dev sign-up off, `NEXT_PUBLIC_INVITE_ONLY=true` on Preview hides the Login sign-up link, 404s `/signup` from the middleware and makes `signUp` refuse; the Team page invite form gains an Organizer/Vendor role picker (`inviteSchema.role`, default organizer). Production keeps open vendor sign-up; its sign-up copy fixes (#58, #59) have been on prod since the 2026-10-08 promotion. No migration, no packages.
- 009-organizer-invites (shipped to `dev` 2026-09-27, prod configured 2026-10-07, first onboarding rehearsed 2026-10-08): real organizer invitations over a contained service-role client (`src/lib/supabase/admin.ts`, imported only by `src/lib/actions/team.ts` behind `requireRole('admin')`; `src/test/admin-client-containment.test.ts` asserts it); `GET /auth/confirm` consumes every emailed link via `verifyOtp`; `/set-password` and `/forgot-password` pages; Pending badge and Resend on the Team page; migration `013` adds `invite_pending` to `users_with_roles`. Constitution 1.1.2 drops the acknowledged `team.ts` stub.
- 008-self-hosted-infrastructure (designed 2026-09-19; deferred post-launch): move off Vercel, hosted Supabase and the Resend SDK onto a Raspberry Pi 5 (prod) and a desktop (staging/backup) running the trimmed Supabase stack behind Caddy, restic backups, Cloudflare-proxied DNS, WireGuard, Ansible. No application rewrite; `APP_ENV` replaces `VERCEL_ENV`, nodemailer replaces the Resend SDK. Design record: `specs/008-self-hosted-infrastructure/research.md`; eight review findings to fold in first (`review-2026-09-19.md`).
- 005 Phase 11 (atomic questionnaire save, 2026-09-14): `saveEventQuestionnaire` replaces the four per-question actions; one `save_event_questionnaire` RPC call (migration 012); the template seed uses the same RPC and records `seeded_from_template_id`; real-database suites `questionnaire-save.test.ts` and `template-writes.test.ts`.
- 006-close-public-data-exposure (2026-08-22; prod 2026-09-13): migration 011 drops every broad `anon` policy on the private tables and routes public submissions through the transactional `submit_public_application(jsonb)` RPC; storage rules in SQL; `deleteFile` and `src/app/test-upload/` removed; a `src/test/security/` Vitest project proves the posture against a real Supabase stack on every PR.
- 005-dynamic-questionnaires (2026-08-22): per-event dynamic questionnaires with templates, show-if branching and lock-on-publish (migration 009); vendors fill dynamic forms at `/apply`, organizers build at `/dashboard/events/[id]`.
