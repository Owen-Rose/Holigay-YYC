# Feature Specification: Invite-Only UAT Environment

**Feature Branch**: `010-invite-only-uat`
**Created**: 2026-09-27
**Status**: Draft
**Input**: User description: "Invite-only UAT environment: account creation on the training deployment only through admin invites; Team page invites can create vendor accounts; production unchanged. Design: docs/superpowers/specs/2026-09-27-invite-only-uat-design.md, section 2 decided."

## Context

Two deployments run the same code against two separate authentication projects:

| Deployment | Audience |
|---|---|
| Production, the custom vendors domain | Real vendors and organizers. Anyone may sign up as a vendor. |
| Training (UAT), the `uat-` hostname | Invited organizers learning the app before event week. |

The training deployment is public by link on purpose: testers must not need a hosting-provider
login to reach it. Today that openness extends to accounts. Anyone who finds the address can
create a vendor account through the sign-up page, or by calling the authentication service
directly with the public key that every browser receives. The training environment should be
invite-only: **no account exists on the training deployment unless an admin invited it**, and
testers get in through the app's own email invitation (spec 009), never through the hosting
provider.

Production keeps open vendor self sign-up. Nothing in this spec changes production behaviour.

This spec closes the roadmap M3 checklist item "Preview-deployment access decided for UAT". It
builds on the invite flow delivered by `specs/009-organizer-invites/` and is sequenced against
the open fixes in `docs/handoffs/2026-09-27-uat-findings.md`. The design record, with every
decision and its rationale, the component list, the manual configuration table and the test
plan, is `docs/superpowers/specs/2026-09-27-invite-only-uat-design.md`. This spec distils it into
testable stories and requirements; its section 2 is decided and is not reopened here.

## Clarifications

### Session 2026-09-27

Decided in the brainstorm and recorded as settled. The plan does not relitigate them.

- Q: Where does "invite-only" get enforced? → A: At the authentication service. The training
  project's self sign-up setting is turned off, so the service refuses every sign-up, including
  a browser calling it directly with the public key. Admin invitations are unaffected, so spec
  009's invite flow becomes the only door. The app adds no email allowlist: one in the app would
  guard only our own screens and is the hand-rolled version of the same idea.
- Q: What does "invite-only" cover? → A: Accounts only. The landing page, the public application
  form and its anonymous submission stay open on the training deployment. The point of the
  training environment is that organizers see what vendors see, and the public form is the
  vendor experience. The residual risk, a stranger pushing junk applications into a training
  database, is low likelihood and deletable.
- Q: How does the app know it is running invite-only? → A: From one explicit per-deployment
  setting, on for the training deployment and unset everywhere else. The mode is never inferred
  from the kind of deployment (preview versus production): that would silently flip every
  pull-request preview, the same trap the spec 007 environment contract avoided. The value is
  not a secret.
- Q: What does the app do in invite-only mode? → A: Hides the sign-up link on the Login page,
  makes the sign-up page answer "not found", and has the sign-up action refuse with "Sign-up is
  by invitation on this site." before contacting the authentication service. This is cosmetic
  and defensive; the service setting is the enforcement. Without it a tester who finds the
  sign-up page would see the service's raw "signups not allowed" error.
- Q: How does a tester get a vendor account on the training deployment? → A: The Team page
  invite form gains a role picker, Organizer (default) or Vendor. The chosen role is set right
  after the account is created, exactly as for organizers today. This preserves the "apply,
  then get an account" flow: the tester submits the public form with their email, the admin
  invites that address as a vendor, and the existing application is linked to the new account on
  acceptance just as it would be on a self sign-up. Admin is never an invitable role.
- Q: Which hostname do invitation links land on? → A: The training project's configured site
  address becomes the `uat-` hostname before the first invitation is sent. Today it points at
  the git-branch preview, so an invitee would finish on the wrong hostname: the same build, but
  the wrong address to bookmark and share. The redirect allow-list keeps both origins.
- Q: What changes on production? → A: Nothing. Self sign-up stays on and the setting stays
  unset. The UAT findings items about self sign-up (items 2, 3 and 9) can no longer be tested on
  the training deployment and move to a production-only checklist.

Settled during planning (2026-09-27), where the design record was found to be wrong or silent:

- Q: The Team page lists organizers and admins only, so where does an invited vendor show up? →
  A: Not on the Team page; the filter stays. The toast confirms the send and the Admin page
  lists the account with the Vendor role. A pending vendor is re-sent by submitting the address
  again in the invite form (there is no Resend button for them). Story 2 was amended to match.
- Q: The public form keeps the email's case while invitations and the authentication service
  lower-case it, so a tester who applied as `Jane@…` and is invited as `jane@…` is not linked.
  What does this spec do? → A: Records it, does not fix it. FR-012's automated test uses a
  lower-case address and a second case documents the mixed-case outcome; the gap is a new item
  in the UAT findings handoff for its own change. Production behaviour is not touched here.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - A stranger who finds the training address cannot get an account (Priority: P1)

Someone who discovers the training deployment's address can read the landing page and submit an
application through the public form, exactly as a vendor would on production. They cannot create
an account: the Login page offers no sign-up link, the sign-up page does not exist, and a direct
sign-up request to the authentication service is refused. Nothing they do leaves an account
behind.

**Why this priority**: This is the reason the spec exists. Until it holds, the training
environment is open to anyone who finds it, and the organizers being trained cannot be sure who
else is in the database with them.

**Independent Test**: On the training deployment, signed out: load the landing page, submit an
application through the public form, open the Login page and look for a sign-up link, visit the
sign-up page's address, and send a sign-up request straight to the authentication service with
the public key. Then check the member list: no account was created.

**Acceptance Scenarios**:

1. **Given** the training deployment in invite-only mode, **When** a signed-out visitor loads
   the landing page and submits the public application form with a file, **Then** both succeed
   exactly as they do on production.
2. **Given** the Login page in invite-only mode, **When** it renders, **Then** it shows no
   sign-up link, and the sign-in and "Forgot password?" paths are unchanged.
3. **Given** invite-only mode, **When** a visitor requests the sign-up page's address directly,
   **Then** they receive the app's standard not-found page and no sign-up form is ever rendered.
4. **Given** invite-only mode, **When** a sign-up request reaches the app's sign-up action (for
   example from a stale page), **Then** it is refused with "Sign-up is by invitation on this
   site." and the authentication service is never contacted.
5. **Given** the training project with self sign-up turned off, **When** anyone sends a sign-up
   request directly to the authentication service with the public key, **Then** the service
   refuses it and no account is created.
6. **Given** the same deployment with the setting unset, **When** the Login page and the
   sign-up page render, **Then** they behave exactly as today (link shown, page renders), so
   production is provably unaffected by the code change alone.

---

### User Story 2 - Admin invites a tester as a vendor from the Team page (Priority: P2)

With self sign-up off, the only way a tester gets a vendor account is an admin inviting them.
On the Team page the admin enters the tester's email, picks **Vendor** from the role picker
(Organizer is the default) and sends. The tester's emailed link lands them signed in on the
set-password page, then on the vendor dashboard. If they had already applied through the public
form with that address, their application is waiting for them. The Team page keeps listing
organizers and admins; the new vendor account is listed on the Admin page with the Vendor role.

**Why this priority**: Without it, story 1 makes the vendor side of the app unreachable on the
training deployment, and the training exercise the environment exists for (apply, then review)
cannot be run end to end.

**Independent Test**: On the training deployment, submit the public form with a throwaway
address, then as an admin invite that address as a vendor, open the email, click the link, set a
password, and confirm the vendor dashboard lists the earlier application. Confirm the Admin page
lists the address as Vendor.

**Acceptance Scenarios**:

1. **Given** an admin on the Team page, **When** the invite form renders, **Then** it offers a
   role choice of Organizer and Vendor with Organizer selected by default, and nothing else.
2. **Given** an address with no account, **When** the admin sends an invitation with Vendor
   chosen, **Then** the toast says the invitation was sent, the Admin page lists the address
   with the Vendor role, and an email with a link arrives.
3. **Given** the invitee clicks that link, **When** they set a password, **Then** they are on
   the vendor dashboard as a vendor, with no manual step by anyone.
4. **Given** the invitee had already submitted the public form with that exact address,
   **When** they first reach the vendor dashboard, **Then** that application is listed there.
5. **Given** a Pending vendor invitee, **When** the admin submits the address again with any
   role selected, **Then** a fresh email goes out, the toast says "re-sent", and the member's
   role is still Vendor.
6. **Given** an address whose account has ever signed in, **When** the admin invites it with
   either role, **Then** the action is refused with spec 009's existing message and nothing
   changes. On the training deployment this can only be a genuine duplicate, since no
   self-signed accounts exist.
7. **Given** the invitation was sent but the role could not be set, **When** the action
   returns, **Then** the admin sees spec 009's "Invitation sent, but the role could not be
   set" message; because every new account starts as a vendor, a vendor invitee still lands
   correctly.

---

### User Story 3 - An organizer invitation lands on the training hostname (Priority: P3)

An admin invites an organizer exactly as in spec 009. The difference is where the link lands:
on the `uat-` hostname the team shares and bookmarks, not on the git-branch preview address the
training project's site address points at today.

**Why this priority**: The first real organizer invitation is the milestone this spec is
sequenced toward. Landing on the wrong hostname is not a functional failure, but it hands the
first invitee the wrong address to remember, and it must be fixed before that invitation goes
out.

**Independent Test**: Invite a throwaway address as an organizer, open the email, and confirm
the link's host, the set-password page and the organizer dashboard are all on the `uat-`
hostname.

**Acceptance Scenarios**:

1. **Given** the training project's site address set to the `uat-` hostname, **When** an admin
   sends an organizer invitation, **Then** the emailed link opens on that hostname and every
   subsequent page (set password, organizer dashboard) stays on it.
2. **Given** the same setting, **When** a user requests a password reset on the training
   deployment, **Then** the reset link also opens on the `uat-` hostname.
3. **Given** the redirect allow-list keeps both origins, **When** a link is opened on the
   git-branch preview address instead, **Then** it still works there.

---

### User Story 4 - Production keeps open vendor self sign-up (Priority: P4)

A vendor on production signs up as today: the Login page shows the sign-up link, the sign-up
page renders, the confirmation email arrives and its link lands them signed in on the vendor
dashboard. The production project's self sign-up setting is confirmed on, and its email
confirmation setting is read and recorded, closing the unchecked item from the UAT findings.

**Why this priority**: It is a non-regression story. It costs a walkthrough and two setting
read-backs, and it is the guarantee the training-only change did not leak.

**Independent Test**: With the setting unset on production, sign up with a throwaway address,
confirm the email and the landing, and read both authentication settings back from the
production project. Record the three results in this spec's production-only checklist.

**Acceptance Scenarios**:

1. **Given** production, **When** a visitor opens the Login page and the sign-up page, **Then**
   the link is shown and the page renders, unchanged.
2. **Given** production, **When** a vendor signs up, **Then** the confirmation email arrives and
   its link lands them signed in on the vendor dashboard, unchanged from spec 009.
3. **Given** the production project's settings, **When** they are read back after this change,
   **Then** self sign-up is on and the email confirmation setting's value is recorded.

---

### Edge Cases

- **Setting on, but the training project's self sign-up is still on.** The app hides and refuses
  sign-up; a direct request to the authentication service would still succeed. Only the manual
  evidence for the service setting (story 1, scenario 5) catches this, so the rollout flips the
  service setting first.
- **Self sign-up off, but the setting unset.** The sign-up page renders and the action forwards
  to the service, which answers "signups not allowed". The action surfaces that message as it
  does any service error. Ugly, harmless.
- **Vendor invitation sent, role write fails.** Same message as spec 009. Every new account
  starts as a vendor, so the invitee is correct anyway; only an organizer invitee needs the
  admin to set the role on the Admin page.
- **Developer runs locally with the setting on.** The local authentication stack still accepts
  sign-ups, so the service would allow one, but the app hides and refuses it. This is the state
  the automated tests exercise; they do not flip the local service setting.
- **Pending invitee re-invited with a different role.** The stored role wins; a re-send never
  changes the role (spec 009's rule, unchanged).
- **Other pull-request previews.** The setting applies to every preview deployment, not only the
  `uat-` hostname. They all share the training project, so this is consistent and accepted.
- **Invitee invited as a vendor who had applied with a differently-cased or differently-spaced
  address.** Addresses are trimmed and lower-cased before use (spec 009), so the link still
  matches; an address that differs in substance does not link, and the tester applies again.

## Requirements *(mandatory)*

### Functional Requirements

**Invite-only mode**

- **FR-001**: The app MUST read invite-only mode from one explicit per-deployment setting. The
  mode is on only when that setting is exactly "true"; unset or any other value is open mode.
  The mode MUST NOT be derived from the kind of deployment (preview versus production).
- **FR-002**: In invite-only mode the Login page MUST NOT show a sign-up link; in open mode it
  MUST show it as today.
- **FR-003**: In invite-only mode a request for the sign-up page's address MUST receive the
  app's standard not-found response before any sign-up content renders; in open mode the page
  MUST render as today.
- **FR-004**: In invite-only mode the sign-up action MUST refuse with "Sign-up is by invitation
  on this site." before contacting the authentication service; in open mode it MUST behave as
  today.
- **FR-005**: The landing page, the public application form and its anonymous submission,
  sign-in, forgot-password, set-password, the emailed-link confirmation page and the keep-alive
  endpoint MUST behave identically in both modes.
- **FR-006**: The in-app behaviour of FR-002 through FR-004 is defensive. Enforcement MUST be the
  training project's self sign-up setting being off, proven by a direct sign-up request to the
  authentication service being refused.

**Invitations with a role**

- **FR-007**: The Team page invite form MUST offer a role choice of Organizer and Vendor, with
  Organizer selected by default.
- **FR-008**: The invite action MUST accept only Organizer or Vendor as the role; any other value,
  including Admin, MUST be rejected by input validation before anything else happens.
- **FR-009**: A newly invited account MUST have the chosen role before the action reports
  success, set by the privileged server action exactly as organizers are set today.
- **FR-010**: A re-send (by button or by re-submitting the address) MUST keep the member's stored
  role, whatever role is selected in the form.
- **FR-011**: The admin-only guard, the existing-account refusal, the "sent" versus "re-sent"
  result, the Pending badge and the "role could not be set" message from spec 009 MUST be
  unchanged.
- **FR-012**: A vendor invited at an address that has already submitted the public form MUST see
  that application on the vendor dashboard after accepting the invitation, with no manual
  linking step. This is existing behaviour and MUST be asserted by an automated test against a
  real database.

**Per-project and per-deployment configuration**

- **FR-013**: The training project's self sign-up setting MUST be off. Evidence: a direct sign-up
  request with the public key is refused.
- **FR-014**: The training project's configured site address MUST be the `uat-` hostname, and
  its redirect allow-list MUST keep both the `uat-` hostname and the git-branch preview
  address. Evidence: the configured values read back.
- **FR-015**: The invite-only setting MUST be on for the training deployment (preview
  deployments) and unset on production and locally. Evidence: on the `uat-` hostname the
  sign-up page is not found and the Login page has no sign-up link; on production both are
  present.
- **FR-016**: The production project's self sign-up setting MUST be confirmed on and its email
  confirmation setting read and recorded before real vendors sign up.
- **FR-017**: Each of FR-013 through FR-016 MUST be a `[manual]` task with an evidence row in this
  spec's `quickstart.md`, following spec 009's pattern; FR-013 and FR-014 MUST be completed
  before the code change reaches the training deployment, and all four before the first real
  invitation.

**Documentation**

- **FR-018**: The same change MUST update the environment contract, the agent guidance's
  environment section, the roadmap M3 checklist item "Preview-deployment access decided for
  UAT", the specs index, and the UAT findings handoff (items 2, 3 and 9 moved to a
  production-only checklist, with story 4's evidence recorded against them).

### Key Entities

- **Deployment mode**: open or invite-only, read from one per-deployment setting. Open on
  production and locally; invite-only on the training deployment.
- **Invitation role**: Organizer or Vendor, chosen by the admin at invite time and fixed for
  re-sends. Admin is never invitable.
- **Team member**: as in spec 009 (account, role, email, whether the invitation is still
  unaccepted), now with a role that may have been chosen at invite time.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: On the training deployment, no path creates an account for someone who was not
  invited: the sign-up link is absent, the sign-up page is not found, the app's sign-up action
  refuses, and a direct request to the authentication service is refused, in 100% of attempts.
- **SC-002**: After the change, a signed-out visitor to the training deployment can load the
  landing page and submit the public application form with a file on the first attempt.
- **SC-003**: One vendor invitation and one organizer invitation are walked through on the
  training deployment with a real mailbox; both links open on the `uat-` hostname and both
  invitees reach their dashboard within 5 minutes of the email arriving.
- **SC-004**: A tester who applied through the public form before being invited as a vendor sees
  that application on their first visit to the vendor dashboard, with zero manual steps.
- **SC-005**: The production sign-up flow is unchanged, verified by one throwaway sign-up on
  production and both authentication settings read back and recorded.
- **SC-006**: Flipping only the kind of deployment (for example, building a pull-request preview
  versus production) never changes the mode; only the explicit setting does.

## Assumptions

- Spec 009's invite flow, confirmation page and set-password page are the foundation and are
  changed only to carry the chosen role.
- The existing signup trigger links a pre-existing vendor row to a new account by email on an
  invitation exactly as it does on a self sign-up (FR-012 proves it rather than assuming it).
- The training project's self sign-up setting cannot be changed from code or from a migration.
  It is project configuration, exposed only through the provider's dashboard and management
  interface, so FR-013 stays a manual task.
- Deliberately out of scope: gating the landing page or the public application form (a later
  spec could add a session requirement behind the same setting if junk submissions become a
  problem); a captcha on the public form; any change to production's sign-up posture; the other
  open UAT findings items (6 status buttons, 4 time zone, 5 reply-to copy), which follow as their
  own changes.
- The residual risk of junk applications in the training database is accepted; they are
  deletable.
- Rollout order: the two training-project settings (FR-013, FR-014) first, since they are
  reversible and need no code; then this spec's single change to the `dev` branch with the
  preview setting in place before merge so the `uat-` hostname picks it up on deploy; then the
  remaining UAT findings items; then the first real organizer invitation.
- The design document is the design record. The plan carries its component list (§4), manual
  configuration table (§4.5), error handling (§5) and test plan (§6) into `plan.md`, its
  contracts, `quickstart.md` and `tasks.md`.
