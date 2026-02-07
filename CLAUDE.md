# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Holigay Vendor Market is a vendor application platform for marketplace events. Vendors can apply to participate in events, upload product photos, and track their application status. Built with Next.js 16 (App Router), Supabase, and TypeScript.

## Development Commands

```bash
npm run dev              # Start development server (localhost:3000)
npm run build            # Production build
npm run lint             # Run ESLint
npm run lint:fix         # Fix ESLint issues
npm run format           # Format with Prettier
npm test                 # Run tests once
npm run test:watch       # Run tests in watch mode
npm run test:coverage    # Generate coverage report
npm run db:types         # Regenerate Supabase types from remote schema
```

## Architecture

### Tech Stack
- **Framework**: Next.js 16 with App Router, React 19, TypeScript
- **Database**: Supabase (PostgreSQL) with Row Level Security
- **Auth**: Supabase Auth (email/password) with cookie-based sessions
- **Forms**: React Hook Form + Zod validation
- **Styling**: Tailwind CSS v4
- **Testing**: Vitest + React Testing Library

### Key Directories
```
src/
├── app/                    # Next.js App Router pages
│   ├── (auth)/            # Auth pages (login, signup) - redirect if logged in
│   └── dashboard/         # Protected routes - require auth
├── components/
│   ├── auth/              # Login/signup form components
│   ├── forms/             # Form components (vendor application)
│   └── ui/                # Reusable UI components
├── lib/
│   ├── actions/           # Server actions (auth.ts, applications.ts)
│   ├── supabase/          # Supabase clients (client.ts, server.ts, middleware.ts)
│   └── validations/       # Zod schemas (auth.ts, application.ts)
└── types/
    └── database.ts        # Auto-generated Supabase types (do not edit manually)
```

### Database Schema
Core tables with RLS enabled:
- `events` - Marketplace events with dates, location, status
- `vendors` - Business info (name, contact, description) + `user_id` link
- `applications` - Vendor applications linking vendors to events
- `attachments` - File uploads for applications (stored in Supabase Storage)
- `user_profiles` - Links auth.users to roles (vendor/organizer/admin)

### Authentication Flow
1. Middleware (`src/middleware.ts`) checks auth state on every request
2. Protected routes (`/dashboard/*`) redirect to `/login?redirectTo=...` if unauthenticated
3. Auth routes (`/login`, `/signup`) redirect to `/dashboard` if already authenticated
4. Server actions in `src/lib/actions/auth.ts` handle signIn, signUp, signOut

### Server Actions Pattern
All server actions use this pattern:
```typescript
'use server'
import { createServerClient } from '@/lib/supabase/server'

export async function actionName(data: ValidatedInput): Promise<ActionResponse> {
  const supabase = await createServerClient()
  // Validate input with Zod schema first
  // Perform database operation
  // Return typed response
}
```

### Form Validation
Zod schemas in `src/lib/validations/` define validation rules and infer TypeScript types:
- `auth.ts` - Login/signup validation
- `application.ts` - Vendor application with file upload validation (max 10MB, images/PDFs)

### Supabase Clients
- `client.ts` - Browser client for client components
- `server.ts` - Server client for server actions and RSC
- `middleware.ts` - Helper for Next.js middleware session refresh

## Environment Variables

Required in `.env.local`:
```
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...   # Server-only, for admin operations
RESEND_API_KEY=re_...              # Email sending
```

Note: `SUPABASE_SERVICE_ROLE_KEY` is only needed for Epic 4 (organizer invites).

## Path Alias

Use `@/` prefix for imports from `src/`:
```typescript
import { cn } from '@/lib/utils'
import { createServerClient } from '@/lib/supabase/server'
```

## Current Development Phase

**Phase: RBAC Implementation**

Implementing role-based access control with 3 roles:
- **Vendor**: Public signup, can view own applications and profile
- **Organizer**: Invite-only, can manage all events and applications
- **Admin**: Full access, can invite organizers and manage system

See `TASKS.md` for detailed task tracking (Epic 1-7 backlog).

### Role System (In Progress)

Once RBAC migrations are applied:

**Database:**
- `user_profiles` table links `auth.users` to roles
- `get_user_role()` SQL function for RLS policies
- Trigger auto-creates profile on signup with `role='vendor'`

**Application:**
- `src/lib/auth/roles.ts` - Role checking utilities
- Middleware checks role for route protection
- Server actions validate role before mutations

### Route Structure

```
/                       # Public landing
/apply                  # Public application form
/login, /signup         # Auth (redirect if logged in)
/vendor-dashboard/*     # Vendor routes (vendor role)
/dashboard/*            # Organizer routes (organizer/admin)
/dashboard/team         # Admin only
```

### Admin Bootstrap

After applying RBAC migrations (`003` through `005`), create the first admin:

1. Apply all migrations in Supabase SQL Editor (in order: `003_user_profiles.sql`, `004_vendors_user_link.sql`, `005_rbac_rls_policies.sql`)
2. Sign up with your admin email at `/signup` (this auto-creates a `vendor` profile)
3. Open `scripts/seed-admin.sql`, replace `your-email@example.com` with your email
4. Run the script in Supabase SQL Editor — it promotes your account to `admin` and prints a verification row

Alternatively, run the UPDATE directly:
```sql
UPDATE user_profiles
SET role = 'admin'
WHERE id = (SELECT id FROM auth.users WHERE email = 'your-email@example.com');
```

### Task Workflow

For implementing tasks from TASKS.md:

1. Reference task by ID (e.g., "Complete task 1.1.1")
2. Complete the task scope
3. Verify acceptance criteria
4. Run tests: `npm test && npm run build`
5. Commit with task ID: `feat(rbac): create user_profiles table [1.1.1]`
