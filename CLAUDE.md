# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Holigay Vendor Market is a vendor application platform for marketplace events. Vendors can apply to participate in events, upload product photos, and track their application status. Built with Next.js 16 (App Router), Supabase, and TypeScript.

## Development Commands

```bash
npm run dev                          # Start development server (localhost:3000)
npm run build                        # Production build
npm run lint                         # Run ESLint
npm run lint:fix                     # Fix ESLint issues
npm run format                       # Format with Prettier
npm test                             # Run tests once
npm run test:watch                   # Run tests in watch mode
npm test -- src/test/specific.test.tsx  # Run a single test file
npm run test:coverage                # Generate coverage report
npm run db:types                     # Regenerate Supabase types from remote schema
```

## Architecture

### Tech Stack
- **Framework**: Next.js 16 with App Router, React 19, TypeScript
- **Database**: Supabase (PostgreSQL) with Row Level Security
- **Auth**: Supabase Auth (email/password) with cookie-based sessions
- **Email**: Resend for transactional emails
- **Forms**: React Hook Form + Zod validation
- **Styling**: Tailwind CSS v4
- **Testing**: Vitest + React Testing Library

### Route Structure
```
src/app/
├── (public)/           # Public pages (landing, apply form) - no auth required
├── (auth)/             # Auth pages (login, signup) - redirect to dashboard if logged in
├── dashboard/          # Protected organizer routes - redirect to login if not authenticated
│   ├── applications/   # Application management
│   │   └── [id]/       # Single application detail view
│   └── page.tsx        # Dashboard home with stats
└── page.tsx            # Root redirect
```

### Key Directories
```
src/
├── components/
│   ├── auth/              # Login/signup form components
│   ├── dashboard/         # Dashboard-specific components (table, filters, export)
│   ├── forms/             # Form components (vendor application)
│   └── ui/                # Reusable UI primitives (button, input, card, etc.)
├── lib/
│   ├── actions/           # Server actions (auth, applications, upload, export)
│   ├── constants/         # Shared constants (application-status.ts)
│   ├── email/             # Resend client and email templates
│   ├── supabase/          # Supabase clients (client.ts, server.ts, middleware.ts)
│   └── validations/       # Zod schemas (auth.ts, application.ts)
└── types/
    └── database.ts        # Auto-generated Supabase types (do not edit manually)
```

### Database Schema
Four main tables with RLS enabled:
- `events` - Marketplace events with dates, location, status
- `vendors` - Business info (name, contact, description)
- `applications` - Vendor applications linking vendors to events (status: pending/approved/rejected/waitlisted)
- `attachments` - File uploads for applications (stored in Supabase Storage)

### Authentication Flow
1. Middleware (`src/middleware.ts`) checks auth state on every request
2. Protected routes (`/dashboard/*`) redirect to `/login?redirectTo=...` if unauthenticated
3. Auth routes (`/login`, `/signup`) redirect to `/dashboard` if already authenticated
4. Server actions in `src/lib/actions/auth.ts` handle signIn, signUp, signOut

### Server Actions Pattern
All server actions use this pattern with typed responses:
```typescript
'use server'
import { createClient } from '@/lib/supabase/server'

type ActionResponse = {
  success: boolean
  error: string | null
  data: SomeType | null
}

export async function actionName(data: ValidatedInput): Promise<ActionResponse> {
  const supabase = await createClient()
  // Validate input with Zod schema first
  // Perform database operation
  // Return typed response
}
```

### Supabase Clients
- `client.ts` - Browser client (`createClient()`) for client components
- `server.ts` - Server client (`createClient()`) for server actions and RSC - uses cookies
- `middleware.ts` - Inline client creation in Next.js middleware for session refresh

### Form Validation
Zod schemas in `src/lib/validations/` define validation rules and infer TypeScript types:
- `auth.ts` - Login/signup validation
- `application.ts` - Vendor application with file upload validation (max 10MB, images/PDFs, max 5 files)

## Environment Variables

Required in `.env.local`:
```
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
RESEND_API_KEY=re_...
```

## Path Alias

Use `@/` prefix for imports from `src/`:
```typescript
import { cn } from '@/lib/utils'
import { createClient } from '@/lib/supabase/server'
```

## Current Development Phase

Currently in Phase 7 (complete), Phase 8 (Deployment) pending. See `TASKS.md` for detailed task tracking.
