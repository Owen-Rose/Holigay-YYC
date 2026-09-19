# Research: Self-Hosted Infrastructure

**Feature**: 008-self-hosted-infrastructure | **Date**: 2026-09-19

This is the design record of the 2026-09-19 brainstorm. It holds every decision with its
rationale and the alternatives rejected, the facts the code inventory established, the
findings of an independent critique of the draft design, and the checks the implementation
must run before relying on an assumption. `spec.md` distils it into stories and
requirements; `plan.md` turns it into structure and phases.

Facts cited by `file:line` were verified against the working tree (`dev`, `1f63d9f`) on
2026-09-19.

---

## Facts from the code inventory

- Every Supabase endpoint is reached through `NEXT_PUBLIC_SUPABASE_URL` and
  `NEXT_PUBLIC_SUPABASE_ANON_KEY` (`src/lib/env-public.ts:40-41`). No hosted URL is
  hard-coded in runtime code. **Zero application-code changes are needed to run against a
  self-hosted stack.**
- Auth usage is four methods — `signInWithPassword`, `signUp`, `signOut`, `getUser`
  (`src/lib/actions/auth.ts:41,101,128`; `src/middleware.ts:39`; `src/lib/auth/roles.ts:26`;
  `vendor-dashboard.ts`, `vendors.ts`). No OAuth, magic links, confirmations
  (`supabase/config.toml:203`) or password reset. GoTrue sends no mail today.
- Storage: one private bucket `attachments` (`supabase/migrations/011_…sql:272-274`); one
  `upload()` (`src/lib/actions/upload.ts:120`); a browser-side 60-second `createSignedUrl`
  (`src/app/dashboard/applications/[id]/attachments-list.tsx:109-118`). Both application
  forms upload through the `uploadFile` server action (`apply/client.tsx:47`,
  `apply/_components/dynamic-application-form.tsx:136`).
- Database access is PostgREST via supabase-js (~90 `.from()` calls, four `.rpc()` sites)
  with RLS as the authority; no realtime, edge functions or postgres-meta use.
- Vercel coupling: `vercel.json` (one cron), `VERCEL_ENV` (`src/lib/env.ts:43-54,129`) and
  `/api/keepalive`, which exists only because hosted free-tier projects pause when idle.
  No `@vercel/*` packages, no `VERCEL_URL` reads, no edge-runtime pin; `next.config.ts` is
  empty.
- Resend coupling: `src/lib/email/client.ts` behind `sendEmail()`, three call sites
  (`applications.ts:222,862`, `answers.ts:246`), two env vars.
- Tooling coupling: hosted project refs in `package.json:18-19`; the CLI-linked backup
  runbook; hosted dashboard steps in `docs/runbooks/event-week-smoke.md:211,223`;
  `supabase/.temp` link state; `scripts/filter-dump-for-local.mjs` (exists only because the
  hosted auth schema was ahead of the local one).
- The repository is public, so GitHub's arm64 runners (`ubuntu-24.04-arm`) are free and
  GHCR pulls need no credentials.
- Local CLI stack images on 2026-09-19: `supabase/postgres:17.6.1.063`, `gotrue:v2.196.0`,
  `postgrest:v14.1`, `storage-api:v1.73.1`, `studio:2026.04.08`, `postgres-meta:v0.96.4`.
  Hosted prod (`supabase/.temp`): gotrue v2.196.0, rest v14.5, storage v1.73.1. Reference
  self-hosting Compose (v0.8.x): postgres 17.6.1.136, gotrue v2.196.0, postgrest v14.17,
  storage-api v1.74.0, and its gateway is now Envoy (`api-gw`), no longer Kong.
- `supabase db push --db-url <conn>` and `supabase gen types typescript --local|--db-url`
  work against any Postgres; the history table is created in the target.

## Decisions

### R1. Leave the hosted service, keep the software

**Decision**: Self-host Postgres + GoTrue + PostgREST + storage-api. No application
rewrite.

**Rationale**: The schema, RLS policies and RPCs are plain Postgres; what is
Supabase-specific is the services around it, which are Apache-2.0 and already run in
Docker on every PR (`src/test/security/`). `docs/ARCHITECTURE.md` §8 costs the alternative
(plain Postgres + own auth + query-builder port) at weeks touching ~90 query sites, 11 auth
sites, the signup trigger and every policy — and it means hand-rolling auth, against the
"don't hand-roll" principle.

**Alternatives**: replace Supabase entirely (rejected, above); self-host Postgres and
choose a different auth layer (rejected: RLS keys on `auth.uid()`, and there is no data
access layer to relocate authorization into).

### R2. Six containers; Caddy replaces the reference gateway

**Decision**: Caddy, app, `supabase/postgres`, GoTrue, PostgREST, storage-api. Studio +
postgres-meta as an optional `admin` profile bound to localhost. No realtime, edge
runtime, imgproxy, supavisor, analytics, vector.

**Rationale**: The app calls exactly three services. The reference gateway does prefix
stripping, key checks and CORS; the anon key is public by design and each service
validates JWTs itself, so three Caddy `handle_path` blocks replace it, and the operator
can name and explain every container. The `supabase/postgres` image is kept because it
ships the roles (`anon`, `authenticated`, `service_role`, `authenticator`,
`supabase_auth_admin`, `supabase_storage_admin`), the `auth`/`storage`/`extensions`
schemas and `auth.uid()`, all of which the migrations depend on.

**Alternatives**: the reference Compose verbatim (eleven containers, ~3 GB idle, an Envoy
config nobody here wrote — rejected as disproportionate); a PaaS layer such as Coolify or
Dokploy (2023–24 vintage, fast-moving, hides the Compose file behind a UI — rejected as
neither boring nor understood).

### R3. Single origin per environment

**Decision**: `app.<domain>` serves the UI and, via Caddy path routing, `/auth/v1`,
`/rest/v1` and `/storage/v1`. `NEXT_PUBLIC_SUPABASE_URL` is the app's own URL. Staging is
`staging.<domain>` likewise.

**Rationale**: The critique found that storage-api emits no CORS headers at all (its
source comments that the gateway handles CORS). The browser-side signed-URL call from the
dashboard would fail at preflight on a separate API origin unless Caddy hand-answered
`OPTIONS` with a header list kept in sync with supabase-js. Same-origin removes the class.
It also means one certificate and one DNS record per environment, and staging's basic
auth can be scoped to non-API paths. Next.js has no routes under those prefixes (route
groups do not appear in URLs). The smoke script's two URL variables are simply equal.

**Alternatives**: `app.` + `api.` hosts with a Caddy CORS block on `/storage/v1/*`
(mirrors every Supabase document and the local stack; rejected as a maintained header
list with opaque failure modes). This reversed a batch-1 decision and was re-approved.

### R4. Classic JWT keys, not the publishable/secret key scheme

**Decision**: HS256 JWT-format `anon` and `service_role` keys minted from one
`JWT_SECRET` (a `mint-keys.sh` helper).

**Rationale**: The newer `sb_publishable_…`/`sb_secret_…` scheme depends on the reference
gateway translating keys; PostgREST and storage-api validate the classic JWTs directly.
The app and the security harness (`src/test/security/harness.ts:30-33`) already assume
JWT keys.

### R5. Version pinning rule

**Decision**: Staging and production run the exact image tags the local `supabase start`
stack runs (read from `docker images` after a start). Upgrades: bump the CLI, bump the
pins, staging first, smoke, then prod, per `docs/runbooks/upgrade-stack.md`.

**Rationale**: Local, staging and prod then share one auth/storage schema generation. The
hosted-ahead-of-local skew that broke restores (`docs/runbooks/backup-restore.md`,
verified-behaviour row 12) cannot recur, and `scripts/filter-dump-for-local.mjs` becomes
unnecessary.

### R6. Pi 5 is production; the desktop is staging, backup target and DR standby

**Decision**: As stated.

**Rationale**: The Pi is silent, draws ~5 W, boots from NVMe, has 8 GB (the trimmed stack
needs ~1.5 GB) and is a fixed-purpose appliance. The desktop runs the identical stack as
staging (replacing Vercel previews), holds the on-site backup copy, and is where restore
drills and the disaster-recovery rehearsal happen. Desktop OS: fresh Debian 13, same
family as Raspberry Pi OS, so one playbook covers both.

**Alternatives**: desktop as prod (more headroom, native x86, ~$5/month electricity,
noisier — reasonable, not chosen); everything on the Pi (loses the second host that makes
IaC and DR real).

### R7. Ingress: port-forward, Caddy TLS, Cloudflare-proxied DNS, ddclient

**Decision**: Router forwards 80/443 and the WireGuard UDP port to the Pi. Caddy issues
Let's Encrypt certificates via HTTP-01, owns the HTTP→HTTPS redirect, sets HSTS, limits
bodies to 20 MB, trusts Cloudflare's published ranges as proxies, and overrides
`Cache-Control` to `private, no-store` on `/storage/v1/*`. DNS on Cloudflare (free),
records proxied, SSL Full (strict), **Always Use HTTPS off**, a cache-bypass rule for
`/storage/v1/*`, Bot Fight Mode off. `ddclient` (Debian package, Cloudflare protocol,
scoped token) keeps the record current. The `app` container gets
`extra_hosts: app.<domain>:host-gateway`.

**Rationale**: Public IPv4 and router control make the textbook layout available; it
teaches firewall, TLS and DNS. Cloudflare hides the home IP and absorbs noise but is
deliberately not load-bearing — proxy off must change nothing, and this is tested. The
critique supplied four specifics: (a) with Cloudflare's redirect on, the *first* HTTP-01
challenge is redirected to an origin with no certificate yet, so Caddy owns the redirect;
DNS-only for first issuance is the fallback; (b) Cloudflare edge-caches images and PDFs by
extension and storage-api emits `max-age=3600`, so a 60-second signed URL would stay
fetchable for an hour without the header override and bypass rule; (c) without
`trusted_proxies` Caddy discards forwarded IPs and GoTrue's per-IP sign-in limit
(`config.toml:184`) becomes one shared bucket for everyone; (d) the Next.js server calls
its own public URL, which without `extra_hosts` loops through the router (needs NAT
loopback with the proxy off) and pushes every upload over the uplink twice.

**Alternatives**: Cloudflare Tunnel (no open ports, no DDNS, but Cloudflare becomes
load-bearing and less is learned); registrar DNS with no Cloudflare (home IP public;
DDNS depends on the registrar's API); DNS-01 via a custom Caddy build (not boring).

### R8. One image per environment, built natively

**Decision**: `staging-<sha>`/`staging` from `dev` on `ubuntu-latest` (amd64, desktop);
`prod-<sha>`/`prod` from `main` on `ubuntu-24.04-arm` (arm64, Pi). A `build-image` job
in `ci.yml` with `needs: [lint-test-build, security-tests]`, push events only. The
public URL and anon key are GitHub Environment *variables*.

**Rationale**: `NEXT_PUBLIC_*` values are inlined at `next build`
(`src/lib/env-public.ts:22-30` documents the literal reads), so an image is bound to an
environment. Next traces `sharp` into the standalone output, so a cross-built image would
carry the wrong architecture's binary; native builds avoid the question. Consequence: the
DR drill on the desktop builds the prod image locally from the tagged commit
(`make build-local TAG=…`, ~3 minutes), rehearsed in story 4.

**Alternatives**: multi-arch manifests from two native runners merged with `imagetools`
(standard but more YAML for no current need); runtime injection of public config (a
pattern the env module was deliberately written against).

### R9. Delivery: CI builds, staging pulls on a timer, prod deploys by hand

**Decision**: `deploy/bin/deploy.sh` on each host pulls the tag in the host's `.env`,
refuses a tag whose prefix does not match the host's `APP_ENV`, restarts the app and keeps
the previous image (weekly prune keeps three). Staging: systemd timer every five minutes.
Prod: `make deploy TAG=prod-<sha>` over SSH, then `npm run smoke`. Rollback is the same
command with the previous tag.

**Rationale**: Choosing *when* production changes is a feature for a seasonal events app;
the staging timer preserves the cheap "push a branch, organizers click a link" loop.

**Alternatives**: fully automatic prod (less control in event week); Watchtower (one more
tool doing what a timer does).

### R10. Email: nodemailer over SMTP; `APP_ENV` replaces `VERCEL_ENV`

**Decision**: `src/lib/email/client.ts` uses nodemailer; env is `SMTP_HOST/PORT/USER/PASS`
+ `EMAIL_FROM_ADDRESS`. Relay: Resend's SMTP endpoint (`smtp.resend.com:465`, user
`resend`, password = API key) on the free tier; the same credentials feed GoTrue
(`GOTRUE_SMTP_*`, `GOTRUE_SMTP_ADMIN_EMAIL`). Production strictness keys on
`APP_ENV=production`; `resend.dev` senders are still refused. `CRON_SECRET` and
`KEEPALIVE_SUPABASE_TARGETS` leave the contract with the keep-alive route.

**Rationale**: Sending from a residential IP is a known trap (port 25 blocked, no
reputation, no reverse DNS); for a few hundred transactional emails a season a relay is
the boring answer, and plain SMTP keeps the provider a configuration choice. The change is
platform-neutral, so it ships to Vercel first with `APP_ENV=production` set before the
merge, and strictness never lapses. The Resend sending domain is **not yet verified**
(M3 checklist) and becomes a prerequisite.

**Alternatives**: keep the Resend SDK (lock-in for no gain); Amazon SES (documented
fallback, config-only switch); Postfix on a VPS (highest effort-to-value in the migration).

### R11. Migrations and types

**Decision**: Unchanged files in `supabase/migrations/`, applied with
`supabase db push --db-url postgresql://postgres:<pw>@127.0.0.1:5432/postgres` over an SSH
tunnel (`make tunnel-db`). `npm run db:types` targets `--local`; the hosted-ref scripts
go. Bring-up order: `db`, then `storage` and `auth` (each runs its own migrations),
then the app migrations — `011` inserts into `storage.buckets` and `003` triggers on
`auth.users`.

### R12. Backups: physical base backup, restic to two repositories, six-hourly

**Decision**: `pg_basebackup` (tar, gzip, WAL streamed) as `supabase_admin` inside the
`db` container — no downtime — plus a logical `pg_dump -Fc` for inspection, the storage
directory, the `db-config` directory and the host `.env`, into `/srv/backup/latest/`;
restic to SFTP on the desktop and to Backblaze B2, encrypted client-side; every six hours;
retention 14 daily / 8 weekly / 12 monthly. The job pings an Uptime Kuma push monitor.
Restore (`restore.sh`): same pinned images, untar the base backup into an empty data
directory, restore `db-config` and storage, start `db`, then `auth`, `storage`, `rest`,
`app`. Drills run as an isolated Compose project on the desktop and are wiped.

**Rationale**: The draft proposed a whole-cluster `pg_dump` restored with
`pg_restore --clean` into an initialised image. The critique showed Supabase's own
guidance and maintainers recommend restoring the data volume instead — the image's
extensions, Vault triggers and ownership make `--clean` restores fail. `pg_basebackup` is
the boring, built-in way to get that volume consistently without stopping Postgres. The
`db-config` directory holds the pgsodium/Vault root key; the reference keeps it in a
named volume and losing it on recreate silently rotates the key. Six hours because an
application window losing a day of submissions is the scenario to avoid.

**Fallback**: the current runbook's method — migrations applied fresh, then the logical
dump's data restored with `session_replication_role = replica`.

### R13. Monitoring: Uptime Kuma and nothing else

**Decision**: Uptime Kuma on the desktop checks `app.<domain>/` and
`/auth/v1/health`, hosts the backup push monitor, and alerts by email through the relay.
Compose: `restart: unless-stopped`, health checks, log rotation. No Prometheus, Grafana,
central logging, WAF or rate-limit plugins.

### R14. Host provisioning: manual first, then Ansible

**Decision**: The Pi is set up by hand from `docs/runbooks/host-setup.md`; the playbook
under `deploy/ansible/` (roles `base`, `docker`, `wireguard`, `ddclient`, `restic`,
`holigay`) is written from it and proven by provisioning the desktop alone; a second run
must report no changes.

**Rationale**: Two hosts plus a rebuild-from-scratch DR story is where IaC genuinely
applies; Ansible is agentless, 2012-vintage, and the playbook doubles as documentation.
A shell script loses on idempotence.

### R15. Remote administration: WireGuard on the Pi

**Decision**: In-kernel WireGuard, one UDP port forwarded, keys managed by the operator.
SSH is never exposed. **Alternative**: Tailscale (easier, but another account and daemon
that becomes load-bearing for admin access).

### R16. Secrets

**Decision**: One mode-600 `/srv/holigay/.env` per host, mirrored in the password manager;
`deploy/.env.example` documents every key. `JWT_SECRET` and the Postgres password are
generated on the Pi in story 2 and never shared with the hosted stack. Rotating
`JWT_SECRET` re-mints the anon key baked into both images — rebuild, redeploy, every
session signed out — so it is runbooked in `upgrade-stack.md`, not routine. Decommission
rotates only hosted-era secrets (the Resend API key). `sops`/age is the upgrade path if
secrets ever need to live in git.

### R17. Data and cutover

**Decision**: Fresh stack, no data migration; the real hostname moves to the Pi at the end
of story 2 (the prod image bakes in the public URL and Let's Encrypt needs public DNS);
Vercel and the hosted projects stay intact as a DNS-flip rollback until story 6; story 5
is a dated go-live gate, not a DNS change.

**Rationale**: Hosted production has never been live and holds only an admin account
(confirmed 2026-09-18); nothing is at stake in pointing the hostname early, and the
rollback is rehearsed.

### R18. Live defect: 1 MB server-action body limit

**Finding**: Next's default server-action body limit is 1 MB
(`node_modules/next/dist/server/app-render/action-handler.js:527-536`), `next.config.ts`
does not raise it, and both forms send the attachment as FormData through the `uploadFile`
server action while validation allows 10 MB (`src/lib/validations/application.ts`). So
attachments over 1 MB fail with HTTP 413 on Vercel today.

**Decision**: `serverActions.bodySizeLimit: '11mb'` in `next.config.ts`, with a test, in
story 1.

### R19. Cookie `Secure` flag

**Finding**: `@supabase/ssr` 0.8 sets `path`, `sameSite`, `httpOnly`, `maxAge` and never
`secure` (`node_modules/@supabase/ssr/dist/main/utils/constants.js:4-10`).

**Decision**: Pass `cookieOptions: { secure: true }` in the server and browser client
factories and the middleware, verified locally first (browsers treat `http://localhost` as
a secure context).

## Checks the implementation must run before relying on an assumption

| # | Assumption | How it is checked | Where recorded |
|---|---|---|---|
| V1 | First Let's Encrypt issuance succeeds through the Cloudflare proxy with the redirect off | Story 2 bring-up; fallback is DNS-only for first issuance | `quickstart.md` |
| V2 | Certificate renewal succeeds proxied | First quarterly drill (~day 60) | `quickstart.md` |
| V3 | `pg_basebackup` restore into the pinned image starts GoTrue and storage-api clean | Story 4 drill | `research.md` R12 + `quickstart.md` |
| V4 | `serverActions.bodySizeLimit` is a top-level or `experimental` key in Next 16.0.7 | Story 1, read the installed type definitions | `plan.md` |
| V5 | GoTrue mailer links resolve under `/auth/v1` with `API_EXTERNAL_URL` + `GOTRUE_MAILER_URLPATHS_*` | Story 2, trigger a recovery email to a test mailbox | `quickstart.md` |
| V6 | `secure` cookies keep local development working | Story 1, manual login on `npm run dev` | `plan.md` |
| V7 | `extra_hosts … host-gateway` reaches the local Caddy with a valid certificate for the public name | Story 2, `curl` from inside the `app` container | `quickstart.md` |
| V8 | The `postgres` role password equals `PGPASSWORD` in the `supabase/postgres` image | Story 2, first `db push --db-url` | `quickstart.md` |
| V9 | Basic auth scoped to non-API paths lets every supabase-js call through on staging | Story 3, organizer UAT | `quickstart.md` |
| V10 | Storage responses carry `Cache-Control: private, no-store` and no Cloudflare cache HIT | Story 2, `curl -I` on a signed URL | `quickstart.md` |

## Cost of the result

Domain (already owned) · Cloudflare free · Backblaze B2 ≈ $0 at this data size · Resend
SMTP free tier · electricity ≈ $0.50/month (Pi) + ≈ $5/month (desktop) · optional one-time
UPS ≈ $100 and RTC battery ≈ $5.
