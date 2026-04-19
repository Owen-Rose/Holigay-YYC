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
npm run db:types         # Regenerate Supabase types (production)
npm run db:types:dev     # Regenerate Supabase types (dev)
```

## Architecture

### Tech Stack
- **Framework**: Next.js 16 with App Router, React 19, TypeScript
- **Database**: Supabase (PostgreSQL) with Row Level Security
- **Auth**: Supabase Auth (email/password) with cookie-based sessions
- **Forms**: React Hook Form + Zod validation
- **Styling**: Tailwind CSS v4
- **Email**: Resend (transactional emails for application status updates)
- **Testing**: Vitest + React Testing Library
- **CI**: GitHub Actions (`.github/workflows/ci.yml`)

### Key Directories
```
src/
├── app/                        # Next.js App Router pages
│   ├── (auth)/                # Auth pages (login, signup) - redirect if logged in
│   ├── (public)/              # Public pages (landing, apply)
│   ├── (vendor)/              # Vendor portal layout group
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
├── test/                       # Test files and setup
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
- `get_user_role()` SQL function (used in RLS policies)
- `handle_new_user` trigger (auto-creates profile on signup, links existing vendors by email)
- `users_with_roles` view (joins auth.users with profiles for admin queries)

### Authentication & Authorization Flow
1. Middleware (`src/middleware.ts`) checks auth state and fetches role on every request
2. **Unauthenticated** users on protected routes → redirect to `/login?redirectTo=...`
3. **Authenticated vendors** accessing `/dashboard` → redirect to `/vendor-dashboard`
4. **Non-admins** accessing `/dashboard/team` → redirect to `/dashboard`
5. Auth routes (`/login`, `/signup`) redirect authenticated users to their role-appropriate dashboard
6. Server actions in `src/lib/actions/` validate role with `requireRole()` or `isOrganizerOrAdmin()` before mutations

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
- `vendor-dashboard.ts` / `vendor-portal.ts` - vendor-specific data fetching
- `team.ts` - organizer invite (partially implemented)
- `admin.ts` - admin operations
- `upload.ts` - file upload handling
- `export.ts` - data export
- `roles.ts` - role-related operations

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

**Phase: UI/UX Brand Re-skin (Epic 6)**

Epics 1-5 are complete. The RBAC system, vendor dashboard, event management, and core platform features are all functional.

See `TASKS.md` for detailed task tracking (Epic 1-7 backlog).

### Completed Epics
- **Epic 1** (Complete): RBAC database layer - user_profiles, roles, RLS policies
- **Epic 2** (Complete): RBAC application layer - middleware, server action guards, role utilities
- **Epic 3** (Complete): Vendor dashboard - application tracking, profile management
- **Epic 4** (Partial): Organizer invite system - UI done (4.1.x), backend pending (4.2.x needs service role client)
- **Epic 5** (Complete): Event management - full CRUD, status workflow, public filtering

### Current Epic: 6 - UI/UX & Brand Re-skin
The app needs to be re-skinned from generic blue/white to the Holigay Events YYC brand identity: dark `#1C171C` background, Quicksand font, violet (`#A78BFA`) primary, rainbow accents. Brand reference: [holigayeventsyyc.carrd.co](https://holigayeventsyyc.carrd.co/). See TASKS.md Story 6.1-6.10 for detailed subtasks.

### Future: Epic 7 - Dynamic Application Forms
Low priority, deferred. Current static form works for MVP.

### Role System (Complete)

**Database:**
- `user_profiles` table links `auth.users` to roles
- `get_user_role()` SQL function for RLS policies
- `handle_new_user` trigger auto-creates profile on signup with `role='vendor'`
- Trigger also links existing vendors by matching email

**Application:**
- `src/lib/auth/roles.ts` - `getCurrentUserRole()`, `requireRole()`, `isOrganizerOrAdmin()`
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

Migrations in `supabase/migrations/` (applied in order):
1. `001_initial_schema.sql` - Core tables (events, vendors, applications, attachments)
2. `002_rls_policies.sql` - Initial RLS policies
3. `003_user_profiles.sql` / `003_user_roles.sql` - User profiles table and role enum
4. `004_vendors_user_link.sql` / `004_user_roles_rls.sql` - Vendor-user linking, role RLS
5. `005_rbac_rls_policies.sql` / `005_users_with_roles_view.sql` - Full RBAC policies, admin view
6. `006_rbac_rls_updates.sql` / `006_users_with_roles_view.sql` - RBAC refinements

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

For implementing tasks from TASKS.md:

1. Reference task by ID (e.g., "Complete task 6.1.1")
2. Complete the task scope
3. Verify acceptance criteria
4. Run tests: `npm test && npm run build`
5. Commit with task ID: `feat(scope): description [task-id]`

## Active Technologies
- TypeScript 5.x, strict mode (`tsconfig.json`) + Next.js 16 (App Router), React 19, `@supabase/ssr`, Vitest, `@testing-library/react` (001-consolidate-role-helpers)
- N/A — no schema or data changes (001-consolidate-role-helpers)

## Recent Changes
- 001-consolidate-role-helpers: Added TypeScript 5.x, strict mode (`tsconfig.json`) + Next.js 16 (App Router), React 19, `@supabase/ssr`, Vitest, `@testing-library/react`
