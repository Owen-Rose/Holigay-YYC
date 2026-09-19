# Tasks: Self-Hosted Infrastructure

**Input**: Design documents from `/specs/008-self-hosted-infrastructure/`
**Prerequisites**: plan.md, spec.md (with `checklists/requirements.md` passed), research.md (R1–R19, checks V1–V10), contracts/deploy-env.md, contracts/operator-interface.md, quickstart.md (the ops record). No data-model.md — the spec's entities are hosts, images, snapshots and runbooks, none persisted by the app.

**Tests**: Included — plan.md's constitution check (Principle II) requires test-first for `next.config.ts`, the env module, the email client and the Supabase client factories. Infrastructure files are verified by `docker compose config`, `caddy validate`, `shellcheck`, `ansible-playbook --syntax-check`, a local `docker build` + run, and `npm run smoke` against every environment.

**Organization**: Task IDs T001–T027 are fixed: `quickstart.md`'s evidence rows and `plan.md` cite them. Phases follow spec priority. Phase 2 is the manual prerequisites (accounts, DNS, router) that US1's last task and every later story depend on; they run in parallel with the US1 code. `[manual]` tasks are dashboard, hardware or terminal work done by the maintainer; each ends with an **evidence:** clause and is ticked only when the matching row in `quickstart.md` is filled (spec 005 T062 / spec 006 T004 / spec 007 precedent). Every task is one `- [ ] Txxx [P?] [USn] …` line — the Speckit checklist format that `/speckit-implement` ticks — and the fourteen repo tasks carry their **Files**, **Interfaces** and step-by-step checkboxes beneath that line (the superpowers plan format; the steps are sub-items, not tasks). Each repo task is one branch off `dev` and one PR, commits tagged `[008-Txxx]`, gated by `npm run lint && npm test && npm run build` with the local stack up (`docker restart supabase_kong_Holigay` if auth health returns 502 after a reset). **No Claude co-authoring trailers on commits or PRs.** `<domain>` is a placeholder everywhere below (research R3); substitute the real name on the hosts and in the evidence rows, never in committed files beyond `deploy/.env.example`.

> **For agentic workers:** REQUIRED SUB-SKILL: use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement the repo tasks task-by-task. `[manual]` tasks are for the maintainer; an agent stops at them and reports what is needed. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Run Holigay Vendor Market on a Raspberry Pi 5 (production) and a desktop (staging, backups, DR) with a self-hosted Supabase stack, no Vercel, no hosted Supabase, no vendor email SDK — without changing the application.

**Architecture:** One image per environment (Next.js standalone) plus the trimmed Supabase stack (Postgres, GoTrue, PostgREST, storage-api) behind Caddy on a single origin, run by Docker Compose from `deploy/`; restic backups to two repositories; Ansible after a manual first bring-up; runbooks for every operation.

**Tech Stack:** Next.js 16.0.7, `@supabase/ssr` 0.8, nodemailer, Vitest; Docker Compose v2, Caddy 2.11, `supabase/postgres` 17.6.1.063, `gotrue` v2.196.0, `postgrest` v14.1, `storage-api` v1.73.1; restic, WireGuard, ddclient, Uptime Kuma 2.x; Ansible; GitHub Actions + GHCR; Cloudflare DNS.

## Global Constraints

- No application rewrite; no migration; no RLS or auth-model change (spec Context, plan Constitution Check).
- Every container image pinned to an explicit tag; Supabase component tags equal the local `supabase start` stack's (FR-009, research R5).
- Single origin per environment: `app.<domain>` (prod), `staging.<domain>` (staging); the API is path-routed under it (FR-011).
- Cloudflare is optional: every check must pass with the proxy off (FR-017, SC-007).
- Only Caddy publishes ports on `0.0.0.0`; Postgres and Studio on `127.0.0.1`; SSH never reachable from the internet (FR-015, FR-020).
- Secrets only in `deploy/.env` on each host (mode 600) and the password manager; never committed (FR-023).
- `APP_ENV ∈ {development, staging, production}` replaces `VERCEL_ENV`; production requires SMTP + sender and refuses `resend.dev` (FR-002, FR-003).
- Node 22 LTS in CI and the image (FR-001).
- Commits: `<type>(<scope>): <summary> [008-Txxx]`, no co-authoring trailers.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependency on an incomplete task)
- **[Story]**: US1–US6 from spec.md
- **[manual]**: Dashboard/hardware/terminal work; evidence recorded in quickstart.md before ticking
- **[needs-resend]**: blocked until T003 (verified sending domain + SMTP credentials)

---

## Phase 1: Setup

**Purpose**: Finish the spec scaffold so the task list is the source of truth.

- [X] T001 Finish the spec scaffold: `quickstart.md` already holds the evidence rows for every `[manual]` task (created with this tasks.md); change the 008 row in specs/README.md to `| 008 | Self-hosted infrastructure | 🚧 In progress | <PR link> | — |`; open the docs-only PR from `008-self-hosted-infrastructure` to `dev` (spec.md, plan.md, research.md, tasks.md, quickstart.md) and put its link in the README row — PR [#23](https://github.com/Owen-Rose/Holigay-YYC/pull/23).

  - [ ] **Step 1**: `git checkout 008-self-hosted-infrastructure && git add specs/008-self-hosted-infrastructure/tasks.md specs/008-self-hosted-infrastructure/quickstart.md specs/README.md && git commit -m "docs(specs): plan, tasks and evidence record for spec 008 [008-T001]"`
  - [ ] **Step 2**: `git push -u origin 008-self-hosted-infrastructure && gh pr create --base dev --title "docs(specs): spec 008 self-hosted infrastructure (design, plan, tasks)" --body "Design record and task list for the self-hosting migration. No code."` — then edit the README row with the PR number and amend/commit.

---

## Phase 2: Foundational — accounts, DNS, router (manual prerequisites)

**Purpose**: Everything outside the repo that later phases assume. Runs in parallel with Phase 3's code tasks; T012 and every Phase 4+ task depend on it.

- [ ] T002 [P] [manual] Cloudflare and router. (a) Cloudflare: add the domain as a free zone; at the registrar, change the nameservers to the two Cloudflare gives you; wait until the zone shows *Active*. Zone settings: **SSL/TLS → Overview → Full (strict)**; **SSL/TLS → Edge Certificates → Always Use HTTPS: OFF** (research R7 — Caddy owns the redirect and the ACME challenge); **Security → Bots → Bot Fight Mode: OFF**; **Caching → Cache Rules → create** "bypass storage": *When incoming requests match* `URI Path starts with /storage/v1/` → *Cache eligibility: Bypass cache*. Create an API token: **My Profile → API Tokens → Create Token → Edit zone DNS** template, scoped to this zone only; store it in the password manager as `cloudflare-ddns-token`. Do **not** create the `app`/`staging` records yet (T018/T021 do, once the hosts exist). (b) Router: give the Pi a DHCP reservation (note its MAC from `ip link` once imaged, or from the sticker); forward TCP 80 and 443 and UDP 51820 to that LAN address; disable UPnP. evidence: the T002 rows in quickstart.md (zone active date, the four settings, the cache rule name, token name; reservation IP, the three forwards, UPnP state) — FR-015, FR-017, FR-018

- [ ] T003 [P] [manual] Resend sending domain and SMTP credentials. In the Resend dashboard, **Domains → Add Domain** for the sending domain (a subdomain such as `mail.<domain>` keeps the apex clean); add the SPF and DKIM records it lists in Cloudflare DNS (DNS-only, not proxied); wait for *Verified*. Confirm the SMTP settings on the API-keys page: host `smtp.resend.com`, port `465` (implicit TLS), user `resend`, password = an API key with *Sending access* — create one named `holigay-smtp` and store it in the password manager. Decide the sender: `Holigay Vendor Market <noreply@mail.<domain>>`. evidence: the T003 rows in quickstart.md (domain, verified date, key name, sender) — FR-003, spec Assumptions

- [ ] T004 [P] [manual] GitHub environments. Repo **Settings → Environments → New environment** twice: `staging` and `production`. No variables yet (T017 and T021 set `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` once each stack has minted its keys); no protection rules. evidence: the T004 row in quickstart.md — FR-006

**Checkpoint**: DNS is on Cloudflare with the zone settings recorded; the router forwards to a reserved address; Resend can send from the real domain; two empty GitHub environments exist.

---

## Phase 3: User Story 1 — The app is deployable anywhere, and the change ships to Vercel first (Priority: P1) 🎯 MVP

**Goal**: A container image that runs anywhere, an environment contract that no longer mentions the hosting platform, email over plain SMTP, and the >1 MB upload defect fixed — all merged and running on Vercel before any self-hosted host exists.

**Independent Test**: `docker build` produces an image that serves the app against `supabase start`; `npm test` passes the new cases; after promotion, Vercel production builds with `APP_ENV=production` and a 5 MB attachment uploads through `/apply`.

- [ ] T005 [US1] `next.config.ts` — standalone output and the server-action body limit — in `next.config.ts` (files, interfaces and steps below)

**Files:**
- Modify: `next.config.ts`
- Test: `src/test/next-config.test.ts`

**Interfaces:**
- Produces: `.next/standalone/` after `next build` (consumed by T007's Dockerfile); server actions accept bodies up to 11 MB.

- [ ] **Step 1: Write the failing test** — create `src/test/next-config.test.ts`:

```ts
// @vitest-environment node
import { describe, it, expect } from 'vitest';
import nextConfig from '../../next.config';

describe('next.config.ts', () => {
  it('emits a standalone build for the container image', () => {
    expect(nextConfig.output).toBe('standalone');
  });

  it('raises the server-action body limit above the 10 MB attachment cap', () => {
    // Next's default is 1 MB. uploadFile receives the attachment as FormData through a
    // server action and validation allows MAX_FILE_SIZE = 10 MB, so every upload over
    // 1 MB was rejected with HTTP 413 (research.md R18).
    expect(nextConfig.experimental?.serverActions?.bodySizeLimit).toBe('11mb');
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/test/next-config.test.ts`
Expected: FAIL — `expected undefined to be 'standalone'`.

- [ ] **Step 3: Implement** — replace `next.config.ts` with:

```ts
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Emits .next/standalone — a self-contained server that the Dockerfile copies into the
  // runtime image. No effect on `next dev` or on Vercel. specs/008-self-hosted-infrastructure.
  output: 'standalone',
  experimental: {
    serverActions: {
      // Next's default is 1 MB. uploadFile (src/lib/actions/upload.ts) receives the
      // attachment as FormData through a server action and validation allows
      // MAX_FILE_SIZE = 10 MB (src/lib/validations/application.ts), so every upload over
      // 1 MB was rejected with HTTP 413. 11 MB leaves room for the multipart envelope;
      // Caddy's request_body limit (deploy/caddy/) is the outer bound at 20 MB.
      bodySizeLimit: '11mb',
    },
  },
};

export default nextConfig;
```

- [ ] **Step 4: Run the test and the gate**

Run: `npx vitest run src/test/next-config.test.ts && npm run lint && npm run build`
Expected: PASS (2 tests); build prints `Creating an optimized production build` and finishes with `.next/standalone` present (`ls .next/standalone/server.js`).

- [ ] **Step 5: Verify the defect is fixed locally** — with `npx supabase start` and `npm run dev` running, open `http://localhost:3000/apply`, attach a 5 MB file (`head -c 5242880 /dev/urandom > /tmp/five.pdf` — the validator checks MIME type by extension/`File.type`, so a `.pdf` name is enough) and submit. Expected: the application is accepted; before this change the same submit fails with `Body exceeded 1 MB limit`.

- [ ] **Step 6: Commit**

```bash
git add next.config.ts src/test/next-config.test.ts
git commit -m "fix(upload): raise the server-action body limit; emit a standalone build [008-T005]"
```

- [ ] T006 [P] [US1] `Secure` session cookies — in `src/lib/supabase/server.ts` (files, interfaces and steps below)

**Files:**
- Modify: `src/lib/supabase/server.ts`, `src/lib/supabase/client.ts`, `src/middleware.ts`
- Test: `src/test/supabase-clients.test.ts` (new), `src/test/middleware.test.ts` (one case added)

**Interfaces:**
- Produces: every `sb-*` cookie the app writes carries `Secure`. `@supabase/ssr` merges `cookieOptions` over its defaults (`path`, `sameSite=lax`, `httpOnly=false`, `maxAge`), so nothing else changes (research R19).

- [ ] **Step 1: Write the failing tests** — create `src/test/supabase-clients.test.ts`:

```ts
// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';

const createServerClient = vi.fn(() => ({}));
const createBrowserClient = vi.fn(() => ({}));

vi.mock('@supabase/ssr', () => ({ createServerClient, createBrowserClient }));
vi.mock('@/lib/env-public', () => ({
  supabaseUrl: 'https://example.supabase.co',
  supabaseAnonKey: 'test-anon-key',
}));
vi.mock('next/headers', () => ({
  cookies: async () => ({ getAll: () => [], set: () => undefined }),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe('Supabase client factories', () => {
  it('the server client asks @supabase/ssr for Secure cookies', async () => {
    const { createClient } = await import('@/lib/supabase/server');
    await createClient();
    expect(createServerClient).toHaveBeenCalledWith(
      'https://example.supabase.co',
      'test-anon-key',
      expect.objectContaining({ cookieOptions: { secure: true } })
    );
  });

  it('the browser client asks @supabase/ssr for Secure cookies', async () => {
    const { createClient } = await import('@/lib/supabase/client');
    createClient();
    expect(createBrowserClient).toHaveBeenCalledWith(
      'https://example.supabase.co',
      'test-anon-key',
      expect.objectContaining({ cookieOptions: { secure: true } })
    );
  });
});
```

Then in `src/test/middleware.test.ts` add, after the existing `import { middleware } from '@/middleware';` line, `import { createServerClient } from '@supabase/ssr';` and this describe block at the end of the file:

```ts
describe('middleware cookie options', () => {
  it('asks @supabase/ssr for Secure cookies on every request', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null });

    await middleware(makeRequest('/'));

    expect(vi.mocked(createServerClient)).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      expect.objectContaining({ cookieOptions: { secure: true } })
    );
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run src/test/supabase-clients.test.ts src/test/middleware.test.ts`
Expected: 3 failures — `expected "vi.fn()" to be called with arguments: … cookieOptions`.

- [ ] **Step 3: Implement** — in `src/lib/supabase/server.ts` add a `cookieOptions` entry as the first key of the options object:

```ts
  return createServerClient<Database>(supabaseUrl, supabaseAnonKey, {
    // Secure on every session cookie. @supabase/ssr never sets it by default (research
    // R19). Browsers treat http://localhost as a secure context, so `npm run dev` keeps
    // working; Safari is the exception and needs https locally.
    cookieOptions: { secure: true },
    cookies: {
```

In `src/lib/supabase/client.ts`:

```ts
export function createClient() {
  return createBrowserClient<Database>(supabaseUrl, supabaseAnonKey, {
    // See src/lib/supabase/server.ts — the same Secure flag on the browser side.
    cookieOptions: { secure: true },
  });
}
```

In `src/middleware.ts`, the `createServerClient` call gains the same first key:

```ts
  const supabase = createServerClient<Database>(supabaseUrl, supabaseAnonKey, {
    cookieOptions: { secure: true },
    cookies: {
```

- [ ] **Step 4: Run the tests and the gate**

Run: `npx vitest run src/test/supabase-clients.test.ts src/test/middleware.test.ts && npm run lint && npm test`
Expected: PASS.

- [ ] **Step 5: Check V6 by hand** — `npm run dev`, sign in at `http://localhost:3000/login`, open DevTools → Application → Cookies: every `sb-…` cookie shows `Secure` ✓ and the dashboard still loads after a refresh. Record the browser used in the T006 row of quickstart.md.

- [ ] **Step 6: Commit**

```bash
git add src/lib/supabase/server.ts src/lib/supabase/client.ts src/middleware.ts src/test/supabase-clients.test.ts src/test/middleware.test.ts
git commit -m "feat(auth): mark session cookies Secure [008-T006]"
```

- [ ] T007 [P] [US1] Dockerfile and local image run — in `Dockerfile` (files, interfaces and steps below)

**Files:**
- Create: `Dockerfile`, `.dockerignore`
- Modify: `.gitignore` (add `deploy/.env` now, so nothing later can commit it)

**Interfaces:**
- Consumes: `.next/standalone` (T005).
- Produces: image serving on `:3000`, non-root user `nextjs`, `HEALTHCHECK` on `/`; build args `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` (consumed by T010's CI job and T014's `make build-local`).

- [ ] **Step 1: Create `Dockerfile`**

```dockerfile
# syntax=docker/dockerfile:1
# Holigay Vendor Market — container image. specs/008-self-hosted-infrastructure (T007).
#
# Two stages. The builder runs `next build` natively on the CI runner's architecture
# (research R8 — no cross-building, because Next traces `sharp` into the standalone output).
# NEXT_PUBLIC_* are inlined at build time, which is why one image is built per environment.

FROM node:22-alpine AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL \
    NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY
RUN npm run build

# Runtime: the standalone server, its traced node_modules, static assets and public/.
FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0
RUN addgroup -S -g 1001 nodejs && adduser -S -u 1001 -G nodejs nextjs
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
USER nextjs
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -q --spider http://127.0.0.1:3000/ || exit 1
CMD ["node", "server.js"]
```

- [ ] **Step 2: Create `.dockerignore`**

```
node_modules
.next
.git
.github
backup
coverage
deploy
docs
specs
supabase
.env*
!.env.example
```

And append to `.gitignore`:

```
# Host secrets for the self-hosted stack (specs/008). Never committed.
/deploy/.env
```

- [ ] **Step 3: Build against the local stack**

Run (with `npx supabase start` up):

```bash
ANON=$(npx supabase status -o env | sed -n 's/^ANON_KEY="\(.*\)"/\1/p')
docker build \
  --build-arg NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321 \
  --build-arg NEXT_PUBLIC_SUPABASE_ANON_KEY="$ANON" \
  -t holigay-app:local .
```

Expected: ends with `naming to docker.io/library/holigay-app:local`. `docker image ls holigay-app` shows a size in the 200–300 MB range.

- [ ] **Step 4: Run it and prove it works** — `--network host` so the container's `127.0.0.1:54321` is the workstation's local stack (the same reason the Pi uses `extra_hosts`, research R7):

```bash
docker run --rm --network host --name holigay-local \
  -e APP_ENV=development holigay-app:local
```

In another shell: `curl -sS -o /dev/null -w '%{http_code}\n' http://localhost:3000/` → `200`; open `http://localhost:3000/login`, sign in as a seeded organizer (`scripts/seed-role.sql` against the local stack if none exists), open an application. `docker inspect --format '{{.State.Health.Status}}' holigay-local` → `healthy` after ~30 s. Stop with Ctrl-C.

- [ ] **Step 5: Commit**

```bash
git add Dockerfile .dockerignore .gitignore
git commit -m "build: multi-stage Dockerfile for the standalone app image [008-T007]"
```

- [ ] T008 [US1] Environment contract: `APP_ENV` and SMTP replace `VERCEL_ENV` and `RESEND_API_KEY` — in `src/lib/env.ts` (files, interfaces and steps below)

**Files:**
- Modify: `src/lib/env.ts`, `src/test/env.test.ts`, `src/test/keepalive-route.test.ts` (stub list only), `.env.example`, `CLAUDE.md` ("Environment Variables" section), `specs/007-production-readiness/contracts/env-contract.md`, `docs/DEV-ENVIRONMENT-SETUP.md` (Part 8 table)

**Interfaces:**
- Produces from `@/lib/env`: `appEnv: 'development' | 'staging' | 'production'`, `isProduction: boolean`, `smtp: { host: string; port: number; user: string; pass: string } | null`, `emailFromAddress: string | undefined`; `cronSecret` and `keepaliveTargets` **unchanged until T026** (the keep-alive protects the hosted projects while they remain the rollback target). `resendApiKey` is removed.
- Consumed by: T009 (email client), `src/app/api/keepalive/route.ts` (unchanged).

- [ ] **Step 1: Rewrite `src/test/env.test.ts`** — replace the whole file:

```ts
// @vitest-environment node
//
// Runs under Node, not the unit project's jsdom default: src/lib/env.ts guards
// against being imported from client code with `typeof window !== 'undefined'`,
// which is always true under jsdom.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const ENV_VARS = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'APP_ENV',
  'SMTP_HOST',
  'SMTP_PORT',
  'SMTP_USER',
  'SMTP_PASS',
  'EMAIL_FROM_ADDRESS',
  'CRON_SECRET',
  'KEEPALIVE_SUPABASE_TARGETS',
] as const;

/**
 * Stubs every variable the env modules read. Anything absent from `overrides`
 * is explicitly unset, so a case can never inherit a value from the developer's
 * shell or from another test file sharing the Vitest worker's process.env.
 */
function stubEnv(overrides: Partial<Record<(typeof ENV_VARS)[number], string>> = {}) {
  for (const name of ENV_VARS) {
    vi.stubEnv(name, overrides[name]);
  }
}

const SMTP = {
  SMTP_HOST: 'smtp.resend.com',
  SMTP_PORT: '465',
  SMTP_USER: 'resend',
  SMTP_PASS: 're_live_key',
} as const;

const VALID_KEEPALIVE =
  'https://dev.supabase.co|dev-anon-key,https://prod.supabase.co|prod-anon-key';

beforeEach(() => {
  vi.resetModules();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

// ---------------------------------------------------------------------------
// env-public
// ---------------------------------------------------------------------------

describe('@/lib/env-public', () => {
  it('throws one aggregated error naming both variables when both are missing', async () => {
    stubEnv();

    await expect(import('@/lib/env-public')).rejects.toThrow(
      /^Invalid environment: NEXT_PUBLIC_SUPABASE_URL \(.+\); NEXT_PUBLIC_SUPABASE_ANON_KEY \(.+\)$/
    );
  });

  it('exports the pair when both are set', async () => {
    stubEnv({
      NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon-key',
    });

    const env = await import('@/lib/env-public');

    expect(env.supabaseUrl).toBe('https://example.supabase.co');
    expect(env.supabaseAnonKey).toBe('anon-key');
  });

  it('rejects a URL that is not a URL', async () => {
    stubEnv({
      NEXT_PUBLIC_SUPABASE_URL: 'not-a-url',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon-key',
    });

    await expect(import('@/lib/env-public')).rejects.toThrow('NEXT_PUBLIC_SUPABASE_URL');
  });

  it('treats an empty string as unset', async () => {
    stubEnv({
      NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: '',
    });

    await expect(import('@/lib/env-public')).rejects.toThrow('NEXT_PUBLIC_SUPABASE_ANON_KEY');
  });
});

// ---------------------------------------------------------------------------
// env — production strictness
// ---------------------------------------------------------------------------

describe('@/lib/env production strictness', () => {
  it('names every missing SMTP and sender variable in one error', async () => {
    stubEnv({ APP_ENV: 'production' });

    await expect(import('@/lib/env')).rejects.toThrow(
      'Invalid environment: SMTP_HOST (required when APP_ENV=production); ' +
        'SMTP_PORT (required when APP_ENV=production); ' +
        'SMTP_USER (required when APP_ENV=production); ' +
        'SMTP_PASS (required when APP_ENV=production); ' +
        'EMAIL_FROM_ADDRESS (required when APP_ENV=production)'
    );
  });

  it('refuses the resend.dev test sender', async () => {
    stubEnv({
      APP_ENV: 'production',
      ...SMTP,
      EMAIL_FROM_ADDRESS: 'Holigay Vendor Market <onboarding@resend.dev>',
    });

    await expect(import('@/lib/env')).rejects.toThrow(
      'EMAIL_FROM_ADDRESS (must not use the resend.dev test sender in production)'
    );
  });

  it('treats a blank sender as missing', async () => {
    stubEnv({ APP_ENV: 'production', ...SMTP, EMAIL_FROM_ADDRESS: '' });

    await expect(import('@/lib/env')).rejects.toThrow(
      'EMAIL_FROM_ADDRESS (required when APP_ENV=production)'
    );
  });

  it.each([
    ['a display name and address', 'Holigay Vendor Market <noreply@holigay.co>'],
    ['a bare address', 'noreply@holigay.co'],
  ])('accepts %s', async (_label, address) => {
    stubEnv({ APP_ENV: 'production', ...SMTP, EMAIL_FROM_ADDRESS: address });

    const env = await import('@/lib/env');

    expect(env.emailFromAddress).toBe(address);
    expect(env.isProduction).toBe(true);
    expect(env.appEnv).toBe('production');
    expect(env.smtp).toEqual({ host: 'smtp.resend.com', port: 465, user: 'resend', pass: 're_live_key' });
  });

  it('rejects a bare display name with no address', async () => {
    stubEnv({ APP_ENV: 'production', ...SMTP, EMAIL_FROM_ADDRESS: 'Holigay Vendor Market' });

    await expect(import('@/lib/env')).rejects.toThrow('EMAIL_FROM_ADDRESS');
  });

  it('rejects a non-numeric SMTP port', async () => {
    stubEnv({
      APP_ENV: 'production',
      ...SMTP,
      SMTP_PORT: 'tls',
      EMAIL_FROM_ADDRESS: 'noreply@holigay.co',
    });

    await expect(import('@/lib/env')).rejects.toThrow('SMTP_PORT');
  });

  it('rejects an unknown APP_ENV', async () => {
    stubEnv({ APP_ENV: 'preview' });

    await expect(import('@/lib/env')).rejects.toThrow('APP_ENV');
  });
});

// ---------------------------------------------------------------------------
// env — lenient outside production
// ---------------------------------------------------------------------------

describe('@/lib/env outside production', () => {
  it.each([
    ['APP_ENV unset', undefined],
    ['APP_ENV=development', 'development'],
    ['APP_ENV=staging', 'staging'],
  ])('parses with nothing set when %s', async (_label, appEnv) => {
    stubEnv(appEnv ? { APP_ENV: appEnv } : {});

    const env = await import('@/lib/env');

    expect(env.isProduction).toBe(false);
    expect(env.appEnv).toBe(appEnv ?? 'development');
    expect(env.smtp).toBeNull();
    expect(env.emailFromAddress).toBeUndefined();
  });

  it('exposes the SMTP settings when all four are set', async () => {
    stubEnv({ ...SMTP });

    const env = await import('@/lib/env');

    expect(env.smtp).toEqual({ host: 'smtp.resend.com', port: 465, user: 'resend', pass: 're_live_key' });
  });

  it('treats a partial SMTP configuration as unset rather than throwing', async () => {
    stubEnv({ SMTP_HOST: 'smtp.resend.com', SMTP_PORT: '465' });

    const env = await import('@/lib/env');

    expect(env.smtp).toBeNull();
  });

  // Only the *requirement* is production-gated. The values must still pass
  // through, or local `npm run dev` email delivery breaks.
  it('passes the sender through when set, even on the resend.dev domain', async () => {
    stubEnv({ ...SMTP, EMAIL_FROM_ADDRESS: 'Holigay Vendor Market <onboarding@resend.dev>' });

    const env = await import('@/lib/env');

    expect(env.isProduction).toBe(false);
    expect(env.emailFromAddress).toBe('Holigay Vendor Market <onboarding@resend.dev>');
  });
});

// ---------------------------------------------------------------------------
// env — keep-alive values (unchanged until the hosted projects are deleted)
// ---------------------------------------------------------------------------

describe('@/lib/env cronSecret', () => {
  it('exposes a secret of at least 16 characters', async () => {
    stubEnv({ CRON_SECRET: 'x'.repeat(16) });

    const env = await import('@/lib/env');

    expect(env.cronSecret).toBe('x'.repeat(16));
  });

  it.each([
    ['shorter than 16 characters', 'x'.repeat(15)],
    ['unset', undefined],
  ])('is null when %s', async (_label, secret) => {
    stubEnv(secret ? { CRON_SECRET: secret } : {});

    const env = await import('@/lib/env');

    expect(env.cronSecret).toBeNull();
  });
});

describe('@/lib/env keepaliveTargets', () => {
  it('parses comma-separated url|key pairs', async () => {
    stubEnv({ KEEPALIVE_SUPABASE_TARGETS: VALID_KEEPALIVE });

    const env = await import('@/lib/env');

    expect(env.keepaliveTargets).toEqual([
      { url: 'https://dev.supabase.co', anonKey: 'dev-anon-key' },
      { url: 'https://prod.supabase.co', anonKey: 'prod-anon-key' },
    ]);
  });

  it.each([
    ['unset', undefined],
    ['missing the separator', 'https://dev.supabase.co'],
    ['missing the key', 'https://dev.supabase.co|'],
    ['not a URL', 'dev.supabase.co|dev-anon-key'],
    ['one bad pair among good ones', 'https://dev.supabase.co|dev-key,garbage'],
  ])('is null when %s, and never throws', async (_label, raw) => {
    stubEnv(raw ? { KEEPALIVE_SUPABASE_TARGETS: raw } : {});

    const env = await import('@/lib/env');

    expect(env.keepaliveTargets).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// env — server-only guard
// ---------------------------------------------------------------------------

describe('@/lib/env server-only guard', () => {
  it('throws when imported where a browser global exists', async () => {
    stubEnv();
    vi.stubGlobal('window', {});

    await expect(import('@/lib/env')).rejects.toThrow(/server-only/);
  });
});
```

In `src/test/keepalive-route.test.ts` replace the `ENV_VARS` array with:

```ts
const ENV_VARS = [
  'APP_ENV',
  'SMTP_HOST',
  'SMTP_PORT',
  'SMTP_USER',
  'SMTP_PASS',
  'EMAIL_FROM_ADDRESS',
  'CRON_SECRET',
  'KEEPALIVE_SUPABASE_TARGETS',
] as const;
```

and replace any remaining `VERCEL_ENV` in that file with `APP_ENV` (`grep -n VERCEL_ENV src/test/keepalive-route.test.ts` must print nothing afterwards).

- [ ] **Step 2: Run to verify the new cases fail**

Run: `npx vitest run src/test/env.test.ts`
Expected: the production-strictness and SMTP cases FAIL (`APP_ENV` is not yet read; `smtp` is not exported).

- [ ] **Step 3: Rewrite `src/lib/env.ts`** — replace the whole file:

```ts
import { z } from 'zod';

/**
 * Server environment contract.
 *
 * Strictness keys on `APP_ENV === 'production'` — set explicitly on the production
 * host (and, until the migration completes, on the Vercel Production deploy) — and
 * never on `NODE_ENV`, which every production-mode build sets. Staging and local
 * builds stay lenient so work continues while an SMTP relay is being set up.
 *
 * See specs/007-production-readiness/contracts/env-contract.md (updated by spec 008).
 */

if (typeof window !== 'undefined') {
  throw new Error(
    '@/lib/env is server-only and must never be imported from a client component. ' +
      'Use @/lib/env-public for NEXT_PUBLIC_* values.'
  );
}

export type AppEnv = 'development' | 'staging' | 'production';
export type SmtpConfig = { host: string; port: number; user: string; pass: string };
export type KeepaliveTarget = { url: string; anonKey: string };

/** `Name <local@domain>` or a bare `local@domain`. Rejects a bare display name. */
const EMAIL_FROM_PATTERN =
  /^(?:[^<>]*<\s*[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+\s*>|[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+)$/;

// Every field below APP_ENV is an unconditionally-valid optional string. Zod skips
// an object-level superRefine when any inner field fails, so keeping the shape
// always-parseable is what makes the aggregated production message deterministic
// and what guarantees CRON_SECRET / KEEPALIVE_SUPABASE_TARGETS can never raise an
// issue. An empty string is treated as unset: a CI or host can set a variable to
// "", and a blank EMAIL_FROM_ADDRESS must not slip past the guard.
const optionalEnv = z
  .string()
  .trim()
  .optional()
  .transform((value) => (value === '' ? undefined : value));

const SMTP_KEYS = ['SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASS'] as const;

const serverEnvSchema = z
  .object({
    APP_ENV: z
      .enum(['development', 'staging', 'production'], {
        error: 'must be one of development, staging, production (or unset)',
      })
      .optional(),
    SMTP_HOST: optionalEnv,
    SMTP_PORT: optionalEnv,
    SMTP_USER: optionalEnv,
    SMTP_PASS: optionalEnv,
    EMAIL_FROM_ADDRESS: optionalEnv,
    CRON_SECRET: optionalEnv,
    KEEPALIVE_SUPABASE_TARGETS: optionalEnv,
  })
  .superRefine((env, ctx) => {
    // The port must be a port wherever it is set, production or not.
    if (env.SMTP_PORT !== undefined && !/^\d{1,5}$/.test(env.SMTP_PORT)) {
      ctx.addIssue({ code: 'custom', path: ['SMTP_PORT'], message: 'must be a port number' });
    }

    if (env.APP_ENV !== 'production') return;

    for (const key of SMTP_KEYS) {
      if (!env[key]) {
        ctx.addIssue({ code: 'custom', path: [key], message: 'required when APP_ENV=production' });
      }
    }

    if (!env.EMAIL_FROM_ADDRESS) {
      ctx.addIssue({
        code: 'custom',
        path: ['EMAIL_FROM_ADDRESS'],
        message: 'required when APP_ENV=production',
      });
    } else if (env.EMAIL_FROM_ADDRESS.includes('resend.dev')) {
      ctx.addIssue({
        code: 'custom',
        path: ['EMAIL_FROM_ADDRESS'],
        message: 'must not use the resend.dev test sender in production',
      });
    } else if (!EMAIL_FROM_PATTERN.test(env.EMAIL_FROM_ADDRESS)) {
      ctx.addIssue({
        code: 'custom',
        path: ['EMAIL_FROM_ADDRESS'],
        message: 'must be "Name <local@domain>" or a bare local@domain address',
      });
    }
  });

const parsed = serverEnvSchema.safeParse(process.env);

if (!parsed.success) {
  throw new Error(
    `Invalid environment: ${parsed.error.issues
      .map((issue) => `${issue.path.join('.')} (${issue.message})`)
      .join('; ')}`
  );
}

const env = parsed.data;

/**
 * Parses `url|key,url|key`. Returns null on anything malformed rather than
 * throwing: /api/keepalive answers 500 `misconfigured` instead, so the app
 * deploys fine before the keep-alive is configured.
 */
function parseKeepaliveTargets(raw: string | undefined): KeepaliveTarget[] | null {
  if (!raw) return null;

  const pairs = raw
    .split(',')
    .map((pair) => pair.trim())
    .filter((pair) => pair.length > 0);

  if (pairs.length === 0) return null;

  const targets: KeepaliveTarget[] = [];

  for (const pair of pairs) {
    const parts = pair.split('|');
    if (parts.length !== 2) return null;

    const url = parts[0].trim();
    const anonKey = parts[1].trim();
    if (!anonKey || !z.url().safeParse(url).success) return null;

    targets.push({ url, anonKey });
  }

  return targets;
}

/** Which environment this process believes it is; `development` when unset. */
export const appEnv: AppEnv = env.APP_ENV ?? 'development';

/** True only when APP_ENV=production — NOT `NODE_ENV === 'production'`. */
export const isProduction: boolean = appEnv === 'production';

/**
 * The SMTP relay, or null when any of the four values is unset. Required only in
 * production; anywhere else sendEmail logs instead of sending when this is null.
 */
export const smtp: SmtpConfig | null =
  env.SMTP_HOST && env.SMTP_PORT && env.SMTP_USER && env.SMTP_PASS
    ? { host: env.SMTP_HOST, port: Number(env.SMTP_PORT), user: env.SMTP_USER, pass: env.SMTP_PASS }
    : null;

/**
 * Undefined when unset. Required (and refused on resend.dev) only in production;
 * anywhere else the email client falls back to the resend.dev test sender.
 */
export const emailFromAddress: string | undefined = env.EMAIL_FROM_ADDRESS;

/** Null unless a secret of at least 16 characters is configured. */
export const cronSecret: string | null =
  env.CRON_SECRET && env.CRON_SECRET.length >= 16 ? env.CRON_SECRET : null;

/** Null when unset or malformed. */
export const keepaliveTargets: KeepaliveTarget[] | null = parseKeepaliveTargets(
  env.KEEPALIVE_SUPABASE_TARGETS
);
```

`src/lib/email/client.ts` still imports `resendApiKey` at this point, so `npm run build` fails until T009 — run only the env tests here and do T009 in the same PR.

- [ ] **Step 4: Run the env tests**

Run: `npx vitest run src/test/env.test.ts src/test/keepalive-route.test.ts`
Expected: env suite PASS; keep-alive suite PASS (it never reads the email values).

- [ ] **Step 5: Documentation in the same change** —

`.env.example`: replace the block from `# Email Configuration (Resend)` through the end of the `# Production strictness` section with:

```
# Email — plain SMTP (nodemailer). Any transactional relay works; the project uses
# Resend's SMTP endpoint on its free tier. Leave all four unset locally: emails are
# logged to the console instead of sent. Set all four to actually send.
# SMTP_HOST=smtp.resend.com
# SMTP_PORT=465
# SMTP_USER=resend
# SMTP_PASS=re_your_api_key_here

# Optional: sender address. `Name <local@domain>` or a bare `local@domain`.
# Default outside production: onboarding@resend.dev (Resend's test sender, which
# delivers ONLY to the Resend account owner's mailbox).
# EMAIL_FROM_ADDRESS=Holigay Vendor Market <noreply@yourdomain.com>

# -----------------------------------------------------------------------------
# Production strictness
# -----------------------------------------------------------------------------
# APP_ENV is one of development | staging | production (unset = development). The
# production host sets APP_ENV=production in deploy/.env; the Vercel Production deploy
# sets it too until the migration completes. Never set it in .env.local.
#
# When APP_ENV=production, SMTP_HOST/PORT/USER/PASS and EMAIL_FROM_ADDRESS become
# REQUIRED and a sender on the resend.dev domain is refused — the build fails rather
# than silently emailing from an address only the Resend account owner can receive.
# Staging and local builds stay lenient. NODE_ENV is deliberately NOT used for this
# decision: every production-mode build sets it.
#
# Full contract: specs/007-production-readiness/contracts/env-contract.md
```

`specs/007-production-readiness/contracts/env-contract.md`: add at the top, under the title, `**Updated by spec 008 (2026-09-19):** \`VERCEL_ENV\` → \`APP_ENV\`; \`RESEND_API_KEY\` → \`SMTP_HOST/PORT/USER/PASS\` (nodemailer). The keep-alive rows stay until spec 008 T026.`; in "Strictness rule" replace `**\`VERCEL_ENV === 'production'\`** — a Vercel Production deploy of \`main\`. Preview deploys (\`VERCEL_ENV=preview\`) and local builds (\`VERCEL_ENV\` unset)` with `**\`APP_ENV === 'production'\`** — set explicitly on the production host (and on the Vercel Production deploy until the migration completes). Staging (\`APP_ENV=staging\`) and local builds (\`APP_ENV\` unset)`; in the Variables table delete the `RESEND_API_KEY` row and the `VERCEL_ENV` row and add:

```
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` | `env` → `src/lib/email/client.ts` | optional — emails are logged, not sent | optional | **required** (all four) | host non-empty; port numeric; user/pass non-empty |
| `APP_ENV` | `env` | unset (= `development`) | `staging` | `production` | one of `development`, `staging`, `production`, or unset |
```

(rename the table's `Preview` column to `Staging`); in "Failure behaviour" change the example message's first item to `SMTP_HOST (required when APP_ENV=production)`; replace "when `RESEND_API_KEY` is unset" with "when any `SMTP_*` value is unset"; in "Where each deployment sets them" replace the `RESEND_API_KEY` row with `| \`SMTP_*\` | set (same relay) | set | optional |` and note under the table: `On the self-hosted hosts every value lives in \`deploy/.env\` (see \`deploy/.env.example\`).`

`CLAUDE.md` "Environment Variables": replace the `RESEND_API_KEY=re_...` optional line with the four `SMTP_*` lines (`SMTP_HOST=smtp.resend.com`, `SMTP_PORT=465`, `SMTP_USER=resend`, `SMTP_PASS=re_...   # any SMTP relay; logged to console if unset`); in the env-module bullet change `Exports \`isProduction\`, \`resendApiKey\`, \`emailFromAddress\`, \`cronSecret\`, \`keepaliveTargets\`` to `Exports \`appEnv\`, \`isProduction\`, \`smtp\`, \`emailFromAddress\`, \`cronSecret\`, \`keepaliveTargets\``; replace the paragraph starting `**Production strictness keys on \`VERCEL_ENV === 'production'\`, never \`NODE_ENV\`.**` with:

```
**Production strictness keys on `APP_ENV === 'production'`, never `NODE_ENV`.**
`APP_ENV` is `development | staging | production` (unset = development) and is set
explicitly per host (`deploy/.env`) — and on Vercel Production until spec 008 completes.
Every production-mode build sets `NODE_ENV=production`, so keying on it would make every
staging build strict. In production, the four `SMTP_*` values and `EMAIL_FROM_ADDRESS` are
required and a sender containing `resend.dev` is refused — that test sender delivers only
to the Resend account owner's mailbox, so using it in production means every vendor email
silently vanishes. Staging and local builds stay lenient.
```

`docs/DEV-ENVIRONMENT-SETUP.md` Part 8 table: replace the two `RESEND_API_KEY` rows with `| \`SMTP_HOST\` / \`SMTP_PORT\` / \`SMTP_USER\` / \`SMTP_PASS\` | \`smtp.resend.com\` / \`465\` / \`resend\` / the API key | Preview and **Production (required)** |` and add `| \`APP_ENV\` | \`staging\` | Preview |` and `| \`APP_ENV\` | \`production\` | **Production (required)** |`; in the callout below replace `\`VERCEL_ENV=production\` makes \`RESEND_API_KEY\` and \`EMAIL_FROM_ADDRESS\` mandatory` with `\`APP_ENV=production\` makes the four \`SMTP_*\` values and \`EMAIL_FROM_ADDRESS\` mandatory`.

- [ ] **Step 6: Commit (together with T009 below, one PR)** — no commit yet; T009 finishes the build.

- [ ] T009 [US1] Email over SMTP with nodemailer — in `src/lib/email/client.ts` (files, interfaces and steps below)

**Files:**
- Modify: `src/lib/email/client.ts`, `src/test/email-client.test.ts`, `package.json` + `package-lock.json` (add `nodemailer`, `@types/nodemailer`; remove `resend`), `src/app/(auth)/signup/page.tsx`

**Interfaces:**
- Consumes: `smtp`, `emailFromAddress`, `isProduction` from `@/lib/env` (T008).
- Produces: unchanged `sendEmail(options: EmailOptions): Promise<EmailResult>`, `isEmailConfigured(): boolean`, `getDefaultFromEmail(): string`, `wrapEmailTemplate`, `htmlToPlainText`. Call sites (`applications.ts:222,862`, `answers.ts:246`, `api/test-email`) need no change.

- [ ] **Step 1: Install / uninstall**

```bash
npm install nodemailer && npm install --save-dev @types/nodemailer && npm uninstall resend
```

Expected: `package.json` dependencies gain `"nodemailer"`, devDependencies gain `"@types/nodemailer"`, `"resend"` is gone; `grep -rn "from 'resend'" src` prints only `src/lib/email/client.ts` (fixed in Step 3).

- [ ] **Step 2: Rewrite `src/test/email-client.test.ts`** — replace the file's mock, helpers and `sendEmail`/`isEmailConfigured` describes (everything before the first template-helper test, if any — the current file ends after `isEmailConfigured`) with:

```ts
// @vitest-environment node
//
// Runs under Node, not the unit project's jsdom default: this suite imports the
// real email client, which pulls in @/lib/env and its browser guard.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock nodemailer so tests never open a socket. createTransport returns an object
// whose sendMail is the shared mockSend; vi.clearAllMocks resets its call history
// between tests while keeping the mock in place.
const mockSend = vi.fn();
const mockCreateTransport = vi.fn(() => ({ sendMail: mockSend }));

vi.mock('nodemailer', () => ({
  default: { createTransport: mockCreateTransport },
  createTransport: mockCreateTransport,
}));

const ENV_VARS = [
  'APP_ENV',
  'SMTP_HOST',
  'SMTP_PORT',
  'SMTP_USER',
  'SMTP_PASS',
  'EMAIL_FROM_ADDRESS',
] as const;

/**
 * Stubs every variable the email client reads through @/lib/env; anything absent
 * from `overrides` is explicitly unset. A production-shaped case must set all six —
 * @/lib/env refuses to parse in production without them, and the dynamic import
 * below would throw.
 */
function stubEnv(overrides: Partial<Record<(typeof ENV_VARS)[number], string>> = {}) {
  for (const name of ENV_VARS) {
    vi.stubEnv(name, overrides[name]);
  }
}

const SMTP = {
  SMTP_HOST: 'smtp.resend.com',
  SMTP_PORT: '465',
  SMTP_USER: 'resend',
  SMTP_PASS: 're_test_key',
} as const;

// getTransport caches its transport in a module-level `let`, and both the client
// and @/lib/env read their config at module load. Calling vi.resetModules() +
// dynamically re-importing for every test keeps env-var changes visible.
beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('sendEmail', () => {
  it('uses the dev-log fallback when no relay is configured outside production', async () => {
    stubEnv();

    const { sendEmail } = await import('@/lib/email/client');

    const result = await sendEmail({ to: 'vendor@example.com', subject: 'Test', html: '<p>Test</p>' });

    expect(result.success).toBe(true);
    expect(result.messageId).toMatch(/^dev-/);
    expect(result.error).toBeNull();
    expect(mockCreateTransport).not.toHaveBeenCalled();
    expect(mockSend).not.toHaveBeenCalled();
  });

  // NODE_ENV is 'production' for every production-mode build, so it must not change
  // what sendEmail does: a staging build with no relay logs rather than failing.
  it('still uses the dev-log fallback when NODE_ENV=production but APP_ENV is not', async () => {
    stubEnv();
    vi.stubEnv('NODE_ENV', 'production');

    const { sendEmail } = await import('@/lib/email/client');

    const result = await sendEmail({ to: 'vendor@example.com', subject: 'Test', html: '<p>Test</p>' });

    expect(result.success).toBe(true);
    expect(result.messageId).toMatch(/^dev-/);
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('opens one implicit-TLS transport on port 465 and sends through it (happy path)', async () => {
    stubEnv({ ...SMTP });
    mockSend.mockResolvedValue({ messageId: '<msg-123@smtp.resend.com>' });

    const { sendEmail } = await import('@/lib/email/client');

    const result = await sendEmail({
      to: 'vendor@example.com',
      subject: 'Test',
      html: '<p>Test</p>',
      text: 'Test',
    });

    expect(mockCreateTransport).toHaveBeenCalledOnce();
    expect(mockCreateTransport).toHaveBeenCalledWith({
      host: 'smtp.resend.com',
      port: 465,
      secure: true,
      auth: { user: 'resend', pass: 're_test_key' },
    });
    expect(mockSend).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'vendor@example.com', subject: 'Test', html: '<p>Test</p>', text: 'Test' })
    );
    expect(result).toEqual({ success: true, messageId: '<msg-123@smtp.resend.com>', error: null });
  });

  it('uses STARTTLS (secure: false) on any port other than 465', async () => {
    stubEnv({ ...SMTP, SMTP_PORT: '587' });
    mockSend.mockResolvedValue({ messageId: 'x' });

    const { sendEmail } = await import('@/lib/email/client');
    await sendEmail({ to: 'vendor@example.com', subject: 'Test', html: '<p>Test</p>' });

    expect(mockCreateTransport).toHaveBeenCalledWith(expect.objectContaining({ port: 587, secure: false }));
  });

  it('falls back to the resend.dev test sender when EMAIL_FROM_ADDRESS is unset', async () => {
    stubEnv({ ...SMTP });
    mockSend.mockResolvedValue({ messageId: 'x' });

    const { sendEmail } = await import('@/lib/email/client');
    await sendEmail({ to: 'vendor@example.com', subject: 'Test', html: '<p>Test</p>' });

    expect(mockSend).toHaveBeenCalledWith(
      expect.objectContaining({ from: 'Holigay Vendor Market <onboarding@resend.dev>' })
    );
  });

  it('sends from the configured address on a production deploy', async () => {
    stubEnv({
      APP_ENV: 'production',
      ...SMTP,
      EMAIL_FROM_ADDRESS: 'Holigay Vendor Market <noreply@holigay.co>',
    });
    mockSend.mockResolvedValue({ messageId: 'x' });

    const { sendEmail } = await import('@/lib/email/client');
    await sendEmail({ to: 'vendor@example.com', subject: 'Test', html: '<p>Test</p>' });

    expect(mockSend).toHaveBeenCalledWith(
      expect.objectContaining({ from: 'Holigay Vendor Market <noreply@holigay.co>' })
    );
  });

  it('passes recipient lists, reply-to, cc and bcc through', async () => {
    stubEnv({ ...SMTP });
    mockSend.mockResolvedValue({ messageId: 'x' });

    const { sendEmail } = await import('@/lib/email/client');
    await sendEmail({
      to: ['a@example.com', 'b@example.com'],
      subject: 'Test',
      html: '<p>Test</p>',
      replyTo: 'organizers@example.com',
      cc: 'c@example.com',
      bcc: ['d@example.com'],
    });

    expect(mockSend).toHaveBeenCalledWith(
      expect.objectContaining({
        to: ['a@example.com', 'b@example.com'],
        replyTo: 'organizers@example.com',
        cc: 'c@example.com',
        bcc: ['d@example.com'],
      })
    );
  });

  it('reports a failed send without throwing', async () => {
    stubEnv({ ...SMTP });
    mockSend.mockRejectedValue(new Error('535 Authentication failed'));

    const { sendEmail } = await import('@/lib/email/client');
    const result = await sendEmail({ to: 'vendor@example.com', subject: 'Test', html: '<p>Test</p>' });

    expect(result).toEqual({ success: false, messageId: null, error: '535 Authentication failed' });
  });
});

describe('isEmailConfigured', () => {
  it('is false when no relay is set', async () => {
    stubEnv();

    const { isEmailConfigured } = await import('@/lib/email/client');

    expect(isEmailConfigured()).toBe(false);
  });

  it('is true when all four SMTP values are set', async () => {
    stubEnv({ ...SMTP });

    const { isEmailConfigured } = await import('@/lib/email/client');

    expect(isEmailConfigured()).toBe(true);
  });
});
```

- [ ] **Step 3: Run to verify they fail**

Run: `npx vitest run src/test/email-client.test.ts`
Expected: FAIL — the module still imports `resendApiKey` (now undefined export) and `resend` (uninstalled).

- [ ] **Step 4: Implement** — in `src/lib/email/client.ts` replace everything from the top of the file through the end of `getResendClient()` (the current lines 1–39) with:

```ts
import { emailFromAddress, smtp } from '@/lib/env';
import nodemailer, { type Transporter } from 'nodemailer';

// =============================================================================
// Configuration
// =============================================================================

/**
 * Default sender email address
 *
 * Both values come from the environment contract (@/lib/env), which requires a
 * verified-domain sender in production and refuses the resend.dev test domain
 * there. Outside production the fallback below applies — when the relay is
 * Resend, it delivers only to the account owner's mailbox.
 *
 * @see specs/007-production-readiness/contracts/env-contract.md
 */
const DEFAULT_FROM_EMAIL = emailFromAddress ?? 'Holigay Vendor Market <onboarding@resend.dev>';

/**
 * SMTP transport, created lazily on the first send so that a build or a test
 * never opens a socket. Port 465 is implicit TLS; anything else (587) uses
 * STARTTLS, which nodemailer negotiates when `secure` is false.
 */
let transport: Transporter | null = null;

function getTransport(): Transporter | null {
  if (transport) return transport;

  if (!smtp) {
    console.warn('[Email] SMTP_HOST/PORT/USER/PASS are not all set. Emails will be logged but not sent.');
    return null;
  }

  transport = nodemailer.createTransport({
    host: smtp.host,
    port: smtp.port,
    secure: smtp.port === 465,
    auth: { user: smtp.user, pass: smtp.pass },
  });
  return transport;
}
```

Replace the `sendEmail` function body (from `const resend = getResendClient();` through its closing `}`) with:

```ts
export async function sendEmail(options: EmailOptions): Promise<EmailResult> {
  const { to, subject, html, text, from = DEFAULT_FROM_EMAIL, replyTo, cc, bcc } = options;

  const transporter = getTransport();

  // Development fallback: log email instead of sending
  if (!transporter) {
    const logEntry: EmailLogEntry = {
      timestamp: new Date().toISOString(),
      to,
      subject,
      from,
    };

    console.log('[Email] Would send email (no SMTP relay configured):');
    console.log(JSON.stringify(logEntry, null, 2));

    return {
      success: true,
      messageId: `dev-${Date.now()}`,
      error: null,
    };
  }

  try {
    const info = await transporter.sendMail({ from, to, subject, html, text, replyTo, cc, bcc });

    return {
      success: true,
      messageId: info.messageId ?? null,
      error: null,
    };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown error occurred';
    console.error('[Email] SMTP error:', err);

    return {
      success: false,
      messageId: null,
      error: errorMessage,
    };
  }
}
```

Update the two doc comments that mention Resend: the `EmailResult.messageId` comment becomes `/** SMTP message id if successful */`, and the `sendEmail` JSDoc's first line becomes `Sends an email over SMTP (nodemailer)` with `Graceful degradation when the relay is not configured`. Replace `isEmailConfigured`:

```ts
/**
 * Checks if email sending is configured and available
 *
 * Reflects the configuration read at boot by @/lib/env, not a live process.env
 * lookup.
 *
 * @returns true if all four SMTP_* values were configured at startup
 */
export function isEmailConfigured(): boolean {
  return smtp !== null;
}
```

In `src/app/(auth)/signup/page.tsx` replace the success message paragraph's text — confirmations are off (`supabase/config.toml` `enable_confirmations = false`) so the "check your email" sentence has always been dead copy:

```tsx
          <p className="text-sm text-green-400">
            Account created successfully! You can now{' '}
            <Link href="/login" className="font-medium underline">
              sign in
            </Link>
            .
          </p>
```

and change the comment above `setSuccess(true)` to `// Show success message — confirmations are off, so the account is usable immediately`.

- [ ] **Step 5: Run the tests and the full gate**

Run: `npx vitest run src/test/email-client.test.ts && npm run lint && npm test && npm run build`
Expected: all PASS; `grep -rn "resend" src --include='*.ts' --include='*.tsx' -i` shows only the `onboarding@resend.dev` fallback string, the `resend.dev` refusal in `env.ts`, and comments.

- [ ] **Step 6: Send one real email locally** — in the shell: `SMTP_HOST=smtp.resend.com SMTP_PORT=465 SMTP_USER=resend SMTP_PASS=<key from T003> npm run dev`, then `curl -s "http://localhost:3000/api/test-email?to=<your address>"` (see `src/app/api/test-email/route.ts` for its query parameters) — the message arrives from `onboarding@resend.dev` (the account owner's mailbox only) or from `EMAIL_FROM_ADDRESS` if also set. Record in the T009 row of quickstart.md. Skip if T003 is not done yet; the unit tests are the gate.

- [ ] **Step 7: Commit and open the PR (T008 + T009)**

```bash
git add src/lib/env.ts src/lib/email/client.ts src/test/env.test.ts src/test/email-client.test.ts src/test/keepalive-route.test.ts package.json package-lock.json .env.example CLAUDE.md docs/DEV-ENVIRONMENT-SETUP.md "specs/007-production-readiness/contracts/env-contract.md" "src/app/(auth)/signup/page.tsx"
git commit -m "feat(email): send over SMTP with nodemailer; APP_ENV replaces VERCEL_ENV [008-T008 008-T009]"
```

PR body must state the ordering rule: **before the next `dev → main` promotion, Vercel Production needs `APP_ENV=production`, the four `SMTP_*` values and `EMAIL_FROM_ADDRESS`, and `RESEND_API_KEY` can be deleted** — otherwise the production build fails on purpose (T012).

- [ ] T010 [US1] CI: Node 22 and the `build-image` job — in `.github/workflows/ci.yml` (files, interfaces and steps below)

**Files:**
- Modify: `.github/workflows/ci.yml`, `package.json` (`@types/node` → `^22`)

**Interfaces:**
- Consumes: `Dockerfile` (T007); GitHub environments `staging`/`production` (T004) with variables `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` (set by T017/T021).
- Produces: `ghcr.io/owen-rose/holigay-app:{staging|prod}-<short sha>` and the floating `:staging` / `:prod` tags (consumed by `deploy.sh`, T014).

- [ ] **Step 1: Node 22** — in `.github/workflows/ci.yml` change both `node-version: '20'` to `node-version: '22'`; run `npm install --save-dev @types/node@^22`. Run `npm run lint && npm test && npm run build` — PASS.

- [ ] **Step 2: Append the job** to `.github/workflows/ci.yml` (same indentation as the other jobs):

```yaml
  # Spec 008 (T010): one image per environment, built natively for its host.
  # dev → staging-<sha> on amd64 (the desktop); main → prod-<sha> on arm64 (the Pi).
  # NEXT_PUBLIC_* are inlined by `next build`, so they are build args from the
  # GitHub environment's variables (public values, not secrets). Pull requests never
  # publish images. Skips cleanly until the environment's variables are set.
  build-image:
    needs: [lint-test-build, security-tests]
    if: github.event_name == 'push' && (github.ref == 'refs/heads/dev' || github.ref == 'refs/heads/main')
    runs-on: ${{ github.ref == 'refs/heads/main' && 'ubuntu-24.04-arm' || 'ubuntu-latest' }}
    environment: ${{ github.ref == 'refs/heads/main' && 'production' || 'staging' }}
    permissions:
      contents: read
      packages: write
    env:
      IMAGE: ghcr.io/owen-rose/holigay-app
      PREFIX: ${{ github.ref == 'refs/heads/main' && 'prod' || 'staging' }}

    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Gate on the environment's public Supabase values
        id: gate
        run: |
          if [ -z "${{ vars.NEXT_PUBLIC_SUPABASE_URL }}" ] || [ -z "${{ vars.NEXT_PUBLIC_SUPABASE_ANON_KEY }}" ]; then
            echo "ready=false" >> "$GITHUB_OUTPUT"
            echo "NEXT_PUBLIC_SUPABASE_URL / _ANON_KEY are not set for this environment; nothing to build."
          else
            echo "ready=true" >> "$GITHUB_OUTPUT"
          fi
          echo "sha=${GITHUB_SHA::7}" >> "$GITHUB_OUTPUT"

      - name: Set up Docker Buildx
        if: steps.gate.outputs.ready == 'true'
        uses: docker/setup-buildx-action@v3

      - name: Log in to GHCR
        if: steps.gate.outputs.ready == 'true'
        uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}

      - name: Build and push
        if: steps.gate.outputs.ready == 'true'
        uses: docker/build-push-action@v6
        with:
          context: .
          push: true
          tags: |
            ${{ env.IMAGE }}:${{ env.PREFIX }}-${{ steps.gate.outputs.sha }}
            ${{ env.IMAGE }}:${{ env.PREFIX }}
          build-args: |
            NEXT_PUBLIC_SUPABASE_URL=${{ vars.NEXT_PUBLIC_SUPABASE_URL }}
            NEXT_PUBLIC_SUPABASE_ANON_KEY=${{ vars.NEXT_PUBLIC_SUPABASE_ANON_KEY }}
          cache-from: type=gha,scope=${{ env.PREFIX }}
          cache-to: type=gha,scope=${{ env.PREFIX }},mode=max
```

- [ ] **Step 3: Validate the workflow locally** — `npx --yes @action-validator/cli .github/workflows/ci.yml` (or paste into GitHub's workflow editor, which lints on save). Expected: no errors.

- [ ] **Step 4: Commit, push, observe**

```bash
git add .github/workflows/ci.yml package.json package-lock.json
git commit -m "ci: Node 22; build-image job publishing per-environment images to GHCR [008-T010]"
```

After merge to `dev`: the `build-image` job runs, prints the "not set for this environment" line and succeeds without pushing. Once T021 sets the staging variables, the first real push creates the package **private** — `[manual]`: GitHub → Packages → `holigay-app` → Package settings → Change visibility → **Public** (the repo is public; anonymous pulls need no token on the hosts). Record in the T010 row of quickstart.md.

- [ ] T011 [US1] Smoke check: optional authenticated storage round-trip — in `scripts/smoke-check.mjs` (files, interfaces and steps below)

**Files:**
- Modify: `scripts/smoke-check.mjs`, `.env.example` (smoke section), `docs/runbooks/event-week-smoke.md` (§1 and §1.1 only — the host changes are T026)

**Interfaces:**
- Consumes: env `SMOKE_ORGANIZER_EMAIL`, `SMOKE_ORGANIZER_PASSWORD` (optional), `SMOKE_STORAGE_EXPECT_PRIVATE=1` (optional; set on the self-hosted stack, where Caddy overrides `Cache-Control`).
- Produces: a sixth check, `storage-round-trip`, printed as `PASS`/`FAIL`/`SKIP`; the summary line counts checks dynamically.

- [ ] **Step 1: Add the check** — in `scripts/smoke-check.mjs`:

(a) After `const REQUIRED_ENV = […]` add:

```js
/** Optional: with both set, check 6 signs in as an organizer and round-trips one object. */
const ORGANIZER_ENV = ['SMOKE_ORGANIZER_EMAIL', 'SMOKE_ORGANIZER_PASSWORD'];

/**
 * A 1×1 transparent PNG. Small, valid, and an allowed attachment type. Uploaded under the
 * app's own `uploads/` prefix so the bucket policies treat it exactly like a real attachment.
 */
const SMOKE_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
  'base64'
);
```

(b) In `readEnv()`, extend the returned object:

```js
  return {
    appUrl: trimmed('SMOKE_APP_URL'),
    supabaseUrl: trimmed('SMOKE_SUPABASE_URL'),
    anonKey: process.env.SMOKE_SUPABASE_ANON_KEY.trim(),
    organizer: ORGANIZER_ENV.every((name) => process.env[name]?.trim())
      ? { email: process.env.SMOKE_ORGANIZER_EMAIL.trim(), password: process.env.SMOKE_ORGANIZER_PASSWORD }
      : null,
    expectPrivateStorage: process.env.SMOKE_STORAGE_EXPECT_PRIVATE === '1',
  };
```

(c) Replace the check runner's bookkeeping so the total is counted, and add a skip: change `const failed = [];` to `const failed = []; let total = 0;`, add `total += 1;` as the first line of `runCheck`, and add after `runCheck`:

```js
/** Prints a SKIP line for an optional check whose inputs are absent. Not counted as run. */
function skipCheck(name, why) {
  process.stdout.write(`SKIP ${name} (${why})\n`);
}
```

(d) Add the check after `checkOrganizerRpcsDenied`:

```js
/**
 * 6. (optional) An organizer can upload, sign, download and delete one object — the path
 * the dashboard's attachment download takes — and the download is marked non-cacheable
 * where the stack promises that. This is the check that would have caught the four
 * storage failures the spec 008 design review found: no CORS from storage-api, edge
 * caching of private files, the 1 MB action limit and a smoke that never touched storage.
 */
async function checkStorageRoundTrip(supabaseUrl, anonKey, organizer, expectPrivate) {
  // A separate client: signing in on the shared one would turn checks 2–5 into
  // authenticated calls and prove nothing about anon.
  const client = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: {
      fetch: (input, init = {}) =>
        fetch(input, { ...init, signal: init.signal ?? AbortSignal.timeout(TIMEOUT_MS) }),
    },
  });

  const { error: signInError } = await client.auth.signInWithPassword(organizer);
  if (signInError) return fail(`sign-in failed: ${signInError.message}`);

  const path = `uploads/smoke-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.png`;
  const bucket = client.storage.from('attachments');

  try {
    const { error: uploadError } = await bucket.upload(path, SMOKE_PNG, {
      contentType: 'image/png',
      upsert: false,
    });
    if (uploadError) return fail(`upload → ${uploadError.message}`);

    const { data: signed, error: signError } = await bucket.createSignedUrl(path, 60);
    if (signError) return fail(`createSignedUrl → ${signError.message}`);

    const response = await fetch(signed.signedUrl, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    const body = Buffer.from(await response.arrayBuffer());
    if (response.status !== 200) return fail(`signed download → HTTP ${response.status}`);
    if (!body.equals(SMOKE_PNG)) return fail(`signed download → ${body.length} bytes, expected ${SMOKE_PNG.length}`);

    const cacheControl = response.headers.get('cache-control') ?? '';
    const cfCache = response.headers.get('cf-cache-status');
    if (expectPrivate && !/no-store/.test(cacheControl)) {
      return fail(`signed download is cacheable: Cache-Control "${cacheControl}" — Caddy must override it to private, no-store`);
    }
    if (cfCache === 'HIT') {
      return fail('signed download was served from the Cloudflare cache — the /storage/v1 bypass rule is missing');
    }

    return pass(`cache-control: ${cacheControl || 'none'}${cfCache ? `, cf-cache-status: ${cfCache}` : ''}`);
  } finally {
    // Always clean up, even after a failure; a leftover object is a false alarm next run.
    await bucket.remove([path]);
    await client.auth.signOut();
  }
}
```

(e) In `main()`, read the new inputs and run or skip the check, and make the summary dynamic:

```js
  const { appUrl, supabaseUrl, anonKey, organizer, expectPrivateStorage } = readEnv();
  …
  await runCheck('organizer-rpcs-denied', () => checkOrganizerRpcsDenied(supabase));
  if (organizer) {
    await runCheck('storage-round-trip', () =>
      checkStorageRoundTrip(supabaseUrl, anonKey, organizer, expectPrivateStorage)
    );
  } else {
    skipCheck('storage-round-trip', 'set SMOKE_ORGANIZER_EMAIL and SMOKE_ORGANIZER_PASSWORD to run it');
  }

  if (failed.length > 0) {
    process.stdout.write(`\n${failed.length} of ${total} failed: ${failed.join(', ')}\n`);
    process.exit(1);
  }

  process.stdout.write(`\nall ${total} checks passed\n`);
  process.exit(0);
```

Update the header comment's usage block with the three optional variables, and the sentence "It cannot write." to: "Checks 1–5 cannot write. Check 6 runs only when organizer credentials are supplied, writes exactly one object under `uploads/` and deletes it before returning."

- [ ] **Step 2: Run against the local stack** — with `npx supabase start` and `npm run dev`:

```bash
ANON=$(npx supabase status -o env | sed -n 's/^ANON_KEY="\(.*\)"/\1/p')
SMOKE_APP_URL=http://localhost:3000 SMOKE_SUPABASE_URL=http://127.0.0.1:54321 SMOKE_SUPABASE_ANON_KEY=$ANON npm run smoke
```

Expected: five `PASS` lines, `SKIP storage-round-trip (…)`, `all 5 checks passed`, exit 0. Then with `SMOKE_ORGANIZER_EMAIL=<seeded organizer> SMOKE_ORGANIZER_PASSWORD=…` added: `PASS storage-round-trip (cache-control: …)`, `all 6 checks passed`. Then with `SMOKE_STORAGE_EXPECT_PRIVATE=1` added: `FAIL storage-round-trip: signed download is cacheable …` and exit 1 (the local stack has no Caddy override — this proves the assertion bites).

- [ ] **Step 3: Documentation** — `.env.example` smoke section: after the `SMOKE_SUPABASE_ANON_KEY` lines add:

```
# SMOKE_ORGANIZER_EMAIL / SMOKE_ORGANIZER_PASSWORD (optional): with both set, a sixth
#   check signs in as that organizer, uploads one small PNG under uploads/, downloads it
#   through a 60-second signed URL and deletes it. Use a dedicated organizer account.
# SMOKE_STORAGE_EXPECT_PRIVATE=1 (optional): also require the download to carry
#   `Cache-Control: private, no-store`. Set it on the self-hosted stack, never on hosted.
```

`docs/runbooks/event-week-smoke.md` §1: add the same three variables to the command block as optional lines and a row to the §1.1 table: `| \`storage-round-trip\` | (optional) an organizer can upload, sign, download and delete an attachment; on the self-hosted stack the download is non-cacheable | Storage policies changed; Caddy's Cache-Control override or Cloudflare's bypass rule missing |`; change "five checks" wording to "checks" where it appears in §1.

- [ ] **Step 4: Commit**

```bash
git add scripts/smoke-check.mjs .env.example docs/runbooks/event-week-smoke.md
git commit -m "feat(smoke): optional authenticated storage round-trip [008-T011]"
```

- [ ] T012 [manual] [US1] [needs-resend] Ship US1 to Vercel. Vercel → Settings → Environment Variables: **Production** — add `APP_ENV=production`, `SMTP_HOST=smtp.resend.com`, `SMTP_PORT=465`, `SMTP_USER=resend`, `SMTP_PASS=<the holigay-smtp key from T003>`, `EMAIL_FROM_ADDRESS=<the sender from T003>`; delete `RESEND_API_KEY`. **Preview** — `APP_ENV=staging` plus the same SMTP values. Then promote: `git checkout main && git merge --ff-only dev && git push`. Verify: the Production deploy builds (the env guard is satisfied); on the production URL submit an application through `/apply` with a 5 MB attachment — accepted; run `SMOKE_APP_URL=<prod> SMOKE_SUPABASE_URL=https://hgmfjvjlxrhdojwlkgap.supabase.co SMOKE_SUPABASE_ANON_KEY=<prod anon> SMOKE_ORGANIZER_EMAIL=… SMOKE_ORGANIZER_PASSWORD=… npm run smoke` (no `SMOKE_STORAGE_EXPECT_PRIVATE`) → `all 6 checks passed`; the "application received" email arrives from the verified domain. Clean up the test application with the event-week runbook §3. evidence: the three T012 rows in quickstart.md — FR-002, FR-003, FR-004, SC-009

**Checkpoint**: the image builds and runs locally; CI publishes (or cleanly skips) images; Vercel production runs on `APP_ENV=production` with SMTP and accepts a 5 MB attachment. Nothing self-hosted exists yet, and nothing needs to.

---

## Phase 4: User Story 2 — Production runs on the Pi, on the real hostnames, with a rehearsed way back (Priority: P2)

**Goal**: The `deploy/` directory (Compose, Caddy, init SQL, key minting, deploy script, Makefile), the runbooks to bring a Pi up by hand and to migrate it, and the Pi itself serving `app.<domain>` behind Cloudflare with the hosted stack as a rehearsed DNS-flip rollback.

**Independent Test**: From a freshly imaged Pi, following `docs/runbooks/host-setup.md` reaches `npm run smoke … SMOKE_STORAGE_EXPECT_PRIVATE=1` → `all 6 checks passed` on `https://app.<domain>`; the click-through passes; the proxy toggles off and on with no change; DNS flips back to Vercel and forward again.

- [ ] T013 [US2] The stack: `deploy/compose.yml`, Caddy, init SQL, key minting — in `deploy/README.md` (files, interfaces and steps below)

**Files:**
- Create: `deploy/README.md`, `deploy/compose.yml`, `deploy/caddy/Caddyfile`, `deploy/caddy/supabase-api.caddy`, `deploy/.env.example`, `deploy/db/init/roles.sql`, `deploy/db/init/jwt.sql`, `deploy/bin/mint-keys.sh`

**Interfaces:**
- Consumes: the app image `ghcr.io/owen-rose/holigay-app:<tag>` (T010) with env `APP_ENV`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SMTP_*`, `EMAIL_FROM_ADDRESS` (T008/T009).
- Produces: services `caddy`, `app`, `db`, `auth`, `rest`, `storage` (+ profile `admin`: `meta`, `studio`); env keys documented in `deploy/.env.example` (consumed by `deploy.sh` T014, `compose.staging.yml` T020, `backup.sh` T022); `mint-keys.sh` output lines `POSTGRES_PASSWORD`, `JWT_SECRET`, `ANON_KEY`, `SERVICE_ROLE_KEY`, `PG_META_CRYPTO_KEY`, `RESTIC_PASSWORD`.

- [ ] **Step 1: `deploy/README.md`**

```markdown
# deploy/ — the self-hosted stack

Everything needed to run Holigay Vendor Market on one host with Docker Compose. Spec:
`specs/008-self-hosted-infrastructure/` (design record in its `research.md`). Procedures are
runbooks under `docs/runbooks/`; this file only says what is here.

| Path | What |
|---|---|
| `compose.yml` | The six services — caddy, app, db, auth (GoTrue), rest (PostgREST), storage (storage-api) — plus the optional `admin` profile (studio, meta). Same file on production and staging. |
| `compose.staging.yml` | Overrides for the desktop: plain-HTTP Caddy behind the Pi, the `staging` image tag. |
| `caddy/Caddyfile` | Production Caddy: TLS, one origin per hostname, the staging proxy, an internal `:8000` for Studio. |
| `caddy/Caddyfile.staging` | Staging Caddy: same routing, no TLS (the Pi terminates it). |
| `caddy/supabase-api.caddy` | The three `handle_path` routes both Caddyfiles import. |
| `.env.example` | Every variable the stack reads, documented. Copy to `.env` (mode 600) on the host. |
| `db/init/` | Two init scripts from the Supabase reference stack, run once when the data directory is empty. |
| `bin/mint-keys.sh` | Generates every secret for `.env`. |
| `bin/deploy.sh` | Pull the tag in `.env` and restart the app. Manual on production, on a timer on staging. |
| `bin/backup.sh`, `bin/restore.sh` | Six-hourly backup to two restic repositories; restore from a snapshot. |
| `systemd/` | Timer units for the staging auto-deploy and the backup. |
| `monitoring/compose.yml` | Uptime Kuma, on the desktop. |
| `ansible/` | The playbook that reproduces `docs/runbooks/host-setup.md`. |

Host layout: the repo is cloned at `/srv/holigay/app`; Compose runs from `/srv/holigay/app/deploy`
with `.env` beside it; data lives outside the checkout under `/srv/holigay/{db,storage,caddy}` (the
`HOLIGAY_DATA` variable), backups under `/srv/backup`.

Pinning rule: the four Supabase images carry the same tags the local `supabase start` stack runs.
Bump them only by `docs/runbooks/upgrade-stack.md`.
```

- [ ] **Step 2: `deploy/compose.yml`**

```yaml
# Holigay Vendor Market — self-hosted stack. specs/008-self-hosted-infrastructure (T013).
#
# One file for production (the Pi) and staging (the desktop); compose.staging.yml overrides
# the differences. Every image is pinned; the Supabase component tags equal the local
# `supabase start` stack's (research R5) — bump them only per docs/runbooks/upgrade-stack.md.
#
# Docker's port publishing bypasses ufw, so THIS FILE is the container firewall
# (research R7): only caddy publishes on 0.0.0.0; db and studio bind to 127.0.0.1;
# everything else is unpublished and reachable only on the compose network.
#
# Bring-up order matters on a fresh host: db, then auth + storage (each runs its own
# schema migrations), then the app migrations (docs/runbooks/migrate.md), then caddy + app.

name: holigay

x-logging: &default-logging
  driver: json-file
  options:
    max-size: "10m"
    max-file: "3"

services:
  caddy:
    image: caddy:2.11.4-alpine
    restart: unless-stopped
    logging: *default-logging
    ports:
      - "80:80"
      - "443:443"
      - "443:443/udp"
    volumes:
      - ./caddy/Caddyfile:/etc/caddy/Caddyfile:ro
      - ./caddy/supabase-api.caddy:/etc/caddy/supabase-api.caddy:ro
      - ${HOLIGAY_DATA}/caddy/data:/data
      - ${HOLIGAY_DATA}/caddy/config:/config
    environment:
      ACME_EMAIL: ${ACME_EMAIL}
      APP_HOST: ${APP_HOST}
      STAGING_HOST: ${STAGING_HOST}
      STAGING_UPSTREAM: ${STAGING_UPSTREAM}
      STAGING_BASIC_AUTH_USER: ${STAGING_BASIC_AUTH_USER}
      STAGING_BASIC_AUTH_HASH: ${STAGING_BASIC_AUTH_HASH}

  app:
    image: ghcr.io/owen-rose/holigay-app:${APP_IMAGE_TAG}
    restart: unless-stopped
    logging: *default-logging
    # The Next.js server calls its own public URL; resolve it to this machine's Caddy
    # (production) or the Pi's (staging) instead of looping through the router (research R7).
    extra_hosts:
      - "${APP_HOST}:${APP_HOST_RESOLVES_TO}"
    environment:
      APP_ENV: ${APP_ENV}
      NEXT_PUBLIC_SUPABASE_URL: https://${APP_HOST}
      NEXT_PUBLIC_SUPABASE_ANON_KEY: ${ANON_KEY}
      SMTP_HOST: ${SMTP_HOST}
      SMTP_PORT: ${SMTP_PORT}
      SMTP_USER: ${SMTP_USER}
      SMTP_PASS: ${SMTP_PASS}
      EMAIL_FROM_ADDRESS: ${EMAIL_FROM_ADDRESS}
    depends_on:
      auth:
        condition: service_healthy
      rest:
        condition: service_healthy
      storage:
        condition: service_healthy

  db:
    image: public.ecr.aws/supabase/postgres:17.6.1.063
    restart: unless-stopped
    logging: *default-logging
    ports:
      - "127.0.0.1:5432:5432"
    volumes:
      - ./db/init/roles.sql:/docker-entrypoint-initdb.d/init-scripts/99-roles.sql:ro
      - ./db/init/jwt.sql:/docker-entrypoint-initdb.d/init-scripts/99-jwt.sql:ro
      - ${HOLIGAY_DATA}/db/data:/var/lib/postgresql/data
      # Holds the pgsodium/Vault root key. Losing it on recreate silently rotates the key.
      - ${HOLIGAY_DATA}/db/config:/etc/postgresql-custom
    environment:
      POSTGRES_HOST: /var/run/postgresql
      PGPORT: 5432
      POSTGRES_PORT: 5432
      # The image makes `postgres` a superuser with THIS password; db push logs in with it.
      PGPASSWORD: ${POSTGRES_PASSWORD}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      PGDATABASE: postgres
      POSTGRES_DB: postgres
      JWT_SECRET: ${JWT_SECRET}
      JWT_EXP: ${JWT_EXPIRY}
    command:
      - postgres
      - -c
      - config_file=/etc/postgresql/postgresql.conf
      - -c
      - log_min_messages=fatal
    healthcheck:
      test: ["CMD", "pg_isready", "-U", "postgres", "-h", "localhost"]
      interval: 5s
      timeout: 5s
      retries: 10

  auth:
    image: public.ecr.aws/supabase/gotrue:v2.196.0
    restart: unless-stopped
    logging: *default-logging
    depends_on:
      db:
        condition: service_healthy
    environment:
      GOTRUE_API_HOST: 0.0.0.0
      GOTRUE_API_PORT: 9999
      API_EXTERNAL_URL: https://${APP_HOST}/auth/v1
      GOTRUE_DB_DRIVER: postgres
      GOTRUE_DB_DATABASE_URL: postgres://supabase_auth_admin:${POSTGRES_PASSWORD}@db:5432/postgres
      GOTRUE_SITE_URL: https://${APP_HOST}
      GOTRUE_URI_ALLOW_LIST: https://${APP_HOST}/**
      GOTRUE_DISABLE_SIGNUP: "false"
      GOTRUE_JWT_ADMIN_ROLES: service_role
      GOTRUE_JWT_AUD: authenticated
      GOTRUE_JWT_DEFAULT_GROUP_NAME: authenticated
      GOTRUE_JWT_EXP: ${JWT_EXPIRY}
      GOTRUE_JWT_SECRET: ${JWT_SECRET}
      GOTRUE_JWT_ISSUER: https://${APP_HOST}/auth/v1
      GOTRUE_EXTERNAL_EMAIL_ENABLED: "true"
      GOTRUE_EXTERNAL_ANONYMOUS_USERS_ENABLED: "false"
      # Parity with supabase/config.toml: confirmations off, signup open, min length 6.
      GOTRUE_MAILER_AUTOCONFIRM: "true"
      GOTRUE_PASSWORD_MIN_LENGTH: 6
      GOTRUE_SMTP_ADMIN_EMAIL: ${SMTP_ADMIN_EMAIL}
      GOTRUE_SMTP_HOST: ${SMTP_HOST}
      GOTRUE_SMTP_PORT: ${SMTP_PORT}
      GOTRUE_SMTP_USER: ${SMTP_USER}
      GOTRUE_SMTP_PASS: ${SMTP_PASS}
      GOTRUE_SMTP_SENDER_NAME: ${SMTP_SENDER_NAME}
      # Links in auth emails are API_EXTERNAL_URL resolved against these paths (research R3).
      GOTRUE_MAILER_URLPATHS_INVITE: /auth/v1/verify
      GOTRUE_MAILER_URLPATHS_CONFIRMATION: /auth/v1/verify
      GOTRUE_MAILER_URLPATHS_RECOVERY: /auth/v1/verify
      GOTRUE_MAILER_URLPATHS_EMAIL_CHANGE: /auth/v1/verify
      GOTRUE_EXTERNAL_PHONE_ENABLED: "false"
      GOTRUE_SMS_AUTOCONFIRM: "false"
    healthcheck:
      test: ["CMD", "wget", "--no-verbose", "--tries=1", "--spider", "http://localhost:9999/health"]
      interval: 5s
      timeout: 5s
      retries: 3

  rest:
    image: public.ecr.aws/supabase/postgrest:v14.1
    restart: unless-stopped
    logging: *default-logging
    depends_on:
      db:
        condition: service_healthy
    environment:
      PGRST_DB_URI: postgres://authenticator:${POSTGRES_PASSWORD}@db:5432/postgres
      PGRST_DB_SCHEMAS: public,graphql_public
      # Migration 001 calls uuid_generate_v4() from the extensions schema (config.toml parity).
      PGRST_DB_EXTRA_SEARCH_PATH: public,extensions
      PGRST_DB_MAX_ROWS: 1000
      PGRST_DB_ANON_ROLE: anon
      PGRST_JWT_SECRET: ${JWT_SECRET}
      PGRST_DB_USE_LEGACY_GUCS: "false"
      PGRST_APP_SETTINGS_JWT_SECRET: ${JWT_SECRET}
      PGRST_APP_SETTINGS_JWT_EXP: ${JWT_EXPIRY}
      PGRST_ADMIN_SERVER_PORT: 3001
    command: ["postgrest"]
    healthcheck:
      test: ["CMD", "postgrest", "--ready"]
      interval: 5s
      timeout: 5s
      retries: 3

  storage:
    image: public.ecr.aws/supabase/storage-api:v1.73.1
    restart: unless-stopped
    logging: *default-logging
    depends_on:
      db:
        condition: service_healthy
      rest:
        condition: service_started
    volumes:
      - ${HOLIGAY_DATA}/storage:/var/lib/storage
    environment:
      ANON_KEY: ${ANON_KEY}
      SERVICE_KEY: ${SERVICE_ROLE_KEY}
      POSTGREST_URL: http://rest:3000
      AUTH_JWT_SECRET: ${JWT_SECRET}
      DATABASE_URL: postgres://supabase_storage_admin:${POSTGRES_PASSWORD}@db:5432/postgres
      STORAGE_PUBLIC_URL: https://${APP_HOST}
      FILE_SIZE_LIMIT: 52428800
      STORAGE_BACKEND: file
      FILE_STORAGE_BACKEND_PATH: /var/lib/storage
      GLOBAL_S3_BUCKET: stub
      TENANT_ID: stub
      REGION: stub
      ENABLE_IMAGE_TRANSFORMATION: "false"
    healthcheck:
      test: ["CMD", "wget", "--no-verbose", "--tries=1", "--spider", "http://storage:5000/status"]
      interval: 5s
      timeout: 5s
      retries: 3
      start_period: 10s

  # --- optional admin profile: `docker compose --profile admin up -d` ---------------
  # Studio on 127.0.0.1:3001, reached through an SSH tunnel; never published beyond it.
  meta:
    profiles: [admin]
    image: public.ecr.aws/supabase/postgres-meta:v0.96.4
    restart: unless-stopped
    logging: *default-logging
    depends_on:
      db:
        condition: service_healthy
    environment:
      PG_META_PORT: 8080
      PG_META_DB_HOST: db
      PG_META_DB_PORT: 5432
      PG_META_DB_NAME: postgres
      PG_META_DB_USER: postgres
      PG_META_DB_PASSWORD: ${POSTGRES_PASSWORD}
      CRYPTO_KEY: ${PG_META_CRYPTO_KEY}

  studio:
    profiles: [admin]
    image: public.ecr.aws/supabase/studio:2026.04.08-sha-205cbe7
    restart: unless-stopped
    logging: *default-logging
    ports:
      - "127.0.0.1:3001:3000"
    depends_on:
      meta:
        condition: service_started
    environment:
      HOSTNAME: "0.0.0.0"
      STUDIO_PG_META_URL: http://meta:8080
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      PG_META_CRYPTO_KEY: ${PG_META_CRYPTO_KEY}
      DEFAULT_ORGANIZATION_NAME: Holigay Events YYC
      DEFAULT_PROJECT_NAME: ${APP_ENV}
      # The internal listener in caddy/Caddyfile; Studio's server side talks to the API here.
      SUPABASE_URL: http://caddy:8000
      SUPABASE_PUBLIC_URL: https://${APP_HOST}
      SUPABASE_ANON_KEY: ${ANON_KEY}
      SUPABASE_SERVICE_KEY: ${SERVICE_ROLE_KEY}
      AUTH_JWT_SECRET: ${JWT_SECRET}
      ENABLED_FEATURES_LOGS_ALL: "false"
```

If `postgrest --ready` turns out not to exist on v14.1 (`docker compose ps` shows `rest` unhealthy while `docker compose logs rest` shows it listening), replace that healthcheck line with `test: ["CMD-SHELL", "wget -q --spider http://localhost:3001/ready || exit 1"]` and record the finding in `research.md` under V-checks; the reference stack's v14.17 uses `--ready`.

- [ ] **Step 3: `deploy/caddy/supabase-api.caddy`**

```
# Imported into every site block that serves the Supabase API (Caddyfile and
# Caddyfile.staging). Strips the /x/v1 prefix each service expects to be without — the
# job the reference stack's gateway does (research R2). Order: specific prefixes first,
# the site's catch-all `handle` last.

request_body {
	max_size 20MB
}

handle_path /auth/v1/* {
	reverse_proxy auth:9999
}

handle_path /rest/v1/* {
	reverse_proxy rest:3000
}

handle_path /storage/v1/* {
	# Private files must never be cached at the edge (research R7): storage-api emits
	# max-age=3600 and Cloudflare caches images/PDFs by extension. `defer` applies the
	# override after the upstream response headers are copied in.
	header {
		Cache-Control "private, no-store"
		-Pragma
		defer
	}
	reverse_proxy storage:5000
}
```

- [ ] **Step 4: `deploy/caddy/Caddyfile`** (production; the staging one is T020)

```
# Caddyfile — production (the Pi). specs/008-self-hosted-infrastructure (T013).
#
# One origin per environment (research R3): the UI and the Supabase API share {$APP_HOST};
# the API prefixes are dispatched in supabase-api.caddy before anything reaches Next.js.
# Also fronts staging on the desktop over the LAN, and exposes an internal, unpublished
# :8000 for Studio (admin profile).

{
	email {$ACME_EMAIL}
	servers {
		# Cloudflare's edge ranges (research R7). Without this Caddy discards X-Forwarded-For
		# and GoTrue's per-IP rate limits become one shared bucket. Refresh from
		# https://www.cloudflare.com/ips/ in the quarterly drill.
		trusted_proxies static 173.245.48.0/20 103.21.244.0/22 103.22.200.0/22 103.31.4.0/22 141.101.64.0/18 108.162.192.0/18 190.93.240.0/20 188.114.96.0/20 197.234.240.0/22 198.41.128.0/17 162.158.0.0/15 104.16.0.0/13 104.24.0.0/14 172.64.0.0/13 131.0.72.0/22 2400:cb00::/32 2606:4700::/32 2803:f800::/32 2405:b500::/32 2405:8100::/32 2a06:98c0::/29 2c0f:f248::/32
	}
}

{$APP_HOST} {
	header Strict-Transport-Security "max-age=31536000; includeSubDomains"
	import /etc/caddy/supabase-api.caddy
	handle {
		reverse_proxy app:3000
	}
}

# Staging lives on the desktop; the Pi terminates TLS and proxies over the LAN. Basic auth
# guards the UI only — supabase-js sends its own Authorization header on the API prefixes.
{$STAGING_HOST} {
	@ui not path /auth/v1/* /rest/v1/* /storage/v1/*
	basic_auth @ui {
		{$STAGING_BASIC_AUTH_USER} {$STAGING_BASIC_AUTH_HASH}
	}
	reverse_proxy {$STAGING_UPSTREAM}
}

# Internal only (not published by compose.yml): Studio's server side calls the API here.
:8000 {
	import /etc/caddy/supabase-api.caddy
	respond 404
}
```

- [ ] **Step 5: `deploy/.env.example`** — no inline comments (Compose's dotenv parser does not reliably strip them); a value containing `$` writes each as `$$` because Compose interpolates this file.

```
# deploy/.env.example — copy to deploy/.env (chmod 600) on each host and fill it in.
# Every key is read by compose.yml, caddy/, or bin/*. bin/mint-keys.sh generates the
# secrets. NEVER commit deploy/.env. Compose interpolates `$` here, so a value that
# contains `$` (the bcrypt hash below) must write every `$` as `$$`.

# ---- identity ----------------------------------------------------------------
# production on the Pi, staging on the desktop
APP_ENV=production
# The one public hostname. The API is path-routed under it.
APP_HOST=app.example.com
# What the app container resolves APP_HOST to. production: host-gateway (this machine's
# Caddy). staging: the Pi's LAN IP (the Pi terminates TLS and proxies back here).
APP_HOST_RESOLVES_TO=host-gateway
# deploy.sh rewrites this. production: prod-<sha>. staging: staging (the floating tag).
APP_IMAGE_TAG=prod
# Let's Encrypt expiry notices
ACME_EMAIL=you@example.com
# Bind-mount root for db/data, db/config, storage and caddy/
HOLIGAY_DATA=/srv/holigay

# ---- staging proxy (used by the Pi's Caddyfile; the desktop leaves the defaults) ----
STAGING_HOST=staging.example.com
# The desktop's LAN IP and port 80 once it exists; 127.0.0.1:9 (discard) until then.
STAGING_UPSTREAM=127.0.0.1:9
STAGING_BASIC_AUTH_USER=organizer
# `docker run --rm caddy:2.11.4-alpine caddy hash-password --plaintext '<password>'`,
# with every $ doubled. This placeholder is the hash of "changeme": replace it before
# staging goes live (T021).
STAGING_BASIC_AUTH_HASH=$$2a$$14$$qivU4tSqn8a/tsNHFF5Eq.sB7FswP2gOYKWrXIRvn7vzgcq8IHbbS

# ---- secrets (bin/mint-keys.sh) --------------------------------------------------
POSTGRES_PASSWORD=
JWT_SECRET=
JWT_EXPIRY=3600
ANON_KEY=
SERVICE_ROLE_KEY=
# admin profile only
PG_META_CRYPTO_KEY=

# ---- email relay (the app and GoTrue read the same values) ---------------------------
SMTP_HOST=smtp.resend.com
SMTP_PORT=465
SMTP_USER=resend
SMTP_PASS=
SMTP_ADMIN_EMAIL=noreply@example.com
SMTP_SENDER_NAME=Holigay Vendor Market
EMAIL_FROM_ADDRESS=Holigay Vendor Market <noreply@example.com>

# ---- backups (bin/backup.sh, T022) ---------------------------------------------------
RESTIC_PASSWORD=
# sftp:<user>@<desktop LAN IP>:<absolute path>  and  b2:<bucket>:/
RESTIC_REPO_ONSITE=sftp:holigay@192.168.1.20:/srv/restic/holigay
RESTIC_REPO_OFFSITE=b2:holigay-backups:/
B2_ACCOUNT_ID=
B2_ACCOUNT_KEY=
# The Uptime Kuma push monitor URL (dead-man switch); empty disables the ping.
UPTIME_KUMA_PUSH_URL=
```

- [ ] **Step 6: `deploy/db/init/roles.sql`** (verbatim from the Supabase reference stack, `docker/volumes/db/roles.sql`) and `deploy/db/init/jwt.sql`:

```sql
-- deploy/db/init/roles.sql — from the Supabase reference stack. Runs once, when the data
-- directory is empty. Gives every service role the one password compose.yml hands out.
-- NOTE: change to your own passwords for production environments
\set pgpass `echo "$POSTGRES_PASSWORD"`

ALTER USER authenticator WITH PASSWORD :'pgpass';
ALTER USER pgbouncer WITH PASSWORD :'pgpass';
ALTER USER supabase_auth_admin WITH PASSWORD :'pgpass';
ALTER USER supabase_functions_admin WITH PASSWORD :'pgpass';
ALTER USER supabase_storage_admin WITH PASSWORD :'pgpass';
```

```sql
-- deploy/db/init/jwt.sql — the reference stack's jwt.sql plus the secret, which the local
-- CLI stack also sets. Runs once, when the data directory is empty.
\set jwt_secret `echo "$JWT_SECRET"`
\set jwt_exp `echo "$JWT_EXP"`

ALTER DATABASE postgres SET "app.settings.jwt_secret" TO :'jwt_secret';
ALTER DATABASE postgres SET "app.settings.jwt_exp" TO :'jwt_exp';
```

- [ ] **Step 7: `deploy/bin/mint-keys.sh`** (`chmod +x`)

```bash
#!/usr/bin/env bash
# Generate every secret deploy/.env needs, on the host that will use them (research R16).
# Prints KEY=value lines to stdout — paste them into deploy/.env, then store the same values
# in the password manager. Never commit the output. Needs only openssl, present on
# Raspberry Pi OS and Debian.
#
# The anon and service_role keys are HS256 JWTs signed with JWT_SECRET, exactly like the
# reference stack's legacy keys (research R4): PostgREST maps the `role` claim to a database
# role; storage-api verifies the signature with the same secret.
set -euo pipefail

b64url() { openssl base64 -e -A | tr '+/' '-_' | tr -d '='; }

mint_jwt() {
  local role=$1 secret=$2 iat exp header payload signature
  iat=$(date +%s)
  exp=$((iat + 10 * 365 * 24 * 3600)) # ten years, like the reference keys
  header=$(printf '{"alg":"HS256","typ":"JWT"}' | b64url)
  payload=$(printf '{"role":"%s","iss":"supabase","iat":%d,"exp":%d}' "$role" "$iat" "$exp" | b64url)
  signature=$(printf '%s.%s' "$header" "$payload" | openssl dgst -sha256 -hmac "$secret" -binary | b64url)
  printf '%s.%s.%s' "$header" "$payload" "$signature"
}

jwt_secret=$(openssl rand -hex 32) # 64 hex characters, above the 32-character minimum

cat <<ENV
# generated by deploy/bin/mint-keys.sh on $(date -u +%FT%TZ) — paste into deploy/.env
POSTGRES_PASSWORD=$(openssl rand -hex 24)
JWT_SECRET=$jwt_secret
ANON_KEY=$(mint_jwt anon "$jwt_secret")
SERVICE_ROLE_KEY=$(mint_jwt service_role "$jwt_secret")
PG_META_CRYPTO_KEY=$(openssl rand -hex 24)
RESTIC_PASSWORD=$(openssl rand -hex 24)
ENV
```

- [ ] **Step 8: Validate everything on the workstation**

```bash
chmod +x deploy/bin/mint-keys.sh
docker run --rm -v "$PWD:/mnt" koalaman/shellcheck:stable deploy/bin/mint-keys.sh
docker compose -f deploy/compose.yml --env-file deploy/.env.example config --quiet && echo compose-ok
docker run --rm -v "$PWD/deploy/caddy:/etc/caddy:ro" \
  -e ACME_EMAIL=you@example.com -e APP_HOST=app.example.com -e STAGING_HOST=staging.example.com \
  -e STAGING_UPSTREAM=127.0.0.1:9 -e STAGING_BASIC_AUTH_USER=organizer \
  -e 'STAGING_BASIC_AUTH_HASH=$2a$14$qivU4tSqn8a/tsNHFF5Eq.sB7FswP2gOYKWrXIRvn7vzgcq8IHbbS' \
  caddy:2.11.4-alpine caddy validate --config /etc/caddy/Caddyfile
KEYS=$(deploy/bin/mint-keys.sh); echo "$KEYS" | grep -c '^[A-Z_]*=' ; echo "$KEYS" | sed -n 's/^ANON_KEY=//p' | cut -d. -f2 | tr '_-' '/+' | base64 -d 2>/dev/null; echo
```

Expected: shellcheck prints nothing; `compose-ok`; Caddy prints `Valid configuration`; the key count is `6`; the decoded payload shows `"role":"anon"`.

- [ ] **Step 9: Prove the stack boots, on the workstation, against the local image** — a throwaway run that also proves the bring-up order. Uses a scratch data root so nothing touches the CLI stack (which must be stopped first: `npx supabase stop`, because both want port 5432 on localhost).

```bash
mkdir -p /tmp/holigay-data
cp deploy/.env.example /tmp/holigay.env
deploy/bin/mint-keys.sh >> /tmp/holigay.env
sed -i 's|^HOLIGAY_DATA=.*|HOLIGAY_DATA=/tmp/holigay-data|; s|^APP_HOST=.*|APP_HOST=app.localtest.me|' /tmp/holigay.env
docker compose -f deploy/compose.yml --env-file /tmp/holigay.env up -d db
sleep 20 && docker compose -f deploy/compose.yml --env-file /tmp/holigay.env ps db     # healthy
docker compose -f deploy/compose.yml --env-file /tmp/holigay.env up -d auth rest storage
sleep 20 && docker compose -f deploy/compose.yml --env-file /tmp/holigay.env ps           # all healthy
PW=$(sed -n 's/^POSTGRES_PASSWORD=//p' /tmp/holigay.env)
npx supabase db push --db-url "postgresql://postgres:$PW@127.0.0.1:5432/postgres"
npx supabase migration list --db-url "postgresql://postgres:$PW@127.0.0.1:5432/postgres"    # 001–012 applied
docker compose -f deploy/compose.yml --env-file /tmp/holigay.env down
sudo rm -rf /tmp/holigay-data /tmp/holigay.env
npx supabase start
```

Expected: every service reports `healthy`; `db push` applies twelve migrations with no error (this is check V8 on the workstation: the `postgres` password equals `POSTGRES_PASSWORD`). If `rest` never becomes healthy, apply the `--ready` fallback from Step 2.

- [ ] **Step 10: Commit**

```bash
git add deploy/README.md deploy/compose.yml deploy/caddy deploy/.env.example deploy/db deploy/bin/mint-keys.sh
git commit -m "infra(deploy): compose stack, Caddy routing, init SQL and key minting [008-T013]"
```

- [ ] T014 [P] [US2] `deploy.sh`, the `Makefile`, and the deploy + upgrade runbooks — in `deploy/bin/deploy.sh` (files, interfaces and steps below)

**Files:**
- Create: `deploy/bin/deploy.sh`, `Makefile`, `docs/runbooks/deploy.md`, `docs/runbooks/upgrade-stack.md`

**Interfaces:**
- Consumes: `deploy/.env` keys `APP_ENV`, `APP_IMAGE_TAG` (T013); image tags `prod-<sha>` / `staging-<sha>` / `staging` (T010).
- Produces: `deploy.sh [TAG]` (exit 2 no `.env`, 3 refused tag, 0 deployed); `make deploy TAG=… [HOST=…]`, `make tunnel-db`, `make logs`, `make status`, `make ssh`, `make build-local TAG=…`.

- [ ] **Step 1: `deploy/bin/deploy.sh`** (`chmod +x`)

```bash
#!/usr/bin/env bash
# Pull the app image named by APP_IMAGE_TAG in deploy/.env and restart only the app service.
# Usage: deploy.sh [TAG]   — with TAG, rewrite APP_IMAGE_TAG first.
#
# Refuses a tag whose prefix does not match APP_ENV (research R9): a production host only
# runs prod-<sha> (or the floating `prod`), a staging host only staging-<sha> or `staging`.
# The previous image is kept, so rolling back is deploy.sh <previous tag> with no pull.
# Never sources .env: values may contain `$$` for Compose, and only two keys are needed.
#
# Exit codes: 0 deployed · 2 no .env · 3 tag refused.
set -euo pipefail

cd "$(dirname "$0")/.."

if [ ! -f .env ]; then
  echo "deploy.sh: no .env in $(pwd)" >&2
  exit 2
fi

if [ "${1:-}" != "" ]; then
  sed -i "s|^APP_IMAGE_TAG=.*|APP_IMAGE_TAG=$1|" .env
fi

app_env=$(sed -n 's/^APP_ENV=//p' .env)
tag=$(sed -n 's/^APP_IMAGE_TAG=//p' .env)

case "$app_env:$tag" in
  production:prod | production:prod-*) ;;
  staging:staging | staging:staging-*) ;;
  *)
    echo "deploy.sh: refusing tag '$tag' on APP_ENV=$app_env" >&2
    exit 3
    ;;
esac

echo "deploy.sh: $app_env ← $tag"
docker compose pull --quiet app
docker compose up -d --no-deps app
docker compose ps app
```

- [ ] **Step 2: `Makefile`** at the repo root. Recipes use `>` instead of a leading tab (`.RECIPEPREFIX`), so a pasted file cannot break on whitespace.

```make
# Operator entry points for the self-hosted stack (specs/008). Run from the repo root on
# the workstation. HOST is an ssh alias from ~/.ssh/config (docs/runbooks/host-setup.md §3).
.RECIPEPREFIX := >
SHELL := /bin/bash

HOST ?= pi
REMOTE_DIR ?= /srv/holigay/app/deploy
TAG ?=
IMAGE ?= ghcr.io/owen-rose/holigay-app

.PHONY: help deploy tunnel-db logs status ssh build-local

help: ## list targets
> @grep -E '^[a-z-]+:.*## ' $(MAKEFILE_LIST) | awk -F ':.*## ' '{printf "  %-12s %s\n", $$1, $$2}'

deploy: ## make deploy TAG=prod-abc1234 [HOST=pi] — deploy or roll back (same command, older tag)
> @test -n "$(TAG)" || { echo "TAG is required, e.g. make deploy TAG=prod-abc1234"; exit 2; }
> ssh $(HOST) "cd $(REMOTE_DIR) && ./bin/deploy.sh $(TAG)"

tunnel-db: ## forward localhost:5432 to the host's Postgres (Ctrl-C to close)
> ssh -N -L 5432:127.0.0.1:5432 $(HOST)

logs: ## follow the stack's logs
> ssh -t $(HOST) "cd $(REMOTE_DIR) && docker compose logs -f --tail=100"

status: ## docker compose ps on the host
> ssh $(HOST) "cd $(REMOTE_DIR) && docker compose ps"

ssh: ## open a shell on the host
> ssh -t $(HOST) "cd $(REMOTE_DIR) && exec \$$SHELL -l"

build-local: ## make build-local TAG=prod-abc1234 NEXT_PUBLIC_SUPABASE_URL=… NEXT_PUBLIC_SUPABASE_ANON_KEY=… — build an image here (DR on the desktop)
> @test -n "$(TAG)" -a -n "$(NEXT_PUBLIC_SUPABASE_URL)" -a -n "$(NEXT_PUBLIC_SUPABASE_ANON_KEY)" || { echo "TAG, NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY are required"; exit 2; }
> docker build --build-arg NEXT_PUBLIC_SUPABASE_URL="$(NEXT_PUBLIC_SUPABASE_URL)" --build-arg NEXT_PUBLIC_SUPABASE_ANON_KEY="$(NEXT_PUBLIC_SUPABASE_ANON_KEY)" -t $(IMAGE):$(TAG) .
```

- [ ] **Step 3: `docs/runbooks/deploy.md`**

```markdown
# Runbook: Deploy, roll back, and the way back to Vercel

**Spec**: `specs/008-self-hosted-infrastructure/` (T014) · **Design**: `research.md` R9, R17

Production deploys are manual by design: you choose when the app changes. Staging deploys
itself every five minutes from the `staging` tag. Both run the same script.

## 0. Prerequisites

- An ssh alias `pi` (and `desktop`) in `~/.ssh/config` — `docs/runbooks/host-setup.md` §3.
- You are on the LAN or connected over WireGuard (`host-setup.md` §6).
- The image exists: CI publishes `ghcr.io/owen-rose/holigay-app:prod-<sha>` for every push
  to `main` and `staging-<sha>` for every push to `dev` (`.github/workflows/ci.yml`,
  `build-image` job). Find the tag on GitHub → Packages → `holigay-app`, or take the first 7
  characters of the commit on `main`.

## 1. Deploy to production

```bash
make deploy TAG=prod-<sha>
```

What it does on the Pi: rewrites `APP_IMAGE_TAG` in `deploy/.env`, refuses a tag that is
not `prod-*` (a staging image baked with the staging URL would otherwise point production
at staging), pulls the image, restarts **only** the `app` container, prints `docker compose
ps app`. Takes under a minute; users see at most one failed request during the restart.

Then, always:

```bash
SMOKE_APP_URL=https://app.<domain> SMOKE_SUPABASE_URL=https://app.<domain> \
SMOKE_SUPABASE_ANON_KEY=<prod anon key> SMOKE_ORGANIZER_EMAIL=<smoke organizer> \
SMOKE_ORGANIZER_PASSWORD=<pw> SMOKE_STORAGE_EXPECT_PRIVATE=1 npm run smoke
```

`all 6 checks passed` or you roll back.

## 2. Roll back

The previous image is still on the host (the deploy never prunes), so this is instant:

```bash
make deploy TAG=prod-<previous sha>
```

`docker image ls ghcr.io/owen-rose/holigay-app` on the host lists what is available; a
weekly prune (`host-setup.md` §9) keeps the last three.

## 3. Staging

Nothing to do: `holigay-deploy.timer` on the desktop runs `deploy.sh` every five minutes
against the floating `staging` tag, which CI moves on every push to `dev`. To pin staging to
a specific build or force a pull now: `make deploy TAG=staging-<sha> HOST=desktop` or
`ssh desktop 'cd /srv/holigay/app/deploy && ./bin/deploy.sh'`.

## 4. Logs and status

```bash
make status          # docker compose ps
make logs            # follow all services; Ctrl-C to stop
make ssh             # a shell in the deploy directory
ssh pi 'cd /srv/holigay/app/deploy && docker compose logs --tail=200 app'
```

## 5. The way back to Vercel (until decommission)

While the hosted stack exists it is the rollback for the *whole* platform, not just the
app image. It is a DNS change:

1. Cloudflare → DNS → edit `app` → change it from the A record pointing at the home IP to a
   `CNAME` → `cname.vercel-dns.com` (proxy on or off, either works). TTL is Auto.
2. Vercel → project → Settings → Domains → add `app.<domain>` (it verifies via the CNAME).
3. Within a few minutes `curl -sI https://app.<domain>` shows `server: Vercel`.
4. The hosted Supabase project is unchanged and the Vercel deploy still points at it, so
   accounts created on the self-hosted stack **do not exist there** — expected, and the
   reason the flip is only for before go-live or for a disaster.

Forward again: remove the domain from Vercel, set the A record back to the home IP
(proxied). Rehearsed once in T018; the times each way are recorded in `quickstart.md`.

## 6. Reset the database (before go-live only)

Only while the stack holds nothing but test data. Stops everything, wipes the data
directories, brings the stack back empty, re-applies the migrations and re-seeds the admin:

```bash
ssh pi
cd /srv/holigay/app/deploy
docker compose down
sudo rm -rf /srv/holigay/db/data/* /srv/holigay/db/config/* /srv/holigay/storage/*
docker compose up -d db && sleep 20 && docker compose up -d auth rest storage
```

Then `docs/runbooks/migrate.md` for the migrations, `docker compose up -d`, sign up at
`/signup`, and `scripts/seed-role.sql` through `docker compose exec db psql -U postgres`.
Keys in `.env` are unchanged, so no image rebuild is needed.
```

- [ ] **Step 4: `docs/runbooks/upgrade-stack.md`**

```markdown
# Runbook: Upgrade the stack, and rotate a secret

**Spec**: `specs/008-self-hosted-infrastructure/` (T014) · **Design**: `research.md` R5, R16

## The pinning rule

`deploy/compose.yml` pins four Supabase images to the tags the local `supabase start` stack
runs. Local, staging and production therefore share one auth/storage schema generation, and
a backup taken on one restores on another. Upgrading is deliberate and in this order:

1. **Bump the CLI**: `npm install --save-dev supabase@latest`, `npx supabase stop`,
   `npx supabase start`, then read the new tags: `docker images --format '{{.Repository}}:{{.Tag}}' | grep -E 'supabase/(postgres|gotrue|postgrest|storage-api):'`.
2. **Read the release notes** for GoTrue and storage-api between the old and new tags
   (`github.com/supabase/auth/releases`, `github.com/supabase/storage/releases`). Both run
   schema migrations on start; a note that mentions a migration means the pre-upgrade
   backup in step 4 is your only way back.
3. **Run the security suite locally** against the new stack: `npm run test:security`.
4. **Staging first**: edit the four `image:` lines in `deploy/compose.yml`, commit to `dev`.
   On the desktop: `./bin/backup.sh` (a manual snapshot), `git pull`, `docker compose pull`,
   `docker compose up -d`, watch `docker compose logs -f auth storage` for their migrations,
   then `npm run smoke` against staging.
5. **Production**, only after staging has run a day: promote to `main`, then on the Pi the
   same five commands, then the smoke.
6. **Postgres major versions are never upgraded in place.** A new major (18) is a new data
   directory: take a logical dump (`backup.sh` writes one), bring the new image up empty,
   restore the dump. Plan it as its own task.

Everything else (`caddy`, `node` base image, Uptime Kuma, the OS) upgrades independently:
Caddy and Kuma by bumping the tag and `docker compose up -d`; the OS by
`unattended-upgrades` (security) and a monthly `apt full-upgrade` by hand.

## Rotating a secret

| Secret | Where it lives | How to rotate |
|---|---|---|
| `SMTP_PASS` (relay API key) | `deploy/.env` on both hosts | New key in Resend, edit both `.env`, `docker compose up -d app auth`, delete the old key |
| `POSTGRES_PASSWORD` | `deploy/.env` + inside Postgres | `docker compose exec db psql -U supabase_admin -c "ALTER USER postgres PASSWORD '<new>'"` and the same for `authenticator`, `supabase_auth_admin`, `supabase_storage_admin`; edit `.env`; `docker compose up -d` |
| `RESTIC_PASSWORD` | `deploy/.env` + both repositories | `restic key add` with the new password on each repository, then `restic key remove` of the old id; edit `.env` |
| Cloudflare token, B2 key | provider dashboards + `.env` / `/etc/ddclient.conf` | Issue new, replace, revoke old |
| **`JWT_SECRET`** | `deploy/.env` **and baked into the app image as `ANON_KEY`** | See below — not routine |

Rotating `JWT_SECRET` changes `ANON_KEY` and `SERVICE_ROLE_KEY` (re-run `mint-keys.sh` with
the new secret, or mint with the same script), which means: update `.env`, update the GitHub
environment variable `NEXT_PUBLIC_SUPABASE_ANON_KEY`, push a commit so CI builds a new image,
`make deploy TAG=<new>`, and every user is signed out (their tokens no longer verify). Do it
only for a suspected leak, on both environments separately, and record it in
`specs/008-self-hosted-infrastructure/quickstart.md`.
```

- [ ] **Step 5: Validate**

```bash
chmod +x deploy/bin/deploy.sh
docker run --rm -v "$PWD:/mnt" koalaman/shellcheck:stable deploy/bin/deploy.sh
make help
```

Expected: shellcheck prints nothing; `make help` lists the six targets. Then a dry run of the refusal path: `cd deploy && printf 'APP_ENV=production\nAPP_IMAGE_TAG=staging-abc\n' > .env && ./bin/deploy.sh; echo "exit=$?"; rm .env; cd ..` → `deploy.sh: refusing tag 'staging-abc' on APP_ENV=production`, `exit=3`.

- [ ] **Step 6: Commit**

```bash
git add deploy/bin/deploy.sh Makefile docs/runbooks/deploy.md docs/runbooks/upgrade-stack.md
git commit -m "infra(deploy): deploy script, Makefile, deploy and upgrade runbooks [008-T014]"
```

- [ ] T015 [P] [US2] Runbooks: `host-setup.md` and `migrate.md` — in `docs/runbooks/host-setup.md` (files, interfaces and steps below)

**Files:**
- Create: `docs/runbooks/host-setup.md`, `docs/runbooks/migrate.md`

**Interfaces:**
- Produces the procedure T016–T018 follow by hand and T020's playbook reproduces. Section numbers are referenced by the manual tasks and by `deploy.md`.

- [ ] **Step 1: `docs/runbooks/host-setup.md`**

```markdown
# Runbook: Set up a host by hand (the Pi first)

**Spec**: `specs/008-self-hosted-infrastructure/` (T015) · **Design**: `research.md` R6, R7, R14, R15

This is the manual procedure for the Raspberry Pi 5. It is deliberately done by hand once
so every step is understood; `deploy/ansible/` then reproduces it for the desktop. Written
for someone who has not read the code. `<domain>`, `<pi-lan-ip>`, `<lan-subnet>` and
`<your key>` are yours to substitute; nothing here is stored in the repo.

Hardware: Pi 5 (8 GB) with an NVMe drive on a PCIe HAT, wired Ethernet, official PSU.
Recommended: a coin cell in the RTC socket ($5 — without it the clock is wrong after a
power cut until NTP syncs, and JWT validation fails for that minute), and a UPS for the Pi,
modem and router (~$100).

## 1. Image the NVMe and boot from it

1. On the workstation, Raspberry Pi Imager → Raspberry Pi 5 → **Raspberry Pi OS Lite
   (64-bit)** → the NVMe (in a USB enclosure) or an SD card to start from. Edit settings:
   hostname `pi`, user `holigay` with a password (used once, below), **enable SSH with
   public-key authentication only** and paste your public key, locale/timezone
   `America/Edmonton`.
2. Boot. If you imaged an SD card, boot from it, then copy to the NVMe:
   `sudo apt install -y git && git clone https://github.com/geerlingguy/rpi-clone && cd rpi-clone && sudo ./rpi-clone nvme0n1 -f`
   (or re-run Imager onto the NVMe from the Pi itself), then set NVMe first in the boot order:
   `sudo rpi-eeprom-config --edit` → `BOOT_ORDER=0xf416`, save, `sudo reboot`, remove the SD.
3. `lsblk` shows `/` on `nvme0n1p2`. Optional, for full PCIe speed: add
   `dtparam=pciex1_gen=3` to `/boot/firmware/config.txt` and reboot.

## 2. Updates and packages

```bash
sudo apt update && sudo apt full-upgrade -y
sudo DEBIAN_FRONTEND=noninteractive apt install -y chrony unattended-upgrades ufw wireguard-tools restic git curl ddclient
sudo timedatectl set-timezone America/Edmonton
sudo systemctl enable --now chrony
```

`unattended-upgrades` installs security updates nightly. Confirm `/etc/apt/apt.conf.d/20auto-upgrades`
contains `APT::Periodic::Unattended-Upgrade "1";`, and leave `Automatic-Reboot` at its
default (`false`) — reboots are yours to schedule.

## 3. SSH: key only, no root, and an alias on the workstation

```bash
sudo tee /etc/ssh/sshd_config.d/10-hardening.conf >/dev/null <<'CONF'
PasswordAuthentication no
KbdInteractiveAuthentication no
PermitRootLogin no
CONF
sudo systemctl restart ssh
```

On the workstation, `~/.ssh/config`:

```
Host pi
    HostName <pi-lan-ip>
    User holigay
    IdentityFile ~/.ssh/<your key>
Host pi-wg
    HostName 10.8.0.1
    User holigay
    IdentityFile ~/.ssh/<your key>
```

Test: `ssh pi` logs in without a password prompt; `ssh -o PubkeyAuthentication=no pi` is
refused with `Permission denied (publickey)`.

## 4. Firewall

```bash
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow from <lan-subnet> to any port 22 proto tcp comment 'ssh from LAN'
sudo ufw allow from 10.8.0.0/24 to any port 22 proto tcp comment 'ssh over WireGuard'
sudo ufw allow 80/tcp comment 'caddy http'
sudo ufw allow 443/tcp comment 'caddy https'
sudo ufw allow 443/udp comment 'caddy http3'
sudo ufw allow 51820/udp comment 'wireguard'
sudo ufw enable
sudo ufw status verbose
```

**Docker bypasses ufw**: a container port published on `0.0.0.0` is reachable no matter what
ufw says, because Docker's NAT rules run before ufw's INPUT chain. The protection is in
`deploy/compose.yml`: only `caddy` publishes on all interfaces; `db` and `studio` bind to
`127.0.0.1`; nothing else publishes at all. Check after every compose change:
`docker compose ps --format '{{.Name}} {{.Ports}}'` — the only `0.0.0.0` entries are caddy's.

## 5. Docker

Docker's own apt repository (Raspberry Pi OS is Debian; use its codename):

```bash
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/debian/gpg -o /etc/apt/keyrings/docker.asc
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/debian $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | sudo tee /etc/apt/sources.list.d/docker.list >/dev/null
sudo apt update && sudo apt install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
sudo usermod -aG docker holigay
sudo tee /etc/docker/daemon.json >/dev/null <<'JSON'
{ "log-driver": "json-file", "log-opts": { "max-size": "10m", "max-file": "3" } }
JSON
sudo systemctl restart docker
```

Log out and in (the group change), then `docker run --rm hello-world` and `docker compose version`.
The data root (`/var/lib/docker`) is on the NVMe because `/` is.

## 6. WireGuard (remote administration)

On the Pi:

```bash
sudo sh -c 'umask 077; wg genkey | tee /etc/wireguard/server.key | wg pubkey > /etc/wireguard/server.pub'
```

On the workstation (and the phone: the WireGuard app generates its own pair): `wg genkey | tee client.key | wg pubkey > client.pub`.

`/etc/wireguard/wg0.conf` on the Pi (mode 600):

```
[Interface]
Address = 10.8.0.1/24
ListenPort = 51820
PrivateKey = <contents of server.key>

[Peer]
# workstation
PublicKey = <contents of client.pub>
AllowedIPs = 10.8.0.2/32

[Peer]
# phone
PublicKey = <the phone's public key>
AllowedIPs = 10.8.0.3/32
```

`sudo systemctl enable --now wg-quick@wg0`. Client config (workstation `wg0.conf`):

```
[Interface]
Address = 10.8.0.2/24
PrivateKey = <contents of client.key>

[Peer]
PublicKey = <contents of server.pub>
Endpoint = <your public IP or a DDNS name>:51820
AllowedIPs = 10.8.0.0/24
PersistentKeepalive = 25
```

No IP forwarding is needed: the tunnel only reaches the Pi itself (`AllowedIPs 10.8.0.0/24`),
which is all administration needs. Test from the LAN first (`sudo wg-quick up ./wg0.conf`,
`ssh pi-wg`), then from outside (T019).

## 7. Directory layout and the repo

```bash
sudo mkdir -p /srv/holigay/db/data /srv/holigay/db/config /srv/holigay/storage /srv/holigay/caddy/data /srv/holigay/caddy/config /srv/backup
sudo chown -R holigay:holigay /srv/holigay /srv/backup
git clone https://github.com/Owen-Rose/Holigay-YYC /srv/holigay/app
cd /srv/holigay/app/deploy
cp .env.example .env && chmod 600 .env
```

Fill `.env`: `APP_ENV=production`, `APP_HOST=app.<domain>`, `ACME_EMAIL`, the staging
proxy values (`STAGING_UPSTREAM` stays `127.0.0.1:9` until the desktop exists), the SMTP
block from the password manager, `EMAIL_FROM_ADDRESS`. Then the secrets:

```bash
./bin/mint-keys.sh >> .env
```

Copy the six generated values into the password manager. Anything you paste that contains
`$` (the basic-auth hash) is written with `$$`.

## 8. Bring the stack up, in order

```bash
docker compose up -d db
watch docker compose ps            # until db is healthy; Ctrl-C
docker compose up -d auth rest storage
watch docker compose ps            # until all three are healthy
```

Now the app migrations — `docs/runbooks/migrate.md` — from the workstation. Then set the
GitHub `production` environment variables (`NEXT_PUBLIC_SUPABASE_URL=https://app.<domain>`,
`NEXT_PUBLIC_SUPABASE_ANON_KEY=<ANON_KEY from .env>`) and push to `main` so CI publishes
`prod-<sha>` (T017). Then DNS (§9), and:

```bash
./bin/deploy.sh prod-<sha>         # writes APP_IMAGE_TAG and starts app
docker compose up -d caddy
docker compose logs -f caddy       # watch the certificate being obtained
```

Seed the admin: open `https://app.<domain>/signup`, create your account, then
`docker compose exec db psql -U postgres -d postgres` and run the two statements from
`scripts/seed-role.sql` with your address and `admin`.

## 9. DNS, the certificate, and dynamic DNS

1. Cloudflare → DNS → add `A app <home public IP>`, **proxied**. (Cloudflare's *Always
   Use HTTPS* is off — T002 — so the Let's Encrypt challenge reaches Caddy on port 80.)
2. Within a minute `docker compose logs caddy` shows `certificate obtained successfully`.
   If it shows a challenge failure instead: set the record to **DNS only**, wait for the
   log line, set it back to proxied. Record which path worked in `quickstart.md` (V1).
3. `curl -sI https://app.<domain>` → `HTTP/2 200`, `strict-transport-security` present,
   `server: cloudflare`.
4. ddclient, so the record follows the home IP. `/etc/ddclient.conf` (mode 600):

   ```
   daemon=300
   syslog=yes
   use=web, web=https://api.ipify.org/
   protocol=cloudflare
   zone=<domain>
   ttl=1
   login=token
   password=<the cloudflare-ddns-token from T002>
   app.<domain>
   ```

   `sudo systemctl enable --now ddclient`, then `sudo ddclient -daemon=0 -verbose -force`
   once: it logs `SUCCESS: updating app.<domain>`.
5. Weekly housekeeping timer for old images — `/etc/cron.weekly/holigay-prune` (mode 755):

   ```sh
   #!/bin/sh
   # keep the last three app images for rollback (docs/runbooks/deploy.md §2)
   docker image ls --format '{{.Repository}}:{{.Tag}}' ghcr.io/owen-rose/holigay-app | tail -n +4 | xargs -r docker image rm
   docker image prune -f >/dev/null
   ```

## 10. Verify

- `docker compose ps` — six services `healthy`/`running`, only caddy on `0.0.0.0`.
- `sudo ufw status` — the eight rules from §4, nothing else.
- From the workstation, `npm run smoke` with the organizer credentials and
  `SMOKE_STORAGE_EXPECT_PRIVATE=1` → `all 6 checks passed`.
- Inside the app container the public name resolves locally (V7):
  `docker compose exec app wget -q -O- https://app.<domain>/auth/v1/health` prints GoTrue's
  health JSON.
- `wg show` lists the peers; `ssh pi-wg` works with the LAN cable of the workstation on a
  different network (T019 does it from a phone hotspot).
```

- [ ] **Step 2: `docs/runbooks/migrate.md`**

```markdown
# Runbook: Apply database migrations to a self-hosted stack

**Spec**: `specs/008-self-hosted-infrastructure/` (T015) · **Design**: `research.md` R11

Migrations are the unchanged files in `supabase/migrations/`, applied by the Supabase CLI
over an SSH tunnel. The CLI keeps its history in the target database
(`supabase_migrations.schema_migrations`), so `migration list` and `db push` behave exactly
as they did against the hosted projects. Postgres is never reachable except through the
tunnel (`deploy/compose.yml` binds it to `127.0.0.1` on the host).

**Order on a fresh host**: `db`, then `auth` and `storage` must have started once before
the first push — migration `011` inserts into `storage.buckets` and `003` creates a trigger
on `auth.users`, both of which those services create on their first boot.

## Staging first, then production

```bash
# 1. Tunnel (leave it running in its own shell; Ctrl-C closes it)
make tunnel-db HOST=desktop        # staging
make tunnel-db HOST=pi             # production

# 2. In another shell: the password, typed, never stored
read -rs PW && export PW           # the POSTGRES_PASSWORD from that host's deploy/.env
DB_URL="postgresql://postgres:${PW}@127.0.0.1:5432/postgres"

# 3. What would change
npx supabase migration list --db-url "$DB_URL"
npx supabase db push --db-url "$DB_URL" --dry-run

# 4. Apply
npx supabase db push --db-url "$DB_URL"

# 5. Confirm, then close the tunnel and forget the password
npx supabase migration list --db-url "$DB_URL"
unset PW DB_URL
```

If `POSTGRES_PASSWORD` contains characters that are special in a URL (`mint-keys.sh` emits
hex, so it does not), percent-encode it.

After production: `npm run smoke` (docs/runbooks/deploy.md §1). A migration that touches
RLS also warrants `npm run test:security` locally beforehand, which runs the same files
against the same image versions.

## Types

`npm run db:types` regenerates `src/types/database.ts` from the **local** stack. Local,
staging and production run the same migrations on the same images, so local is the source.
```

- [ ] **Step 3: Commit**

```bash
git add docs/runbooks/host-setup.md docs/runbooks/migrate.md
git commit -m "docs(runbooks): manual host setup and migration procedures [008-T015]"
```

- [ ] T016 [manual] [US2] Image, harden and prepare the Pi: follow `docs/runbooks/host-setup.md` §1–§7 (NVMe boot, packages, SSH key-only + alias, ufw, Docker, WireGuard tested on the LAN, directories, repo clone, `.env` filled with `mint-keys.sh` output). Needs T002 (router reservation), T013, T015. evidence: the four T016 rows in quickstart.md (`lsblk`/hostname/timezone; `ssh -o PubkeyAuthentication=no pi` refused + `ufw status` output; `docker compose version` + `daemon.json`; `wg show` + a LAN handshake) — FR-015, FR-020, FR-029, FR-031

- [ ] T017 [manual] [US2] Data services, migrations, and the first production image: `host-setup.md` §8 first half — `docker compose up -d db`, then `auth rest storage`, all healthy; `docs/runbooks/migrate.md` against the Pi (`migration list` shows 001–012) — this is check V8; GitHub → Settings → Environments → `production` → variables `NEXT_PUBLIC_SUPABASE_URL=https://app.<domain>` and `NEXT_PUBLIC_SUPABASE_ANON_KEY=<ANON_KEY from the Pi's .env>`; push any commit to `main` (or re-run the last `build-image` job) and confirm `ghcr.io/owen-rose/holigay-app:prod-<sha>` exists; make the package public if this is the first push (T010). Needs T010, T012, T016. evidence: the four T017 rows in quickstart.md — FR-006, FR-013, FR-014

- [ ] T018 [manual] [US2] Go public on the real hostname: `host-setup.md` §9 (the proxied `app` record, certificate obtained — record V1's path), §8 second half (`deploy.sh prod-<sha>`, `caddy` up, admin seeded), ddclient forced update, the weekly prune script. Then the gates: `npm run smoke` with organizer credentials and `SMOKE_STORAGE_EXPECT_PRIVATE=1` → `all 6 checks passed`; the click-through — sign up as a vendor → `/apply` with a 5 MB attachment → organizer review → download the attachment in the browser → change status → both emails arrive from the verified domain; from a shell, `curl -sI "<a signed URL copied from the dashboard's download link>"` shows `cache-control: private, no-store` and no `cf-cache-status: HIT` (V10); trigger a password-recovery email against `/auth/v1/recover` for a test account (`curl -X POST https://app.<domain>/auth/v1/recover -H "apikey: <anon>" -H "Content-Type: application/json" -d '{"email":"<test mailbox>"}'`) and confirm the link in it starts with `https://app.<domain>/auth/v1/verify` (V5); `host-setup.md` §10's container `wget` (V7); Cloudflare proxy **off** → smoke green → **on** (SC-007); the rollback rehearsal from `docs/runbooks/deploy.md` §5 — flip to Vercel, `curl -sI` shows `server: Vercel`, flip back, note both times. Clean up the test application with the event-week runbook §3 (`psql` via `docker compose exec db`). Needs T017. evidence: the ten T018 rows in quickstart.md — FR-016, FR-017, FR-018, FR-019, SC-002, SC-007

- [ ] T019 [manual] [US2] WireGuard from outside: with the workstation (or the phone) on a mobile hotspot, `wg-quick up`, `ssh pi-wg`, `make deploy TAG=<current prod tag> HOST=pi-wg` (a no-op redeploy) and `make status HOST=pi-wg`. Needs T016 and the router's UDP forward (T002). evidence: the T019 row in quickstart.md — FR-015

**Checkpoint**: `https://app.<domain>` is served by the Pi through Cloudflare with a green smoke, the hosted stack is a rehearsed DNS flip away, and the maintainer can administer the Pi from anywhere.

---


## Phase 5: User Story 3 — Staging on the desktop, provisioned by code, deployed automatically (Priority: P3)

**Goal**: The Ansible playbook that reproduces `host-setup.md`, the staging overrides, the auto-deploy timer, and the desktop running staging behind the Pi with organizer-only access — replacing Vercel previews for acceptance testing.

**Independent Test**: A fresh Debian 13 desktop provisioned by `ansible-playbook site.yml --limit desktop` alone serves `https://staging.<domain>` behind basic auth; a second run reports `changed=0`; a push to `dev` is live on staging within five minutes; an organizer completes the M3 acceptance script.

- [ ] T020 [US3] Ansible playbook, staging overrides, deploy timer — in `deploy/compose.staging.yml` (files, interfaces and steps below)

**Files:**
- Create: `deploy/compose.staging.yml`, `deploy/caddy/Caddyfile.staging`, `deploy/systemd/holigay-deploy.service`, `deploy/systemd/holigay-deploy.timer`, `deploy/ansible/README.md`, `deploy/ansible/ansible.cfg`, `deploy/ansible/requirements.yml`, `deploy/ansible/inventory.example.ini`, `deploy/ansible/vault.example.yml`, `deploy/ansible/site.yml`, `deploy/ansible/group_vars/all.yml`, `deploy/ansible/host_vars/pi.yml`, `deploy/ansible/host_vars/desktop.yml`, `deploy/ansible/roles/{base,docker,wireguard,ddclient,restic,holigay}/tasks/main.yml`, `deploy/ansible/roles/{base,docker,wireguard,ddclient}/handlers/main.yml`, `deploy/ansible/roles/wireguard/templates/wg0.conf.j2`, `deploy/ansible/roles/ddclient/templates/ddclient.conf.j2`, `deploy/ansible/roles/holigay/handlers/main.yml`
- Modify: `deploy/.env.example` (add `COMPOSE_FILE`), `deploy/README.md` (Ansible row already present; add the ProxyJump note), `.gitignore` (Ansible secrets), `scripts/smoke-check.mjs` (`SMOKE_BASIC_AUTH` for the two page fetches — staging sits behind basic auth)

**Interfaces:**
- Consumes: `deploy/compose.yml`, `deploy/caddy/supabase-api.caddy`, `deploy/.env` keys (T013); `deploy/bin/deploy.sh` (T014); the procedure in `docs/runbooks/host-setup.md` §2–§7, §9 (T015).
- Produces: `docker compose` on the desktop reads `COMPOSE_FILE=compose.yml:compose.staging.yml` from `.env`; systemd units `holigay-deploy.{service,timer}`; playbook `site.yml` with per-host `holigay_env` ∈ `production|staging`, `ufw_rules`, `holigay_units`, `holigay_timers`; the Pi's backup SSH key at `/home/holigay/.ssh/id_ed25519_backup` and an ssh alias `desktop` on the Pi (consumed by `backup.sh`, T022); env `SMOKE_BASIC_AUTH=user:password` in the smoke script.

- [ ] **Step 1: `deploy/compose.staging.yml`**

```yaml
# Staging overrides for the desktop. Selected by COMPOSE_FILE=compose.yml:compose.staging.yml
# in deploy/.env, so a plain `docker compose …` (and deploy.sh, and the timer) picks both up.
# TLS is terminated on the Pi, which proxies https://staging.<domain> here over the LAN;
# Caddy on this host listens on plain :80 only.
services:
  caddy:
    ports: !override
      - "80:80"
    volumes: !override
      - ./caddy/Caddyfile.staging:/etc/caddy/Caddyfile:ro
      - ./caddy/supabase-api.caddy:/etc/caddy/supabase-api.caddy:ro
      - ${HOLIGAY_DATA}/caddy/data:/data
      - ${HOLIGAY_DATA}/caddy/config:/config
    environment:
      # The Pi is the only proxy in front of this host; trust its forwarded headers.
      PI_LAN_IP: ${APP_HOST_RESOLVES_TO}
```

- [ ] **Step 2: `deploy/caddy/Caddyfile.staging`**

```
# Caddyfile — staging (the desktop). The Pi terminates TLS and proxies
# https://{$STAGING_HOST} → this host's :80 over the LAN (deploy/caddy/Caddyfile). The
# routing is the same as production; only TLS is absent.

{
	auto_https off
	servers {
		trusted_proxies static {$PI_LAN_IP}
	}
}

http://{$APP_HOST} {
	import /etc/caddy/supabase-api.caddy
	handle {
		reverse_proxy app:3000
	}
}

# Internal only: Studio (admin profile).
:8000 {
	import /etc/caddy/supabase-api.caddy
	respond 404
}
```

- [ ] **Step 3: systemd units** — `deploy/systemd/holigay-deploy.service`:

```ini
[Unit]
Description=Holigay staging auto-deploy (pull the staging tag if it moved)
After=docker.service network-online.target
Requires=docker.service

[Service]
Type=oneshot
User=holigay
WorkingDirectory=/srv/holigay/app/deploy
ExecStart=/srv/holigay/app/deploy/bin/deploy.sh
```

`deploy/systemd/holigay-deploy.timer`:

```ini
[Unit]
Description=Run holigay-deploy every 5 minutes

[Timer]
OnBootSec=2min
OnUnitActiveSec=5min
RandomizedDelaySec=30

[Install]
WantedBy=timers.target
```

- [ ] **Step 4: `deploy/.env.example`** — add under the `# ---- identity` block, after `HOLIGAY_DATA`:

```
# staging only: layer the staging overrides so plain `docker compose` uses them.
# Leave this line commented on production.
# COMPOSE_FILE=compose.yml:compose.staging.yml
```

And `.gitignore` gains:

```
# Ansible inventory and vault hold LAN addresses, keys and tokens (specs/008)
/deploy/ansible/inventory.ini
/deploy/ansible/vault.yml
```

- [ ] **Step 5: Smoke behind basic auth** — in `scripts/smoke-check.mjs`, `readEnv()` returns one more field, `basicAuth: process.env.SMOKE_BASIC_AUTH?.trim() || null`, and `checkAppPages(appUrl, basicAuth)` sends it on the two page fetches only (the API prefixes are excluded from basic auth in the Caddyfile, and supabase-js sets its own `Authorization`):

```js
      const response = await fetch(`${appUrl}${path}`, {
        headers: {
          'cache-control': 'no-cache',
          ...(basicAuth ? { authorization: `Basic ${Buffer.from(basicAuth).toString('base64')}` } : {}),
        },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
```

`main()` passes it: `await runCheck('app-pages', () => checkAppPages(appUrl, basicAuth));`. Document in the header usage block and in `.env.example`'s smoke section: `SMOKE_BASIC_AUTH=user:password (optional): staging sits behind basic auth; sent on the page checks only.` Verify: `npm run smoke` against local still passes unchanged; `SMOKE_BASIC_AUTH=x:y` against local also passes (the header is ignored by a site without basic auth).

- [ ] **Step 6: Ansible — `deploy/ansible/README.md`**

```markdown
# deploy/ansible — provisioning

Reproduces `docs/runbooks/host-setup.md` §2–§7 and §9 for any Debian-family host. The Pi was
set up by hand from that runbook first; this playbook was written from it and is proven by
provisioning the desktop from it alone (spec 008 T021). A second run must report
`changed=0`.

## Install (workstation)

```bash
pipx install --include-deps ansible && pipx inject ansible ansible-lint   # or: pip install --user ansible ansible-lint
cd deploy/ansible
ansible-galaxy collection install -r requirements.yml
cp inventory.example.ini inventory.ini      # fill in the LAN addresses (git-ignored)
cp vault.example.yml vault.yml && ansible-vault encrypt vault.yml   # the Cloudflare token (git-ignored)
```

## Run

```bash
ansible-playbook site.yml --ask-vault-pass --limit desktop            # first time: stops at the .env check
ansible-playbook site.yml --ask-vault-pass --limit desktop            # after placing deploy/.env: converges
ansible-playbook site.yml --ask-vault-pass --limit desktop --check    # preview; must be all ok
ansible-playbook site.yml --ask-vault-pass                            # both hosts
```

The playbook never creates `deploy/.env`: secrets come from the password manager, by hand,
mode 600 (`host-setup.md` §7). It also never writes the WireGuard *client* configs or the
peers' keys — put the peers' public keys in `host_vars/pi.yml`.

## Reaching the desktop from away

WireGuard terminates on the Pi only. In `~/.ssh/config`:

```
Host desktop
    HostName <desktop-lan-ip>
    User holigay
    ProxyJump pi-wg
```

## Layout

`site.yml` → roles `base` (timezone, packages, sshd, ufw, unattended-upgrades, chrony),
`docker` (Docker's apt repo, daemon.json, group), `wireguard` (Pi only), `ddclient` (Pi only),
`restic` (Pi: backup SSH key + alias; desktop: the SFTP target and the key authorization),
`holigay` (directories, checkout, `.env` check, systemd units, weekly prune, `docker compose
up -d`, timers, and on staging the monitoring stack). Host differences live in `host_vars/`.
```

- [ ] **Step 7: Ansible — config, requirements, inventory, vault example, `site.yml`, vars**

`deploy/ansible/ansible.cfg`:

```ini
[defaults]
inventory = inventory.ini
roles_path = roles
host_key_checking = True
interpreter_python = auto_silent
retry_files_enabled = False
```

`deploy/ansible/requirements.yml`:

```yaml
---
collections:
  - name: community.general
  - name: community.docker
  - name: community.crypto
  - name: ansible.posix
```

`deploy/ansible/inventory.example.ini`:

```ini
[pi]
pi ansible_host=192.168.1.10 ansible_user=holigay

[desktop]
desktop ansible_host=192.168.1.20 ansible_user=holigay

[holigay:children]
pi
desktop
```

`deploy/ansible/vault.example.yml`:

```yaml
---
# Copy to vault.yml and `ansible-vault encrypt vault.yml`. Only the Pi's ddclient needs it.
cloudflare_token: replace-with-the-cloudflare-ddns-token
```

`deploy/ansible/site.yml`:

```yaml
---
- name: Holigay hosts
  hosts: holigay
  become: true
  vars_files:
    - vault.yml
  roles:
    - base
    - docker
    - { role: wireguard, when: holigay_env == 'production' }
    - { role: ddclient, when: holigay_env == 'production' }
    - restic
    - holigay
```

`deploy/ansible/group_vars/all.yml`:

```yaml
---
timezone: America/Edmonton
lan_subnet: 192.168.1.0/24
wireguard_subnet: 10.8.0.0/24
holigay_user: holigay
holigay_root: /srv/holigay
holigay_repo: https://github.com/Owen-Rose/Holigay-YYC
holigay_branch: main
```

`deploy/ansible/host_vars/pi.yml`:

```yaml
---
holigay_env: production
ufw_rules:
  - { from: "{{ lan_subnet }}", port: "22", proto: tcp, comment: ssh from LAN }
  - { from: "{{ wireguard_subnet }}", port: "22", proto: tcp, comment: ssh over WireGuard }
  - { port: "80", proto: tcp, comment: caddy http }
  - { port: "443", proto: tcp, comment: caddy https }
  - { port: "443", proto: udp, comment: caddy http3 }
  - { port: "51820", proto: udp, comment: wireguard }
wireguard_address: 10.8.0.1/24
wireguard_peers:
  - { name: workstation, public_key: replace-with-the-workstation-public-key, allowed_ips: 10.8.0.2/32 }
  - { name: phone, public_key: replace-with-the-phone-public-key, allowed_ips: 10.8.0.3/32 }
cloudflare_zone: example.com
ddclient_hosts:
  - app.example.com
  - staging.example.com
holigay_units: [holigay-backup.service, holigay-backup.timer]
holigay_timers: [holigay-backup.timer]
```

`deploy/ansible/host_vars/desktop.yml`:

```yaml
---
holigay_env: staging
ufw_rules:
  - { from: "{{ lan_subnet }}", port: "22", proto: tcp, comment: ssh from LAN }
  - { from: "{{ lan_subnet }}", port: "80", proto: tcp, comment: staging caddy, proxied by the Pi }
  - { from: "{{ lan_subnet }}", port: "3001", proto: tcp, comment: uptime kuma UI }
holigay_units: [holigay-deploy.service, holigay-deploy.timer]
holigay_timers: [holigay-deploy.timer]
```

(`host_vars/pi.yml` and `host_vars/desktop.yml` are committed with placeholder values; the WireGuard public keys and the zone are the only edits a real run needs, and they are public values.)

- [ ] **Step 8: Roles** — `roles/base/tasks/main.yml`:

```yaml
---
- name: Timezone
  community.general.timezone:
    name: "{{ timezone }}"

- name: Base packages
  ansible.builtin.apt:
    name: [chrony, unattended-upgrades, ufw, git, curl, restic]
    state: present
    update_cache: true
    cache_valid_time: 3600

- name: Chrony enabled
  ansible.builtin.systemd:
    name: chrony
    enabled: true
    state: started

- name: Unattended security upgrades
  ansible.builtin.copy:
    dest: /etc/apt/apt.conf.d/20auto-upgrades
    mode: "0644"
    content: |
      APT::Periodic::Update-Package-Lists "1";
      APT::Periodic::Unattended-Upgrade "1";

- name: Sshd hardening
  ansible.builtin.copy:
    dest: /etc/ssh/sshd_config.d/10-hardening.conf
    mode: "0644"
    content: |
      PasswordAuthentication no
      KbdInteractiveAuthentication no
      PermitRootLogin no
  notify: Restart ssh

- name: Firewall policy
  community.general.ufw:
    direction: "{{ item.direction }}"
    policy: "{{ item.policy }}"
  loop:
    - { direction: incoming, policy: deny }
    - { direction: outgoing, policy: allow }

- name: Firewall rules
  community.general.ufw:
    rule: allow
    from_ip: "{{ item.from | default('any') }}"
    port: "{{ item.port }}"
    proto: "{{ item.proto }}"
    comment: "{{ item.comment }}"
  loop: "{{ ufw_rules }}"

- name: Firewall enabled
  community.general.ufw:
    state: enabled
```

`roles/base/handlers/main.yml`:

```yaml
---
- name: Restart ssh
  ansible.builtin.systemd:
    name: ssh
    state: restarted
```

`roles/docker/tasks/main.yml`:

```yaml
---
- name: Keyrings directory
  ansible.builtin.file:
    path: /etc/apt/keyrings
    state: directory
    mode: "0755"

- name: Docker apt key
  ansible.builtin.get_url:
    url: https://download.docker.com/linux/debian/gpg
    dest: /etc/apt/keyrings/docker.asc
    mode: "0644"

- name: Docker apt repository
  ansible.builtin.apt_repository:
    repo: "deb [arch={{ ansible_architecture | replace('x86_64', 'amd64') | replace('aarch64', 'arm64') }} signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/debian {{ ansible_distribution_release }} stable"
    filename: docker
    state: present

- name: Docker packages
  ansible.builtin.apt:
    name: [docker-ce, docker-ce-cli, containerd.io, docker-compose-plugin]
    state: present
    update_cache: true

- name: Container log rotation
  ansible.builtin.copy:
    dest: /etc/docker/daemon.json
    mode: "0644"
    content: '{ "log-driver": "json-file", "log-opts": { "max-size": "10m", "max-file": "3" } }'
  notify: Restart docker

- name: Operator in the docker group
  ansible.builtin.user:
    name: "{{ holigay_user }}"
    groups: docker
    append: true

- name: Docker enabled
  ansible.builtin.systemd:
    name: docker
    enabled: true
    state: started
```

`roles/docker/handlers/main.yml`:

```yaml
---
- name: Restart docker
  ansible.builtin.systemd:
    name: docker
    state: restarted
```

`roles/wireguard/tasks/main.yml`:

```yaml
---
- name: WireGuard tools
  ansible.builtin.apt:
    name: wireguard-tools
    state: present

- name: Server private key (generated once, never read back into git)
  ansible.builtin.shell: umask 077 && wg genkey > /etc/wireguard/server.key
  args:
    creates: /etc/wireguard/server.key

- name: Server public key (for the client configs)
  ansible.builtin.shell: wg pubkey < /etc/wireguard/server.key > /etc/wireguard/server.pub
  args:
    creates: /etc/wireguard/server.pub

- name: Read the private key for the template
  ansible.builtin.slurp:
    src: /etc/wireguard/server.key
  register: wg_server_key
  no_log: true

- name: wg0.conf
  ansible.builtin.template:
    src: wg0.conf.j2
    dest: /etc/wireguard/wg0.conf
    mode: "0600"
  no_log: true
  notify: Restart wg0

- name: wg0 enabled
  ansible.builtin.systemd:
    name: wg-quick@wg0
    enabled: true
    state: started
```

`roles/wireguard/templates/wg0.conf.j2`:

```
[Interface]
Address = {{ wireguard_address }}
ListenPort = 51820
PrivateKey = {{ wg_server_key.content | b64decode | trim }}
{% for peer in wireguard_peers %}

[Peer]
# {{ peer.name }}
PublicKey = {{ peer.public_key }}
AllowedIPs = {{ peer.allowed_ips }}
{% endfor %}
```

`roles/wireguard/handlers/main.yml`:

```yaml
---
- name: Restart wg0
  ansible.builtin.systemd:
    name: wg-quick@wg0
    state: restarted
```

`roles/ddclient/tasks/main.yml`:

```yaml
---
- name: ddclient
  ansible.builtin.apt:
    name: ddclient
    state: present
  environment:
    DEBIAN_FRONTEND: noninteractive

- name: ddclient.conf
  ansible.builtin.template:
    src: ddclient.conf.j2
    dest: /etc/ddclient.conf
    mode: "0600"
  no_log: true
  notify: Restart ddclient

- name: ddclient enabled
  ansible.builtin.systemd:
    name: ddclient
    enabled: true
    state: started
```

`roles/ddclient/templates/ddclient.conf.j2`:

```
daemon=300
syslog=yes
use=web, web=https://api.ipify.org/
protocol=cloudflare
zone={{ cloudflare_zone }}
ttl=1
login=token
password={{ cloudflare_token }}
{{ ddclient_hosts | join(',') }}
```

`roles/ddclient/handlers/main.yml`:

```yaml
---
- name: Restart ddclient
  ansible.builtin.systemd:
    name: ddclient
    state: restarted
```

`roles/restic/tasks/main.yml` — the Pi gets a dedicated key and an ssh alias for the desktop; the desktop gets the SFTP target and authorizes that key, restricted to the sftp server:

```yaml
---
- name: Backup SSH key on the production host
  become_user: "{{ holigay_user }}"
  community.crypto.openssh_keypair:
    path: "/home/{{ holigay_user }}/.ssh/id_ed25519_backup"
    type: ed25519
    comment: holigay-backup
  register: backup_key
  when: holigay_env == 'production'

- name: Ssh alias for the on-site repository (production host)
  become_user: "{{ holigay_user }}"
  ansible.builtin.blockinfile:
    path: "/home/{{ holigay_user }}/.ssh/config"
    create: true
    mode: "0600"
    marker: "# {mark} holigay restic target"
    block: |
      Host desktop
          HostName {{ hostvars['desktop']['ansible_host'] }}
          User {{ holigay_user }}
          IdentityFile ~/.ssh/id_ed25519_backup
          IdentitiesOnly yes
  when: holigay_env == 'production'

- name: Desktop host key known to the production host
  become_user: "{{ holigay_user }}"
  ansible.builtin.known_hosts:
    name: "{{ hostvars['desktop']['ansible_host'] }}"
    key: "{{ lookup('pipe', 'ssh-keyscan -t ed25519 ' ~ hostvars['desktop']['ansible_host'] ~ ' 2>/dev/null') }}"
  when: holigay_env == 'production'

- name: SFTP target directory (staging host)
  ansible.builtin.file:
    path: /srv/restic/holigay
    state: directory
    owner: "{{ holigay_user }}"
    group: "{{ holigay_user }}"
    mode: "0750"
  when: holigay_env == 'staging'

- name: Authorize the production host's backup key, sftp only
  ansible.posix.authorized_key:
    user: "{{ holigay_user }}"
    key: "{{ hostvars['pi']['backup_key']['public_key'] }}"
    key_options: 'restrict,command="/usr/lib/openssh/sftp-server"'
  when: holigay_env == 'staging' and hostvars['pi']['backup_key'] is defined
```

`roles/holigay/tasks/main.yml`:

```yaml
---
- name: Data directories
  ansible.builtin.file:
    path: "{{ item }}"
    state: directory
    owner: "{{ holigay_user }}"
    group: "{{ holigay_user }}"
    mode: "0750"
  loop:
    - "{{ holigay_root }}"
    - "{{ holigay_root }}/db/data"
    - "{{ holigay_root }}/db/config"
    - "{{ holigay_root }}/storage"
    - "{{ holigay_root }}/caddy/data"
    - "{{ holigay_root }}/caddy/config"
    - "{{ holigay_root }}/monitoring"
    - /srv/backup

- name: Repository checkout
  become_user: "{{ holigay_user }}"
  ansible.builtin.git:
    repo: "{{ holigay_repo }}"
    dest: "{{ holigay_root }}/app"
    version: "{{ holigay_branch }}"
    update: true

- name: deploy/.env present?
  ansible.builtin.stat:
    path: "{{ holigay_root }}/app/deploy/.env"
  register: env_file

- name: Stop until deploy/.env exists
  ansible.builtin.fail:
    msg: >-
      Copy deploy/.env.example to {{ holigay_root }}/app/deploy/.env on this host, fill it
      in (bin/mint-keys.sh for the secrets; docs/runbooks/host-setup.md §7), chmod 600,
      then re-run. The playbook never writes secrets.
  when: not env_file.stat.exists

- name: deploy/.env permissions
  ansible.builtin.file:
    path: "{{ holigay_root }}/app/deploy/.env"
    owner: "{{ holigay_user }}"
    group: "{{ holigay_user }}"
    mode: "0600"

- name: Systemd units
  ansible.builtin.copy:
    src: "{{ holigay_root }}/app/deploy/systemd/{{ item }}"
    remote_src: true
    dest: "/etc/systemd/system/{{ item }}"
    mode: "0644"
  loop: "{{ holigay_units }}"
  notify: Reload systemd

- name: Weekly image prune
  ansible.builtin.copy:
    dest: /etc/cron.weekly/holigay-prune
    mode: "0755"
    content: |
      #!/bin/sh
      # keep the last three app images for rollback (docs/runbooks/deploy.md §2)
      docker image ls --format '{{ '{{' }}.Repository{{ '}}' }}:{{ '{{' }}.Tag{{ '}}' }}' ghcr.io/owen-rose/holigay-app | tail -n +4 | xargs -r docker image rm
      docker image prune -f >/dev/null

- name: Stack up
  become_user: "{{ holigay_user }}"
  community.docker.docker_compose_v2:
    project_src: "{{ holigay_root }}/app/deploy"
    state: present

- name: Monitoring up (staging host)
  become_user: "{{ holigay_user }}"
  community.docker.docker_compose_v2:
    project_src: "{{ holigay_root }}/app/deploy/monitoring"
    state: present
  when: holigay_env == 'staging'

- name: Apply pending handlers before enabling timers
  ansible.builtin.meta: flush_handlers

- name: Timers enabled
  ansible.builtin.systemd:
    name: "{{ item }}"
    enabled: true
    state: started
  loop: "{{ holigay_timers }}"
```

`roles/holigay/handlers/main.yml`:

```yaml
---
- name: Reload systemd
  ansible.builtin.systemd:
    daemon_reload: true
```

(`deploy/monitoring/compose.yml` and the backup units the Pi's `holigay_units` name are created by T022; until then run the desktop with `--limit desktop` only, which needs neither.)

- [ ] **Step 9: Validate on the workstation**

```bash
cd deploy/ansible
ansible-galaxy collection install -r requirements.yml
cp inventory.example.ini inventory.ini && cp vault.example.yml vault.yml
ansible-playbook site.yml --syntax-check && ansible-lint site.yml roles/
rm inventory.ini vault.yml
cd ../..
docker compose -f deploy/compose.yml -f deploy/compose.staging.yml --env-file deploy/.env.example config --quiet && echo staging-compose-ok
docker run --rm -v "$PWD/deploy/caddy:/etc/caddy:ro" -e APP_HOST=staging.example.com -e PI_LAN_IP=192.168.1.10 \
  caddy:2.11.4-alpine caddy validate --config /etc/caddy/Caddyfile.staging
systemd-analyze verify deploy/systemd/holigay-deploy.service deploy/systemd/holigay-deploy.timer
```

Expected: syntax check `playbook: site.yml`; `ansible-lint` reports 0 failures (warnings about `command`/`shell` idempotence are addressed by the `creates:` guards and may be ignored with a `# noqa` comment if they still fire); `staging-compose-ok`; `Valid configuration`; `systemd-analyze` prints nothing (it warns only about the absolute `ExecStart` path not existing on the workstation, which is expected).

- [ ] **Step 10: Commit**

```bash
git add deploy/compose.staging.yml deploy/caddy/Caddyfile.staging deploy/systemd deploy/ansible deploy/.env.example deploy/README.md .gitignore scripts/smoke-check.mjs .env.example
git commit -m "infra(ansible): playbook for both hosts; staging overrides and auto-deploy timer [008-T020]"
```

- [ ] T021 [manual] [US3] Provision the desktop and bring staging up. (1) Install Debian 13 (netinst, "SSH server" and "standard system utilities" only, no desktop environment), user `holigay` with your public key and sudo (`apt install sudo && usermod -aG sudo holigay`), a DHCP reservation for it on the router. (2) From the workstation: `ansible-playbook site.yml --ask-vault-pass --limit desktop` — it converges through the `restic` role and **stops at the `.env` check** (expected); place `deploy/.env` on the desktop: `mint-keys.sh` output, `APP_ENV=staging`, `APP_HOST=staging.<domain>`, `APP_HOST_RESOLVES_TO=<pi-lan-ip>`, `APP_IMAGE_TAG=staging`, `COMPOSE_FILE=compose.yml:compose.staging.yml`, the SMTP block, `EMAIL_FROM_ADDRESS`. (3) The image must exist before the stack can come up: GitHub → `staging` environment → `NEXT_PUBLIC_SUPABASE_URL=https://staging.<domain>`, `NEXT_PUBLIC_SUPABASE_ANON_KEY=<the desktop's ANON_KEY>`; push any commit to `dev`; wait for `staging-<sha>` and the floating `staging` tag in GHCR. Then re-run the playbook — it converges, pulls the image and brings the whole stack up; from now on the timer picks up every `dev` push within five minutes (`journalctl -u holigay-deploy.service` on the desktop). (4) `docs/runbooks/migrate.md` against the desktop (`make tunnel-db HOST=desktop`), then `./bin/deploy.sh` once by hand so the app restarts against the migrated schema. (5) On the Pi, in `deploy/.env`: `STAGING_UPSTREAM=<desktop-lan-ip>:80` and a real `STAGING_BASIC_AUTH_HASH` (generate with the `caddy hash-password` command from `.env.example`, paste with `$$`); `docker compose up -d caddy` (recreates Caddy with the new env). Cloudflare → DNS → `A staging <home public IP>` proxied. (6) `curl -sI https://staging.<domain>/` → `401` with `www-authenticate: Basic`; `curl -sI -u organizer:<pw> https://staging.<domain>/` → `200`; `curl -sI https://staging.<domain>/auth/v1/health` → `200` **without** credentials (V9); `SMOKE_APP_URL=https://staging.<domain> SMOKE_SUPABASE_URL=https://staging.<domain> SMOKE_SUPABASE_ANON_KEY=<staging anon> SMOKE_BASIC_AUTH=organizer:<pw> SMOKE_ORGANIZER_EMAIL=… SMOKE_ORGANIZER_PASSWORD=… SMOKE_STORAGE_EXPECT_PRIVATE=1 npm run smoke` → `all 6 checks passed`. (7) Idempotence: `ansible-playbook site.yml --ask-vault-pass --limit desktop` again → recap shows `changed=0`; then run it against the Pi too (`--limit pi`) and confirm it changes nothing the hand setup did not already do (a non-zero `changed` here is a runbook/playbook mismatch to fix in T020, not on the host). (8) Push a visible change to `dev`, time it to staging. (9) An organizer runs the M3 acceptance script (`docs/M3-PLAN.md`, "UAT dry-run shape") on staging; findings go to Tier 3 PRs, not this spec. Needs T004, T018, T020. evidence: the six T021 rows in quickstart.md — FR-021, FR-022, FR-029, SC-008

**Checkpoint**: two hosts, one playbook, `changed=0` on re-run; staging behind organizer-only basic auth follows `dev` within five minutes; the organizers have a place to test.

---

## Phase 6: User Story 4 — Backups exist, alert when they fail, and have been restored (Priority: P4)

**Goal**: A six-hourly physical backup to two encrypted repositories, a dead-man switch that emails when it misses, a scripted restore proven by a drill on the desktop, and a power-cycle rehearsal.

**Independent Test**: `holigay-backup.timer` fires and both `restic snapshots` lists grow; a deliberately broken repository password produces an alert email within one cycle; `restore.sh` on the desktop yields a stack that passes `npm run smoke`; the Pi survives a power pull with alerts sent and data intact.

- [ ] T022 [US4] `backup.sh`, `restore.sh`, the backup timer, monitoring, and the runbooks — in `deploy/db/pg_hba.conf` (files, interfaces and steps below)

**Files:**
- Create: `deploy/db/pg_hba.conf`, `deploy/bin/backup.sh`, `deploy/bin/restore.sh`, `deploy/systemd/holigay-backup.service`, `deploy/systemd/holigay-backup.timer`, `deploy/monitoring/compose.yml`, `docs/runbooks/disaster-recovery.md`
- Modify: `deploy/compose.yml` (mount `pg_hba.conf`), `deploy/.env.example` (`RESTIC_REPO_ONSITE` uses the ssh alias), `docs/runbooks/backup-restore.md` (rewritten), `docs/runbooks/upgrade-stack.md` (the `pg_hba.conf` diff step), `/etc/cron.weekly` prune script content in `docs/runbooks/host-setup.md` §9 and `roles/holigay` (add the restic prune)

**Interfaces:**
- Consumes: `.env` keys `HOLIGAY_DATA`, `RESTIC_PASSWORD`, `RESTIC_REPO_ONSITE`, `RESTIC_REPO_OFFSITE`, `B2_ACCOUNT_ID`, `B2_ACCOUNT_KEY`, `UPTIME_KUMA_PUSH_URL` (T013); the ssh alias `desktop` + backup key on the Pi (T020); the `db` container as `supabase_admin` over loopback.
- Produces: `/srv/backup/latest/{db/base/base.tar.gz,db/base/pg_wal.tar.gz,db/postgres.dump,db/config/,storage/,env,TAKEN_AT}`; restic snapshots tagged `holigay` in both repositories; `restore.sh [snapshot-id]` (env `RESTIC_REPO` overrides the source; exit 3 if the data directory is not empty); units `holigay-backup.{service,timer}`; Uptime Kuma at `http://<desktop-lan-ip>:3001`.

- [ ] **Step 1: Allow `pg_basebackup` over loopback** — the pinned image's `/etc/postgresql/pg_hba.conf` (verified 2026-09-19) has `host all all 127.0.0.1/32 trust` but **no `replication` entry**, and a physical base backup needs one. `deploy/db/pg_hba.conf` is the image's file plus one loopback-only line, mounted read-only over the original:

```
# deploy/db/pg_hba.conf — the pinned supabase/postgres image's pg_hba.conf plus ONE line:
# a replication connection over the container's loopback, which pg_basebackup (bin/backup.sh)
# needs and the image does not grant. Loopback inside the container is unreachable from
# anywhere else. On every image bump, diff this against the new image's
# /etc/postgresql/pg_hba.conf (docs/runbooks/upgrade-stack.md step 1b).
local all  supabase_admin     scram-sha-256
local all  all                peer map=supabase_map
host  all  all  127.0.0.1/32  trust
host  all  all  ::1/128       trust
host  replication  all  127.0.0.1/32  trust
host  all  all  10.0.0.0/8  scram-sha-256
host  all  all  172.16.0.0/12  scram-sha-256
host  all  all  192.168.0.0/16  scram-sha-256
host  all  all  0.0.0.0/0     scram-sha-256
host  all  all  ::0/0     scram-sha-256
```

In `deploy/compose.yml`, `db.volumes` gains `- ./db/pg_hba.conf:/etc/postgresql/pg_hba.conf:ro` (after the two init scripts). In `docs/runbooks/upgrade-stack.md`, after step 1 add **1b**: "`docker run --rm --entrypoint cat public.ecr.aws/supabase/postgres:<new tag> /etc/postgresql/pg_hba.conf | diff - deploy/db/pg_hba.conf` — the only difference must be the `replication` line; carry any upstream change into our file."

- [ ] **Step 2: `deploy/bin/backup.sh`** (`chmod +x`)

```bash
#!/usr/bin/env bash
# Six-hourly backup (research R12). A physical base backup of Postgres taken while it runs,
# a logical dump for inspection, the uploaded files, the db config (pgsodium key) and .env
# are staged under /srv/backup/latest and pushed by restic to the on-site (desktop, SFTP)
# and off-site (Backblaze B2) repositories, encrypted client-side. The last step pings the
# Uptime Kuma push monitor; a missed ping IS the alert, so on any failure the ping is
# skipped and the exit code is non-zero (journalctl -u holigay-backup shows why).
#
# Runs as the holigay user from deploy/ (systemd/holigay-backup.timer). Never sources .env
# (values may hold `$$`); reads the keys it needs with sed. Data copies go through
# `docker compose cp`, which reads as root inside the containers regardless of file owners.
set -euo pipefail
cd "$(dirname "$0")/.."

env_get() { sed -n "s/^$1=//p" .env; }

HOLIGAY_DATA=$(env_get HOLIGAY_DATA)
STAGE=/srv/backup/latest
ONSITE=$(env_get RESTIC_REPO_ONSITE)
OFFSITE=$(env_get RESTIC_REPO_OFFSITE)
PUSH=$(env_get UPTIME_KUMA_PUSH_URL)
RESTIC_PASSWORD=$(env_get RESTIC_PASSWORD)
B2_ACCOUNT_ID=$(env_get B2_ACCOUNT_ID)
B2_ACCOUNT_KEY=$(env_get B2_ACCOUNT_KEY)
export RESTIC_PASSWORD B2_ACCOUNT_ID B2_ACCOUNT_KEY

[ -n "$RESTIC_PASSWORD" ] || { echo "backup.sh: RESTIC_PASSWORD is empty in .env" >&2; exit 2; }

rm -rf "$STAGE"
mkdir -p "$STAGE/db"

# 1. Physical: a consistent copy of the running cluster, WAL streamed into the archive so
#    it is self-contained. Over loopback as the image's superuser (deploy/db/pg_hba.conf).
docker compose exec -T db sh -c 'rm -rf /tmp/basebackup && pg_basebackup -h 127.0.0.1 -U supabase_admin -D /tmp/basebackup -Ft -z -X stream -c fast'
docker compose cp db:/tmp/basebackup "$STAGE/db/base"
docker compose exec -T db rm -rf /tmp/basebackup

# 2. Logical: readable with pg_restore/psql, and the path for a future Postgres major.
docker compose exec -T db pg_dump -h 127.0.0.1 -U supabase_admin -Fc postgres > "$STAGE/db/postgres.dump"

# 3. Files and configuration.
docker compose cp storage:/var/lib/storage "$STAGE/storage"
docker compose cp db:/etc/postgresql-custom "$STAGE/db/config"
cp -p .env "$STAGE/env"
date -u +%FT%TZ > "$STAGE/TAKEN_AT"

# 4. Two repositories. One failing does not stop the other; either failing fails the run.
status=0
for repo in "$ONSITE" "$OFFSITE"; do
  if restic -r "$repo" backup --quiet --tag holigay "$STAGE"; then
    restic -r "$repo" forget --quiet --tag holigay --keep-daily 14 --keep-weekly 8 --keep-monthly 12
  else
    echo "backup.sh: FAILED $repo" >&2
    status=1
  fi
done
[ "$status" -eq 0 ] || exit 1

# 5. Prove it ran. (Pruning is weekly, in /etc/cron.weekly/holigay-prune — not here.)
if [ -n "$PUSH" ]; then
  curl -fsS -m 10 "${PUSH}?status=up&msg=ok" >/dev/null || echo "backup.sh: push monitor unreachable" >&2
fi
echo "backup.sh: ok $(cat "$STAGE/TAKEN_AT")"
```

- [ ] **Step 3: `deploy/bin/restore.sh`** (`chmod +x`)

```bash
#!/usr/bin/env bash
# Restore a snapshot into THIS compose project (research R12). Run from deploy/ on the host
# you are restoring onto, with the data directories EMPTY (a fresh host, or after
# `docker compose down` and clearing HOLIGAY_DATA — docs/runbooks/backup-restore.md §3).
#
# Usage: restore.sh [snapshot-id]        default: latest
#        RESTIC_REPO=<repo> restore.sh   default: RESTIC_REPO_ONSITE from .env
#
# Restores the base backup into the data directory, the db config (pgsodium key), the
# storage files; prints where the backed-up .env is so it can be diffed against the current
# one; starts db, then everything. The image's entrypoint re-owns the data directory on
# start, so files extracted as the holigay user are fine. Exit 3 if the data dir is not empty.
set -euo pipefail
cd "$(dirname "$0")/.."

env_get() { sed -n "s/^$1=//p" .env; }

HOLIGAY_DATA=$(env_get HOLIGAY_DATA)
REPO=${RESTIC_REPO:-$(env_get RESTIC_REPO_ONSITE)}
SNAP=${1:-latest}
WORK=/srv/backup/restore
RESTIC_PASSWORD=$(env_get RESTIC_PASSWORD)
B2_ACCOUNT_ID=$(env_get B2_ACCOUNT_ID)
B2_ACCOUNT_KEY=$(env_get B2_ACCOUNT_KEY)
export RESTIC_PASSWORD B2_ACCOUNT_ID B2_ACCOUNT_KEY

if [ -n "$(ls -A "$HOLIGAY_DATA/db/data" 2>/dev/null)" ]; then
  echo "restore.sh: $HOLIGAY_DATA/db/data is not empty — refusing. See docs/runbooks/backup-restore.md §3." >&2
  exit 3
fi

docker compose down
rm -rf "$WORK" && mkdir -p "$WORK"
restic -r "$REPO" restore "$SNAP" --target "$WORK"
S="$WORK/srv/backup/latest"
echo "restore.sh: snapshot taken at $(cat "$S/TAKEN_AT")"

tar -xzf "$S/db/base/base.tar.gz" -C "$HOLIGAY_DATA/db/data"
mkdir -p "$HOLIGAY_DATA/db/data/pg_wal"
tar -xzf "$S/db/base/pg_wal.tar.gz" -C "$HOLIGAY_DATA/db/data/pg_wal"
cp -a "$S/db/config/." "$HOLIGAY_DATA/db/config/"
cp -a "$S/storage/." "$HOLIGAY_DATA/storage/"

echo "restore.sh: the backed-up .env is $S/env — diff it against ./.env (keys, hosts) before relying on this stack"
docker compose up -d db
sleep 15
docker compose ps db
docker compose up -d
docker compose ps
rm -rf "$WORK"
```

- [ ] **Step 4: Units and monitoring** — `deploy/systemd/holigay-backup.service`:

```ini
[Unit]
Description=Holigay backup (pg_basebackup + files → restic, two repositories)
After=docker.service network-online.target
Requires=docker.service

[Service]
Type=oneshot
User=holigay
WorkingDirectory=/srv/holigay/app/deploy
ExecStart=/srv/holigay/app/deploy/bin/backup.sh
```

`deploy/systemd/holigay-backup.timer`:

```ini
[Unit]
Description=Run holigay-backup every 6 hours

[Timer]
OnCalendar=00/6:15
RandomizedDelaySec=5min
Persistent=true

[Install]
WantedBy=timers.target
```

`deploy/monitoring/compose.yml` (the desktop; published on the LAN on purpose — this host is not internet-exposed and the UI has its own login):

```yaml
# Uptime Kuma — the whole monitoring stack (research R13). Runs on the desktop, watches
# production from the outside, hosts the backup push monitor, alerts by email through the
# same SMTP relay (configured in its UI). Reachable on the LAN at http://<desktop>:3001.
name: holigay-monitoring

services:
  uptime-kuma:
    image: louislam/uptime-kuma:2.5.5
    restart: unless-stopped
    ports:
      - "3001:3001"
    volumes:
      - /srv/holigay/monitoring:/app/data
    logging:
      driver: json-file
      options:
        max-size: "10m"
        max-file: "3"
```

Weekly pruning: the `/etc/cron.weekly/holigay-prune` script (in `host-setup.md` §9 and `roles/holigay`) gains, after the image lines:

```sh
# restic: drop data no snapshot references any more (backup.sh runs `forget` six-hourly, never prune)
cd /srv/holigay/app/deploy && for repo in "$(sed -n 's/^RESTIC_REPO_ONSITE=//p' .env)" "$(sed -n 's/^RESTIC_REPO_OFFSITE=//p' .env)"; do
  RESTIC_PASSWORD="$(sed -n 's/^RESTIC_PASSWORD=//p' .env)" B2_ACCOUNT_ID="$(sed -n 's/^B2_ACCOUNT_ID=//p' .env)" B2_ACCOUNT_KEY="$(sed -n 's/^B2_ACCOUNT_KEY=//p' .env)" \
    su -s /bin/sh holigay -c "restic -r '$repo' prune --quiet" || true
done
```

In `deploy/.env.example`, change `RESTIC_REPO_ONSITE=sftp:holigay@192.168.1.20:/srv/restic/holigay` to `RESTIC_REPO_ONSITE=sftp:desktop:/srv/restic/holigay` with the comment `# sftp:<ssh alias on this host>:<absolute path on the target>  (the alias comes from the ansible restic role)`.

- [ ] **Step 5: Rewrite `docs/runbooks/backup-restore.md`** — replace the whole file:

```markdown
# Runbook: Backup and restore

**Spec**: `specs/008-self-hosted-infrastructure/` (T022) · **Design**: `research.md` R12

A backup nobody has restored is not a backup, so §3 (the drill) is part of the routine —
quarterly, on the desktop, in isolation — not an optional extra. The previous version of this
runbook (hosted projects, Supabase CLI dumps, the local-stack skew filter) is in git history
under spec 007; none of it applies to the self-hosted stack.

## 0. What a backup contains, and where it goes

`deploy/bin/backup.sh` runs on the production host every six hours
(`holigay-backup.timer`) and stages under `/srv/backup/latest/`:

| Item | How | Why |
|---|---|---|
| `db/base/base.tar.gz`, `db/base/pg_wal.tar.gz` | `pg_basebackup -X stream` inside the `db` container | A consistent physical copy of the cluster, taken with **no downtime**. This is what a restore uses: same image, untar, start. |
| `db/postgres.dump` | `pg_dump -Fc` | Logical, for reading with `pg_restore -l` / `psql`, and the only path across a Postgres major version. Not the restore path. |
| `db/config/` | copy of `/etc/postgresql-custom` | The pgsodium/Vault root key. Without it the restored cluster cannot open anything the Vault encrypted. |
| `storage/` | copy of the storage-api file backend | Every uploaded attachment. `public.attachments.file_path` is plain text — the files and the rows travel together. |
| `env` | `deploy/.env` | The keys the data was written with. Compared, not blindly reused, on restore. |

restic then pushes the stage to **two** repositories — `RESTIC_REPO_ONSITE` (the desktop over
SFTP, the ssh alias `desktop`) and `RESTIC_REPO_OFFSITE` (Backblaze B2) — encrypted with
`RESTIC_PASSWORD` before anything leaves the Pi, keeps 14 daily / 8 weekly / 12 monthly
snapshots, and finally pings the Uptime Kuma push monitor. **A missed ping is the alert.**
Weekly, `/etc/cron.weekly/holigay-prune` reclaims space in both repositories.

Treat the repositories like credentials: they hold `auth.users` password hashes and vendor
PII. The restic password is in the password manager and in `deploy/.env` — nowhere else.

## 1. Check that backups are happening

```bash
ssh pi 'systemctl list-timers holigay-backup.timer; journalctl -u holigay-backup.service -n 20 --no-pager'
ssh pi 'cd /srv/holigay/app/deploy && set -a && RESTIC_PASSWORD=$(sed -n "s/^RESTIC_PASSWORD=//p" .env) restic -r "$(sed -n "s/^RESTIC_REPO_ONSITE=//p" .env)" snapshots --tag holigay --latest 3'
```

Uptime Kuma (`http://<desktop>:3001`) shows the push monitor green with a timestamp under
six hours old. Red means the last run failed or never ran — `journalctl` says which.

## 2. Take one by hand

```bash
ssh pi 'cd /srv/holigay/app/deploy && ./bin/backup.sh'
```

Do this before any stack upgrade (`docs/runbooks/upgrade-stack.md`) and before go-live.

## 3. Restore — the quarterly drill, and the real thing

The drill restores the latest production snapshot onto the **desktop**, as a separate
Compose project the Pi does not route to, verifies it without the app (the staging image's
baked-in URL points at staging's API, so the app would prove nothing), and wipes it.
Production data never lands in the staging project (the rule from spec 007 stands).

```bash
ssh desktop
# 3.1 an isolated project directory and data root
sudo mkdir -p /srv/holigay-drill && sudo chown holigay:holigay /srv/holigay-drill
cp -r /srv/holigay/app/deploy /srv/holigay-drill/deploy && cd /srv/holigay-drill/deploy
sed -i 's|^name: holigay$|name: holigay-drill|; s|"127.0.0.1:5432:5432"|"127.0.0.1:5433:5432"|' compose.yml
mkdir -p /srv/holigay-drill/data/{db/data,db/config,storage,caddy/data,caddy/config}
# 3.2 the drill's .env: start from staging's, then edit these lines
cp /srv/holigay/app/deploy/.env .env
#   HOLIGAY_DATA=/srv/holigay-drill/data
#   RESTIC_REPO_ONSITE=/srv/restic/holigay        (a local path — the repository IS on this host)
#   RESTIC_PASSWORD=<production's, from the password manager — the repository was made with it>
#   delete the COMPOSE_FILE line
# The restored data was written under production's JWT secret. The drill's services all use
# staging's, consistently, so password sign-in and signed URLs still work; the restored `env`
# file (printed by restore.sh) diffed against production's .env is the check that nothing
# else drifted.
# 3.3 restore (refuses if the data dir is not empty), then stop what the drill does not need
./bin/restore.sh
docker compose stop app caddy
```

`restore.sh` restores `latest` (pass a snapshot id for an older one — `restic snapshots`
lists them), starts `db`, then the rest. `caddy` cannot bind :80 here (staging owns it) and
`app` would talk to staging — both are stopped on purpose.

```bash
# 3.4 verify — rows, files, auth, and one signed download, all inside the drill's network
docker compose exec db psql -U postgres -d postgres -Atc "select 'auth.users', count(*) from auth.users union all select 'applications', count(*) from public.applications union all select 'attachments', count(*) from public.attachments union all select 'storage.objects', count(*) from storage.objects;"
find /srv/holigay-drill/data/storage -type f | wc -l          # equals the storage.objects count
ANON=$(sed -n 's/^ANON_KEY=//p' .env); SERVICE=$(sed -n 's/^SERVICE_ROLE_KEY=//p' .env)
# sign in as the production admin (proves auth.users, identities and password hashes restored)
docker run --rm --network holigay-drill_default curlimages/curl:8.11.1 -sS -o /dev/null -w 'auth token: HTTP %{http_code}\n' \
  -X POST "http://auth:9999/token?grant_type=password" -H "apikey: $ANON" -H "Content-Type: application/json" \
  -d '{"email":"<the production admin address>","password":"<its password>"}'
# sign one restored object and download it (proves storage.objects rows, files and keys line up)
P=$(docker compose exec db psql -U postgres -d postgres -Atc "select file_path from public.attachments order by created_at desc limit 1")
SIGNED=$(docker run --rm --network holigay-drill_default curlimages/curl:8.11.1 -sS -X POST "http://storage:5000/object/sign/attachments/$P" \
  -H "Authorization: Bearer $SERVICE" -H "Content-Type: application/json" -d '{"expiresIn":60}' | sed -E 's/.*"signedURL":"([^"]+)".*/\1/')
docker run --rm --network holigay-drill_default curlimages/curl:8.11.1 -sS -o /dev/null -w 'download: HTTP %{http_code}, %{size_download} bytes\n' "http://storage:5000$SIGNED"
```

`HTTP 200` for the token and a non-zero download mean rows, files, hashes and keys all
line up (V3). Record the elapsed time from 3.1 to the download in `quickstart.md`; the
target is under one hour.

```bash
# 3.5 wipe — nothing from production stays on this host
docker compose down -v
cd / && sudo rm -rf /srv/holigay-drill
```

**The real thing** (the Pi is dead or its NVMe is gone) is `docs/runbooks/disaster-recovery.md`:
the same `restore.sh`, on a host provisioned by the playbook, followed by repointing the
router and DNS.

## 4. Restore a single file or table

```bash
restic -r <repo> snapshots --tag holigay
restic -r <repo> restore <id> --target /tmp/r --include '/srv/backup/latest/storage/attachments/uploads/<file>'
restic -r <repo> restore <id> --target /tmp/r --include '/srv/backup/latest/db/postgres.dump'
pg_restore -l /tmp/r/srv/backup/latest/db/postgres.dump | less      # what is in the logical dump
```

## Verified behaviour

| # | Observed | Why it matters |
|---|---|---|
| 1 | The pinned image's `pg_hba.conf` has no `replication` entry (checked 2026-09-19) | `deploy/db/pg_hba.conf` adds one for the container's loopback only; re-diff on every image bump |
| 2 | The image's entrypoint runs `find "$PGDATA" ! -user postgres -exec chown postgres` before starting | A restore extracted as `holigay` starts cleanly; no manual chown |
| 3 | `restic forget` runs after every backup, `prune` only weekly | Pruning rewrites pack files and costs B2 transactions; six-hourly would be wasteful |
| 4 | (filled in by the first drill, T024) | |
```

- [ ] **Step 6: `docs/runbooks/disaster-recovery.md`**

```markdown
# Runbook: Disaster recovery

**Spec**: `specs/008-self-hosted-infrastructure/` (T022) · **Design**: `research.md` R6, R12, R17

Target: production back on a green smoke test within one hour of deciding to recover, with
at most six hours of data lost (the backup interval). Rehearsed once before go-live (T024)
and quarterly after (`backup-restore.md` §3).

## Scenarios

| What died | Recover onto | Image source |
|---|---|---|
| The Pi's NVMe, or the Pi | A replacement Pi (best) or the desktop (fastest) | Replacement Pi: `ghcr.io/…:prod-<sha>` as usual. Desktop: build it locally — GHCR's prod image is arm64 only |
| Both hosts (fire, theft, flood) | Any Debian box, later | The off-site repository (B2) has everything; `make build-local` for the image |
| One file or table | Nothing — `backup-restore.md` §4 | — |
| A bad deploy | Nothing — `deploy.md` §2 (rollback) | — |

## A. Replacement Pi (or any fresh host)

1. `docs/runbooks/host-setup.md` §1 by hand (image the NVMe), then the playbook:
   `ansible-playbook site.yml --ask-vault-pass --limit pi` — it stops at the `.env` check.
2. `deploy/.env` from the password manager (the *same* keys — the data was written with
   them; a different `JWT_SECRET` would orphan every user session and the storage JWTs).
3. Do **not** re-run the playbook yet (it would bring an empty stack up). Instead:
   `cd /srv/holigay/app/deploy && ./bin/restore.sh` — from the on-site repository if the
   desktop is alive (`RESTIC_REPO_ONSITE`), else `RESTIC_REPO=b2:holigay-backups:/ ./bin/restore.sh`.
   `restore.sh` runs `docker compose down` first, which is a no-op on a fresh host, and
   needs the image: `docker compose pull app` works once `.env` has `APP_IMAGE_TAG`.
4. `ansible-playbook … --limit pi` now converges (timers, cron).
5. Router: the DHCP reservation and port forwards follow the MAC address — update them
   for the new board. DNS follows the public IP — unchanged, unless you also moved.
6. `npm run smoke` with `SMOKE_STORAGE_EXPECT_PRIVATE=1` → `all 6 checks passed`; sign in;
   open one application. Record the elapsed time in `quickstart.md`.

## B. The desktop stands in for the Pi

The desktop is amd64; the published prod image is arm64. Build it:

```bash
git clone https://github.com/Owen-Rose/Holigay-YYC /tmp/h && cd /tmp/h && git checkout <the sha production was running>
make build-local TAG=prod-<sha> NEXT_PUBLIC_SUPABASE_URL=https://app.<domain> NEXT_PUBLIC_SUPABASE_ANON_KEY=<ANON_KEY from the production .env>
```

Then, on the desktop, stop staging (`cd /srv/holigay/app/deploy && docker compose down`),
replace its `.env` with production's (keep a copy of staging's), delete the `COMPOSE_FILE`
line, set `APP_HOST_RESOLVES_TO=host-gateway`, `APP_IMAGE_TAG=prod-<sha>`, and `./bin/restore.sh`.
Router: forward 80/443 to the desktop instead of the Pi. Cloudflare's record needs no
change. Smoke, then tell the organizers staging is off until the Pi is back.

## C. Both hosts gone

Any Debian 13 machine with the playbook (`host-setup.md` §1 replaced by whatever installs
Debian on it), the password manager (`.env`, the restic password, the B2 key), and the
B2 repository. Steps as in A with `RESTIC_REPO=b2:…`. Buy a new Pi when convenient and do A
again to move back.

## Before you need it

- The password manager holds: `deploy/.env` for both hosts, the restic password, the B2
  account id and key, the Cloudflare token, the WireGuard server key. If any is missing,
  fix that today.
- `restic -r b2:holigay-backups:/ snapshots --latest 1` from the workstation (with the B2
  env and the restic password in the shell) proves the off-site copy is readable from
  outside the house. Do it in the quarterly drill.
```

- [ ] **Step 7: Validate on the workstation** — shellcheck, unit syntax, and a real `backup.sh` run against a throwaway stack (the T013 Step 9 recipe, plus a local restic repository):

```bash
chmod +x deploy/bin/backup.sh deploy/bin/restore.sh
docker run --rm -v "$PWD:/mnt" koalaman/shellcheck:stable deploy/bin/backup.sh deploy/bin/restore.sh
systemd-analyze verify deploy/systemd/holigay-backup.service deploy/systemd/holigay-backup.timer
docker compose -f deploy/monitoring/compose.yml config --quiet && echo monitoring-ok
docker compose -f deploy/compose.yml --env-file deploy/.env.example config --quiet && echo compose-ok

# end-to-end against a throwaway stack (stop the CLI stack first: npx supabase stop)
mkdir -p /tmp/holigay-data /tmp/holigay-restic && cp deploy/.env.example /tmp/holigay.env && deploy/bin/mint-keys.sh >> /tmp/holigay.env
sed -i 's|^HOLIGAY_DATA=.*|HOLIGAY_DATA=/tmp/holigay-data|; s|^APP_HOST=.*|APP_HOST=app.localtest.me|; s|^RESTIC_REPO_ONSITE=.*|RESTIC_REPO_ONSITE=/tmp/holigay-restic|; s|^RESTIC_REPO_OFFSITE=.*|RESTIC_REPO_OFFSITE=/tmp/holigay-restic|' /tmp/holigay.env
cp /tmp/holigay.env deploy/.env      # backup.sh reads ./.env; deleted below
RESTIC_PASSWORD=$(sed -n 's/^RESTIC_PASSWORD=//p' deploy/.env) restic init -r /tmp/holigay-restic
( cd deploy && docker compose up -d db && sleep 20 && docker compose up -d auth rest storage && sleep 20 )
PW=$(sed -n 's/^POSTGRES_PASSWORD=//p' deploy/.env); npx supabase db push --db-url "postgresql://postgres:$PW@127.0.0.1:5432/postgres"
sudo mkdir -p /srv/backup && sudo chown "$USER" /srv/backup
deploy/bin/backup.sh
ls -la /srv/backup/latest /srv/backup/latest/db/base
RESTIC_PASSWORD=$(sed -n 's/^RESTIC_PASSWORD=//p' deploy/.env) restic -r /tmp/holigay-restic snapshots
# restore into a second empty data root, same keys
( cd deploy && docker compose down )
sed -i 's|^HOLIGAY_DATA=.*|HOLIGAY_DATA=/tmp/holigay-data2|' deploy/.env && mkdir -p /tmp/holigay-data2/{db/data,db/config,storage,caddy/data,caddy/config}
deploy/bin/restore.sh
( cd deploy && docker compose ps && docker compose exec db psql -U postgres -d postgres -Atc "select count(*) from supabase_migrations.schema_migrations" )
( cd deploy && docker compose down )
rm -f deploy/.env; sudo rm -rf /tmp/holigay-data /tmp/holigay-data2 /tmp/holigay-restic /tmp/holigay.env /srv/backup/latest
npx supabase start
```

Expected: shellcheck silent; `backup.sh: ok <timestamp>`; the stage holds `base.tar.gz` and `pg_wal.tar.gz`; one snapshot; after `restore.sh`, `db` healthy, `auth`/`storage`/`rest` healthy (their migration tables came back at the expected versions — V3 on the workstation), and the count prints `12`. If `pg_basebackup` reports `no pg_hba.conf entry for replication connection`, the `pg_hba.conf` mount from Step 1 is not in `compose.yml`.

- [ ] **Step 8: Commit**

```bash
git add deploy/db/pg_hba.conf deploy/compose.yml deploy/bin/backup.sh deploy/bin/restore.sh deploy/systemd/holigay-backup.service deploy/systemd/holigay-backup.timer deploy/monitoring/compose.yml deploy/.env.example deploy/ansible/roles/holigay/tasks/main.yml docs/runbooks/backup-restore.md docs/runbooks/disaster-recovery.md docs/runbooks/upgrade-stack.md docs/runbooks/host-setup.md
git commit -m "infra(backup): six-hourly physical backups to two restic repositories, restore script, DR runbook [008-T022]"
```

- [ ] T023 [manual] [US4] Repositories, timers, monitoring, and the alert proof. (1) Backblaze: create bucket `holigay-backups` (private, default encryption on, lifecycle "keep all versions" is fine — restic manages retention), then an application key scoped to that bucket only; store both in the password manager. (2) On the Pi, in `deploy/.env`: `RESTIC_PASSWORD` (already minted), `RESTIC_REPO_ONSITE=sftp:desktop:/srv/restic/holigay`, `RESTIC_REPO_OFFSITE=b2:holigay-backups:/`, `B2_ACCOUNT_ID`, `B2_ACCOUNT_KEY`. `ssh desktop` from the Pi as `holigay` must work non-interactively (the restic role set the alias and the key); then, with the restic env exported in the shell (`set -a; RESTIC_PASSWORD=…; B2_ACCOUNT_ID=…; B2_ACCOUNT_KEY=…; set +a`): `restic init -r sftp:desktop:/srv/restic/holigay` and `restic init -r b2:holigay-backups:/`. (3) `ansible-playbook site.yml --ask-vault-pass --limit pi` installs the units; `systemctl list-timers` shows `holigay-backup.timer`; run one by hand (`./bin/backup.sh`) and confirm `restic snapshots` on both repositories. (4) Uptime Kuma at `http://<desktop>:3001`: create the admin account; Settings → Notifications → SMTP with the relay values from `.env` and your address, "Default enabled"; monitors: HTTP(s) `https://app.<domain>/` (60 s), HTTP(s) keyword `https://app.<domain>/auth/v1/health` (60 s), and **Push** "holigay backup" with heartbeat interval 21600 s (6 h) and retries 0 — copy its push URL (up to and excluding `?`) into the Pi's `.env` as `UPTIME_KUMA_PUSH_URL`; run `backup.sh` once more and see the push monitor turn green. (5) The proof: on the Pi set `RESTIC_PASSWORD` in `.env` to a wrong value, run `./bin/backup.sh` (it fails, no ping), wait for the push monitor's heartbeat to expire (or temporarily set the interval to 300 s), confirm the alert email arrives, restore the password, run `backup.sh`, confirm the recovery email. Needs T020, T021, T022. evidence: the five T023 rows in quickstart.md — FR-024, FR-025, FR-027, SC-005

- [ ] T024 [manual] [US4] The restore drill and the pull-the-plug test. (1) `docs/runbooks/backup-restore.md` §3 on the desktop, end to end, with a stopwatch: from 3.1 to the signed-URL download in 3.4; fill row 4 of the runbook's "Verified behaviour" table with what you observed (ownership, service start order, anything that surprised you) and the drill line under "Rehearsals and drills" in `quickstart.md`; wipe per 3.5 and confirm `/srv/holigay-drill` is gone. This is the DR rehearsal too: if the elapsed time exceeds one hour, the runbook is what needs fixing. (2) `docs/runbooks/disaster-recovery.md` "Before you need it": `restic … snapshots --latest 1` against B2 from the workstation succeeds. (3) Pull the plug: with the stack healthy and the timers active, unplug the Pi's power for 30 seconds during daytime (not event week). Expected: Uptime Kuma emails "down" within two minutes; on power the Pi boots from NVMe, `docker compose ps` shows everything healthy without any command, the "up" email arrives, `docker compose exec db psql -U postgres -d postgres -Atc "select count(*) from public.applications"` matches the count taken before the pull, and `journalctl -b -1 -u docker` shows the previous boot ended without a clean stop (the point of the test). If any service needs a hand to come back, that is a `restart:` or `depends_on` bug in `compose.yml` — fix in T022's files. Needs T023. evidence: the three T024 rows in quickstart.md — FR-026, FR-028, SC-004

**Checkpoint**: two encrypted copies every six hours, an alert that has actually fired, a restore that has actually been done, and a power cut that was actually survived.

---

## Phase 7: User Story 5 — The self-hosted stack becomes the system of record (Priority: P5)

**Goal**: A dated go-live day on which every gate is re-run against the live stack and recorded, after which the self-hosted stack is the truth and the hosted one is only a rollback.

**Independent Test**: On one day, the smoke script, the event-week click-through and a live test submission all pass on `https://app.<domain>`, and `quickstart.md` says so.

- [ ] T025 [manual] [US5] Go-live day. Preconditions: T018, T021, T023, T024 all ticked; no open finding from the organizer UAT that touches submission, review or email. (1) Reset production to admin-only: `docs/runbooks/deploy.md` §6 (down, wipe the data roots, up `db` then `auth rest storage`, `migrate.md`, `up -d`, sign up, `seed-role.sql` → `admin`). Keys unchanged, so no image rebuild. (2) `./bin/backup.sh` by hand — the first real snapshot of the system of record. (3) `docs/runbooks/event-week-smoke.md` end to end on production: `npm run smoke` with organizer credentials and `SMOKE_STORAGE_EXPECT_PRIVATE=1`; the ten-minute click-through with a real mailbox (the test vendor address on your own domain), a 5 MB attachment, both emails from the verified domain; the cleanup SQL through `docker compose exec db psql -U postgres -d postgres` (T026 rewrites that section for `psql`; until then run the same statements — the SQL is unchanged) and the storage object removed from `/srv/holigay/storage/attachments/uploads/` plus its `storage.objects` row. (4) Re-run and re-record on the same day: Cloudflare proxy off → smoke → on; `curl -I` on a signed URL (`private, no-store`, no cache HIT); `systemctl list-timers` on the Pi (backup) and the desktop (deploy); Uptime Kuma all green. (5) Write the date and "system of record" in the T025 rows; tell the organizers the address. The hosted stack stays reachable as a DNS flip for **two weeks** from this date; nothing on it is maintained. evidence: the four T025 rows in quickstart.md — SC-001, SC-002, SC-007

**Checkpoint**: production is the Pi. The calendar note for T026 is two weeks out.

---

## Phase 8: User Story 6 — The hosted platforms are gone and the repository says so (Priority: P6)

**Goal**: After two weeks live with no rollback, delete the hosted projects, remove the code and configuration that existed only for them, retire their secrets, and make the documentation describe the self-hosted stack.

**Independent Test**: `grep -rn 'supabase.co\|VERCEL_ENV\|RESEND_API_KEY\|keepalive' src docs CLAUDE.md README.md .env.example .github package.json` finds only historical spec records; the Vercel and Supabase dashboards show no projects; the docs' first paragraphs are true.

- [ ] T026 [US6] Repository cleanup and documentation — in `vercel.json` (files, interfaces and steps below)

**Files:**
- Delete: `vercel.json`, `src/app/api/keepalive/route.ts` (and the directory), `src/test/keepalive-route.test.ts`, `.github/workflows/keepalive.yml`, `scripts/filter-dump-for-local.mjs`
- Modify: `src/lib/env.ts`, `src/test/env.test.ts`, `.env.example`, `package.json`, `docs/runbooks/event-week-smoke.md`, `docs/ARCHITECTURE.md`, `docs/ROADMAP.md`, `CLAUDE.md`, `README.md`, `docs/DEV-ENVIRONMENT-SETUP.md`, `specs/007-production-readiness/contracts/env-contract.md`, `specs/README.md`

**Interfaces:**
- Produces from `@/lib/env`: `appEnv`, `isProduction`, `smtp`, `emailFromAddress` only (`cronSecret`, `keepaliveTargets`, `KeepaliveTarget` removed). `npm run db:types` = `supabase gen types typescript --local --schema public > src/types/database.ts`; `db:types:dev` and `db:types:local` removed.

- [ ] **Step 1: Delete the keep-alive and the hosted-only tooling**

```bash
git rm vercel.json src/app/api/keepalive/route.ts src/test/keepalive-route.test.ts .github/workflows/keepalive.yml scripts/filter-dump-for-local.mjs
rmdir src/app/api/keepalive 2>/dev/null || true
```

- [ ] **Step 2: Env module, test-first** — in `src/test/env.test.ts` remove `'CRON_SECRET'` and `'KEEPALIVE_SUPABASE_TARGETS'` from `ENV_VARS`, delete the `VALID_KEEPALIVE` constant and the two describe blocks `'@/lib/env cronSecret'` and `'@/lib/env keepaliveTargets'`, and add:

```ts
describe('@/lib/env surface', () => {
  it('no longer exposes the keep-alive values', async () => {
    stubEnv({ CRON_SECRET: 'x'.repeat(16), KEEPALIVE_SUPABASE_TARGETS: 'https://a.example|k' } as never);

    const env = await import('@/lib/env');

    expect('cronSecret' in env).toBe(false);
    expect('keepaliveTargets' in env).toBe(false);
  });
});
```

Run `npx vitest run src/test/env.test.ts` — the new case FAILS. Then in `src/lib/env.ts`: delete `export type KeepaliveTarget`, the `CRON_SECRET` and `KEEPALIVE_SUPABASE_TARGETS` fields of the schema, the whole `parseKeepaliveTargets` function, the `cronSecret` and `keepaliveTargets` exports, and the sentence in the schema comment about them (leave "keeping the shape always-parseable is what makes the aggregated production message deterministic"). Run the test again — PASS. `grep -rn "cronSecret\|keepaliveTargets" src` prints nothing.

- [ ] **Step 3: `.env.example` and `package.json`** — delete the whole `# Keep-alive (Vercel Production only …)` section from `.env.example`. In `package.json` replace the three `db:types*` scripts with one:

```json
    "db:types": "supabase gen types typescript --local --schema public > src/types/database.ts",
```

`npm run db:types` with the local stack up must produce a `src/types/database.ts` with no diff (`git diff --stat src/types/database.ts` empty) — proof that the local schema is the schema.

- [ ] **Step 4: `docs/runbooks/event-week-smoke.md`** — the hosted references: §1's production command becomes

```bash
SMOKE_APP_URL=https://app.<domain> \
SMOKE_SUPABASE_URL=https://app.<domain> \
SMOKE_SUPABASE_ANON_KEY=<prod anon key, deploy/.env ANON_KEY> \
SMOKE_ORGANIZER_EMAIL=<smoke organizer> SMOKE_ORGANIZER_PASSWORD=<pw> \
SMOKE_STORAGE_EXPECT_PRIVATE=1 \
npm run smoke
```

with the note "Both URLs are the same host: the API is path-routed under the app's origin (spec 008)". §1.1's `app-pages` row: replace "The deploy failed, or the production env guard refused the build (`resend.dev` sender, missing key)" with "The `app` container is down or unhealthy (`make status`), or the host is unreachable (`make logs`)". §3.2 becomes:

```markdown
### 3.2 Delete the storage object — the file and its row

Storage is a directory on the production host plus a metadata row. Remove both, using the
`file_path` from 3.1:

```bash
ssh pi 'rm -f /srv/holigay/storage/attachments/<file_path>'
ssh pi 'cd /srv/holigay/app/deploy && docker compose exec db psql -U postgres -d postgres -c "delete from storage.objects where bucket_id = '"'"'attachments'"'"' and name = '"'"'<file_path>'"'"'"'
```
```

§3.3's first comment line becomes `-- On the production host: cd /srv/holigay/app/deploy && docker compose exec db psql -U postgres -d postgres, then paste. Replace both placeholders throughout.` and drop the sentence about the editor rejecting the transaction. §4's table: the `app-pages` row → "The `app` container (`make status`, `make logs`); Caddy's certificate (`docker compose logs caddy`)"; delete the row about a paused free-tier project; add `| Every check fails with a TLS error | Caddy could not renew its certificate — \`docker compose logs caddy\`; \`docs/runbooks/host-setup.md\` §9 |`. "Verified behaviour" row 7 → `| 7 | Storage objects are files under \`/srv/holigay/storage/attachments/\` plus a \`storage.objects\` row; delete both | Nothing is orphaned on a self-hosted file backend, but a row without a file 404s and a file without a row is invisible |`.

- [ ] **Step 5: Architecture, roadmap, CLAUDE.md, README, dev-environment doc, env contract, specs index** — exact replacements:

`docs/ARCHITECTURE.md` §1 bullets:

```markdown
- **Runtime:** Next.js 16 (App Router, RSC) + React 19, TypeScript strict, one container image per environment (`Dockerfile`), deployed by Docker Compose from `deploy/`
- **Hosts:** a Raspberry Pi 5 (production) and a desktop (staging, backup target, DR standby) on the maintainer's LAN, behind Cloudflare-proxied DNS — `specs/008-self-hosted-infrastructure/`
- **Data:** self-hosted Supabase stack — `supabase/postgres` 17 + GoTrue + PostgREST + storage-api, pinned to the local CLI stack's versions
- **Auth:** GoTrue (email/password), cookie sessions via `@supabase/ssr`
- **Email:** plain SMTP via nodemailer (relay: Resend's SMTP endpoint, swappable by config)
- **Files:** storage-api's file backend, single private `attachments` bucket, on the production host's NVMe
- **Testing:** Vitest + Testing Library (unit tests, mocked Supabase) and a security suite against the local stack
```

§6 table: the Email row's "Where" → `src/lib/email/client.ts` behind `sendEmail()` (nodemailer/SMTP), swap cost "Config-only — any SMTP relay"; add a row `| Hosting | \`deploy/\` (Compose, Caddy, scripts, Ansible) | one directory | **None** — the app image runs anywhere Docker does |`. §8: append after the conclusion paragraph:

```markdown
**Update (spec 008, 2026):** the move happened — but as *self-hosting the Supabase software*,
not leaving it. GoTrue, PostgREST and storage-api run in Docker on the maintainer's hardware;
the schema, RLS and RPCs are unchanged; the app code changed only where it named the old
platforms (`APP_ENV` for `VERCEL_ENV`, nodemailer for the Resend SDK). The hosted projects,
Vercel and the keep-alive cron are gone. Design record: `specs/008-self-hosted-infrastructure/research.md`.
```

Delete §8's final "One operational caveat …" paragraph about free-tier pausing and the keep-alive.

`docs/ROADMAP.md`: in "Explicitly not recommended", replace the "Migrating off Supabase / self-hosting" bullet with `- ~~**Migrating off Supabase / self-hosting.**~~ **Done differently by spec 008 (2026):** the Supabase *software* is self-hosted on the maintainer's hardware; nothing was rewritten. The original reasoning (the auth layer is the lock-in, don't rebuild it) held — it is exactly why the stack was kept.`; replace the Tier 4 "Supabase free-tier pause guard" bullet with `- ~~**Supabase free-tier pause guard**~~ — retired with the hosted projects (spec 008 T026).`; in "Current state" change the Deployment row to `| Deployment | Self-hosted (spec 008): Pi 5 production, desktop staging; runbooks in \`docs/runbooks/\` |`.

`CLAUDE.md`: Tech Stack `**Email**` → `nodemailer over SMTP (relay: Resend SMTP endpoint)`; add `- **Hosting**: self-hosted Docker Compose stack in \`deploy/\` — Raspberry Pi 5 (production) + desktop (staging/backups); see \`docs/runbooks/\``; "Email System" first bullet → `\`src/lib/email/client.ts\` - SMTP transport (nodemailer) configuration`; delete the whole "Vercel Production only, never in .env.local" block (the `CRON_SECRET`/`KEEPALIVE_SUPABASE_TARGETS` code block and the paragraph after it) from "Environment Variables"; in the env-module bullet drop `\`cronSecret\`, \`keepaliveTargets\``; Route Structure: delete the `/api/keepalive` line; Runbooks table: add rows for `host-setup.md` (a new host), `deploy.md` (every deploy, rollback), `migrate.md` (every migration), `upgrade-stack.md` (image bumps, secret rotation), `disaster-recovery.md` (a dead host) and change `backup-restore.md`'s description to "the six-hourly restic backup and the quarterly restore drill"; "Development Commands": drop `db:types:dev` and `db:types:local`; add to "Current Development Phase" one sentence: `Spec 008 moved production to self-hosted hardware on <go-live date>; the hosted Supabase projects and Vercel were deleted on <date>.`; Recent Changes: update the 008 bullet to past tense with those dates.

`README.md`: line 15 `**Email**: nodemailer over SMTP`; line 24's comment `# then fill in the Supabase pair (SMTP optional locally)`; add a line under the commands table: `| \`make deploy TAG=…\` | Deploy (or roll back) production — \`docs/runbooks/deploy.md\` |`.

`docs/DEV-ENVIRONMENT-SETUP.md`: replace Part 8 ("Configure Vercel") with a two-line pointer: `## Part 8: Deploy targets — Production and staging are self-hosted; see \`deploy/README.md\` and \`docs/runbooks/host-setup.md\`. GitHub environments \`staging\`/\`production\` hold the two public build variables.`; delete Part 9 (`db:types` is local-only now) and renumber Part 10 → 9, replacing its step 7 `Vercel creates preview deployment automatically` with `Staging on the desktop deploys \`dev\` within five minutes` and step 8's URL wording with `https://staging.<domain>` (basic auth).

`specs/007-production-readiness/contracts/env-contract.md`: delete the `CRON_SECRET` and `KEEPALIVE_SUPABASE_TARGETS` rows and the paragraph "Required for keep-alive …", the keep-alive rows of the deployment table, and rename its columns to `Local | Staging host | Production host`; delete the "Ordering rule for the next promotion" section. Also `specs/007-production-readiness/contracts/keepalive-route.md`: prepend `**Retired by spec 008 T026** — the route, cron and workflow were deleted with the hosted projects.`

`specs/README.md`: the 008 row → `| 008 | Self-hosted infrastructure | ✅ Shipped; live <go-live date>, hosted projects deleted <date> | <PR links> | <date> |`.

- [ ] **Step 6: Gate and commit**

```bash
npm run lint && npm test && npm run build
grep -rn 'supabase\.co\|VERCEL_ENV\|RESEND_API_KEY\|keepalive' src docs CLAUDE.md README.md .env.example .github package.json vercel.json 2>/dev/null
```

Expected: gate green; the grep prints only lines inside `docs/M3-PLAN.md` and `docs/archive/` (historical) — anything else is a miss. Then:

```bash
git add -A
git commit -m "chore(decommission): remove the keep-alive, Vercel config and hosted-only tooling; docs describe the self-hosted stack [008-T026]"
```

- [ ] T027 [manual] [US6] Delete the hosted platforms and retire their secrets. Preconditions: two weeks since T025 with no rollback; T026 merged. (1) Vercel → project → Settings → Advanced → Delete Project. (2) Supabase → each project (dev `kcokcufmzyckbodelqpb`, prod `hgmfjvjlxrhdojwlkgap`) → Settings → General → Delete project (nothing on them is needed: prod was reset before go-live and dev held test data; the last dumps taken by spec 007's runbook can be deleted from `backup/` on the workstation too). (3) Resend → API Keys → create a new sending key, put it in both hosts' `deploy/.env` (`SMTP_PASS`) and the password manager, `docker compose up -d app auth` on each, send one test email, then delete the old key (it was on Vercel and in the migration's shell history). (4) GitHub → Settings → Secrets → delete `KEEPALIVE_DEV_URL`, `KEEPALIVE_DEV_ANON_KEY`, `KEEPALIVE_PROD_URL`, `KEEPALIVE_PROD_ANON_KEY`. (5) `npx supabase unlink` on the workstation; `rm -rf supabase/.temp`. (6) Close spec 008: dates into `specs/README.md` and `CLAUDE.md` (the placeholders T026 left), and the closing line in `quickstart.md`. evidence: the four T027 rows in quickstart.md — FR-032, SC-006

**Checkpoint**: the app runs on hardware the maintainer owns, every runbook has been executed at least once, and nothing in the repository or the accounts refers to a platform that no longer serves it.

---

## Dependencies and execution order

- **T001** first (the task list is the source of truth).
- **Phase 2** (T002, T003, T004) runs in parallel with Phase 3 code; **T012** needs T002–T004 and T008–T011; every Phase 4+ task needs T002.
- **Phase 3**: T005 → T007 → T010; T008 → T009 (one PR); T006 and T011 independent; T012 last.
- **Phase 4**: T013 → T014 and T015 (parallel) → T016 → T017 (needs T010, T012) → T018 (needs T011) → T019.
- **Phase 5**: T020 (needs T013, T014, T015) → T021 (needs T004, T018).
- **Phase 6**: T022 (needs T013, T020) → T023 (needs T021) → T024.
- **Phase 7**: T025 needs T018, T021, T023, T024.
- **Phase 8**: T026 two weeks after T025 → T027.
- The hosted stack and the keep-alive stay alive until **T026/T027**; nothing before them deletes anything hosted.

## Parallel execution examples

- **Phase 2 with Phase 3**: T002, T003 and T004 (accounts, all yours) run while T005–T011 are built; only T012 waits for both.
- **Phase 3**: T005, T006 and T007 touch disjoint files and can be three parallel branches; T008 → T009 is one PR; T010 and T011 are independent of each other and of T006/T007.
- **Phase 4**: T014 and T015 (scripts + runbooks) in parallel once T013's file names exist; the host tasks T016 → T017 → T018 → T019 are sequential by nature.
- **Phase 5 and 6**: T020 (automation) and T022 (backup scripts and runbooks) can be written in parallel; their manual counterparts T021, T023, T024 are sequential.

## Implementation strategy

- **MVP is User Story 1 alone**: after T012 the app runs on the current platform from the same artifact and contract the self-hosted hosts will use, the upload defect is fixed, and nothing self-hosted exists yet. Stop there if the migration is deferred; nothing is lost.
- **Increment 2 is User Story 2**: production on the maintainer's hardware with the old platform one DNS flip away. This is the first point at which the goal is met.
- **Increments 3–4 (US3, US4)** add staging, automation, backups and monitoring; each ends with a rehearsal.
- **US5 and US6** are dated gates, not builds.
- Every repo task ends with the constitution's local gate; every `[manual]` task ends with an evidence row. A task is ticked only when its PR is merged (constitution, Development Workflow §6).

## Task-to-requirement map

| FR | Tasks | FR | Tasks |
|---|---|---|---|
| FR-001 | T005, T007, T010 | FR-017 | T002, T018, T025 |
| FR-002 | T008, T012, T026 | FR-018 | T002, T018, T020 |
| FR-003 | T003, T008, T009, T012 | FR-019 | T013, T018 |
| FR-004 | T005, T012 | FR-020 | T013, T015, T016 |
| FR-005 | T006 | FR-021 | T013, T020, T021 |
| FR-006 | T004, T010, T017 | FR-022 | T014, T020, T021 |
| FR-007 | T011 | FR-023 | T007, T013, T015, T020 |
| FR-008 | T013 | FR-024 | T022, T023 |
| FR-009 | T013, T014 | FR-025 | T022, T023 |
| FR-010 | T013 | FR-026 | T022, T024 |
| FR-011 | T013 | FR-027 | T022, T023 |
| FR-012 | T013 | FR-028 | T013, T024 |
| FR-013 | T013, T015, T017 | FR-029 | T015, T016, T020, T021 |
| FR-014 | T015, T017, T026 | FR-030 | T014, T015, T022, T026 |
| FR-015 | T002, T015, T016, T019 | FR-031 | T015, T016 |
| FR-016 | T013, T018 | FR-032 | T026, T027 |
