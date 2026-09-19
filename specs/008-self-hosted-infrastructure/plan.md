# Implementation Plan: Self-Hosted Infrastructure

**Branch**: `008-self-hosted-infrastructure` | **Date**: 2026-09-19 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/008-self-hosted-infrastructure/spec.md` (clarifications recorded in its Session 2026-09-19 block); design record `research.md` (R1–R19, checks V1–V10)

## Summary

Move the app off Vercel, the two hosted Supabase projects and the Resend SDK onto hardware
the maintainer owns, without rewriting the application. The six stories reduce to:

1. **Platform-neutral repo changes, shipped to Vercel first** (US1) — a multi-stage
   `Dockerfile` with Next.js standalone output; `experimental.serverActions.bodySizeLimit`
   (fixes the live >1 MB upload 413); `Secure` session cookies; `APP_ENV` replacing
   `VERCEL_ENV`; nodemailer over SMTP replacing the Resend SDK; Node 22; a `build-image`
   CI job publishing one image per environment to GHCR; an optional authenticated storage
   round-trip in the smoke script.
2. **The `deploy/` directory** (US2–US4) — one Compose file for the six-container stack
   (Caddy, app, `supabase/postgres`, GoTrue, PostgREST, storage-api; Studio + postgres-meta
   as an `admin` profile), a Caddyfile serving UI and API from one origin, the db init SQL,
   `mint-keys.sh` / `deploy.sh` / `backup.sh` / `restore.sh`, systemd units, a staging
   override, a monitoring Compose file for Uptime Kuma, and an Ansible playbook written
   after the manual Pi bring-up and proven on the desktop.
3. **Runbooks** (US2–US6) — `host-setup.md`, `deploy.md` (with rollback), `migrate.md`,
   `upgrade-stack.md` (pinning rule and secret rotation), `disaster-recovery.md`, a
   rewritten `backup-restore.md`, and `event-week-smoke.md` updated for `psql` and the new
   hosts. Every `[manual]` task records its evidence in `quickstart.md`.
4. **Gates and decommission** (US5, US6) — a dated go-live day re-running every gate, then
   deletion of the hosted projects and of the code that existed only for them.

Zero application logic changes: every Supabase endpoint is reached through
`NEXT_PUBLIC_SUPABASE_URL` and the schema, RLS and RPCs are unchanged. The hosted stack is
the DNS-flip rollback from the moment the real hostname moves to the Pi (end of US2) until
US6. Reasoning record: `research.md`. Terminology: the spec's *artifact* is the container image built by the `Dockerfile`; its *health-check script* is `npm run smoke` (`scripts/smoke-check.mjs`); its *edge proxy* is Cloudflare.

## Technical Context

**Language/Version**: TypeScript 5.x, `strict: true` (unchanged); plain-ESM Node for `scripts/smoke-check.mjs`; POSIX shell (`bash`, shellcheck-clean) for `deploy/bin/*`; YAML for Compose, GitHub Actions and Ansible; Caddyfile; Markdown runbooks
**Primary Dependencies**: Next.js 16.0.7 (App Router; `output: 'standalone'`, `experimental.serverActions.bodySizeLimit`), React 19, `@supabase/ssr` ^0.8 (`cookieOptions`), `zod` ^4 (env schema), **`nodemailer` (new runtime dep) + `@types/nodemailer` (new dev dep)**, `resend` removed in US6; Supabase CLI 2.65.6 (`db push --db-url`, `gen types --local`); Docker Engine + Compose v2 on both hosts; Caddy 2 (official image, pinned); `supabase/postgres` 17.6.1.063, `gotrue` v2.196.0, `postgrest` v14.1, `storage-api` v1.73.1 (the local CLI stack's tags — research R5); restic (Debian package); WireGuard (`wireguard-tools`); `ddclient` (Debian package); Uptime Kuma 2.x (container, desktop only); Ansible ≥ 2.16 with `community.docker`, `community.general`, `ansible.posix`
**Storage**: Postgres 17 on the Pi's NVMe under `/srv/holigay/db/data`; storage-api `file` backend under `/srv/holigay/storage`; `db-config` (pgsodium key) under `/srv/holigay/db/config`; backups in `/srv/backup/latest/` then restic → SFTP on the desktop + Backblaze B2
**Testing**: Vitest unit project — `next.config` test, env schema tests rewritten for `APP_ENV`/SMTP, email client tests re-mocked on nodemailer, a Supabase-client cookie-options test; the `security` project is untouched. Infra files are verified by `docker compose config`, `caddy validate`, `shellcheck`, `ansible-playbook --syntax-check`, a local `docker build` + run against `supabase start`, and `npm run smoke` against every environment
**Target Platform**: Raspberry Pi 5 (8 GB, NVMe, Raspberry Pi OS Lite 64-bit, arm64) = production; desktop (Debian 13, amd64) = staging + backup target + DR standby; workstation unchanged; GitHub Actions (`ubuntu-latest`, `ubuntu-24.04-arm`); GHCR (public repo); Cloudflare DNS (free, proxied)
**Project Type**: Single Next.js web application + `deploy/` infrastructure directory + runbooks
**Performance Goals**: deploy or rollback < 5 min (SC-001); smoke < 60 s unchanged; restore to green smoke < 1 h (SC-004); staging picks up a `dev` push < 5 min; backup RPO ≤ 6 h (SC-005)
**Constraints**: no application rewrite; every image pinned; local == staging == prod Supabase component versions; single origin per environment; Cloudflare optional (proxy off must pass); SSH never internet-exposed; only Caddy publishes on `0.0.0.0`; secrets only in `/srv/holigay/.env` (mode 600) and the password manager; `<domain>` stays a placeholder in committed files; no Claude co-authoring trailers
**Scale/Scope**: ~8 source/test files edited, 1 Dockerfile, ~20 files under `deploy/`, 1 CI job, 6 runbooks (5 new, 1 rewritten) + 1 updated, ~9 docs touched; 27 tasks, 13 of them `[manual]`

## Constitution Check

*GATE: evaluated pre-Phase 0 and re-checked post-design — PASS (no violations to justify).*

| Principle | Check | Status |
|---|---|---|
| I — Zod before DB | `src/lib/env.ts` stays a Zod schema parsed at import; the only shape change is `VERCEL_ENV → APP_ENV` and `RESEND_API_KEY → SMTP_*`. No server action's validation order changes | PASS |
| I — `requireRole()` on mutations | No new server action. `uploadFile` is untouched apart from the framework body limit that already governs it | PASS |
| I — `{success, error, data}` responses | `EmailResult` shape unchanged; `sendEmail()` signature unchanged | PASS |
| I — RLS on user-data tables / append-only migrations | **No migration.** `supabase/migrations/` is applied unchanged to the new Postgres; no policy edits | PASS |
| I — CI gates | `format:check → lint → test → build` unchanged; `security-tests` unchanged; the new `build-image` job runs after both and only on pushes | PASS |
| I — No `any`, no dead code | The dead "check your email" copy on the signup page is removed with the email change; the keep-alive route is removed only when its purpose (hosted pausing) ends in US6 | PASS |
| I — New env vars documented with their introduction | `APP_ENV`, `SMTP_HOST/PORT/USER/PASS`, `SMOKE_ORGANIZER_EMAIL/PASSWORD`, `SMOKE_STORAGE_EXPECT_PRIVATE` land in `.env.example`, `CLAUDE.md`, `docs/DEV-ENVIRONMENT-SETUP.md` and `specs/007-…/contracts/env-contract.md` in the PRs that introduce them; every `deploy/.env` key is documented in `deploy/.env.example` | PASS |
| II — Tests with every changed action / module | Test-first for `next.config`, `env.ts`, `email/client.ts`, the Supabase client factories; the smoke script's new check is verified by running it against local, then the Pi | PASS |
| III — UI consistency | One dead sentence removed from `/signup`; no styling | PASS |
| IV — RSC / performance | No client-component conversions; `revalidatePath` calls untouched; `extra_hosts` removes a network round trip from every server-side query | PASS |
| Stack lock-in | One new runtime dependency (`nodemailer`, 2010-vintage, SMTP-standard) replacing a vendor SDK; nothing else added to the app | PASS |

## Project Structure

### Documentation (this feature)

```text
specs/008-self-hosted-infrastructure/
├── spec.md              # stories US1–US6, FR-001–FR-032, SC-001–SC-009
├── plan.md              # This file
├── research.md          # R1–R19 decisions, inventory facts, checks V1–V10
├── checklists/requirements.md   # spec quality checklist (passed 2026-09-19, second pass)
├── contracts/deploy-env.md      # every key of deploy/.env: who reads it, per environment, secret or not
├── contracts/operator-interface.md  # make targets, scripts, units, tags, smoke inputs, routes, ports
├── quickstart.md        # the ops/evidence record for every [manual] task (created with tasks.md)
└── tasks.md             # T001–T027
```

### Source code and infrastructure (repository root)

```text
Dockerfile                                # T007 — multi-stage, standalone, non-root, HEALTHCHECK
.dockerignore                             # T007
Makefile                                  # T014 — deploy, rollback, tunnel-db, smoke, build-local, ssh
next.config.ts                            # T005 — output: 'standalone', experimental.serverActions.bodySizeLimit
package.json                              # T009 (+nodemailer, −resend in US6), T026 (db:types scripts)
.github/workflows/ci.yml                  # T010 — Node 22; build-image job
scripts/smoke-check.mjs                   # T011 — optional authenticated storage round-trip
src/lib/env.ts                            # T008 — APP_ENV, SMTP_*; keep-alive vars removed in T026
src/lib/email/client.ts                   # T009 — nodemailer transport
src/lib/supabase/{server,client}.ts       # T006 — cookieOptions: { secure: true }
src/middleware.ts                         # T006
src/app/(auth)/signup/page.tsx            # T009 — dead confirmation copy removed
src/test/{next-config,env,email-client,supabase-clients,keepalive-route,middleware}.test.ts

deploy/
├── README.md                             # T013 — what lives here and how the pieces fit
├── compose.yml                           # T013 — caddy, app, db, auth, rest, storage (+ admin profile: studio, meta)
├── compose.staging.yml                   # T020 — plain-HTTP Caddy, staging app tag
├── Caddyfile                             # T013 — one origin: /auth/v1, /rest/v1, /storage/v1, catch-all app; staging proxy; internal :8000
├── .env.example                          # T013 — every key, documented
├── db/init/roles.sql                     # T013 — from the reference stack
├── db/init/jwt.sql                       # T013 — app.settings.jwt_secret / jwt_exp
├── db/pg_hba.conf                        # T022 — the image's file + one loopback replication line for pg_basebackup
├── bin/mint-keys.sh                      # T013 — JWT_SECRET + anon/service_role JWTs + passwords
├── bin/deploy.sh                         # T014 — pull tag from .env, refuse mismatched prefix, up -d app
├── bin/backup.sh                         # T022 — pg_basebackup + pg_dump + dirs → restic ×2 → push monitor
├── bin/restore.sh                        # T022 — snapshot → data dir + config + storage → up
├── systemd/holigay-deploy.{service,timer}   # T020 — staging auto-deploy every 5 min
├── systemd/holigay-backup.{service,timer}   # T022 — every 6 h
├── monitoring/compose.yml                # T022 — Uptime Kuma (desktop)
└── ansible/
    ├── README.md, ansible.cfg, requirements.yml, inventory.example.ini, vault.example.yml, site.yml   # T020
    ├── group_vars/all.yml, host_vars/{pi,desktop}.yml                                # T020 (public values only)
    └── roles/{base,docker,wireguard,ddclient,restic,holigay}/                     # T020

docs/runbooks/
├── host-setup.md                         # T015 — the manual Pi bring-up (the playbook is written from this)
├── deploy.md                             # T014 — deploy, rollback, DNS flip back to Vercel, database reset
├── migrate.md                            # T015 — db push over the tunnel, staging first
├── upgrade-stack.md                      # T014 — pinning rule, upgrade order, secret rotation
├── disaster-recovery.md                  # T022 — rebuild a host, restore, repoint
├── backup-restore.md                     # T022 — rewritten for restic / pg_basebackup
└── event-week-smoke.md                   # T026 — hosts, psql, filesystem cleanup
```

**Structure Decision**: infrastructure lives in one top-level `deploy/` directory (Compose,
Caddyfile, scripts, units, Ansible) so a host checkout is `git clone` + `cp .env.example
.env`; the application tree is untouched except for the files listed. Runbooks stay under
`docs/runbooks/` per spec 007's convention.

## Phases (mirror `tasks.md`)

| Phase | Story | Tasks | Ends when |
|---|---|---|---|
| 1 | setup | T001 | `quickstart.md` exists; docs-only PR open |
| 2 | prerequisites | T002–T004 [manual] | Cloudflare zone + settings + token; router forwards; Resend domain verified; GitHub environments |
| 3 | US1 | T005–T012 | image builds and runs locally; CI publishes images; Vercel prod on `APP_ENV=production` uploads a 5 MB attachment |
| 4 | US2 | T013–T019 | `npm run smoke` (with the storage round-trip) green on `app.<domain>` served by the Pi; rollback flip rehearsed; WireGuard works from outside |
| 5 | US3 | T020–T021 | desktop provisioned by the playbook alone (second run: 0 changes); staging auto-deploys; organizer completes the UAT script |
| 6 | US4 | T022–T024 | backups land in two repositories every 6 h; a broken backup alerts; restore drill passes smoke; pull-the-plug test passes |
| 7 | US5 | T025 | go-live day evidence recorded |
| 8 | US6 | T026–T027 | hosted projects deleted; dead code gone; docs describe the self-hosted stack |

## Complexity Tracking

No constitution violations to justify. The one deliberate deviation from the Supabase
self-hosting reference — Caddy instead of the Envoy gateway, a single origin, and the
trimmed service list — is recorded with its reasoning in `research.md` R2 and R3.
