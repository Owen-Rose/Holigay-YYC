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
│   ├── api/                   # API routes (email preview/test)
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
│   ├── supabase/              # Supabase clients (client, server, middleware)
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
- `SECURITY DEFINER` RPCs for atomic multi-table writes: `submit_public_application(jsonb)` (the only public-submission write path — `anon`/`authenticated` may execute it), `create_event_with_default_questionnaire(jsonb)` and `ensure_event_questionnaire(uuid)` (organizer-only — `anon` EXECUTE revoked by migration 011).

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
- `team.ts` - organizer invite (partially implemented)
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
- `middleware.ts` - Helper for Next.js middleware session refresh

### Email System
- `src/lib/email/client.ts` - Resend client configuration
- `src/lib/email/templates/` - HTML email templates
  - `application-received.ts` - Sent when vendor submits an application
  - `status-update.ts` - Sent when application status changes
- API routes at `/api/preview-email` and `/api/test-email` for development testing

## Environment Variables

Required in `.env.local`:
```
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
RESEND_API_KEY=re_...              # Email sending (logged to console if unset)
```

Optional:
```
SUPABASE_SERVICE_ROLE_KEY=eyJ...   # Server-only, needed for organizer invites (Epic 4)
EMAIL_FROM_ADDRESS=Holigay Vendor Market <noreply@yourdomain.com>  # Custom sender
```

## Path Alias

Use `@/` prefix for imports from `src/`:
```typescript
import { cn } from '@/lib/utils'
import { createServerClient } from '@/lib/supabase/server'
```

## Current Development Phase

Specs 005 and 006 shipped to `dev` together in PR #7 (2026-08-22) — one 13-commit fast-forward; their histories were inseparable. Migration `011` is applied to the **dev** Supabase project and the closed posture is verified there; **prod has not been rolled out yet** (see `specs/006-close-public-data-exposure/quickstart.md`). Next up is spec 005's remaining work: the T050 manual walkthrough, plus the two Tier 2 defects — non-atomic questionnaire-builder saves and the never-populated `seeded_from_template_id`. Specs 001 / 002 / 004 are merged; all `docs/cleanup-roadmap.md` workstreams are complete (that file is historical — current planning lives in `docs/ROADMAP.md`). See `specs/README.md` for an at-a-glance status of every spec.

### Epic status snapshot
- **Epic 1** (Complete): RBAC database layer
- **Epic 2** (Complete): RBAC application layer
- **Epic 3** (Complete): Vendor dashboard
- **Epic 4** (Partial): Organizer invite system — UI complete; backend (4.2.x) pending service-role client
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

### Admin Bootstrap

After applying all migrations, create the first admin:

1. Sign up at `/signup` (auto-creates a `vendor` profile)
2. Run in Supabase SQL Editor:
```sql
UPDATE user_profiles
SET role = 'admin'
WHERE id = (SELECT id FROM auth.users WHERE email = 'your-email@example.com');
```

Or use `scripts/seed-admin.sql` (replace email first).

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

## Recent Changes
- 006-close-public-data-exposure: Closed the anon-key data exposure. Migration 011 drops every broad `anon` policy on the private tables and routes public submissions through the transactional `submit_public_application(jsonb)` RPC; storage rules moved from the dashboard into SQL; `deleteFile` and `src/app/test-upload/` removed; required-answer emptiness is now enforced per answer kind on both client and server; a `src/test/security/` Vitest project proves the posture against a real Supabase stack on every PR.
- 005-dynamic-questionnaires: Per-event dynamic questionnaires with templates, show-if branching, and lock-on-publish. Migration 009 adds 5 RLS-gated tables; vendors fill dynamic forms at `/apply`, organizers build at `/dashboard/events/[id]`.
- 002-consolidate-vendor-portal: Added TypeScript 5.x, `strict: true` (`tsconfig.json` unchanged). + Next.js 16 (App Router), React 19, `@supabase/ssr`, Vitest — all unchanged.
