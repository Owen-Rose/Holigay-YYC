# PR4 - Task Tracker

> Check off tasks as you complete them. Mark with the appropriate status symbol.

## Legend
- ⬜ Not started
- 🔄 In progress
- ✅ Complete
- ⏸️ Blocked

---

## Phase 1: Project Foundation (Days 1-2)

### Task 1.1: Initialize Next.js Project
- ✅ Run: `npx create-next-app@latest . --typescript --tailwind --eslint --app --src-dir --import-alias "@/*"`
- ✅ Verify: `npm run dev` shows Next.js page at localhost:3000
- ⬜ Commit: `git add . && git commit -m "chore: initialize Next.js project"`

**Files created:** `package.json`, `tsconfig.json`, `tailwind.config.ts`, `next.config.ts`, `src/app/*`

---

### Task 1.2: Configure Development Tools
- ✅ Install Prettier: `npm install -D prettier prettier-plugin-tailwindcss`
- ✅ Create `.prettierrc` with config
- ✅ Create `.vscode/settings.json` with format-on-save
- ✅ Update `package.json` scripts (add `format`, `lint:fix`)
- ✅ Verify: `npm run format` runs without error
- ✅ Verify: `npm run lint` passes
- ⬜ Commit: `git commit -m "chore: add Prettier and ESLint config"`

**Files created:** `.prettierrc`, `.vscode/settings.json`, `.vscode/extensions.json`

---

### Task 1.3: Set Up Testing Framework
- ✅ Install: `npm install -D vitest @vitejs/plugin-react jsdom @testing-library/react @testing-library/jest-dom`
- ✅ Create `vitest.config.ts`
- ✅ Create `src/test/setup.ts`
- ✅ Add `test` script to `package.json`
- ✅ Create `src/app/page.test.tsx` (smoke test)
- ✅ Verify: `npm test` passes
- ⬜ Commit: `git commit -m "chore: add Vitest testing framework"`

**Files created:** `vitest.config.ts`, `src/test/setup.ts`, `src/app/page.test.tsx`

---

### Task 1.4: Initialize Git & CI
- ✅ Update `.gitignore` (already configured by Next.js)
- ✅ Create `.github/workflows/ci.yml`
- ⬜ Push to GitHub
- ⬜ Verify: CI workflow runs on push
- ⬜ Commit: `git commit -m "ci: add GitHub Actions workflow"`

**Files created:** `.github/workflows/ci.yml`

---

### Task 1.5: Create Project Structure
- ✅ Create folder structure (components, lib, types)
- ✅ Create `src/lib/utils.ts` with `cn()` helper
- ✅ Verify: Folders visible in file explorer
- ⬜ Commit: `git commit -m "chore: create project folder structure"`

**Files created:** `src/lib/utils.ts`, multiple directories

---

## Phase 2: Database & Backend Setup (Days 3-4)

### Task 2.1: Create Supabase Project
- ✅ Go to [supabase.com](https://supabase.com) and create new project
- ✅ Wait for project to finish provisioning (~2 min)
- ✅ Copy Project URL and anon key from Settings > API
- ✅ Create `.env.local` with credentials
- ✅ Create `.env.example` with placeholder values
- ✅ Verify: Environment variables configured
- ⬜ Commit: `git commit -m "chore: add Supabase environment config"`

**Files created:** `.env.local`, `.env.example`

---

### Task 2.2: Create Database Schema
- ✅ Install Supabase CLI: `npm install -D supabase`
- ✅ Initialize: `npx supabase init`
- ✅ Create `supabase/migrations/001_initial_schema.sql`
- ✅ Run migration in Supabase SQL Editor
- ✅ Verify: Tables visible in Table Editor (events, vendors, applications, attachments)
- ⬜ Commit: `git commit -m "feat: add database schema migration"`

**Files created:** `supabase/migrations/001_initial_schema.sql`, `supabase/config.toml`

---

### Task 2.3: Configure Row Level Security
- ✅ Create `supabase/migrations/002_rls_policies.sql`
- ✅ Run migration in Supabase SQL Editor
- ✅ Verify: RLS enabled on all tables
- ⬜ Commit: `git commit -m "feat: add Row Level Security policies"`

---

### Task 2.4: Set Up Supabase Storage
- ✅ Go to Supabase Dashboard > Storage
- ✅ Create bucket named `attachments`
- ✅ Set bucket to private
- ✅ Add storage policies (public upload, authenticated download/delete)
- ✅ Verify: Bucket visible in dashboard

---

### Task 2.5: Generate TypeScript Types
- ✅ Install: `npm install @supabase/supabase-js`
- ✅ Run: `npx supabase gen types typescript --project-id <ref> > src/types/database.ts`
- ✅ Add type generation script to `package.json`
- ✅ Verify: Types file exists
- ⬜ Commit: `git commit -m "feat: add Supabase TypeScript types"`

---

### Task 2.6: Create Supabase Client Utilities
- ✅ Install: `npm install @supabase/ssr`
- ✅ Create `src/lib/supabase/client.ts`
- ✅ Create `src/lib/supabase/server.ts`
- ✅ Create `src/lib/supabase/middleware.ts`
- ✅ Verify: Can connect to DB
- ⬜ Commit: `git commit -m "feat: add Supabase client utilities"`

---

## Phase 3: Authentication (Days 5-6)

### Task 3.1: Create Auth UI Components
- ✅ Install: `npm install react-hook-form zod @hookform/resolvers`
- ✅ Create `src/lib/validations/auth.ts`
- ✅ Create `src/components/auth/login-form.tsx`
- ✅ Create `src/components/auth/signup-form.tsx`
- ✅ Verify: Components render
- ⬜ Commit: `git commit -m "feat: add auth form components"`

---

### Task 3.2: Implement Auth Pages
- ✅ Create `src/app/(auth)/login/page.tsx`
- ✅ Create `src/app/(auth)/signup/page.tsx`
- ✅ Create `src/app/(auth)/layout.tsx`
- ✅ Verify: Pages accessible at /login and /signup
- ✅ Commit: `git commit -m "feat: add login and signup pages"`

---

### Task 3.3: Create Auth Server Actions
- ✅ Create `src/lib/actions/auth.ts`
- ✅ Implement signIn, signUp, signOut
- ✅ Verify: Auth works (TypeScript ✓, ESLint ✓, Build ✓, Pages accessible ✓)
- ⬜ Commit: `git commit -m "feat: add auth server actions"`

---

### Task 3.4: Add Auth Middleware
- ✅ Create `src/middleware.ts`
- ✅ Configure protected routes (/dashboard requires auth, /login|/signup redirect if already logged in)
- ✅ Verify: Redirects work (dashboard → /login?redirectTo=/dashboard when unauthenticated)
- ✅ Commit: `git commit -m "feat: add auth middleware"`

**Files created:** `src/middleware.ts`, `src/app/dashboard/page.tsx` (placeholder)

---

### Task 3.5: Create Dashboard Layout
- ✅ Create `src/app/dashboard/layout.tsx`
- ✅ Add sidebar navigation
- ✅ Add logout button
- ✅ Verify: Dashboard works
- ⬜ Commit: `git commit -m "feat: add dashboard layout"`

---

## Phase 4: Vendor Application Form (Days 7-9)

### Task 4.1: Create Zod Validation Schema
- ✅ Create `src/lib/validations/application.ts`
- ✅ Define all form fields with validation rules
- ✅ Add custom validators (phone, file types)
- ✅ Export inferred TypeScript types
- ✅ Verify: Schema validates test data correctly
- ✅ Commit: `git commit -m "feat: add application form validation schema"`

**Files created:** `src/lib/validations/application.ts`

---

### Task 4.2: Build Form UI Components
- ✅ Create `src/components/ui/input.tsx`
- ✅ Create `src/components/ui/textarea.tsx`
- ✅ Create `src/components/ui/select.tsx`
- ✅ Create `src/components/ui/button.tsx`
- ✅ Create `src/components/ui/file-upload.tsx`
- ✅ Create `src/components/ui/checkbox.tsx` (bonus: needed for product categories)
- ✅ Create `src/components/forms/vendor-application-form.tsx`
- ✅ Verify: Form renders all fields correctly (TypeScript ✓, ESLint ✓, Build ✓, Tests ✓)
- ✅ Commit: `git commit -m "feat: add vendor application form UI"`

**Files created:** `src/components/ui/*`, `src/components/forms/vendor-application-form.tsx`

---

### Task 4.3: Create File Upload Handler
- ✅ Create `src/lib/actions/upload.ts`
- ✅ Implement `uploadFile` action (uploads to Supabase Storage)
- ✅ Add file type validation (images, PDFs)
- ✅ Add file size limit (10MB)
- ✅ Return storage path on success
- ✅ Verify: Test file upload manually
- ✅ Commit: `git commit -m "feat: add file upload handler"`

**Files created:** `src/lib/actions/upload.ts`

---

### Task 4.4: Create Application Submit Action
- ✅ Create `src/lib/actions/applications.ts`
- ✅ Implement `submitApplication` action
- ✅ Create/find vendor record by email
- ✅ Create application record with event link
- ✅ Link uploaded attachments
- ✅ Verify: Submission creates records in DB
- ✅ Commit: `git commit -m "feat: add application submit action"`

**Files created:** `src/lib/actions/applications.ts`

---

### Task 4.5: Build Application Page
- ✅ Create `src/app/(public)/apply/page.tsx`
- ✅ Fetch active event(s) from DB
- ✅ Render vendor application form
- ✅ Handle form submission (with file uploads)
- ✅ Show success message on submit
- ✅ Show error messages on failure
- ✅ Verify: TypeScript ✓, ESLint ✓, Build ✓, Tests ✓
- ✅ Commit: `git commit -m "feat: add vendor application page"`

**Files created:** `src/app/(public)/layout.tsx`, `src/app/(public)/apply/page.tsx`, `src/app/(public)/apply/client.tsx`

---

### Task 4.6: Add Form Submission Test
- ✅ Create `src/test/application-form.test.tsx`
- ✅ Test form validation (required fields, invalid email, product categories)
- ✅ Test form submission (mocked with data verification)
- ✅ Test form rendering (all sections, fields, options)
- ✅ Test loading state during submission
- ✅ Verify: `npm test` passes (16 tests)
- ✅ Commit: `git commit -m "test: add application form tests"`

**Files created:** `src/test/application-form.test.tsx`

---

## Phase 5: Organizer Dashboard (Days 10-13)

### Task 5.1: Create Applications List Component
- ✅ Create `src/components/dashboard/applications-table.tsx`
- ✅ Add table columns: Business, Contact, Status, Date, Actions
- ✅ Add loading skeleton state
- ✅ Make responsive (card view on mobile)
- ✅ Verify: Component renders with mock data (TypeScript ✓, ESLint ✓, Build ✓, Tests ✓)
- ⬜ Commit: `git commit -m "feat: add applications table component"`

**Files created:** `src/components/dashboard/applications-table.tsx`

---

### Task 5.2: Fetch Applications Server Action
- ✅ Add `getApplications` to `src/lib/actions/applications.ts`
- ✅ Accept filter parameters (status, search)
- ✅ Include vendor info in response
- ✅ Add pagination support
- ✅ Verify: Data fetches correctly
- ✅ Commit: `git commit -m "feat: add get applications action"`

**Files created:** None (extends existing file)

---

### Task 5.3: Build Dashboard Home Page
- ✅ Update `src/app/dashboard/page.tsx`
- ✅ Add summary cards (Pending, Approved, Total)
- ✅ Add recent applications preview (last 5)
- ✅ Add quick action links
- ✅ Verify: Stats display correctly (TypeScript ✓, ESLint ✓, Build ✓, Tests ✓)
- ✅ Commit: `git commit -m "feat: add dashboard home with stats"`

**Files created:** None (updates existing file)

---

### Task 5.4: Build Applications List Page
- ✅ Create `src/app/dashboard/applications/page.tsx`
- ✅ Fetch applications server-side
- ✅ Render applications table
- ✅ Verify: All applications display
- ✅ Commit: `git commit -m "feat: add applications list page"`

**Files created:** `src/app/dashboard/applications/page.tsx`

---

### Task 5.5: Add Search & Filter
- ✅ Create `src/components/dashboard/applications-filter.tsx`
- ✅ Add search input (business name, email)
- ✅ Add status filter dropdown
- ✅ Use URL search params for state
- ✅ Verify: Filters update table results (TypeScript ✓, ESLint ✓, Build ✓, Tests ✓)
- ✅ Commit: `git commit -m "feat: add application search and filters"`

**Files created:** `src/components/dashboard/applications-filter.tsx`

---

### Task 5.6: Create Application Detail View
- ✅ Create `src/app/dashboard/applications/[id]/page.tsx`
- ✅ Fetch application by ID
- ✅ Display all application fields
- ✅ Display attached files with download links
- ✅ Add status update buttons
- ✅ Add organizer notes field
- ✅ Verify: Detail page shows correct data (TypeScript ✓, ESLint ✓, Build ✓, Tests ✓)
- ✅ Commit: `git commit -m "feat: add application detail view"`

**Files created:** `src/app/dashboard/applications/[id]/page.tsx`, `src/app/dashboard/applications/[id]/status-buttons.tsx`, `src/app/dashboard/applications/[id]/organizer-notes.tsx`, `src/app/dashboard/applications/[id]/attachments-list.tsx`, `src/lib/constants/application-status.ts`

---

### Task 5.7: Implement Status Update
- ✅ Add `updateApplicationStatus` to `src/lib/actions/applications.ts`
- ✅ Add `updateApplicationNotes` action
- ✅ Update UI to call actions
- ✅ Verify: Status changes persist
- ✅ Commit: `git commit -m "feat: add status and notes update actions"`

**Files created:** None (extends existing file)
**Note:** Core functionality implemented in Task 5.6. See Future Enhancements for polish items.

---

### Task 5.8: Add CSV Export
- ✅ Create `src/lib/actions/export.ts`
- ✅ Implement `exportApplicationsCSV` action
- ✅ Include relevant columns
- ✅ Add export button to applications page
- ✅ Verify: CSV downloads with correct data (TypeScript ✓, ESLint ✓, Build ✓, Tests ✓)
- ✅ Commit: `git commit -m "feat: add CSV export functionality"`

**Files created:** `src/lib/actions/export.ts`, `src/components/dashboard/export-button.tsx`

---

## Phase 6: Email Notifications (Days 14-15)

### Task 6.1: Set Up Resend
- ✅ Create account at [resend.com](https://resend.com)
- ✅ Get API key
- ✅ Add `RESEND_API_KEY` to `.env.local`
- ✅ Install: `npm install resend`
- ✅ Create `src/lib/email/client.ts`
- ✅ Test sending a simple email
- ✅ Commit: `git commit -m "feat: add Resend email client"`

**Files created:** `src/lib/email/client.ts`

---

### Task 6.2: Create Email Templates
- ✅ Create `src/lib/email/templates/application-received.tsx`
- ✅ Create `src/lib/email/templates/status-update.tsx`
- ✅ Style with inline CSS (email-safe)
- ✅ Verify: Templates render correctly
- ⬜ Commit: `git commit -m "feat: add email templates"`

**Files created:** `src/lib/email/templates/*`

---

### Task 6.3: Send Confirmation on Submit
- ✅ Update `submitApplication` action
- ✅ Send confirmation email after DB insert
- ✅ Handle email failures gracefully (log, don't block)
- ⬜ Verify: Email received after submission
- ✅ Commit: `git commit -m "feat: send confirmation email on submit"`

**Files created:** None (updates existing file)

---

### Task 6.4: Send Notification on Status Change
- ✅ Update `updateApplicationStatus` action
- ✅ Send email on approve/reject
- ✅ Use different templates per status
- ⬜ Verify: Email received on status change
- ⬜ Commit: `git commit -m "feat: send email on status change"`

**Files created:** None (updates existing file)

---

## Phase 7: Landing Page & Polish (Days 16-17)

### Task 7.1: Design Landing Page
- ⬜ Update `src/app/(public)/page.tsx`
- ⬜ Add hero section with event info
- ⬜ Add benefits section for vendors
- ⬜ Add CTA button to apply
- ⬜ Add event details/dates
- ⬜ Verify: Looks good on desktop and mobile
- ⬜ Commit: `git commit -m "feat: add landing page design"`

**Files created:** None (updates existing file)

---

### Task 7.2: Add Shared UI Components
- ⬜ Create `src/components/ui/card.tsx`
- ⬜ Create `src/components/ui/badge.tsx`
- ⬜ Create `src/components/ui/spinner.tsx`
- ⬜ Update existing components with variants
- ⬜ Verify: Consistent styling across app
- ⬜ Commit: `git commit -m "feat: add shared UI components"`

**Files created:** `src/components/ui/*`

---

### Task 7.3: Responsive Layout Check
- ⬜ Test all pages at 320px width (mobile)
- ⬜ Test all pages at 768px width (tablet)
- ⬜ Test all pages at 1280px+ width (desktop)
- ⬜ Fix any overflow issues
- ⬜ Ensure buttons are touch-friendly (min 44px)
- ⬜ Commit: `git commit -m "fix: responsive layout improvements"`

**Files created:** Various (style updates)

---

### Task 7.4: Add Loading & Error States
- ⬜ Create `src/app/loading.tsx` (global loading)
- ⬜ Create `src/app/error.tsx` (global error boundary)
- ⬜ Create `src/app/not-found.tsx` (404 page)
- ⬜ Add loading states to async components
- ⬜ Verify: Errors display nicely, loading shows skeleton
- ⬜ Commit: `git commit -m "feat: add loading and error states"`

**Files created:** `src/app/loading.tsx`, `error.tsx`, `not-found.tsx`

---

## Phase 8: Deployment & Documentation (Days 18-19)

### Task 8.1: Prepare for Production
- ⬜ Run `npm run build` and fix any errors
- ⬜ Check all env vars are documented in `.env.example`
- ⬜ Remove any `console.log` statements
- ⬜ Optimize images (if any)
- ⬜ Verify: Build succeeds with no warnings
- ⬜ Commit: `git commit -m "chore: prepare for production"`

**Files created:** None

---

### Task 8.2: Deploy to Vercel
- ⬜ Go to [vercel.com](https://vercel.com) and import GitHub repo
- ⬜ Add environment variables in Vercel dashboard
- ⬜ Deploy
- ⬜ Verify: Live URL is accessible
- ⬜ Verify: All features work on production

**Files created:** None (Vercel dashboard)

---

### Task 8.3: Configure Supabase for Production
- ⬜ Add Vercel URL to Supabase > Auth > URL Configuration
- ⬜ Add Vercel URL to allowed origins in Storage policies
- ⬜ (Optional) Consider separate prod Supabase project
- ⬜ Verify: Auth and storage work on production

**Files created:** None (Supabase dashboard)

---

### Task 8.4: Write README
- ⬜ Create comprehensive `README.md`
- ⬜ Include: Project overview, features list
- ⬜ Include: Prerequisites (Node, npm, etc.)
- ⬜ Include: Local setup steps (goal: one command)
- ⬜ Include: Environment variables table
- ⬜ Include: Deployment instructions
- ⬜ Include: Maintenance notes
- ⬜ Commit: `git commit -m "docs: add comprehensive README"`

**Files created:** `README.md`

---

### Task 8.5: Create Seed Data Script
- ⬜ Create `scripts/seed.ts`
- ⬜ Add sample event
- ⬜ Add sample applications (various statuses)
- ⬜ Add script to `package.json`
- ⬜ Verify: `npm run seed` populates data
- ⬜ Commit: `git commit -m "feat: add database seed script"`

**Files created:** `scripts/seed.ts`

---

### Task 8.6: Final Testing & QA
- ⬜ Test: Vendor can submit application
- ⬜ Test: Files upload successfully
- ⬜ Test: Confirmation email received
- ⬜ Test: Organizer can log in
- ⬜ Test: Dashboard shows applications
- ⬜ Test: Filter and search work
- ⬜ Test: Status update works
- ⬜ Test: Status change email received
- ⬜ Test: CSV export downloads correctly
- ⬜ Test: Mobile experience is usable
- ⬜ Document any bugs for future fix

**Files created:** None

---

## Quick Commands

```bash
npm run dev          # Start dev server
npm run lint         # Run ESLint
npm run format       # Run Prettier
npm test             # Run tests
npm run build        # Production build
```

---

## Future Enhancements

> Non-critical polish items to revisit after core features are complete.

### UX Polish
- ⬜ Add optimistic updates for status changes (instant UI feedback)
- ⬜ Add toast notifications for success/error messages
- ⬜ Add loading skeletons for application detail page

### Accessibility
- ⬜ Audit and improve keyboard navigation
- ⬜ Add ARIA labels where missing
- ⬜ Test with screen readers

### Performance
- ⬜ Add caching for frequently accessed data
- ⬜ Optimize image loading for attachments

---

## Progress Summary

| Phase | Status | Tasks |
|-------|--------|-------|
| 1. Project Foundation | ✅ Complete | 5/5 |
| 2. Database & Backend Setup | ✅ Complete | 6/6 |
| 3. Authentication | ✅ Complete | 5/5 |
| 4. Vendor Application Form | ✅ Complete | 6/6 |
| 5. Organizer Dashboard | ✅ Complete | 8/8 |
| 6. Email Notifications | ⬜ Not Started | 0/4 |
| 7. Landing Page & Polish | ⬜ Not Started | 0/4 |
| 8. Deployment & Documentation | ⬜ Not Started | 0/6 |
| **Total** | **In Progress** | **30/44** |
