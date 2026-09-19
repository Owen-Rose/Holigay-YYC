# Feature Specification: Self-Hosted Infrastructure

**Feature Branch**: `008-self-hosted-infrastructure`
**Created**: 2026-09-19
**Status**: Draft — design approved in the 2026-09-19 brainstorm; `plan.md`/`tasks.md` pending
**Input**: User description: "Move off as many of the infrastructure-as-a-service platforms this app runs on as I reasonably can — Vercel, Resend, Supabase — and self-host that functionality on hardware I already have: a Raspberry Pi and some PCs I can repurpose. Two reasons: I want to learn how to do it, and I don't want to be beholden to subscription models for features I can program or configure myself. Boring over new. Proportionate, not over-engineered. Standards without theatre. Don't hand-roll everything. It's the infrastructure layer I want to take over, not the application stack."

## Context

The app runs on Vercel (Next.js hosting), two hosted Supabase projects (Postgres, auth,
file storage) and Resend (transactional email). The maintainer owns a Raspberry Pi 5 (8 GB,
NVMe) and a desktop PC that can run around the clock, has a public IPv4 address with
control of the home router, owns a domain with DNS at the registrar, and is prepared to
keep GitHub, the registrar and a free Cloudflare account. The app is a small single-tenant
CRUD tool: under a hundred users, two or three organizers, seasonal traffic.

`docs/ROADMAP.md` marks self-hosting "not recommended". That verdict was value-for-effort
on a free tool, not feasibility. `docs/ARCHITECTURE.md` §8 records that the whole schema —
tables, triggers, row-level security, `SECURITY DEFINER` RPCs — is plain Postgres and
portable. What is Supabase-specific is the *services around* Postgres (GoTrue, PostgREST,
storage-api), all Apache-2.0, and the security test suite already runs against exactly
that stack in Docker on every PR. The decision that shapes everything else is therefore to
leave **Supabase-the-hosted-service** and keep **Supabase-the-software**: every line of
application code and every RLS policy stays valid, and the work is infrastructure and
tooling, not an application rewrite.

The design record — every decision with its rationale, the alternatives rejected, the
findings of the code inventory and of an independent critique, and the checks the
implementation must run before relying on an assumption — is `research.md`. This spec
distils it into testable stories and requirements. Phases are ordered so that each ends
with something demonstrably working and the hosted stack remains a rollback target (a DNS
flip) until the final phase.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - The app is deployable anywhere, and the change ships to Vercel first (Priority: P1)

The application builds into a container image that runs identically on the Pi, the
desktop and the maintainer's workstation. Its environment contract no longer mentions the
hosting platform. Email leaves over plain SMTP so the relay is a configuration choice.
Every change in this story is platform-neutral and is merged and deployed to Vercel
*before* any self-hosted host exists, so production strictness never lapses. A live defect
found during the design review — attachments over 1 MB are rejected by the server-action
body limit on Vercel today — is fixed here.

**Why this priority**: Everything later deploys this image and reads this contract. Shipping
it to the current platform first proves the changes are neutral and de-risks the cutover.

**Independent Test**: Build the image on the workstation, run it against the local
`supabase start` stack, sign in as a seeded organizer and complete an application review;
merge to `main` with `APP_ENV=production` set on Vercel and confirm the production deploy
still builds and a 5 MB attachment uploads through the public form.

**Acceptance Scenarios**:

1. **Given** the repository at `main`, **When** `docker build` runs, **Then** it produces an
   image that serves the app on port 3000 as a non-root user and reports healthy.
2. **Given** the image and a running local stack, **When** the container is started with
   only the documented environment variables, **Then** login, application submission with
   an attachment, review and status change all work.
3. **Given** a production deployment (`APP_ENV=production`) missing any SMTP variable or
   the sender address, or using a `resend.dev` sender, **When** it builds, **Then** the
   build fails with one aggregated message naming every problem (the existing behaviour,
   keyed on `APP_ENV` instead of `VERCEL_ENV`).
4. **Given** the public form on Vercel, **When** a vendor attaches a 5 MB file, **Then** the
   upload succeeds (today it fails with HTTP 413).
5. **Given** a push to `dev` or `main` whose lint, test, build and security jobs pass,
   **When** CI completes, **Then** an image tagged for that environment and commit exists in
   the GitHub container registry; pull requests never publish images.
6. **Given** the smoke script with organizer credentials supplied, **When** it runs,
   **Then** it uploads an attachment, obtains a signed URL, downloads it and asserts the
   response is marked non-cacheable; without credentials it behaves exactly as today.

---

### User Story 2 - Production runs on the Pi, on the real hostnames, with a rehearsed way back (Priority: P2)

The Pi is set up by hand from a runbook written for someone who has not read the code:
hardened operating system, Docker, the six-container stack, the app migrations, the first
admin, WireGuard for remote administration. The production hostname moves to the Pi
behind Cloudflare, the same smoke test and manual click-through that gate the hosted
environment pass, and moving the hostname back to Vercel is rehearsed once.

**Why this priority**: This is the migration. Doing it manually first is a deliberate
learning step; the automation in story 3 is written from this runbook.

**Independent Test**: From a freshly imaged Pi, follow `docs/runbooks/host-setup.md` to a
green `npm run smoke` on the real hostname, then complete sign-up → apply with a 5 MB
attachment → review → download → status email end to end; toggle the Cloudflare proxy off
and on with no change in behaviour; flip DNS back to Vercel and forward again.

**Acceptance Scenarios**:

1. **Given** a Pi booted from NVMe and the runbook, **When** every step is followed,
   **Then** the stack is up with only Caddy reachable from the LAN, Postgres and Studio bound
   to localhost, SSH key-only, and the firewall in the documented state.
2. **Given** the stack, **When** `supabase db push --db-url …` runs through the SSH tunnel,
   **Then** all migrations apply in order and `supabase migration list` shows them.
3. **Given** the real hostname pointing at the Pi through Cloudflare, **When** the smoke
   script runs, **Then** every check passes, including the storage round-trip.
4. **Given** a signed attachment URL, **When** fetched, **Then** the response carries
   `Cache-Control: private, no-store` and is not served from the Cloudflare cache.
5. **Given** the Cloudflare proxy is switched off for the record, **When** the smoke script
   runs again, **Then** it still passes (the dependency is optional).
6. **Given** the maintainer is away from home, **When** they connect over WireGuard,
   **Then** they can SSH to the Pi and run a deploy.
7. **Given** the runbook's rollback section, **When** DNS is pointed back at Vercel,
   **Then** the hosted stack serves within the DNS TTL, and pointing it forward again
   restores the Pi.

---

### User Story 3 - Staging on the desktop, provisioned by code, deployed automatically (Priority: P3)

The manual runbook becomes an Ansible playbook, proven by provisioning the desktop from it
alone. The desktop runs the identical stack as staging, reached through the Pi behind
organizer-only basic authentication, and picks up every push to `dev` within minutes —
replacing Vercel preview deployments for organizer acceptance testing and closing the
"preview links are public" gap recorded in spec 007.

**Why this priority**: A second host is what makes infrastructure-as-code and the
disaster-recovery story real; staging is what the organizers need for the next event's
acceptance testing.

**Independent Test**: Run the playbook against a fresh Debian 13 desktop and confirm the
staging stack serves at the staging hostname behind basic auth; run the playbook a second
time and confirm it reports no changes; push to `dev` and confirm the new build is live on
staging within five minutes; have an organizer complete the M3 acceptance script.

**Acceptance Scenarios**:

1. **Given** a fresh Debian 13 install reachable by SSH, **When** the playbook runs,
   **Then** the host is hardened, Docker is installed, the staging stack is up and the
   restic SFTP target exists — with no manual step outside the playbook.
2. **Given** a provisioned host, **When** the playbook runs again, **Then** it reports zero
   changes.
3. **Given** the staging hostname, **When** an organizer opens it, **Then** they are asked
   for the shared credentials once, and every API call from the page then works (basic
   auth never applies to the API paths).
4. **Given** a push to `dev` with green CI, **When** five minutes pass, **Then** staging
   serves the new commit.
5. **Given** the desktop is powered off, **When** the staging hostname is opened, **Then** a
   clear gateway error is returned and production is unaffected.

---

### User Story 4 - Backups exist, alert when they fail, and have been restored (Priority: P4)

Every six hours the Pi takes a consistent physical backup of the database, the uploaded
files and its configuration, encrypts it, and stores it in two places: the desktop and an
off-site object-storage bucket. A missed backup raises an email. The maintainer restores a
backup onto the desktop, in isolation, and the restored stack passes the smoke test. A
power-cycle of the Pi is rehearsed and the monitoring proves it noticed.

**Why this priority**: The hosted platform had no automatic backups either, but it had
someone else's operations team. This story is what makes "rock solid" true.

**Independent Test**: Break a backup on purpose (wrong repository password) and confirm an
alert email arrives within one cycle; restore the latest snapshot onto the desktop as an
isolated Compose project and run the smoke script against it; pull the Pi's power, confirm
the down alert and the recovery, and confirm the database is intact.

**Acceptance Scenarios**:

1. **Given** the backup timer, **When** it fires, **Then** a database base backup, the
   storage directory and the host configuration are captured without stopping any service
   and pushed to both repositories, and the monitoring push endpoint is pinged.
2. **Given** a repository that is unreachable, **When** the backup runs, **Then** the other
   repository still receives the snapshot and the failure is reported.
3. **Given** a deliberately failing backup, **When** one cycle passes, **Then** an email
   alert arrives.
4. **Given** the latest snapshot and the restore runbook, **When** the drill runs on the
   desktop, **Then** the isolated restored stack passes the smoke script within one hour and
   is wiped afterwards, leaving no production data on the staging host.
5. **Given** the Pi loses power, **When** it returns, **Then** every service comes back
   without manual action, the down and recovery alerts were sent, and the database is
   consistent.

---

### User Story 5 - The self-hosted stack becomes the system of record (Priority: P5)

With stories 1–4 proven, the maintainer resets production to hold nothing but the admin
account, walks the event-week runbook on the live stack, makes one live test submission
end to end, and declares the self-hosted stack the system of record. The hosted stack stays
available as a rollback for two more weeks.

**Why this priority**: The gate is deliberately a separate, dated event so that "it works"
is a recorded verification rather than an accumulation.

**Independent Test**: On one day, re-run every gate from stories 2–4 and the event-week
runbook against the live hostname; record the evidence in `quickstart.md`.

**Acceptance Scenarios**:

1. **Given** the go-live day, **When** the smoke script and the event-week click-through
   run, **Then** both pass and the evidence is recorded.
2. **Given** a live test submission with an attachment, **When** an organizer reviews it
   and changes its status, **Then** the vendor's mailbox receives both emails from the
   verified domain.

---

### User Story 6 - The hosted platforms are gone and the repository says so (Priority: P6)

Two weeks after go-live with no rollback, the Vercel project and both hosted Supabase
projects are deleted, the code and configuration that existed only for them are removed,
the documentation describes the self-hosted stack, and the hosted-era secrets are retired.

**Why this priority**: Leaving dead platforms and dead code around is how the next
maintainer gets confused; the roadmap and architecture documents must describe reality.

**Independent Test**: Search the source and documentation for the hosted platform's
domains, the old environment variables and the keep-alive route; only historical spec
records remain. The hosted dashboards show no projects.

**Acceptance Scenarios**:

1. **Given** the decommission tasks are done, **When** the repository is searched for
   `supabase.co`, `VERCEL_ENV`, `RESEND_API_KEY` and the keep-alive route, **Then** only
   historical spec documents match.
2. **Given** `CLAUDE.md`, `docs/ARCHITECTURE.md` and `docs/ROADMAP.md`, **When** read,
   **Then** they describe the self-hosted stack, its runbooks and its pinning rule, and the
   roadmap's "not recommended" entry is updated to record what was done and why.
3. **Given** the Resend API key used during the migration, **When** decommission
   completes, **Then** it has been rotated and the new one is only on the two hosts and in
   the password manager.

---

### Edge Cases

- The ISP changes the home IP during an application window: dynamic DNS updates the
  record within its five-minute cycle; Cloudflare's proxy masks the change from clients.
- Power is lost while Postgres is writing: the database is on NVMe with default durability
  settings and recovers on restart; the last backup is at most six hours old.
- The Pi's clock is wrong after a power cut: token validation may fail until NTP syncs;
  chrony is on and an RTC battery is recommended.
- The desktop is off: staging returns a gateway error; production, backups to the
  off-site repository and monitoring of production from elsewhere are unaffected, but the
  on-site backup copy and the uptime checks hosted on the desktop are paused.
- A production deploy is attempted with a staging-tagged image (or vice versa): the deploy
  script refuses a tag whose environment prefix does not match the host.
- The first certificate issuance behind the Cloudflare proxy fails: the runbook's fallback
  sets the record to DNS-only for the first issuance, then re-enables the proxy.
- The JWT signing secret must be rotated: the anon key baked into both images changes, so
  rotation is a rebuild, a redeploy and every user signed out — runbooked, never routine.
- A restore drill must not leave vendor data on the staging host: the drill runs as a
  separate Compose project the Pi does not route to, and is wiped at the end.
- Cloudflare's proxy is turned off: everything must keep working; this is tested.

## Requirements *(mandatory)*

### Functional Requirements

**Application and image**

- **FR-001**: The application MUST build into a container image from a multi-stage
  `Dockerfile` using Next.js standalone output, running as a non-root user with a health
  check, on Node 22 LTS.
- **FR-002**: Production strictness MUST key on `APP_ENV` (`development | staging |
  production`); `VERCEL_ENV`, `CRON_SECRET` and `KEEPALIVE_SUPABASE_TARGETS` MUST be
  removed from the contract. The env contract document, `.env.example`, `CLAUDE.md` and the
  env tests MUST be updated in the same change.
- **FR-003**: Email MUST be sent over SMTP via nodemailer with `SMTP_HOST`, `SMTP_PORT`,
  `SMTP_USER`, `SMTP_PASS` and `EMAIL_FROM_ADDRESS`; `sendEmail()`'s signature, the
  best-effort warning behaviour and the log-only mode without configuration MUST be
  preserved; a `resend.dev` sender MUST still be refused in production.
- **FR-004**: The server-action body size limit MUST be raised to at least the maximum
  attachment size plus form overhead (11 MB), with a test.
- **FR-005**: Session cookies MUST carry the `Secure` flag, verified to keep local
  development working.
- **FR-006**: CI MUST publish one image per environment — `staging-<sha>` from `dev`,
  `prod-<sha>` from `main` — built natively for the target architecture, only after the
  existing lint, test, build and security jobs pass, and never for pull requests.
- **FR-007**: The smoke script MUST gain an optional authenticated storage round-trip
  (upload, signed URL, download, non-cacheable assertion) enabled by organizer
  credentials, and MUST behave as today without them.

**Stack**

- **FR-008**: Production MUST run six containers on the Pi: Caddy, the app, the
  `supabase/postgres` image, GoTrue, PostgREST and storage-api; Studio and postgres-meta
  MUST be an optional profile bound to localhost only.
- **FR-009**: Every image MUST be pinned to an explicit tag, and the Supabase component
  tags MUST match those the local `supabase start` stack runs (the pinning rule); upgrades
  MUST follow `docs/runbooks/upgrade-stack.md`, staging first.
- **FR-010**: The stack MUST use classic JWT-format `anon` and `service_role` keys minted
  from a single `JWT_SECRET` generated on the Pi and never shared with the hosted stack.
- **FR-011**: The API MUST be served from the application's own origin: Caddy routes
  `/auth/v1`, `/rest/v1` and `/storage/v1` to the services before the app, and
  `NEXT_PUBLIC_SUPABASE_URL` is the app's own URL. No CORS configuration is required.
- **FR-012**: GoTrue, PostgREST and storage-api MUST be configured for parity with
  `supabase/config.toml` (auto-confirm on, signup open, minimum password length 6, schemas
  `public,graphql_public`, extra search path `public,extensions`, max rows 1000, 50 MiB
  file limit, file storage backend on a bind mount), with the mailer URL paths, admin
  email and JWT issuer set explicitly; the `db` service MUST set `PGPASSWORD`.
- **FR-013**: Bring-up MUST start `db`, then `storage` and `auth`, and only then apply the
  app migrations; the runbook MUST state why.
- **FR-014**: App migrations MUST be applied unchanged with `supabase db push --db-url`
  over an SSH tunnel; type generation MUST target the local stack; the hosted project
  references MUST be removed from `package.json`.

**Ingress**

- **FR-015**: The router MUST forward only 80/443 (TCP) and the WireGuard port (UDP) to the
  Pi; SSH MUST never be reachable from the internet; UPnP MUST be disabled.
- **FR-016**: Caddy MUST terminate TLS with Let's Encrypt, own the HTTP→HTTPS redirect, set
  HSTS, limit request bodies to 20 MB, trust only Cloudflare's published ranges for
  forwarded client IPs, and override `Cache-Control` to `private, no-store` on storage
  responses.
- **FR-017**: DNS MUST be hosted on Cloudflare with proxied records, SSL mode Full
  (strict), "Always Use HTTPS" off, a cache-bypass rule for `/storage/v1/*`, and Bot Fight
  Mode off; the stack MUST work with the proxy disabled.
- **FR-018**: A dynamic-DNS client (`ddclient`, Cloudflare protocol, scoped token) MUST keep
  the record current.
- **FR-019**: The app container MUST resolve its own public hostname to the Docker host so
  server-side calls never leave the machine.
- **FR-020**: Only Caddy MAY publish ports on all interfaces; Postgres and Studio MUST bind
  to localhost; every other service MUST be unpublished. The host runbook MUST record that
  Docker bypasses the host firewall.
- **FR-021**: Staging MUST be reached through the Pi's Caddy behind basic authentication
  scoped to non-API paths, over plain HTTP on the LAN.

**Delivery**

- **FR-022**: One deploy script per host MUST pull and restart the app from the tag in the
  host's `.env`, refuse a tag whose prefix does not match the host's `APP_ENV`, and keep the
  previous image for rollback; staging MUST run it on a five-minute timer; production MUST
  run it only through `make deploy TAG=…` over SSH.
- **FR-023**: Secrets MUST live in one mode-600 `.env` per host with a copy in the password
  manager; `deploy/.env.example` MUST document every key; no secret MAY be committed.

**Backups, recovery and monitoring**

- **FR-024**: Every six hours the Pi MUST capture a `pg_basebackup` (self-contained, no
  downtime), a logical `pg_dump` for inspection, the storage directory, the `db-config`
  directory and the host `.env`, and push them with restic to an SFTP repository on the
  desktop and a Backblaze B2 repository, encrypted client-side, with retention of 14
  daily, 8 weekly and 12 monthly snapshots.
- **FR-025**: The backup job MUST report completion to a monitoring push endpoint; a
  missed report MUST alert by email within one cycle.
- **FR-026**: `deploy/bin/restore.sh` MUST rebuild a working stack from a snapshot by
  restoring the data directory, `db-config` and the storage directory into the same pinned
  images; the drill MUST run as an isolated Compose project on the desktop and be wiped
  afterwards; the method and its fallback MUST be recorded in `research.md` with the drill
  result as evidence.
- **FR-027**: Uptime Kuma on the desktop MUST check the production root and the auth
  health endpoint and host the backup push monitor, alerting by email through the relay.
- **FR-028**: Compose services MUST use `restart: unless-stopped`, health checks and log
  rotation.

**Provisioning and documentation**

- **FR-029**: The Pi MUST be set up manually once from `docs/runbooks/host-setup.md`; an
  Ansible playbook under `deploy/ansible/` MUST then reproduce it, be proven by
  provisioning the desktop alone, and be idempotent (a second run reports no changes).
- **FR-030**: Runbooks MUST exist for host setup, deploy and rollback, migrations, stack
  upgrades (including secret rotation), disaster recovery and backup/restore, each written
  for someone who has not read the code; the event-week smoke runbook MUST be updated for
  the new hosts and for `psql` instead of the hosted SQL editor.
- **FR-031**: The Pi MUST boot from NVMe with Docker's data root on it, run `unattended-
  upgrades` for the OS and chrony for time; the runbook MUST recommend an RTC battery and a
  UPS.

**Decommission**

- **FR-032**: After two weeks live with no rollback, the Vercel project and both hosted
  Supabase projects MUST be deleted; `vercel.json`, the keep-alive route and its test and
  workflow, the Resend dependency, `supabase/.temp` link state and the hosted-dump filter
  script MUST be removed; `CLAUDE.md`, `docs/ARCHITECTURE.md`, `docs/ROADMAP.md` and
  `specs/README.md` MUST describe the self-hosted stack.

### Key Entities

- **Host**: a machine running the stack — the Pi (production) or the desktop (staging,
  backup target, disaster-recovery standby). Each has one `.env`, one Compose project and
  one deploy script.
- **Image**: an environment-specific build of the app, tagged `staging-<sha>` or
  `prod-<sha>`, with the public Supabase URL and anon key baked in.
- **Snapshot**: one backup run — base backup, logical dump, storage files, configuration —
  stored in two restic repositories.
- **Runbook**: a procedure under `docs/runbooks/` executable by someone who has not read
  the code.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: One command deploys production and one command rolls it back, each in under
  five minutes.
- **SC-002**: `npm run smoke` and the event-week click-through pass on the self-hosted
  stack exactly as written for the hosted one.
- **SC-003**: Local, staging and production run identical pinned versions of Postgres,
  GoTrue, PostgREST and storage-api.
- **SC-004**: A restore onto a freshly provisioned host reaches a green smoke test in under
  one hour, and has been rehearsed at least once before go-live.
- **SC-005**: Recovery point is at most six hours; a missed backup alerts within one cycle.
- **SC-006**: Recurring cost is the domain, free Cloudflare, Backblaze B2 at this size
  (≈ $0), the email relay's free tier and roughly $6/month of electricity; no per-feature
  subscriptions remain.
- **SC-007**: With the Cloudflare proxy disabled, every check still passes.
- **SC-008**: Every host-setup step is reproducible from the playbook with no undocumented
  manual action; a second run reports zero changes.
- **SC-009**: Attachments up to 10 MB upload successfully (they fail above 1 MB today).

## Assumptions

- Hardware: Raspberry Pi 5, 8 GB, NVMe boot; one desktop able to run 24/7, reinstalled with
  Debian 13. Both on the same LAN behind a router the maintainer controls, with a public
  IPv4 address (no CGNAT).
- Budget: small fixed costs are acceptable (domain, object storage at cents, an optional
  UPS); the objection is to per-feature subscriptions and lock-in.
- Kept services: GitHub (repository and Actions), the domain registrar, Cloudflare's free
  tier. Vercel is dropped entirely, including preview deployments.
- Email relay: Resend's SMTP endpoint on its free tier; the sending domain is **not yet
  verified** and doing so is a prerequisite. Amazon SES is the fallback; switching is
  configuration only. No self-hosted outbound mail server.
- Data: no migration. Hosted production has never been live and holds only an admin
  account; the hosted dev project holds test data. The self-hosted stack starts empty with
  the migrations applied and the admin seeded.
- Timeline: none; learning pace. Each phase is understood before the next.
- Operator: the maintainer alone. Runbooks are written accordingly.
- The domain name is kept as a `<domain>` placeholder in committed files and substituted
  on the hosts.
- Out of scope, recorded deliberately: organizer invites (now possible with a server-side
  service-role key, but a separate spec), a password-reset flow (GoTrue is configured for
  it; the app has no such screen), self-hosted git/CI or mail, high availability,
  Kubernetes, point-in-time recovery.
