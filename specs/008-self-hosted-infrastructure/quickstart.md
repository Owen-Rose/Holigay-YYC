# Quickstart: Self-Hosted Infrastructure

**Feature**: 008-self-hosted-infrastructure

This file is the **ops record** for the migration. Every `[manual]` task in `tasks.md` is
ticked only when its evidence row below is filled in — the same discipline as spec 007's
evidence record and spec 006's "Prod rollout record". Reasoning lives in `research.md`;
procedures in `docs/runbooks/`.

## Local development loop (unchanged by this spec)

```bash
npx supabase start                      # migrations through 012 apply on boot
docker restart supabase_kong_Holigay    # if auth health returns 502 after a reset
npm run lint && npm test && npm run build

# Smoke against the local stack, with and without the storage round-trip (after T011)
ANON=$(npx supabase status -o env | sed -n 's/^ANON_KEY="\(.*\)"/\1/p')
SMOKE_APP_URL=http://localhost:3000 SMOKE_SUPABASE_URL=http://127.0.0.1:54321 \
SMOKE_SUPABASE_ANON_KEY=$ANON npm run smoke
SMOKE_ORGANIZER_EMAIL=<seeded organizer> SMOKE_ORGANIZER_PASSWORD=<pw> \
SMOKE_APP_URL=http://localhost:3000 SMOKE_SUPABASE_URL=http://127.0.0.1:54321 \
SMOKE_SUPABASE_ANON_KEY=$ANON npm run smoke

# The image, built and run against the local stack (after T007)
docker build --build-arg NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321 \
  --build-arg NEXT_PUBLIC_SUPABASE_ANON_KEY="$ANON" -t holigay-app:local .
docker run --rm --network host -e APP_ENV=development holigay-app:local
```

## Operator loop (after Phase 4)

```bash
make deploy TAG=prod-<sha>              # prod, from the workstation over SSH/WireGuard
make deploy TAG=prod-<previous sha>     # rollback is the same command
make tunnel-db                          # then: npx supabase db push --db-url postgresql://postgres:<pw>@127.0.0.1:5432/postgres
make logs                               # docker compose logs on the Pi
SMOKE_APP_URL=https://app.<domain> SMOKE_SUPABASE_URL=https://app.<domain> \
SMOKE_SUPABASE_ANON_KEY=<prod anon> SMOKE_ORGANIZER_EMAIL=… SMOKE_ORGANIZER_PASSWORD=… \
SMOKE_STORAGE_EXPECT_PRIVATE=1 npm run smoke
```

## Evidence record

Fill the rows as the manual tasks complete. "Evidence" means what was actually observed:
the dashboard state, the command output, the timing, or the name of a screenshot kept
outside the repo. Dates are ISO. **Nothing sensitive goes in this file** — no keys, no
passwords, no hashes, no vendor PII, and the real domain only where a hostname is the
evidence itself.

### Phase 2 — accounts, DNS, router

| Task | What | Evidence | Date |
|---|---|---|---|
| T002 | Cloudflare zone active; nameservers changed at the registrar | | |
| T002 | SSL Full (strict); Always Use HTTPS OFF; Bot Fight Mode OFF | | |
| T002 | Cache Rule "bypass storage" on `/storage/v1/` | | |
| T002 | DNS-edit API token created (name only) | | |
| T002 | Router: Pi DHCP reservation; forwards TCP 80, 443 and UDP 51820; UPnP off | | |
| T003 | Resend sending domain *Verified* (domain, date) | | |
| T003 | SMTP key `holigay-smtp` created; sender decided | | |
| T004 | GitHub environments `staging` and `production` exist | | |

### Phase 3 — US1 on Vercel

| Task | What | Evidence | Date |
|---|---|---|---|
| T006 | Secure cookies confirmed in DevTools on `npm run dev` (browser) | | |
| T009 | One real email sent through the relay from `npm run dev` | | |
| T010 | First `build-image` run: skipped cleanly / GHCR package made public | | |
| T012 | Vercel Production variables set (`APP_ENV`, four `SMTP_*`, sender); `RESEND_API_KEY` deleted | | |
| T012 | 5 MB attachment accepted on production; email arrived from the verified domain | | |
| T012 | `npm run smoke` with organizer credentials against production: `all 6 checks passed` | | |

### Phase 4 — US2, the Pi

| Task | What | Evidence | Date |
|---|---|---|---|
| T016 | Pi boots from NVMe; hostname; timezone; OS updated | | |
| T016 | SSH key-only (password auth refused from the workstation); ufw status output | | |
| T016 | Docker + Compose versions; `daemon.json` log rotation in place | | |
| T016 | WireGuard `wg show` on the Pi; handshake from the workstation on the LAN | | |
| T017 | Keys minted; `.env` mode 600; secrets in the password manager | | |
| T017 | `docker compose ps`: db, auth, rest, storage healthy | | |
| T017 | `supabase migration list --db-url` shows 001–012 applied | | |
| T017 | GitHub `production` variables set; first `prod-<sha>` image published | | |
| T017 | Image tags on the Pi equal the local CLI stack's (SC-003) | | |
| T018 | `app.<domain>` record created (proxied); certificate issued (V1: proxied first try / DNS-only fallback) | | |
| T018 | `docker compose ps`: caddy and app healthy; admin account seeded | | |
| T018 | `npm run smoke` with `SMOKE_STORAGE_EXPECT_PRIVATE=1`: `all 6 checks passed` | | |
| T018 | Click-through: sign-up → apply with 5 MB attachment → review → download → status email | | |
| T018 | `curl -I` on a signed URL: `Cache-Control: private, no-store`, no `cf-cache-status: HIT` (V10) | | |
| T018 | Proxy toggled off → smoke green → toggled on (SC-007) | | |
| T018 | Rollback flip to Vercel and back rehearsed (time to serve each way) | | |
| T018 | Image rollback with `make deploy` to the previous tag and forward again (time each way, SC-001) | | |
| T018 | `curl` from inside the app container reaches the local Caddy with a valid cert (V7) | | |
| T018 | ddclient status; one forced update logged | | |
| T019 | WireGuard from outside the LAN (phone hotspot): SSH works; `make deploy` works | | |

### Phase 5 — US3, staging and IaC

| Task | What | Evidence | Date |
|---|---|---|---|
| T021 | Desktop: Debian 13 installed; playbook first run summary (changed=N) | | |
| T021 | Playbook second run: `changed=0` | | |
| T021 | GitHub `staging` variables set; first `staging-<sha>` image published | | |
| T021 | Push to `dev` → staging serving the new commit (minutes elapsed) | | |
| T021 | Basic auth prompt on `staging.<domain>`; every API call works after it (V9) | | |
| T021 | Organizer completed the M3 UAT script on staging | | |

### Phase 6 — US4, backups, monitoring, drills

| Task | What | Evidence | Date |
|---|---|---|---|
| T023 | B2 bucket created; app key scoped to it (names only) | | |
| T023 | `restic init` on the desktop SFTP repository and on B2 | | |
| T023 | `holigay-backup.timer` active; first run's `restic snapshots` on both repositories | | |
| T023 | Uptime Kuma: monitors for `/` and `/auth/v1/health`; push monitor for the backup; email notification tested | | |
| T023 | Deliberately failed backup → alert email received within one cycle | | |
| T024 | Restore drill on the desktop (`holigay-drill`): time from start to green smoke (V3) | | |
| T024 | Drill project wiped; `docker volume ls` / `ls /srv/holigay-drill` empty | | |
| T024 | Pull-the-plug: Pi power-cycled; services back without action; down + recovery alerts; row counts unchanged | | |

### Phase 7 — US5, go-live

| Task | What | Evidence | Date |
|---|---|---|---|
| T025 | Production database reset to admin-only | | |
| T025 | Event-week runbook click-through on the live stack | | |
| T025 | Live test submission: both emails delivered from the verified domain | | |
| T025 | Every Phase 4–6 gate re-run green on the same day | | |

### Phase 8 — US6, decommission

| Task | What | Evidence | Date |
|---|---|---|---|
| T027 | Vercel project deleted | | |
| T027 | Hosted Supabase projects deleted (dev, prod) | | |
| T027 | Resend API key rotated; new key on both hosts only | | |
| T027 | GitHub keep-alive secrets removed | | |

## Verification checks (research.md V1–V10)

| # | Assumption | Recorded under |
|---|---|---|
| V1 | First Let's Encrypt issuance succeeds through the proxy with the redirect off | T018 certificate row |
| V2 | Renewal succeeds proxied (~day 60) | first quarterly drill, appended here |
| V3 | `pg_basebackup` restore starts GoTrue and storage-api clean | T024 drill row |
| V4 | `serverActions.bodySizeLimit` lives under `experimental` in Next 16.0.7 | resolved 2026-09-19 (`node_modules/next/dist/server/config-shared.d.ts:497` inside `ExperimentalConfig`) |
| V5 | GoTrue mailer links resolve under `/auth/v1` | T018 click-through row (trigger a recovery email to a test mailbox) |
| V6 | `secure` cookies keep local development working | T006 row |
| V7 | `extra_hosts … host-gateway` reaches the local Caddy with a valid certificate | T018 container-curl row |
| V8 | The `postgres` role password equals `PGPASSWORD` | T017 migrations row (the first `db push` proves it) |
| V9 | Basic auth scoped to non-API paths lets supabase-js through | T021 basic-auth row |
| V10 | Storage responses carry `private, no-store` and no cache HIT | T018 `curl -I` row |

## Rehearsals and drills

Append one line per drill (restore, pull-the-plug, rollback flip, certificate renewal check):

- (none yet)
