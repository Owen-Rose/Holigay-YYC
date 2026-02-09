# Holigay Vendor Market - RBAC Implementation Backlog

> Transform the app from single-role to multi-role (Vendor, Organizer, Admin) with proper access controls.

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
| Epic 5: Event Management | High | In Progress |
| Epic 6: UI/UX Improvements | Medium | Not Started |
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
- [ ] Apply to createEvent, updateEvent, deleteEvent (when created)

**Scope:** Will be done when Epic 5 is implemented
**Note:** Placeholder task - deferred to Epic 5 (actions don't exist yet)

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
- [ ] `createEvent` - validate, insert, return ID
- [ ] `updateEvent` - validate, update by ID
- [ ] `deleteEvent` - soft delete or hard delete?
- [ ] All actions check organizer/admin role

**Scope:** Add to events.ts
**AC:** Vendor cannot create/update/delete events
**Files:** `src/lib/actions/events.ts`

---

### Story 5.3: Event Status Workflow

#### Task 5.3.1: Add event status transitions
- [ ] draft → active (publish)
- [ ] active → closed (end applications)
- [ ] Add UI controls for status changes

**Scope:** Update event form or detail page
**AC:** Can activate and close events

#### Task 5.3.2: Hide closed events from public apply page
- [ ] Update /apply page query
- [ ] Only show events with status='active'

**Scope:** Modify apply page
**AC:** Closed events not in dropdown

---

### Epic 5 Definition of Done
- [ ] Organizers can create, edit, delete events
- [ ] Event status workflow works
- [ ] Only active events shown to public
- [ ] Dashboard nav links to events page

---

## Epic 6: UI/UX Improvements

> **Milestone:** Polish and usability improvements.
> **Depends on:** Epics 3, 5 (can be done in parallel)
> **Blocks:** Nothing

### Story 6.1: Toast Notifications

#### Task 6.1.1: Install toast library
- [ ] Add react-hot-toast or sonner
- [ ] Set up Toaster in root layout

**Scope:** Package install + layout change
**AC:** Toast function available globally
**Files:** `package.json`, `src/app/layout.tsx`

#### Task 6.1.2: Add toasts to key actions
- [ ] Application status update
- [ ] Event create/update
- [ ] Profile save
- [ ] Error states

**Scope:** Update components that call actions
**AC:** User gets visual feedback on actions

---

### Story 6.2: Application Form UX

#### Task 6.2.1: Add file preview for uploads
- [ ] Show thumbnail of uploaded images
- [ ] Show filename for PDFs

**Scope:** Update FileUpload component
**AC:** Can see file before submitting

---

### Story 6.3: Mobile Improvements

#### Task 6.3.1: Test and fix mobile layouts
- [ ] Check all pages at 375px width
- [ ] Fix any overflow issues
- [ ] Ensure touch targets are 44px+

**Scope:** CSS fixes
**AC:** Usable on mobile device

---

### Epic 6 Definition of Done
- [ ] Toast notifications work
- [ ] No major mobile issues
- [ ] File previews work

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
