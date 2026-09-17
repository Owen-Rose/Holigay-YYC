# Dev Environment Setup Guide

> Setting up separate development and production environments with Supabase + Vercel + Git branching.

## Current Architecture

| Component | Production | Development |
|-----------|-----------|-------------|
| Git branch | `main` | `dev` |
| Vercel | Production deployment | Preview deployments |
| Supabase | `hgmfjvjlxrhdojwlkgap` | (your dev project ref) |
| `.env.local` | — | Points at dev Supabase |

---

## Part 1: Create the Dev Supabase Project

1. Go to [supabase.com/dashboard](https://supabase.com/dashboard)
2. Click **New Project**
3. Name it `Holigay-Dev` (or similar)
4. Choose the same region as production if possible
5. Set a database password — save it somewhere safe
6. Wait for provisioning to finish

## Part 2: Run All Migrations on the Dev Project

In the dev Supabase dashboard, go to **SQL Editor**. Run these **one at a time, in order**:

1. `supabase/migrations/001_initial_schema.sql`
2. `supabase/migrations/002_rls_policies.sql`
3. `supabase/migrations/003_user_profiles.sql`
4. `supabase/migrations/004_vendors_user_link.sql`
5. `supabase/migrations/005_rbac_rls_policies.sql`

Copy the full contents of each file, paste into SQL Editor, and run. Wait for each to succeed before running the next.

## Part 3: Create the Storage Bucket

In the dev Supabase dashboard:

1. Go to **Storage** > click **New bucket**
2. Name it exactly: `attachments` (private, not public)
3. Go to **Storage > Policies** and add 3 policies under the attachments bucket:

**INSERT policy:**
- Name: `allow uploads`
- Target roles: `anon`, `authenticated`
- WITH CHECK: `bucket_id = 'attachments'`

**SELECT policy:**
- Name: `allow downloads`
- Target roles: `anon`, `authenticated`
- USING: `bucket_id = 'attachments'`

**DELETE policy:**
- Name: `allow deletes`
- Target roles: `authenticated` only
- USING: `bucket_id = 'attachments'`

## Part 4: Grab Dev Credentials

In the dev Supabase dashboard:

1. Go to **Settings > API**
2. Copy:
   - **Project URL** (`https://xxxxxxxx.supabase.co`)
   - **anon public** key (`eyJ...`)
3. Note the **Project Reference ID** — the `xxxxxxxx` part of the URL

## Part 5: Update Local Environment Variables

Edit `.env.local` to point at the **dev** project:

```
NEXT_PUBLIC_SUPABASE_URL=https://YOUR-DEV-PROJECT-REF.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=YOUR-DEV-ANON-KEY
RESEND_API_KEY=re_your_key_here
```

Keep your production credentials saved somewhere safe (password manager, notes app). They go in Vercel, not in `.env.local`.

## Part 6: Create Test Users

**Option A: Via Supabase Dashboard (recommended)**

1. Go to **Authentication > Users** in the dev project
2. Click **Add user > Create new user**
3. Enter email + password, check **Auto Confirm User**
4. Create these users:

| Email | Role | Notes |
|-------|------|-------|
| `admin@test.com` | admin | Promote via SQL (see below) |
| `vendor@test.com` | vendor | Auto-assigned by trigger |
| `organizer@test.com` | organizer | Promote via SQL (see below) |

**Promote admin:**
```sql
UPDATE user_profiles
SET role = 'admin'
WHERE id = (
  SELECT id FROM auth.users
  WHERE email = 'admin@test.com'
);
```

**Promote organizer:**
```sql
UPDATE user_profiles
SET role = 'organizer'
WHERE id = (
  SELECT id FROM auth.users
  WHERE email = 'organizer@test.com'
);
```

**Verify all users:**
```sql
SELECT u.email, p.role
FROM user_profiles p
JOIN auth.users u ON u.id = p.id;
```

**Option B: Via signup form**

1. Disable email confirmation: **Authentication > Providers > Email** > turn off **Confirm email**
2. Sign up at `localhost:3000/signup` with each test email
3. Promote admin/organizer via SQL as above

## Part 7: Branch Model

`dev` is the integration branch and `main` is production. Feature work branches off
`dev`, merges back via PR, and `dev` is promoted to `main` with a fast-forward merge
when a milestone ships. (The historical `staging` branch was renamed to `dev` and no
longer exists.)

```bash
# Sync dev with main after a promotion
git checkout dev
git merge main
git push origin dev
git checkout main
```

## Part 8: Configure Vercel

### Production branch
1. Go to **Settings > Git**
2. Confirm production branch is `main`

### Environment variables
1. Go to **Settings > Environment Variables**
2. Add/update:

| Variable | Value | Environment |
|----------|-------|-------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Dev Supabase URL | Preview |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Dev anon key | Preview |
| `RESEND_API_KEY` | Same or test key | Preview |
| `RESEND_API_KEY` | Live key | **Production (required)** |
| `EMAIL_FROM_ADDRESS` | `Name <noreply@verified-domain>` | Preview |
| `EMAIL_FROM_ADDRESS` | `Name <noreply@verified-domain>` | **Production (required)** |
| `CRON_SECRET` | `openssl rand -hex 32` (≥ 16 chars) | Production only |
| `KEEPALIVE_SUPABASE_TARGETS` | `https://dev-ref.supabase.co\|<dev anon>,https://prod-ref.supabase.co\|<prod anon>` | Production only |

3. Confirm **Production** variables still point at the production Supabase project

> **The two email Production rows are build-time requirements.** `VERCEL_ENV=production`
> makes `RESEND_API_KEY` and `EMAIL_FROM_ADDRESS` mandatory, and refuses any sender on
> the `resend.dev` domain — a Production deploy without them fails the build on
> purpose, because that test sender delivers only to the Resend account owner. Preview
> deploys are lenient. See
> `specs/007-production-readiness/contracts/env-contract.md`.

> **The two keep-alive rows are not.** Left unset the app still deploys and
> `/api/keepalive` answers `401` (no secret) or `500` `misconfigured` (no targets).
> They are Production-only because Vercel runs cron jobs on Production deployments
> only, never previews. List **both** Supabase projects in
> `KEEPALIVE_SUPABASE_TARGETS` — production's own project is not inferred from the
> deployment, so a half-filled list would silently let the other one pause. Setting
> them is task T008 of spec 007; the route and the `vercel.json` schedule are T007.
> See `specs/007-production-readiness/contracts/keepalive-route.md`.

Result:
- Vercel production (`main`) → production Supabase
- Vercel preview (`dev` + PR branches) → dev Supabase

## Part 9: Update db:types Script

Add a dev version of the types script in `package.json`:

```json
"db:types": "supabase gen types typescript --project-id hgmfjvjlxrhdojwlkgap > src/types/database.ts",
"db:types:dev": "supabase gen types typescript --project-id YOUR-DEV-PROJECT-REF > src/types/database.ts"
```

Both should produce identical output since the schemas are the same.

## Part 10: Workflow Going Forward

```
1. git checkout dev
2. git pull origin dev
3. git checkout -b feature/task-X.Y.Z
4. ... work, commit ...
5. git push origin feature/task-X.Y.Z
6. Create PR: feature/task-X.Y.Z → dev
7. Vercel creates preview deployment automatically
8. Test on preview URL with test users
9. Merge PR to dev
10. When ready for production: merge dev → main
```

For solo work, pushing directly to `dev` and skipping PRs is also fine. The key point is that `dev` is your testing ground and `main` stays production-ready.

---

## Checklist

- [ ] Create new Supabase project (Part 1)
- [ ] Run all 5 migrations (Part 2)
- [ ] Create `attachments` storage bucket + policies (Part 3)
- [ ] Copy dev credentials (Part 4)
- [ ] Update `.env.local` to point at dev project (Part 5)
- [ ] Disable email confirmation on dev project (Part 6)
- [ ] Create 3 test users: admin, vendor, organizer (Part 6)
- [ ] Confirm `dev` exists and is synced with `main` (Part 7)
- [ ] Configure Vercel env vars, including the two required Production rows (Part 8)
- [ ] Add `db:types:dev` script to package.json (Part 9)
