# Contract: `deploy/.env` — the host configuration

**Feature**: 008-self-hosted-infrastructure | **Date**: 2026-09-19
**Implemented by**: `deploy/.env.example` (T013, T020, T022), read by `deploy/compose.yml`, `deploy/compose.staging.yml`, `deploy/caddy/*`, `deploy/bin/*`

One file per host, at `/srv/holigay/app/deploy/.env`, mode `0600`, owned by the operator
user, never committed (`/deploy/.env` is git-ignored), mirrored in the password manager.
Compose interpolates `$` in this file, so a value containing `$` (the bcrypt hash) writes
every `$` as `$$`. The scripts under `deploy/bin/` never source the file; they read single
keys with `sed`, so `$$` never reaches a shell.

## Keys

| Key | Read by | Production | Staging | Secret | Validation / notes |
|---|---|---|---|---|---|
| `APP_ENV` | compose → app container; `deploy.sh` | `production` | `staging` | no | one of the three values; `deploy.sh` matches the tag prefix against it |
| `APP_HOST` | compose (app env, `extra_hosts`), Caddyfile | `app.<domain>` | `staging.<domain>` | no | the one public hostname; the API is path-routed under it |
| `APP_HOST_RESOLVES_TO` | compose `extra_hosts`; staging Caddy `PI_LAN_IP` | `host-gateway` | the production host's LAN IP | no | where the app container sends its own public URL |
| `APP_IMAGE_TAG` | compose `app.image`; rewritten by `deploy.sh` | `prod-<7sha>` | `staging` | no | prefix must match `APP_ENV` |
| `ACME_EMAIL` | Caddyfile global | an address | unused | no | certificate expiry notices |
| `HOLIGAY_DATA` | compose bind mounts; `backup.sh`, `restore.sh` | `/srv/holigay` | `/srv/holigay` | no | root of `db/data`, `db/config`, `storage`, `caddy/` |
| `COMPOSE_FILE` | Compose itself | absent (commented) | `compose.yml:compose.staging.yml` | no | makes plain `docker compose` use the staging overrides |
| `STAGING_HOST` | Caddyfile (production) | `staging.<domain>` | default | no | the staging proxy site block |
| `STAGING_UPSTREAM` | Caddyfile (production) | `<desktop LAN IP>:80` | default `127.0.0.1:9` | no | `:9` (discard) until the desktop exists → 502 |
| `STAGING_BASIC_AUTH_USER` | Caddyfile (production) | `organizer` | default | no | |
| `STAGING_BASIC_AUTH_HASH` | Caddyfile (production) | bcrypt, `$$`-escaped | default | **yes** | `caddy hash-password`; example ships the hash of `changeme` |
| `POSTGRES_PASSWORD` | compose → db (`POSTGRES_PASSWORD`, `PGPASSWORD`), auth, rest, storage, meta, studio; init `roles.sql` | minted | minted | **yes** | hex; the `postgres` superuser and every service role get it |
| `JWT_SECRET` | compose → db (`jwt.sql`), auth, rest, storage, studio | minted | minted (different) | **yes** | ≥ 32 chars; signs `ANON_KEY`/`SERVICE_ROLE_KEY`; rotation = rebuild both artifacts |
| `JWT_EXPIRY` | compose → db, auth, rest | `3600` | `3600` | no | seconds |
| `ANON_KEY` | compose → app (`NEXT_PUBLIC_SUPABASE_ANON_KEY`), storage, studio; GitHub env var of the same value | minted | minted | no (public) | HS256 JWT, `role: anon`; baked into the artifact |
| `SERVICE_ROLE_KEY` | compose → storage (`SERVICE_KEY`), studio | minted | minted | **yes** | HS256 JWT, `role: service_role`; never in the app |
| `PG_META_CRYPTO_KEY` | compose → meta, studio (admin profile) | minted | minted | **yes** | only with `--profile admin` |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` | compose → app, auth (`GOTRUE_SMTP_*`) | relay values | same relay | `SMTP_PASS` **yes** | port `465` = implicit TLS; the app's env contract requires all four in production |
| `SMTP_ADMIN_EMAIL` | compose → auth | the sender address | same | no | |
| `SMTP_SENDER_NAME` | compose → auth | `Holigay Vendor Market` | same | no | |
| `EMAIL_FROM_ADDRESS` | compose → app | `Name <noreply@…>` on the verified domain | same | no | refused if it contains `resend.dev` in production |
| `RESTIC_PASSWORD` | `backup.sh`, `restore.sh`, weekly prune | minted | unused (target host) | **yes** | encrypts both repositories |
| `RESTIC_REPO_ONSITE` | `backup.sh`, `restore.sh` | `sftp:desktop:/srv/restic/holigay` | `/srv/restic/holigay` in a drill | no | `desktop` is the ssh alias the provisioning writes |
| `RESTIC_REPO_OFFSITE` | `backup.sh`, `restore.sh` (`RESTIC_REPO` override) | `b2:<bucket>:/` | unused | no | |
| `B2_ACCOUNT_ID` / `B2_ACCOUNT_KEY` | `backup.sh`, `restore.sh`, prune | the bucket-scoped key | unused | **yes** | |
| `UPTIME_KUMA_PUSH_URL` | `backup.sh` | `http://<desktop LAN IP>:3001/api/push/<token>` | unused | **yes** (token) | base URL without query; empty disables the ping |

## Derived values the app container receives

`NEXT_PUBLIC_SUPABASE_URL=https://${APP_HOST}`, `NEXT_PUBLIC_SUPABASE_ANON_KEY=${ANON_KEY}`,
`APP_ENV`, the four `SMTP_*` values and `EMAIL_FROM_ADDRESS`. The two public values are
also baked into the artifact at build time from the GitHub environment's variables, which
must equal the host's (`docs/runbooks/upgrade-stack.md`, secret rotation).

## Failure behaviour

- A missing key that Compose interpolates renders as empty; `docker compose config` warns.
  Run it after every edit.
- `deploy.sh` exits 2 without a `.env` and 3 on a tag/environment mismatch.
- `backup.sh` exits 2 with an empty `RESTIC_PASSWORD` and never pings the monitor on any
  failure, so the dead-man alert fires.
- The app's own env contract (`specs/007-production-readiness/contracts/env-contract.md`)
  still applies inside the container: with `APP_ENV=production` and any relay value
  missing, the container exits at start with one aggregated message.
