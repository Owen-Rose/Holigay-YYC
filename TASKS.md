# Holigay Vendor Market - Task Tracker

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
- ⬜ Create `src/lib/actions/applications.ts`
- ⬜ Implement `submitApplication` action
- ⬜ Create/find vendor record by email
- ⬜ Create application record with event link
- ⬜ Link uploaded attachments
- ⬜ Verify: Submission creates records in DB
- ⬜ Commit: `git commit -m "feat: add application submit action"`

**Files created:** `src/lib/actions/applications.ts`

---

### Task 4.5: Build Application Page
- ⬜ Create `src/app/(public)/apply/page.tsx`
- ⬜ Fetch active event(s) from DB
- ⬜ Render vendor application form
- ⬜ Handle form submission
- ⬜ Show success message on submit
- ⬜ Show error messages on failure
- ⬜ Verify: Full flow works end-to-end
- ⬜ Commit: `git commit -m "feat: add vendor application page"`

**Files created:** `src/app/(public)/apply/page.tsx`

---

### Task 4.6: Add Form Submission Test
- ⬜ Create `src/test/application-form.test.tsx`
- ⬜ Test form validation (required fields)
- ⬜ Test form submission (mocked)
- ⬜ Verify: `npm test` passes
- ⬜ Commit: `git commit -m "test: add application form tests"`

**Files created:** `src/test/application-form.test.tsx`

---

## Phase 5-8: See plan file for remaining tasks

Full task list available at: `~/.claude/plans/cozy-snuggling-cray.md`

---

## Quick Commands

```bash
npm run dev          # Start dev server
npm run lint         # Run ESLint
npm run format       # Run Prettier
npm test             # Run tests
npm run build        # Production build
```
