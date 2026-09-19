# Feature Specification: Self-Hosted Infrastructure

**Feature Branch**: `008-self-hosted-infrastructure`
**Created**: 2026-09-19
**Status**: Draft
**Input**: User description: "Move off as many of the infrastructure-as-a-service platforms this app runs on as I reasonably can — Vercel, Resend, Supabase — and self-host that functionality on hardware I already have: a Raspberry Pi and some PCs I can repurpose. Two reasons: I want to learn how to do it, and I don't want to be beholden to subscription models for features I can program or configure myself. Boring over new. Proportionate, not over-engineered. Standards without theatre. Don't hand-roll everything. It's the infrastructure layer I want to take over, not the application stack."

## Context

The app runs today on a hosting platform (Vercel), two hosted database-and-auth projects
(Supabase) and a transactional email service (Resend). The maintainer owns a small
single-board computer (8 GB, solid-state storage) and a desktop PC that can run around the
clock, has a public IPv4 address with control of the home router, owns a domain with DNS at
the registrar, and is prepared to keep the code host, the registrar and a free edge-proxy
account. The app is a small single-tenant CRUD tool: under a hundred users, two or three
organizers, seasonal traffic.

`docs/ROADMAP.md` marks self-hosting "not recommended". That verdict was value-for-effort
on a free tool, not feasibility. `docs/ARCHITECTURE.md` §8 records that the whole schema —
tables, triggers, row-level security, the transactional procedures — is standard SQL and
portable. What is specific to the hosted service is the set of services around the
database (authentication, the data API, file storage), all open source, and the security
test suite already runs against exactly that set locally on every PR. The decision that
shapes everything else is therefore to leave **the hosted service** and keep **its
software**: every line of application code and every access policy stays valid, and the
work is infrastructure and tooling, not an application rewrite.

The design record — every decision with its rationale, the alternatives rejected, the
findings of the code inventory and of an independent critique, and the checks the
implementation must run before relying on an assumption — is `research.md`. This spec
distils it into testable stories and requirements. Phases are ordered so that each ends
with something demonstrably working and the hosted stack remains a rollback target (a DNS
flip) until the final phase.

## Clarifications

### Session 2026-09-19

- Q: Leave the hosted database/auth/storage service, or replace its software entirely? → A: Self-host the same open-source components; no application rewrite.
- Q: Self-host outbound email too? → A: No. The app sends over the standard mail-submission protocol to a rented relay; the provider is swappable by configuration.
- Q: Budget stance? → A: Small fixed costs are fine (domain, cents of object storage, an optional UPS); no per-feature subscriptions.
- Q: Which surrounding services stay? → A: The code host with its CI, the domain registrar, and a free edge-proxy account. The hosting platform is dropped entirely, previews included.
- Q: Which machine is production? → A: The single-board computer. The desktop is staging, the on-site backup target and the disaster-recovery standby.
- Q: How does traffic reach the production host? → A: The router forwards the web ports; the host terminates TLS itself; DNS is on the edge proxy with records proxied, and the proxy must not be load-bearing.
- Q: How are deploys triggered? → A: CI builds on every push; staging pulls automatically; production is one explicit operator command.
- Q: Where do off-site backups go? → A: An object-storage bucket, encrypted before leaving the house; an on-site copy on the desktop.
- Q: Remote administration? → A: A VPN terminating on the production host; administrative shell access is never internet-exposed.
- Q: Infrastructure as code? → A: The production host is set up by hand once from a runbook; provisioning automation is then written from that runbook and proven by provisioning the desktop from it alone.
- Q: Timeline? → A: None; learning pace. The hosted stack stays as rollback until the self-hosted one passes the same gates.
- Q: Data at cutover? → A: Fresh stack, no data migration (hosted production never went live and holds only an admin account).
- Q: Which self-hosting shape? → A: The minimal set of services the app uses, behind one reverse proxy, instead of the reference stack's eleven services or a PaaS layer.
- Q: One origin or two? → A: The data API is served under the application's own origin, path-routed, so no cross-origin configuration exists (the file-storage service emits no cross-origin headers on its own).
- Q: The real domain name in committed files? → A: Kept as a `<domain>` placeholder; substituted on the hosts.
- Q: Desktop operating system? → A: A fresh server install of the same OS family as the single-board computer, so one automation covers both.
- Q: Is the email sending domain verified with the relay? → A: Not yet; it becomes a prerequisite.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - The app is deployable anywhere, and the change ships to the current platform first (Priority: P1)

The application builds into a self-contained server artifact that runs identically on the
production host, the desktop and the maintainer's workstation. Its environment contract no
longer mentions the hosting platform. Email leaves over the standard mail-submission
protocol so the relay is a configuration choice. Every change in this story is
platform-neutral and is merged and deployed to the *current* platform before any
self-hosted host exists, so production strictness never lapses. A live defect found during
the design review — attachments over 1 MB are rejected by the server's request-size limit
today — is fixed here.

**Why this priority**: Everything later deploys this artifact and reads this contract.
Shipping it to the current platform first proves the changes are neutral and de-risks the
cutover.

**Independent Test**: Build the artifact on the workstation, run it against the local
development stack, sign in as a seeded organizer and complete an application review; merge
to `main` with the production environment setting in place on the current platform and
confirm the production deploy still builds and a 5 MB attachment uploads through the public
form.

**Acceptance Scenarios**:

1. **Given** the repository at `main`, **When** the artifact is built, **Then** it serves the
   app on its configured port as a non-root process and reports healthy.
2. **Given** the artifact and a running local stack, **When** it is started with only the
   documented environment variables, **Then** login, application submission with an
   attachment, review and status change all work.
3. **Given** a production deployment missing any mail-relay value or the sender address, or
   using the relay's test sender domain, **When** it builds, **Then** the build fails with
   one aggregated message naming every problem (the existing behaviour, keyed on the new
   environment setting instead of the platform's variable).
4. **Given** the public form on the current platform, **When** a vendor attaches a 5 MB
   file, **Then** the upload succeeds (today it fails with HTTP 413).
5. **Given** a push to `dev` or `main` whose lint, test, build and security jobs pass,
   **When** CI completes, **Then** an artifact tagged for that environment and commit
   exists in the code host's registry; pull requests never publish artifacts.
6. **Given** the health-check script with organizer credentials supplied, **When** it runs,
   **Then** it uploads an attachment, obtains an expiring link, downloads it and asserts
   the response is marked non-cacheable; without credentials it behaves exactly as today.

---

### User Story 2 - Production runs on the maintainer's hardware, on the real hostname, with a rehearsed way back (Priority: P2)

The production host is set up by hand from a runbook written for someone who has not read
the code: hardened operating system, container runtime, the service stack, the app
migrations, the first admin, a VPN for remote administration. The production hostname
moves to the new host behind the edge proxy, the same health check and manual
click-through that gate the hosted environment pass, and moving the hostname back to the
old platform is rehearsed once.

**Why this priority**: This is the migration. Doing it manually first is a deliberate
learning step; the automation in story 3 is written from this runbook.

**Independent Test**: From a freshly imaged host, follow the host-setup runbook to a green
health check on the real hostname, then complete sign-up → apply with a 5 MB attachment →
review → download → status email end to end; toggle the edge proxy off and on with no
change in behaviour; flip DNS back to the old platform and forward again.

**Acceptance Scenarios**:

1. **Given** a host booted from its solid-state drive and the runbook, **When** every step
   is followed, **Then** the stack is up with only the reverse proxy reachable from the
   LAN, the database and admin console bound to the local interface, shell access by key
   only, and the firewall in the documented state.
2. **Given** the stack, **When** the migrations tool runs through the encrypted tunnel,
   **Then** all migrations apply in order and the tool's history lists them.
3. **Given** the real hostname pointing at the host through the edge proxy, **When** the
   health-check script runs, **Then** every check passes, including the storage round-trip.
4. **Given** an expiring attachment link, **When** fetched, **Then** the response is marked
   non-cacheable and is not served from the edge cache.
5. **Given** the edge proxy is switched off for the record, **When** the health check runs
   again, **Then** it still passes (the dependency is optional).
6. **Given** the maintainer is away from home, **When** they connect over the VPN, **Then**
   they can reach the host's shell and run a deploy.
7. **Given** the runbook's rollback section, **When** DNS is pointed back at the old
   platform, **Then** the hosted stack serves within the DNS TTL, and pointing it forward
   again restores the new host.

---

### User Story 3 - Staging on the desktop, provisioned by code, deployed automatically (Priority: P3)

The manual runbook becomes provisioning automation, proven by provisioning the desktop
from it alone. The desktop runs the identical stack as staging, reached through the
production host behind organizer-only basic authentication, and picks up every push to
`dev` within minutes — replacing the old platform's preview deployments for organizer
acceptance testing and closing the "preview links are public" gap recorded in spec 007.

**Why this priority**: A second host is what makes infrastructure-as-code and the
disaster-recovery story real; staging is what the organizers need for the next event's
acceptance testing.

**Independent Test**: Run the automation against a fresh desktop install and confirm the
staging stack serves at the staging hostname behind basic auth; run it a second time and
confirm it reports no changes; push to `dev` and confirm the new build is live on staging
within five minutes; have an organizer complete the M3 acceptance script.

**Acceptance Scenarios**:

1. **Given** a fresh server install reachable by shell, **When** the automation runs,
   **Then** the host is hardened, the container runtime is installed, the staging stack is
   up and the on-site backup target exists — with no manual step outside the automation
   except placing the secrets file.
2. **Given** a provisioned host, **When** the automation runs again, **Then** it reports
   zero changes.
3. **Given** the staging hostname, **When** an organizer opens it, **Then** they are asked
   for the shared credentials once, and every API call from the page then works (basic
   auth never applies to the API paths).
4. **Given** a push to `dev` with green CI, **When** five minutes pass, **Then** staging
   serves the new commit.
5. **Given** the desktop is powered off, **When** the staging hostname is opened, **Then** a
   clear gateway error is returned and production is unaffected.

---

### User Story 4 - Backups exist, alert when they fail, and have been restored (Priority: P4)

Every six hours the production host takes a consistent backup of the database, the
uploaded files and its configuration, encrypts it, and stores it in two places: the
desktop and an off-site object store. A missed backup raises an email. The maintainer
restores a backup onto the desktop, in isolation, and the restored stack is verified. A
power-cycle of the production host is rehearsed and the monitoring proves it noticed.

**Why this priority**: The hosted platform had no automatic backups either, but it had
someone else's operations team. This story is what makes "rock solid" true.

**Independent Test**: Break a backup on purpose (wrong repository password) and confirm an
alert email arrives within one cycle; restore the latest snapshot onto the desktop as an
isolated stack and verify rows, files, sign-in and one expiring download; pull the
production host's power, confirm the down alert and the recovery, and confirm the database
is intact.

**Acceptance Scenarios**:

1. **Given** the backup schedule, **When** it fires, **Then** a consistent database backup,
   the file storage directory and the host configuration are captured without stopping any
   service and pushed to both repositories, and the dead-man monitor is pinged.
2. **Given** a repository that is unreachable, **When** the backup runs, **Then** the other
   repository still receives the snapshot and the failure is reported.
3. **Given** a deliberately failing backup, **When** one cycle passes, **Then** an email
   alert arrives.
4. **Given** the latest snapshot and the restore runbook, **When** the drill runs on the
   desktop, **Then** the isolated restored stack passes verification within one hour and is
   wiped afterwards, leaving no production data on the staging host.
5. **Given** the production host loses power, **When** it returns, **Then** every service
   comes back without manual action, the down and recovery alerts were sent, and the
   database is consistent.

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

1. **Given** the go-live day, **When** the health-check script and the event-week
   click-through run, **Then** both pass and the evidence is recorded.
2. **Given** a live test submission with an attachment, **When** an organizer reviews it
   and changes its status, **Then** the vendor's mailbox receives both emails from the
   verified domain.

---

### User Story 6 - The hosted platforms are gone and the repository says so (Priority: P6)

Two weeks after go-live with no rollback, the hosting-platform project and both hosted
database projects are deleted, the code and configuration that existed only for them are
removed, the documentation describes the self-hosted stack, and the hosted-era secrets are
retired.

**Why this priority**: Leaving dead platforms and dead code around is how the next
maintainer gets confused; the roadmap and architecture documents must describe reality.

**Independent Test**: Search the source and documentation for the hosted platforms'
domains, the old environment variables and the keep-alive route; only historical spec
records remain. The hosted dashboards show no projects.

**Acceptance Scenarios**:

1. **Given** the decommission tasks are done, **When** the repository is searched for the
   hosted service's domain, the old platform's environment variable, the old email
   provider's key and the keep-alive route, **Then** only historical spec documents match.
2. **Given** the agent guidance, the architecture document and the roadmap, **When** read,
   **Then** they describe the self-hosted stack, its runbooks and its version-pinning rule,
   and the roadmap's "not recommended" entry is updated to record what was done and why.
3. **Given** the email relay key used during the migration, **When** decommission
   completes, **Then** it has been rotated and the new one is only on the two hosts and in
   the password manager.

---

### Edge Cases

- The ISP changes the home IP during an application window: the dynamic-DNS client
  updates the record within its five-minute cycle; the edge proxy masks the change from
  clients.
- Power is lost while the database is writing: the database is on solid-state storage with
  default durability settings and recovers on restart; the last backup is at most six hours
  old.
- The host's clock is wrong after a power cut: session-token validation may fail until time
  synchronization completes; the runbook recommends a clock battery.
- The desktop is off: staging returns a gateway error; production, backups to the off-site
  repository and the alerting of production from elsewhere are unaffected, but the on-site
  backup copy and the uptime checks hosted on the desktop are paused.
- A production deploy is attempted with a staging artifact (or vice versa): the deploy
  script refuses a version whose environment prefix does not match the host.
- The first TLS certificate issuance behind the edge proxy fails: the runbook's fallback
  points the record directly at the host for the first issuance, then re-enables the proxy.
- The token-signing secret must be rotated: the public API key baked into both artifacts
  changes, so rotation is a rebuild, a redeploy and every user signed out — runbooked, never
  routine.
- A restore drill must not leave vendor data on the staging host: the drill runs as a
  separate, isolated stack the production host does not route to, and is wiped at the end.
- The edge proxy is turned off: everything must keep working; this is tested.

## Requirements *(mandatory)*

### Functional Requirements

**Application and artifact**

- **FR-001**: The application MUST build into a self-contained server artifact that runs
  identically on any host with a container runtime, as a non-root process with a health
  check, on a currently supported long-term-support runtime version.
- **FR-002**: Production strictness MUST key on an explicit deployment-environment setting
  with the values `development`, `staging` and `production`, set by the operator per host,
  never on the build mode; the hosting platform's own environment variable MUST leave the
  contract now and the keep-alive settings when the hosted projects are retired. The
  environment contract document, the example environment file, the agent guidance and the
  environment tests MUST be updated in the same change.
- **FR-003**: Email MUST be sent over the standard mail-submission protocol to a
  configurable relay (host, port, user, password) plus a sender address; the sending
  function's interface, its best-effort warning behaviour and its log-only mode without
  configuration MUST be preserved; a sender on the relay's test domain MUST still be
  refused in production.
- **FR-004**: The server MUST accept a form submission carrying an attachment up to the
  documented maximum (10 MB) plus form overhead, with a test; today's 1 MB ceiling is a
  defect.
- **FR-005**: Session cookies MUST carry the Secure attribute, verified to keep local
  development working.
- **FR-006**: Continuous integration MUST publish one artifact per environment — staging
  from `dev`, production from `main`, each tagged with its environment and commit — built
  natively for the target host's processor architecture, only after the existing lint, test,
  build and security jobs pass, and never for pull requests.
- **FR-007**: The health-check script MUST gain an optional authenticated storage
  round-trip (upload, expiring link, download, non-cacheable assertion) enabled by organizer
  credentials, and MUST behave as today without them.

**Stack**

- **FR-008**: Production MUST run only the services the application uses — reverse proxy,
  application, database, authentication, data API and file storage — as separately
  restartable units; an administrative database console MAY exist as an optional profile
  bound to the local interface only.
- **FR-009**: Every service MUST be pinned to an explicit version, and the data-layer
  components MUST run the versions the local development stack runs (the pinning rule);
  upgrades MUST follow a documented procedure, staging first.
- **FR-010**: The API credentials MUST be the classic signed-token format minted from a
  single secret generated on the production host and never shared with the hosted service.
- **FR-011**: The data API MUST be served from the application's own origin under path
  prefixes, so that no cross-origin configuration exists.
- **FR-012**: Authentication, data-API and file-storage settings MUST match the local
  development stack's (auto-confirm on, signup open, minimum password length 6, exposed
  schemas, extra search path, row cap, file-size limit, file-backed storage), with the
  mailer link paths, the administrative sender and the token issuer set explicitly; the
  database MUST receive its administrative password from the same setting the migrations
  tool uses.
- **FR-013**: Bring-up MUST start the database, then authentication and file storage, and
  only then apply the application migrations; the runbook MUST state why.
- **FR-014**: Migrations MUST be applied unchanged with the existing migrations tool over
  an encrypted tunnel; type generation MUST target the local stack; references to the hosted
  projects MUST be removed from the package scripts.

**Ingress**

- **FR-015**: The router MUST forward only the two web ports and the VPN port to the
  production host; administrative shell access MUST never be reachable from the internet;
  automatic port mapping on the router MUST be disabled.
- **FR-016**: The reverse proxy MUST obtain and renew TLS certificates automatically, own
  the redirect from plain HTTP, send strict-transport-security, cap request bodies at 20 MB,
  trust forwarded client addresses only from the edge proxy's published ranges, and mark
  file-storage responses non-cacheable.
- **FR-017**: DNS MUST be served by the edge proxy's free tier with proxied records, strict
  origin-certificate verification, the edge's own HTTPS redirect off, a cache-bypass rule for
  the file-storage path, and bot mitigation off; the stack MUST work with the proxy disabled.
- **FR-018**: A dynamic-DNS client MUST keep the public record current.
- **FR-019**: The application MUST resolve its own public hostname to the local reverse
  proxy so server-side calls never leave the machine.
- **FR-020**: Only the reverse proxy MAY listen on all interfaces; the database and the
  admin console MUST bind to the loopback interface; every other service MUST be unexposed.
  The host runbook MUST record that the container runtime bypasses the host firewall.
- **FR-021**: Staging MUST be reached through the production host's reverse proxy behind
  basic authentication scoped to non-API paths, over plain HTTP on the LAN.

**Delivery**

- **FR-022**: One deploy script per host MUST pull and restart the app from the version
  recorded in the host's configuration, refuse a version whose environment prefix does not
  match the host, and keep the previous version for rollback; staging MUST run it on a
  five-minute timer; production MUST run it only on an explicit operator command.
- **FR-023**: Secrets MUST live in one owner-only configuration file per host with a copy
  in the password manager; an example file MUST document every key; no secret MAY be
  committed.

**Backups, recovery and monitoring**

- **FR-024**: Every six hours the production host MUST capture a consistent physical
  database backup (no downtime), a logical dump for inspection, the file storage directory,
  the database configuration directory and the host configuration, and push them,
  encrypted before they leave the host, to two repositories — on-site on the desktop and
  off-site in object storage — with retention of 14 daily, 8 weekly and 12 monthly
  snapshots.
- **FR-025**: The backup job MUST report completion to a dead-man monitor; a missed report
  MUST alert by email within one cycle.
- **FR-026**: A restore script MUST rebuild a working stack from a snapshot by restoring
  the data directory, the database configuration and the file storage into the same pinned
  versions; the drill MUST run as an isolated stack on the desktop and be wiped afterwards;
  the method and its fallback MUST be recorded in `research.md` with the drill result as
  evidence.
- **FR-027**: Uptime monitoring on the desktop MUST check the production root and the
  authentication health endpoint and host the backup dead-man monitor, alerting by email
  through the relay.
- **FR-028**: Services MUST restart automatically, expose health checks and rotate their
  logs.

**Provisioning and documentation**

- **FR-029**: The production host MUST be set up manually once from a host-setup runbook;
  provisioning automation MUST then reproduce it, be proven by provisioning the desktop
  alone, and be idempotent (a second run reports no changes).
- **FR-030**: Runbooks MUST exist for host setup, deploy and rollback, migrations, stack
  upgrades (including secret rotation), disaster recovery and backup/restore, each written
  for someone who has not read the code; the event-week runbook MUST be updated for the new
  hosts and for a database console instead of the hosted SQL editor.
- **FR-031**: The production host MUST boot from its solid-state drive with the container
  runtime's data on it, apply security updates automatically and keep its clock
  synchronized; the runbook MUST recommend a clock battery and an uninterruptible power
  supply.

**Decommission**

- **FR-032**: After two weeks live with no rollback, the hosting-platform project and both
  hosted database projects MUST be deleted; the platform's configuration file, the
  keep-alive route with its test and workflow, the vendor email SDK, the hosted link state
  and the hosted-dump filter script MUST be removed; the agent guidance, the architecture
  document, the roadmap and the specs index MUST describe the self-hosted stack.

### Key Entities

- **Host**: a machine running the stack — the production host or the desktop (staging,
  backup target, disaster-recovery standby). Each has one secrets file, one service stack
  and one deploy script.
- **Artifact**: an environment-specific build of the app, tagged with its environment and
  commit, with the public API address and public API key baked in.
- **Snapshot**: one backup run — database backup, logical dump, file storage,
  configuration — stored in two encrypted repositories.
- **Runbook**: a procedure under `docs/runbooks/` executable by someone who has not read
  the code.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: One command deploys production and one command rolls it back, each in under
  five minutes.
- **SC-002**: The automated health check and the event-week click-through pass on the
  self-hosted stack exactly as written for the hosted one.
- **SC-003**: Local, staging and production run identical pinned versions of every
  data-layer component.
- **SC-004**: A restore onto a freshly provisioned host reaches a green health check in
  under one hour, and has been rehearsed at least once before go-live.
- **SC-005**: Recovery point is at most six hours; a missed backup alerts within one cycle.
- **SC-006**: Recurring cost is the domain, free-tier services, object storage at this data
  size (≈ $0), the email relay's free tier and roughly $6/month of electricity; no
  per-feature subscriptions remain.
- **SC-007**: With the edge proxy disabled, every check still passes.
- **SC-008**: Every host-setup step is reproducible from the provisioning automation with no
  undocumented manual action; a second run reports zero changes.
- **SC-009**: Attachments up to 10 MB upload successfully (they fail above 1 MB today).

## Assumptions

- Hardware: a single-board computer with 8 GB of memory booting from solid-state storage;
  one desktop able to run 24/7, reinstalled with a fresh server OS of the same family. Both
  on the same LAN behind a router the maintainer controls, with a public IPv4 address (no
  carrier-grade NAT).
- Budget: small fixed costs are acceptable (domain, object storage at cents, an optional
  UPS); the objection is to per-feature subscriptions and lock-in.
- Kept services: the code host (repository and CI), the domain registrar, the edge proxy's
  free tier. The current hosting platform is dropped entirely, including preview
  deployments.
- Email relay: the current email provider's mail-submission endpoint on its free tier; the
  sending domain is **not yet verified** and doing so is a prerequisite. A second provider
  is the documented fallback; switching is configuration only. No self-hosted outbound mail
  server.
- Data: no migration. Hosted production has never been live and holds only an admin
  account; the hosted dev project holds test data. The self-hosted stack starts empty with
  the migrations applied and the admin seeded.
- Timeline: none; learning pace. Each phase is understood before the next.
- Operator: the maintainer alone. Runbooks are written accordingly.
- The domain name is kept as a `<domain>` placeholder in committed files and substituted
  on the hosts.
- Out of scope, recorded deliberately: organizer invites (now possible with a server-side
  privileged key, but a separate spec), a password-reset flow (the authentication service is
  configured for it; the app has no such screen), self-hosted code hosting, CI or mail, high
  availability, orchestration platforms, point-in-time recovery.
