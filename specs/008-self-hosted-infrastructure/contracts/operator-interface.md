# Contract: the operator interface

**Feature**: 008-self-hosted-infrastructure | **Date**: 2026-09-19
**Implemented by**: `Makefile` (T014), `deploy/bin/*` (T013, T014, T022), `deploy/systemd/*` (T020, T022), `deploy/caddy/*` (T013, T020), `scripts/smoke-check.mjs` (T011, T020), `.github/workflows/ci.yml` (T010)

What the maintainer types, what it does, and what it returns. Runbooks under
`docs/runbooks/` explain when; this is the reference.

## Workstation commands (`Makefile`, run from the repo root)

| Command | Does | Notes |
|---|---|---|
| `make deploy TAG=<tag> [HOST=pi]` | `ssh` to the host and run `deploy.sh <tag>` | rollback is the same command with an older tag; exit codes pass through |
| `make tunnel-db [HOST=…]` | forward `localhost:5432` to the host's database | for `supabase db push --db-url …` and GUI clients |
| `make logs [HOST=…]` | follow the stack's logs | |
| `make status [HOST=…]` | `docker compose ps` on the host | |
| `make ssh [HOST=…]` | a shell in the deploy directory | |
| `make build-local TAG=<tag> NEXT_PUBLIC_SUPABASE_URL=… NEXT_PUBLIC_SUPABASE_ANON_KEY=…` | build the artifact here | disaster recovery on the desktop |
| `make help` | list targets | |

`HOST` is an ssh alias: `pi` (LAN), `pi-wg` (over the VPN), `desktop` (LAN, or via `ProxyJump pi-wg`).

## Host scripts (`deploy/bin/`, run from `deploy/` as the operator user)

| Script | Usage | Exit codes | Side effects |
|---|---|---|---|
| `mint-keys.sh` | `./bin/mint-keys.sh >> .env` | 0 | prints `POSTGRES_PASSWORD`, `JWT_SECRET`, `ANON_KEY`, `SERVICE_ROLE_KEY`, `PG_META_CRYPTO_KEY`, `RESTIC_PASSWORD` |
| `deploy.sh [TAG]` | with TAG, rewrites `APP_IMAGE_TAG`; then pulls and restarts `app` only | 0 deployed · 2 no `.env` · 3 tag refused | keeps the previous artifact; prints `docker compose ps app` |
| `backup.sh` | stage under `/srv/backup/latest/`, push to both repositories, `forget` per retention, ping the monitor | 0 ok · 1 a repository failed · 2 no restic password | never pings on failure |
| `restore.sh [snapshot]` | `RESTIC_REPO=<repo>` overrides the source; restores into `HOLIGAY_DATA`, starts `db` then everything | 0 · 3 data directory not empty | prints where the backed-up `.env` is for diffing |

## Scheduled units

| Unit | Host | Schedule | Runs |
|---|---|---|---|
| `holigay-deploy.timer` | staging | every 5 min (2 min after boot) | `deploy.sh` (floating `staging` tag) |
| `holigay-backup.timer` | production | every 6 h at :15 (`Persistent=true`) | `backup.sh` |
| `/etc/cron.weekly/holigay-prune` | both | weekly | keeps the last three artifacts; `restic prune` on both repositories (production) |

## Artifact tags (`ghcr.io/owen-rose/holigay-app`)

| Tag | Built from | Runner / architecture | Baked-in public values |
|---|---|---|---|
| `staging-<7sha>`, `staging` | push to `dev` | amd64 (the desktop) | GitHub environment `staging` |
| `prod-<7sha>`, `prod` | push to `main` | arm64 (the production host) | GitHub environment `production` |

The `build-image` job skips cleanly while an environment's `NEXT_PUBLIC_SUPABASE_URL` /
`NEXT_PUBLIC_SUPABASE_ANON_KEY` variables are unset. Pull requests never build.

## Health-check script (`npm run smoke`) — inputs

| Variable | Required | Effect |
|---|---|---|
| `SMOKE_APP_URL`, `SMOKE_SUPABASE_URL`, `SMOKE_SUPABASE_ANON_KEY` | yes (exit 2 if missing) | as before; on the self-hosted stack the two URLs are equal |
| `SMOKE_ORGANIZER_EMAIL`, `SMOKE_ORGANIZER_PASSWORD` | no | enables check 6, `storage-round-trip`; `SKIP` line otherwise |
| `SMOKE_STORAGE_EXPECT_PRIVATE=1` | no | check 6 also requires `Cache-Control: private, no-store`; set on the self-hosted stack only |
| `SMOKE_BASIC_AUTH=user:password` | no | sent on the two page checks only (staging) |

Exit 0 all passed · 1 at least one failed · 2 usage. The summary line counts the checks run.

## Reverse-proxy routes (both environments)

| Request | Upstream | Prefix stripped | Extra |
|---|---|---|---|
| `/auth/v1/*` | authentication `:9999` | yes | |
| `/rest/v1/*` | data API `:3000` | yes | |
| `/storage/v1/*` | file storage `:5000` | yes | response `Cache-Control: private, no-store` |
| everything else | app `:3000` | — | production: HSTS; staging (on the production host): basic auth on these paths only |
| internal `:8000` | the three API prefixes | yes | unpublished; the admin console's server side |

## Ports that listen on a host

| Host | Interface | Port | Owner |
|---|---|---|---|
| production | all | 80, 443 (tcp), 443 (udp) | reverse proxy |
| production | all | 51820 (udp) | VPN |
| production | loopback | 5432 | database (tunnel only) |
| production | loopback | 3001 | admin console (profile `admin`, tunnel only) |
| staging | all (LAN) | 80 | reverse proxy, plain HTTP, proxied by production |
| staging | all (LAN) | 3001 | uptime monitor UI |
| staging | loopback | 5432 | database (tunnel only) |
| both | LAN + VPN only (firewall) | 22 | shell |
