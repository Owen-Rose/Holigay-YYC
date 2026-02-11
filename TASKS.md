# Holigay Vendor Market - Development Backlog

> Epics 1-5: RBAC Implementation (Complete). Epic 6: Brand re-skin & UX polish. Epic 7: Dynamic forms (Future).

## Legend
- [ ] Not started
- [x] Complete

## Quick Reference

| Epic | Priority | Status |
|------|----------|--------|
| Epic 1: RBAC Database Layer | Critical | Complete |
| Epic 2: RBAC Application Layer | Critical | Complete |
| Epic 3: Vendor Dashboard | High | Complete |
| Epic 4: Organizer Invite System | Medium | In Progress |
| Epic 5: Event Management | High | Complete |
| Epic 6: UI/UX & Brand Re-skin | High | Not Started |
| Epic 7: Dynamic Forms | Low | Future |

---

## Epic 1: RBAC Foundation (Database Layer)

> **Milestone:** Roles exist in the database and RLS enforces them.
> **Depends on:** Nothing
> **Blocks:** Epic 2

### Story 1.1: Create User Profiles Table

#### Task 1.1.1: Create migration 003_user_profiles.sql
- [x] Create `user_role` enum type (`vendor`, `organizer`, `admin`)
- [x] Create `user_profiles` table with `id`, `role`, `vendor_id`, timestamps
- [x] Add indexes for role and vendor_id
- [x] Add `updated_at` trigger

**Scope:** SQL migration file only
**AC:** Migration runs without errors in Supabase SQL editor
**Test:** `SELECT * FROM user_profiles` returns empty table
**Files:** `supabase/migrations/003_user_profiles.sql`

#### Task 1.1.2: Create handle_new_user trigger
- [x] Create trigger function that inserts profile on auth.users insert
- [x] Default role is `vendor`
- [x] Link to existing vendor if email matches (see Task 1.2.2)

**Scope:** SQL in same or separate migration
**AC:** New signup creates row in user_profiles with role='vendor'
**Test:** Sign up new user, check `user_profiles` table

#### Task 1.1.3: Create get_user_role() helper function
- [x] Create SQL function returning current user's role
- [x] Use `SECURITY DEFINER` and `STABLE`

**Scope:** SQL function
**AC:** `SELECT get_user_role()` returns role for authenticated user
**Test:** Run in SQL editor with auth context

---

### Story 1.2: Link Vendors to Users

#### Task 1.2.1: Create migration 004_vendors_user_link.sql
- [x] Add `user_id UUID REFERENCES auth.users(id)` to vendors table
- [x] Add index on `user_id`
- [x] Column should be nullable (existing vendors don't have users)

**Scope:** SQL migration
**AC:** Column exists, `SELECT user_id FROM vendors` works
**Files:** `supabase/migrations/004_vendors_user_link.sql`

#### Task 1.2.2: Update handle_new_user trigger for vendor linking
- [x] On signup, check if vendor exists with same email
- [x] If yes, set `vendor_id` in user_profiles and `user_id` in vendors

**Scope:** Update trigger from 1.1.2
**AC:** Apply with email X, sign up with email X → linked
**Test:** Manual test with existing vendor record

---

### Story 1.3: Replace RLS Policies

#### Task 1.3.1: Create migration 005_rbac_rls_policies.sql
- [x] Drop all existing permissive policies
- [x] Create role-aware policies for `events` table
- [x] Create role-aware policies for `vendors` table
- [x] Create role-aware policies for `applications` table
- [x] Create role-aware policies for `attachments` table

**Scope:** SQL migration (will be large)
**AC:** Vendors only see own data, organizers see all
**Test:**
  - As vendor: `SELECT * FROM applications` returns only own
  - As organizer: Returns all
**Files:** `supabase/migrations/005_rbac_rls_policies.sql`

#### Task 1.3.2: Add RLS policy for user_profiles table
- [x] Users can SELECT own profile
- [x] Admins can SELECT/UPDATE all profiles
- [x] INSERT only allowed for trigger (system)

**Scope:** Add to 005 migration or separate
**AC:** Vendor cannot query other profiles
**Test:** Try to select another user's profile

---

### Story 1.4: Seed Admin User

#### Task 1.4.1: Create admin seed script
- [x] Create SQL script to promote user to admin by email
- [x] Include clear instructions

**Scope:** Single SQL file
**AC:** Running script changes user role to admin
**Files:** `scripts/seed-admin.sql`

#### Task 1.4.2: Document admin bootstrap process
- [x] Add section to CLAUDE.md explaining first-time admin setup
- [x] Include commands to run

**Scope:** Documentation only
**AC:** Clear instructions a new dev can follow
**Files:** `CLAUDE.md`

---

### Epic 1 Definition of Done
- [x] All migrations run successfully on staging
- [x] New signups get `vendor` role automatically
- [x] RLS blocks vendors from organizer data
- [x] Admin user can be seeded
- [x] Types regenerated (`npm run db:types`)

---

## Epic 2: RBAC Foundation (Application Layer)

> **Milestone:** Routes and server actions enforce roles.
> **Depends on:** Epic 1
> **Blocks:** Epics 3, 4, 5

### Story 2.1: Auth Helper Utilities

#### Task 2.1.1: Create src/lib/auth/roles.ts
- [x] `getCurrentUserRole()` - returns role or null
- [x] `requireRole(allowedRoles)` - throws if not authorized
- [x] `isOrganizerOrAdmin()` - boolean helper

**Scope:** New TypeScript file
**AC:** Functions work with current Supabase session
**Test:** Unit test or manual verification
**Files:** `src/lib/auth/roles.ts`

#### Task 2.1.2: Add role type definitions
- [x] Export `Role` type from database types or manually
- [x] Ensure TypeScript knows about `user_profiles` table

**Scope:** Type definitions
**AC:** No type errors when importing Role
**Test:** Build passes

---

### Story 2.2: Update Middleware

#### Task 2.2.1: Fetch role in middleware
- [x] After auth check, query `user_profiles` for role
- [x] Handle case where profile doesn't exist (default to vendor)

**Scope:** Modify middleware
**AC:** Role available in middleware logic
**Test:** Add console.log, verify role appears

#### Task 2.2.2: Add role-based route redirects
- [x] Vendors accessing `/dashboard` → redirect to `/vendor-dashboard`
- [x] Non-admins accessing `/dashboard/team` → redirect to `/dashboard`
- [x] Keep existing auth redirects working

**Scope:** Modify middleware
**AC:** Wrong role = redirect to appropriate dashboard
**Test:** Log in as vendor, navigate to /dashboard, verify redirect
**Files:** `src/middleware.ts`

---

### Story 2.3: Update Server Actions

#### Task 2.3.1: Add role check to updateApplicationStatus
- [x] Import role helpers
- [x] Check `isOrganizerOrAdmin()` before processing
- [x] Return error if unauthorized

**Scope:** Modify existing action
**AC:** Vendor calling action gets error response
**Test:** Call action as vendor in dev tools

#### Task 2.3.2: Add role check to updateApplicationNotes
- [x] Same pattern as 2.3.1

**Scope:** Modify existing action
**AC:** Vendor calling action gets error
**Files:** `src/lib/actions/applications.ts`

#### Task 2.3.3: Add role check to event management actions
- [x] Apply to createEvent, updateEvent, deleteEvent (when created)

**Scope:** Completed as part of Epic 5
**Note:** All event actions use `isOrganizerOrAdmin()` — see `src/lib/actions/events.ts`

#### Task 2.3.4: Update signUp action for vendor linking
- [x] After successful signup, check for existing vendor by email
- [x] If found, update `vendors.user_id` and `user_profiles.vendor_id`

**Scope:** Modify auth action
**AC:** Existing vendor gets linked on signup
**Test:** Apply as guest, sign up with same email, verify linked
**Files:** `src/lib/actions/auth.ts`
**Note:** Already handled by `handle_new_user` database trigger (Task 1.1.2/1.2.2). No application-layer changes needed.

---

### Epic 2 Definition of Done
- [x] Middleware redirects based on role
- [x] Server actions reject unauthorized requests
- [x] Vendor linking works on signup
- [x] `npm run build` passes with no errors
- [x] `npm test` passes

---

## Epic 3: Vendor Dashboard

> **Milestone:** Vendors have their own dashboard to track applications.
> **Depends on:** Epic 2
> **Blocks:** Nothing

### Story 3.1: Vendor Dashboard Layout

#### Task 3.1.1: Create /vendor-dashboard route group
- [x] Create layout with vendor-specific navigation
- [x] Include: Home, My Applications, Profile, Logout
- [x] Style similar to organizer dashboard but distinct

**Scope:** New layout file
**AC:** Vendor nav is separate from organizer nav
**Files:** `src/app/vendor-dashboard/layout.tsx`

#### Task 3.1.2: Create vendor dashboard home page
- [x] Show application status cards (pending/approved/rejected)
- [x] Show recent applications list
- [x] Counts should only include THIS vendor's applications

**Scope:** New page
**AC:** Vendor sees only their own data
**Files:** `src/app/vendor-dashboard/page.tsx`

---

### Story 3.2: Vendor Applications View

#### Task 3.2.1: Create vendor applications list page
- [x] List all applications for current vendor
- [x] Show event name, status, submission date
- [x] Link to detail view

**Scope:** New page
**AC:** Only shows applications linked to vendor's user_id
**Files:** `src/app/vendor-dashboard/applications/page.tsx`

#### Task 3.2.2: Create vendor application detail page
- [x] Read-only view of application
- [x] Show status, event info, submitted files
- [x] No edit/status change buttons (vendor can't modify)

**Scope:** New page
**AC:** Can view but not edit
**Files:** `src/app/vendor-dashboard/applications/[id]/page.tsx`

---

### Story 3.3: Vendor Profile Management

#### Task 3.3.1: Create vendor profile page
- [x] Form to edit business info (name, contact, description, website)
- [x] Pre-populate with current data
- [x] Submit updates vendor record

**Scope:** New page with form
**AC:** Changes persist after refresh
**Files:** `src/app/vendor-dashboard/profile/page.tsx`

#### Task 3.3.2: Create updateVendorProfile server action
- [x] Validate input
- [x] Ensure user can only update their own vendor record
- [x] RLS also enforces this

**Scope:** New server action
**AC:** Cannot update another vendor's profile
**Files:** `src/lib/actions/vendors.ts`

---

### Epic 3 Definition of Done
- [x] Vendor dashboard accessible at /vendor-dashboard
- [x] Vendors can view their applications
- [x] Vendors can edit their profile
- [x] RLS prevents data leakage

---

## Epic 4: Organizer Invite System

> **Milestone:** Admins can invite organizers.
> **Depends on:** Epic 2
> **Blocks:** Nothing

### Story 4.1: Team Management UI

#### Task 4.1.1: Create /dashboard/team page
- [x] List existing organizers
- [x] Show invite form (email input + button)
- [x] Admin-only access (redirect if not admin)

**Scope:** New page
**AC:** Non-admin gets redirected
**Files:** `src/app/dashboard/team/page.tsx`

#### Task 4.1.2: Create organizer invite form
- [x] Email validation
- [x] Submit button with loading state
- [x] Success/error feedback

**Scope:** Client component in team page
**AC:** Form submits to server action

---

### Story 4.2: Invite Server Action

#### Task 4.2.1: Set up Supabase Admin client
- [ ] Create server-only client using service role key
- [ ] Add `SUPABASE_SERVICE_ROLE_KEY` to .env.example

**Scope:** New Supabase client file
**AC:** Can call admin API methods
**Files:** `src/lib/supabase/admin.ts`

#### Task 4.2.2: Create inviteOrganizer action
- [ ] Check current user is admin
- [ ] Create user via `auth.admin.inviteUserByEmail`
- [ ] Update user_profiles to set role='organizer'
- [ ] Handle errors gracefully

**Scope:** New server action
**AC:** Invited user receives email, can log in as organizer
**Files:** `src/lib/actions/team.ts`

#### Task 4.2.3: Add SUPABASE_SERVICE_ROLE_KEY to env
- [ ] Add to `.env.local`
- [ ] Document in `.env.example`

**Scope:** Environment config
**AC:** Action doesn't error on missing key

---

### Epic 4 Definition of Done
- [ ] Admin can access /dashboard/team
- [ ] Non-admins are redirected
- [ ] Invite sends email to new organizer
- [ ] Invited organizer can log in and access dashboard

---

## Epic 5: Event Management

> **Milestone:** Organizers can create and manage events.
> **Depends on:** Epic 2
> **Blocks:** Nothing

### Story 5.1: Events List Page

#### Task 5.1.1: Create /dashboard/events page
- [x] List all events with status badges
- [x] Show draft, active, closed
- [x] Link to edit page
- [x] "Create Event" button

**Scope:** New page
**AC:** All events visible with correct statuses
**Files:** `src/app/dashboard/events/page.tsx`

#### Task 5.1.2: Create getEvents server action
- [x] Fetch all events
- [x] Include application count per event
- [x] Order by event_date descending

**Scope:** New server action
**AC:** Returns events with stats
**Files:** `src/lib/actions/events.ts`

---

### Story 5.2: Event Create/Edit

#### Task 5.2.1: Create event form component
- [x] Fields: name, description, event_date, location, deadline, status, max_vendors
- [x] Validation with Zod
- [x] Reusable for create and edit

**Scope:** New form component
**AC:** Validates required fields
**Files:** `src/components/forms/event-form.tsx`

#### Task 5.2.2: Create /dashboard/events/new page
- [x] Render event form in create mode
- [x] Submit creates event
- [x] Redirect to events list on success

**Scope:** New page
**AC:** Can create new event
**Files:** `src/app/dashboard/events/new/page.tsx`

#### Task 5.2.3: Create /dashboard/events/[id] page
- [x] Fetch event by ID
- [x] Render form with existing values
- [x] Submit updates event

**Scope:** New page
**AC:** Can edit existing event
**Files:** `src/app/dashboard/events/[id]/page.tsx`

#### Task 5.2.4: Create event CRUD server actions
- [x] `createEvent` - validate, insert, return ID
- [x] `updateEvent` - validate, update by ID
- [x] `deleteEvent` - hard delete (blocked if event has applications)
- [x] All actions check organizer/admin role

**Scope:** Add to events.ts
**AC:** Vendor cannot create/update/delete events
**Files:** `src/lib/actions/events.ts`

---

### Story 5.3: Event Status Workflow

#### Task 5.3.1: Add event status transitions
- [x] draft → active (publish)
- [x] active → closed (end applications)
- [x] Add UI controls for status changes

**Scope:** Events list page + server action
**AC:** Can activate and close events

#### Task 5.3.2: Hide closed events from public apply page
- [x] Update /apply page query
- [x] Only show events with status='active'

**Scope:** Verified existing query in getActiveEvents()
**AC:** Closed events not in dropdown

---

### Epic 5 Definition of Done
- [x] Organizers can create, edit, delete events
- [x] Event status workflow works
- [x] Only active events shown to public
- [x] Dashboard nav links to events page

---

## Epic 6: UI/UX Improvements

> **Milestone:** Re-skin the app to match the Holigay Events YYC brand identity, then polish UX.
> **Depends on:** Epics 3, 5
> **Blocks:** Nothing
>
> **Brand Reference:** [holigayeventsyyc.carrd.co](https://holigayeventsyyc.carrd.co/)
> The current app uses a generic corporate blue/white/Geist Sans theme. The actual brand is dark (`#1C171C`),
> warm, pride-inclusive with Quicksand font and rainbow accents. This epic aligns the platform with the brand.

### Story 6.1: Brand Foundation (Theme & Font)

> Set up the color palette, CSS custom properties, and font that everything else depends on.

#### Task 6.1.1: Rewrite globals.css with brand color system
- [ ] Remove light/dark media query (dark-only design)
- [ ] Define all CSS custom properties in `:root`:
  - `--background: #1C171C` (warm near-black from Carrd)
  - `--foreground: #F5F0F5` (warm off-white, 13:1 contrast)
  - `--surface: #2A2230` (card/panel backgrounds)
  - `--surface-bright: #352D3B` (elevated surfaces, hover states)
  - `--border: #4A3F52` (input borders)
  - `--border-subtle: #3A3142` (card borders, dividers)
  - `--muted: #A89BB2` (secondary text, 5.1:1 contrast)
  - `--muted-foreground: #8B7D96` (placeholders, tertiary text)
  - `--primary: #A78BFA` (violet-400, replaces blue-600)
  - `--primary-hover: #8B5CF6` (violet-500)
  - `--primary-soft: rgba(167,139,250,0.15)` (active nav, icon bgs)
  - `--primary-foreground: #1C171C` (text on primary buttons)
- [ ] Register all tokens in `@theme inline` for Tailwind v4 (enables `bg-surface`, `text-muted`, `border-border`, etc.)
- [ ] Define rainbow gradient: `linear-gradient(135deg, #EF4444, #F97316, #EAB308, #22C55E, #3B82F6, #A78BFA)`
- [ ] Add subtle radial gradient pattern on `body::before` for depth (no image files)
- [ ] Set body font-family and background

**Scope:** Rewrite `src/app/globals.css`
**AC:** Background is `#1C171C`, text is warm off-white, Tailwind utility classes like `bg-surface` and `text-primary` work
**Test:** `npm run build` passes; open localhost:3000 and verify dark background
**Files:** `src/app/globals.css`

#### Task 6.1.2: Swap Geist font for Quicksand
- [ ] Replace `Geist` + `Geist_Mono` imports with `Quicksand` from `next/font/google`
- [ ] Configure weights 300, 400, 500, 600, 700
- [ ] Set CSS variable `--font-quicksand`
- [ ] Apply variable class to `<body>`
- [ ] Update `@theme inline` to use `--font-quicksand` as `--font-sans`
- [ ] Fix root metadata title from "Create Next App" to "Holigay Events YYC"

**Scope:** Modify root layout
**AC:** All text renders in Quicksand (rounded letterforms); page title is correct
**Test:** Inspect font in browser DevTools; check `<title>` tag
**Files:** `src/app/layout.tsx`, `src/app/globals.css`

---

### Story 6.2: Layout Re-skin

> Update the layout shells (headers, sidebars, footers) so all child pages inherit the dark theme.

#### Task 6.2.1: Re-skin public layout
- [ ] Header: `bg-surface/80 backdrop-blur-lg border-b border-border-subtle` (glassmorphic sticky)
- [ ] Add 2px rainbow gradient decorative bar at very top of page
- [ ] Brand text: `text-foreground font-bold`, hover: `text-primary`
- [ ] "Sign In" link: `text-muted hover:text-primary`
- [ ] Footer: `border-t border-border-subtle`, `text-muted-foreground`
- [ ] Remove any `bg-gray-50` or `bg-white` references

**Scope:** Modify public layout
**AC:** Public pages have dark header/footer with glassmorphic effect and rainbow top bar
**Test:** Navigate to `/` — header is dark with visible border, rainbow bar at top
**Files:** `src/app/(public)/layout.tsx`

#### Task 6.2.2: Re-skin auth layout
- [ ] Remove `bg-gray-50` wrapper
- [ ] Auth card: `bg-surface border border-border-subtle rounded-xl backdrop-blur-sm shadow-xl`
- [ ] Brand text: `text-foreground`
- [ ] Back link: `text-muted-foreground hover:text-primary`

**Scope:** Modify auth layout
**AC:** Login/signup pages have dark card on dark background
**Test:** Navigate to `/login` — no white elements
**Files:** `src/app/(auth)/layout.tsx`

#### Task 6.2.3: Re-skin organizer dashboard layout
- [ ] Sidebar/header: `bg-surface` (replaces `bg-white`)
- [ ] All borders: `border-border-subtle` (replaces `border-gray-200`)
- [ ] Active nav: `bg-primary-soft text-primary` (replaces `bg-blue-50 text-blue-700`)
- [ ] Admin nav items: `bg-purple-500/15 text-purple-400`
- [ ] Hover states: `hover:bg-surface-bright` (replaces `hover:bg-gray-100`)
- [ ] Text: `text-foreground` / `text-muted` / `text-muted-foreground` (replaces gray scale)
- [ ] Overlay: `bg-black/60` (replaces `bg-gray-900/50`)
- [ ] Logout: `hover:bg-red-500/10 hover:text-red-400`

**Scope:** Systematic class replacement in organizer dashboard layout
**AC:** Sidebar and header are dark with violet accent on active nav
**Test:** Log in as organizer, verify sidebar/header are dark with correct accents
**Files:** `src/app/dashboard/layout.tsx`

#### Task 6.2.4: Re-skin vendor dashboard layout
- [ ] Same treatment as 6.2.3 (dark surfaces, dark borders, dark text)
- [ ] Keep teal accent for differentiation: `bg-teal-500/15 text-teal-400` (replaces `bg-teal-50 text-teal-700`)

**Scope:** Systematic class replacement in vendor dashboard layout
**AC:** Vendor sidebar is dark with teal accent on active nav
**Test:** Log in as vendor, verify dark sidebar with teal accents
**Files:** `src/app/vendor-dashboard/layout.tsx`

#### Task 6.2.5: Re-skin vendor portal layout
- [ ] Same treatment as 6.2.4

**Scope:** Systematic class replacement
**AC:** Vendor portal layout matches vendor dashboard dark theme
**Files:** `src/app/(vendor)/layout.tsx`

---

### Story 6.3: UI Component Library Re-skin

> Re-skin all shared UI components. Since pages import these everywhere, changes cascade globally.

#### Task 6.3.1: Re-skin Button component
- [ ] `primary`: `bg-primary text-primary-foreground hover:bg-primary-hover focus:ring-primary/50`
- [ ] `secondary`: `bg-surface-bright text-foreground hover:bg-surface-bright/80`
- [ ] `outline`: `border border-border bg-transparent text-foreground hover:bg-surface-bright`
- [ ] `ghost`: `text-muted hover:bg-surface-bright hover:text-foreground`
- [ ] `danger`: keep `bg-red-600 text-white` but update ring to `focus:ring-red-500/50`
- [ ] Add `focus:ring-offset-background` to all variants so ring offset matches dark bg

**Scope:** Update variant styles in Button component
**AC:** All buttons have violet primary, dark outline/ghost, correct focus rings on dark bg
**Test:** View any page with buttons; verify primary is violet, outline has dark background
**Files:** `src/components/ui/button.tsx`

#### Task 6.3.2: Re-skin Card component
- [ ] Base styles: `rounded-xl border bg-surface/80 backdrop-blur-sm`
- [ ] Default variant: `border-border-subtle`
- [ ] Interactive variant: `hover:shadow-lg hover:shadow-primary/5 hover:border-border`
- [ ] Outlined variant: `border-border`
- [ ] Add new `glass` variant: `border-border-subtle/50 bg-surface/50 backdrop-blur-lg`
- [ ] CardTitle: `text-foreground` (replaces `text-gray-900`)
- [ ] CardDescription: `text-muted` (replaces `text-gray-500`)
- [ ] CardHeader/CardFooter borders: `border-border-subtle`

**Scope:** Update styles in Card component
**AC:** Cards have dark semi-transparent background with blur; glass variant available
**Test:** View dashboard — stat cards are dark with visible borders
**Files:** `src/components/ui/card.tsx`

#### Task 6.3.3: Re-skin Input component
- [ ] Label: `text-foreground`
- [ ] Input base: add `bg-surface text-foreground`
- [ ] Normal border: `border-border` (replaces `border-gray-300`)
- [ ] Focus: `border-primary ring-primary/50` (replaces blue)
- [ ] Error: `border-red-500/60 focus:border-red-400 focus:ring-red-400/50`
- [ ] Disabled: `disabled:bg-surface-bright disabled:text-muted-foreground`
- [ ] Placeholder: `placeholder:text-muted-foreground`
- [ ] Hint text: `text-muted`
- [ ] Error text: `text-red-400`

**Scope:** Update styles in Input component
**AC:** Inputs have dark background, visible on dark page, violet focus ring
**Test:** View any form page — inputs are dark with legible text
**Files:** `src/components/ui/input.tsx`

#### Task 6.3.4: Re-skin Textarea component
- [ ] Same treatment as Input (6.3.3)

**Scope:** Update styles in Textarea component
**AC:** Textareas match Input dark styling
**Files:** `src/components/ui/textarea.tsx`

#### Task 6.3.5: Re-skin Select component
- [ ] Same treatment as Input for borders, focus, disabled
- [ ] `bg-white` → `bg-surface`
- [ ] Update SVG dropdown arrow fill from `%236b7280` to `%23A89BB2` for visibility on dark bg
- [ ] Note: native `<option>` elements inherit OS styling (known limitation on dark themes)

**Scope:** Update styles in Select component
**AC:** Select has dark background, arrow is visible, focus ring is violet
**Files:** `src/components/ui/select.tsx`

#### Task 6.3.6: Re-skin Badge component
- [ ] Replace light-bg variants with semi-transparent dark-friendly versions:
  - `default`: `bg-foreground/10 text-foreground`
  - `secondary`: `bg-foreground/5 text-muted`
  - `success`: `bg-green-500/15 text-green-400`
  - `warning`: `bg-yellow-500/15 text-yellow-400`
  - `danger`: `bg-red-500/15 text-red-400`
  - `info`: `bg-primary/15 text-primary`

**Scope:** Update variant styles in Badge component
**AC:** Badges are readable on dark backgrounds with semi-transparent colored backgrounds
**Test:** View applications table — status badges are legible
**Files:** `src/components/ui/badge.tsx`

#### Task 6.3.7: Re-skin Checkbox component
- [ ] Hover: `hover:bg-surface-bright` (replaces `hover:bg-gray-50`)
- [ ] Border: `border-border` (replaces `border-gray-300`)
- [ ] Checked: `text-primary focus:ring-primary/50` (replaces blue)
- [ ] Label: `text-foreground`
- [ ] Description: `text-muted`

**Scope:** Update styles in Checkbox component
**AC:** Checkboxes are visible on dark bg with violet check color
**Files:** `src/components/ui/checkbox.tsx`

#### Task 6.3.8: Re-skin FileUpload component
- [ ] Label: `text-foreground`
- [ ] Drop zone border: `border-border hover:border-border/80`
- [ ] Active drag: `border-primary bg-primary-soft`
- [ ] Error zone: `border-red-500/60 bg-red-500/10`
- [ ] Icon/text: `text-muted-foreground` / `text-muted`
- [ ] Upload link: `text-primary hover:text-primary-hover`
- [ ] File list: `border-border-subtle divide-border-subtle`
- [ ] Remove button: `text-red-400 hover:text-red-300`

**Scope:** Update styles in FileUpload component
**AC:** File upload area is visible on dark bg, drag state uses violet accent
**Files:** `src/components/ui/file-upload.tsx`

---

### Story 6.4: Auth Pages Re-skin

> Update auth forms and pages that use raw elements (not the UI component library).

#### Task 6.4.1: Re-skin login form component
- [ ] Labels: `text-foreground` (replaces `text-gray-700`)
- [ ] Inputs: `bg-surface text-foreground border-border`, focus: `border-primary ring-primary/50`
- [ ] Submit button: `bg-primary text-primary-foreground hover:bg-primary-hover`
- [ ] Links: `text-primary hover:text-primary-hover`

**Scope:** Update inline Tailwind classes in login form
**AC:** Login form has dark inputs and violet button
**Files:** `src/components/auth/login-form.tsx`

#### Task 6.4.2: Re-skin signup form component
- [ ] Same treatment as 6.4.1

**Scope:** Update inline Tailwind classes in signup form
**AC:** Signup form matches login form dark styling
**Files:** `src/components/auth/signup-form.tsx`

#### Task 6.4.3: Re-skin login page
- [ ] `text-gray-900` → `text-foreground`
- [ ] `text-gray-600` → `text-muted`
- [ ] Error state: `bg-red-500/10 text-red-400` (replaces `bg-red-50 text-red-700`)
- [ ] Links: `text-primary hover:text-primary-hover`
- [ ] Loading skeleton: `bg-surface-bright` (replaces `bg-gray-200`)

**Scope:** Update page-level classes
**AC:** Login page is fully dark with no white elements
**Files:** `src/app/(auth)/login/page.tsx`

#### Task 6.4.4: Re-skin signup page
- [ ] Same as 6.4.3
- [ ] Success state: `bg-green-500/10 text-green-400` (replaces `bg-green-50 text-green-700`)

**Scope:** Update page-level classes
**AC:** Signup page is fully dark
**Files:** `src/app/(auth)/signup/page.tsx`

---

### Story 6.5: Landing Page Re-skin

> The most visually impactful page. Introduce rainbow gradient and glassmorphic effects.

#### Task 6.5.1: Re-skin hero section
- [ ] Heading text: `text-foreground` (replaces `text-gray-900`)
- [ ] Brand name "Holigay Vendor Market": rainbow gradient text using `bg-gradient-to-r bg-clip-text text-transparent`
- [ ] Subtitle: `text-muted` (replaces `text-gray-600`)
- [ ] "Apply Now" CTA: rainbow or violet gradient background with white text
- [ ] "View Events" button: `border-border bg-surface text-foreground hover:bg-surface-bright`

**Scope:** Update hero section classes
**AC:** Hero has rainbow gradient brand name, dark background, violet/rainbow CTA
**Test:** Load landing page — brand name shimmers with rainbow, buttons are visible
**Files:** `src/app/(public)/page.tsx`

#### Task 6.5.2: Re-skin benefits section
- [ ] Section headings: `text-foreground` and `text-muted`
- [ ] Benefit cards: `border-border-subtle bg-surface/60 backdrop-blur-sm` (glassmorphic)
- [ ] Card text: `text-foreground` and `text-muted`
- [ ] Icon circles shift to dark-friendly versions:
  - `bg-blue-100 text-blue-600` → `bg-blue-500/15 text-blue-400`
  - `bg-green-100 text-green-600` → `bg-green-500/15 text-green-400`
  - `bg-purple-100 text-purple-600` → `bg-purple-500/15 text-purple-400`
  - `bg-orange-100 text-orange-600` → `bg-orange-500/15 text-orange-400`
  - `bg-teal-100 text-teal-600` → `bg-teal-500/15 text-teal-400`
  - `bg-pink-100 text-pink-600` → `bg-pink-500/15 text-pink-400`

**Scope:** Update benefits grid classes
**AC:** Benefit cards are glassmorphic on dark bg; colored icon circles are visible
**Files:** `src/app/(public)/page.tsx`

#### Task 6.5.3: Re-skin events section and event cards
- [ ] EventCard container: `border-border-subtle bg-surface`
- [ ] Date badge: `bg-primary text-primary-foreground` (replaces `bg-blue-600`)
- [ ] Text: `text-foreground` / `text-muted`
- [ ] "Apply for this Event" button: `bg-primary text-primary-foreground`
- [ ] Empty state: `bg-surface`, icon: `bg-surface-bright text-muted-foreground`

**Scope:** Update event cards and empty state
**AC:** Event cards are dark with violet date badges
**Files:** `src/app/(public)/page.tsx`

#### Task 6.5.4: Re-skin final CTA section
- [ ] Background: rainbow gradient (`bg-gradient-to-r from-violet-600 via-pink-500 to-orange-400`) replaces `bg-blue-600`
- [ ] Subtitle: `text-white/80` (replaces `text-blue-100`)
- [ ] CTA button: `bg-white text-primary-foreground` (white button pops on rainbow)

**Scope:** Update CTA section classes
**AC:** CTA section has rainbow gradient background, white button stands out
**Files:** `src/app/(public)/page.tsx`

---

### Story 6.6: Dashboard Pages Re-skin

> Systematic replacement of gray/blue/white classes across all dashboard pages.

#### Task 6.6.1: Re-skin organizer dashboard home page
- [ ] Stat card icons: `bg-primary-soft text-primary` (replaces `bg-blue-50 text-blue-600`)
- [ ] All `text-gray-*` → `text-foreground` / `text-muted` / `text-muted-foreground`
- [ ] All `bg-white` / `bg-gray-*` → `bg-surface` / `bg-surface-bright`
- [ ] All `border-gray-*` → `border-border-subtle`
- [ ] `hover:bg-gray-50` → `hover:bg-surface-bright`
- [ ] `divide-gray-200` → `divide-border-subtle`
- [ ] Links: `text-primary hover:text-primary-hover`

**Scope:** Systematic class replacement on organizer dashboard page
**AC:** Dashboard is fully dark with violet accents
**Files:** `src/app/dashboard/page.tsx`

#### Task 6.6.2: Re-skin vendor dashboard home page
- [ ] Same treatment as 6.6.1
- [ ] Keep teal accent for vendor: `bg-teal-500/15 text-teal-400`

**Scope:** Systematic class replacement on vendor dashboard page
**AC:** Vendor dashboard is dark with teal accents
**Files:** `src/app/vendor-dashboard/page.tsx`

#### Task 6.6.3: Re-skin events management page
- [ ] "Create Event" button: `bg-primary text-primary-foreground`
- [ ] Table header: `bg-surface-bright` (replaces `bg-gray-50`)
- [ ] Table rows hover: `hover:bg-surface-bright`
- [ ] All gray text/border replacements as per 6.6.1

**Scope:** Update events page classes
**AC:** Events table is dark with readable text
**Files:** `src/app/dashboard/events/page.tsx`

#### Task 6.6.4: Re-skin public apply page
- [ ] `text-gray-900` → `text-foreground`
- [ ] `text-gray-600` → `text-muted`
- [ ] `bg-white shadow-md` → `bg-surface border border-border-subtle`

**Scope:** Update apply page wrapper classes
**AC:** Apply page has dark card wrapper
**Files:** `src/app/(public)/apply/page.tsx`

#### Task 6.6.5: Re-skin remaining dashboard subpages
- [ ] Apply systematic gray→dark replacements to all remaining pages (~10-15 files):
  - `/dashboard/events/new/page.tsx`
  - `/dashboard/events/[id]/page.tsx`
  - `/dashboard/applications/page.tsx` (if exists)
  - `/dashboard/team/page.tsx`
  - `/vendor-dashboard/applications/page.tsx`
  - `/vendor-dashboard/applications/[id]/page.tsx`
  - `/vendor-dashboard/profile/page.tsx`
  - Any other dashboard subpages
- [ ] Follow the same class mapping used in 6.6.1

**Scope:** Bulk class updates across remaining pages
**AC:** No white/light-gray elements remain in any dashboard page
**Test:** Navigate every dashboard page — all are dark themed

---

### Story 6.7: Utility Pages & Dashboard Components Re-skin

#### Task 6.7.1: Re-skin error/404/loading/unauthorized pages
- [ ] `src/app/not-found.tsx`: `bg-surface-bright` circle, `text-muted-foreground`, primary buttons
- [ ] `src/app/error.tsx`: `bg-red-500/15` circle, `text-red-400` icon
- [ ] `src/app/loading.tsx`: `text-primary` spinner, `text-muted` text
- [ ] `src/app/unauthorized/page.tsx`: `bg-amber-500/15`, `text-amber-400`, primary buttons

**Scope:** Update 4 utility pages
**AC:** Error/loading/404 pages are dark themed
**Test:** Visit `/nonexistent` to test 404

#### Task 6.7.2: Re-skin dashboard components
- [ ] `src/components/dashboard/role-badge.tsx`:
  - admin: `bg-purple-500/15 text-purple-400`
  - organizer: `bg-primary/15 text-primary`
  - vendor: `bg-foreground/10 text-foreground`
  - Loading skeleton: `bg-surface-bright`
- [ ] Apply same dark-theme replacements to:
  - `src/components/dashboard/applications-filter.tsx`
  - `src/components/dashboard/applications-table.tsx`
  - `src/components/dashboard/export-button.tsx`
  - `src/components/admin/user-role-select.tsx`
  - `src/components/team/invite-form.tsx`
  - `src/components/forms/vendor-application-form.tsx`
  - `src/components/forms/vendor-profile-form.tsx`
  - `src/components/forms/event-form.tsx`

**Scope:** Update all remaining components
**AC:** All components render correctly on dark backgrounds
**Test:** Navigate pages that use each component; no white/light elements remain

---

### Story 6.8: Toast Notifications

#### Task 6.8.1: Install toast library
- [ ] Add react-hot-toast or sonner
- [ ] Set up Toaster in root layout
- [ ] Configure dark theme styling to match brand

**Scope:** Package install + layout change
**AC:** Toast function available globally, toasts render with dark styling
**Files:** `package.json`, `src/app/layout.tsx`

#### Task 6.8.2: Add toasts to key actions
- [ ] Application status update
- [ ] Event create/update/delete
- [ ] Profile save
- [ ] Error states

**Scope:** Update components that call server actions
**AC:** User gets visual feedback on all key actions

---

### Story 6.9: Application Form UX

#### Task 6.9.1: Add file preview for uploads
- [ ] Show thumbnail of uploaded images
- [ ] Show filename and icon for PDFs
- [ ] Ensure previews work on dark background

**Scope:** Update FileUpload component
**AC:** Can see file preview before submitting

---

### Story 6.10: Mobile Improvements

#### Task 6.10.1: Test and fix mobile layouts
- [ ] Check all pages at 375px width
- [ ] Fix any overflow issues
- [ ] Ensure touch targets are 44px+
- [ ] Verify dark theme looks correct on mobile

**Scope:** CSS fixes
**AC:** Usable on mobile device with no broken layouts

---

### Epic 6 Definition of Done
- [ ] App matches Holigay Events YYC brand (dark `#1C171C` background, Quicksand font, violet primary)
- [ ] Rainbow gradient used on landing page hero text and CTA section
- [ ] All UI components render correctly on dark backgrounds
- [ ] No white/light-gray elements remain anywhere in the app
- [ ] WCAG contrast ratios pass on all text (verify in DevTools)
- [ ] Focus rings visible on dark background (ring-offset uses dark color)
- [ ] Toast notifications work with dark styling
- [ ] File previews work
- [ ] No major mobile issues
- [ ] `npm run build && npm run lint` passes

---

## Epic 7: Dynamic Application Forms (Future)

> **Status:** Low priority, not blocking launch
> **Note:** Current static form works fine for MVP

Tasks deferred - see plan file for details.

---

## Commands Reference

```bash
# Development
npm run dev              # Start dev server
npm run build            # Production build
npm run lint             # Run ESLint
npm run format           # Run Prettier
npm test                 # Run tests

# Database
npm run db:types         # Regenerate Supabase types
npx supabase db push     # Push migrations to linked project
```

---

## Archived

Previous task list archived to: `docs/archive/TASKS-v1.md`
