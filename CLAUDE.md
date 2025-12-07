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
Four main tables with RLS enabled:
- `events` - Marketplace events with dates, location, status
- `vendors` - Business info (name, contact, description)
- `applications` - Vendor applications linking vendors to events
- `attachments` - File uploads for applications (stored in Supabase Storage)

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
```

## Path Alias

Use `@/` prefix for imports from `src/`:
```typescript
import { cn } from '@/lib/utils'
import { createServerClient } from '@/lib/supabase/server'
```

## Current Development Phase

Currently in Phase 4: Building the vendor application form. See `TASKS.md` for detailed task tracking.
