# Feature Specification: Organizer Invites, Link Consumption and Password Reset

**Feature Branch**: `009-organizer-invites`
**Created**: 2026-09-26
**Status**: Draft
**Input**: User description: "Organizer invites sent from the Team page, an /auth/confirm route that consumes invite, recovery and signup links server-side, a set-password page, and a forgot-password flow. Design: docs/superpowers/specs/2026-09-26-organizer-invites-design.md; decisions D1–D6 settled; section 9 carried forward as Clarifications."

## Context

Three things are broken or missing today, and they share one root cause: the app has no page
that turns an emailed sign-in link into a signed-in session.

1. **Invite links go nowhere.** The Team page has a finished "Invite Organizer" form, but the
   action behind it is a stub that returns an error. Sending an invite from the hosting
   provider's admin console instead produces a link that lands the invitee on the public
   landing page, signed out, with no way to set a password. Seen on the dev preview on
   2026-09-23 during the spec 007 rehearsal.
2. **Signup confirmation links do the same.** On production, email confirmation is on; the
   link confirms the address but leaves the visitor signed out. The signup page papers over
   it by telling them to sign in.
3. **No password reset.** A user who forgets their password has no recourse in the app.

A fourth, quieter problem: even a working console-sent invite creates the new account as a
**vendor** (the signup trigger hard-codes it), so every organizer onboarding ends with the
admin running a manual database update. Under spec 008 the admin console becomes an optional,
local-only tool, so "just use the console" gets worse over time, not better.

This spec supersedes the Epic 4 backend stub (tasks 4.2.x in `docs/archive/TASKS.md`), closes
the spec 007 rehearsal finding "nothing exchanges the confirmation link's code", and delivers
the two items spec 008 deliberately left out of its scope: organizer invites and a
password-reset flow. The design record — every decision with its rationale, the component
list, the manual configuration table, the security notes and the test plan — is
`docs/superpowers/specs/2026-09-26-organizer-invites-design.md`. This spec distils it into
testable stories and requirements.

## Clarifications

### Session 2026-09-26

- Q: Scope? → A: One link-consumption page, one set-password page, the in-app Send Invite, and
  a forgot-password flow. The first two are unavoidable for any invite path; the invite send is
  a thin layer over them; forgot-password reuses both and costs one email trigger and one link.
- Q: The invited email already has an account? → A: Refuse if that person has ever signed in
  ("change their role on the Admin page instead"); re-send the invitation if they were invited
  and never signed in; existing organizers and admins get the same refusal. Resending a lost
  invite is the one case acceptance testing will hit; role changes already have a home on the
  Admin page.
- Q: How do pending invitees appear on the Team page? → A: In the member list with a
  **Pending** badge and a **Resend** button. Invitees exist as accounts immediately, so without
  this they would look like full members.
- Q: How does an emailed link become a session? → A: The email templates point every link
  (invite, password reset, signup confirmation) at one confirmation page in the app, which
  verifies the one-time token on the server, establishes the session, and redirects. Client-side
  pickup of tokens from the page address is rejected (it puts sign-in logic on the public
  landing page). A browser-bound code exchange is rejected for invites (the exchange secret
  would live in the admin's browser, not the invitee's).
- Q: How does an invitee become an organizer? → A: The invite action sets the role to organizer
  immediately after the account is created, using the privileged server credential. Reading the
  role from signup metadata is rejected: any client can set that metadata, so it would be a
  privilege-escalation hole.
- Q: Where does the privileged credential live? → A: One server-only module, imported by the
  team action only; an automated check asserts nothing else imports it.

### Carried forward — to confirm during plan

Recorded assumptions with a verification owner, not open questions. Each is a known behaviour
of the current stack that the plan or its first real-stack test must prove before the design
relies on it.

- Re-inviting an account that was invited but never confirmed re-sends the invitation rather
  than failing. Owner: the first real-stack security test; if false, the resend branch of the
  invite action changes.
- The minimum password length on both hosted projects is 6, matching the existing signup rule.
  Owner: plan; if a project is stricter, the rule is aligned.
- The dev project's configured site address still points at the dev preview origin (fixed
  2026-09-23). Owner: plan, re-verified before the dev walkthrough.
- The server-side session helper writes session cookies on token verification inside a
  request handler exactly as it does on password sign-in. Owner: plan / the first real-stack
  test.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Admin invites a new organizer with no manual database step (Priority: P1)

An admin on the Team page enters a colleague's email address and clicks Send Invite. The row
appears in the team list at once, marked Pending with the Organizer role. The colleague
receives a branded email with a link. Clicking it lands them, already signed in, on a "Set your
password" page. After setting a password they are on the organizer dashboard as an organizer.
Nobody touches the database by hand.

**Why this priority**: This is the reason the spec exists. Every other story reuses the two
pieces it introduces (the link-consumption page and the set-password page), and it is the
onboarding path the team will use for the next event.

**Independent Test**: On the dev preview, invite a throwaway address, open the email in a real
mailbox, click the link, set a password, and confirm the invitee is on the organizer dashboard
with the Organizer role shown on the Team page — with no manual database step anywhere.

**Acceptance Scenarios**:

1. **Given** an admin on the Team page and an address with no account, **When** they submit
   Send Invite, **Then** a confirmation toast says the invitation was sent, the address appears
   in the member list immediately with a Pending badge and the Organizer role, and an email
   with a link arrives at that address.
2. **Given** the invitee clicks the link in that email, **When** the page loads, **Then** they
   are signed in and on the set-password page, without visiting the public landing page or a
   sign-in form.
3. **Given** the invitee on the set-password page, **When** they enter and confirm a valid
   password, **Then** they are redirected to the organizer dashboard and are an organizer.
4. **Given** an address belonging to someone who has ever signed in (vendor, organizer or
   admin), **When** an admin submits Send Invite, **Then** the action is refused with the
   message "That email already has an account. Change their role on the Admin page instead.",
   no email is sent and nothing changes.
5. **Given** a non-admin somehow reaches the invite action, **When** it runs, **Then** it is
   refused with a not-authorized error and nothing is sent.
6. **Given** a deployment where the privileged credential is not configured, **When** an admin
   submits Send Invite, **Then** they see "Invites are not configured on this deployment" and no
   error trace.
7. **Given** the invitation was sent but the role could not be set, **When** the action
   returns, **Then** the admin sees "Invitation sent, but the role could not be set. Set it on
   the Admin page." so the failure is visible and recoverable.

---

### User Story 2 - Any user resets a forgotten password (Priority: P2)

A user who cannot remember their password follows a "Forgot password?" link on the Login page,
enters their email, and sees a neutral confirmation whether or not the address has an account.
The emailed link lands them, signed in, on the set-password page; after setting a new password
they are on the dashboard for their role.

**Why this priority**: The app has no recovery path today, and it reuses both pages story 1
introduces at the cost of one email trigger and one link. It is also the documented recovery
for an invitee who abandoned the set-password page (story 1's edge case).

**Independent Test**: With an existing vendor account on the dev preview, request a reset,
open the email, click the link, set a new password, confirm the redirect to the vendor
dashboard, sign out, and sign in with the new password. Request a reset for an address with
no account and confirm the on-screen response is identical.

**Acceptance Scenarios**:

1. **Given** the Login page, **When** the user looks below the form, **Then** a "Forgot
   password?" link is present and leads to the reset request page.
2. **Given** the reset request page, **When** the user submits an address with an account,
   **Then** the page shows "If that address has an account, a reset link is on its way" and an
   email with a link arrives.
3. **Given** the reset request page, **When** the user submits an address with no account,
   **Then** the page shows exactly the same message and nothing distinguishes the two cases.
4. **Given** the reset request page, **When** the user submits a malformed address, **Then**
   a validation error is shown and nothing is sent.
5. **Given** the user clicks the reset link, **When** the page loads, **Then** they are signed
   in and on the set-password page.
6. **Given** the user sets a new password, **When** the action succeeds, **Then** they are
   redirected to the organizer dashboard if they are an organizer or admin, otherwise to the
   vendor dashboard, and the new password works on the next sign-in.

---

### User Story 3 - Admin sees and resends pending invitations (Priority: P3)

Members who have been invited and have not accepted — their email is unconfirmed and they have
never signed in — are visibly Pending on the Team page. The
admin can resend a lost invitation from that row or by entering the address again; the toast
distinguishes "re-sent" from "sent". The badge clears on the invitee's first sign-in.

**Why this priority**: A lost invitation is the one failure acceptance testing will hit. Without
the badge, pending invitees look like full members.

**Independent Test**: Invite an address, do not click the link, confirm the Pending badge and
Resend button, click Resend, confirm a second email and the "re-sent" toast; then click the link
and confirm the badge is gone.

**Acceptance Scenarios**:

1. **Given** a member whose invitation is unaccepted (email unconfirmed, never signed in),
   **When** the Team page renders, **Then** their row shows a Pending badge and a Resend
   button; every other member shows neither.
2. **Given** a Pending row, **When** the admin clicks Resend, **Then** a fresh email goes out
   and the toast says "Invitation re-sent".
3. **Given** a Pending member's address, **When** the admin submits it through the invite form
   again, **Then** the outcome is the same as Resend.
4. **Given** a resend, **When** it completes, **Then** the member's role is unchanged.
5. **Given** the invitee clicks the invitation link (confirming the address and signing in),
   **When** the Team page is next rendered,
   **Then** the Pending badge and Resend button are gone.
6. **Given** the Team page's summary tiles, **When** the change ships, **Then** their counts
   are unchanged by this feature.

---

### User Story 4 - A vendor's signup confirmation lands them signed in (Priority: P4)

On production, where email confirmation is on, a vendor who signs up clicks the confirmation
link and lands signed in on the vendor dashboard instead of on the public landing page signed
out. The signup page's "sign in afterwards" copy is corrected in the same change.

**Why this priority**: It costs one email template change once story 1's page exists, and it
closes a recorded spec 007 backlog item. On the dev project, where confirmations are off,
nothing changes.

**Independent Test**: On production, sign up with a throwaway address, click the confirmation
link, and confirm the vendor dashboard loads with a session. Confirm the signup page no longer
tells the visitor to sign in afterwards.

**Acceptance Scenarios**:

1. **Given** a new vendor signs up on production, **When** they click the confirmation link,
   **Then** they are signed in and on the vendor dashboard.
2. **Given** the signup page, **When** it renders after this change, **Then** its copy
   describes the confirmation email and no longer instructs the visitor to sign in afterwards.
3. **Given** the dev project with confirmations off, **When** a vendor signs up, **Then**
   the sign-up flow is unchanged; only the success message's wording differs (confirmations are
   off there, so no mail is sent).

---

### Edge Cases

- **Expired or already-used link.** Verification fails; the visitor lands on the Login page
  with "That link has expired or was already used. Ask an admin to send a new invitation, or
  use Forgot password." No session is created.
- **Second use of the same link.** Same outcome as expired: the token is one-time.
- **Unknown link kind.** A link whose kind is not invite, password reset, signup confirmation
  or email change is treated as invalid, with the same outcome.
- **Requested destination is not an internal allow-listed page.** Anything that is not one of
  the set-password page, the organizer dashboard or the vendor dashboard — including
  protocol-relative and absolute addresses — is ignored and the kind's default is used:
  invite and reset go to the set-password page; signup confirmation and email change go to the
  vendor dashboard.
- **Set-password page reached without a session.** Redirect to the Login page with a "sign in
  first" notice.
- **Invitee abandons the set-password page.** They are now confirmed and have signed in once,
  so the Pending badge clears and Resend is refused as an existing account. They recover through
  Forgot password. Accepted and documented so it is not mistaken for a bug.
- **Account created in the hosting console with the address pre-confirmed.** It is not Pending
  and cannot be re-invited (the refusal of FR-002 applies); it signs in with the password the
  admin set or uses Forgot password.
- **Invitation sent, role not set.** Explicit message to the admin (story 1, scenario 7); the
  member exists as a vendor until the admin sets the role on the Admin page.
- **Email rate limit reached on a reset request.** The user sees the same neutral message; the
  failure is logged server-side. No account existence leaks.
- **Existing organizer or admin is invited.** Same refusal as story 1, scenario 4.
- **Signed-in user visits the set-password or forgot-password page.** They are not bounced away
  as they would be from the sign-in and signup pages; both pages are usable while signed in.

## Requirements *(mandatory)*

### Functional Requirements

**Invitations**

- **FR-001**: Only admins MUST be able to send an organizer invitation; the action MUST refuse
  any other role before doing anything else.
- **FR-002**: An invitation to an address whose account has ever signed in MUST be refused
  with the message "That email already has an account. Change their role on the Admin page
  instead.", sending nothing and changing nothing. Existing organizers and admins MUST receive
  the same refusal.
- **FR-003**: An invitation to an address that was invited and has never signed in MUST
  re-send the invitation and MUST NOT change the member's role.
- **FR-004**: A newly invited account MUST have the organizer role before the action reports
  success, with no manual step; the role MUST be assigned by the privileged server action, never
  read from client-supplied signup data.
- **FR-005**: The action's success result MUST distinguish a first send from a re-send so the
  interface can say "sent" or "re-sent".
- **FR-006**: If the invitation is sent but the role cannot be set, the action MUST report
  "Invitation sent, but the role could not be set. Set it on the Admin page."
- **FR-007**: On a deployment where the privileged credential is absent, the action MUST fail
  closed with "Invites are not configured on this deployment" and no error trace.
- **FR-008**: The invitation email address MUST be validated, trimmed and lower-cased before
  use.

**Link consumption**

- **FR-009**: One unauthenticated confirmation page MUST consume every emailed link kind —
  invitation, password reset, signup confirmation and email change — whether the link was sent
  by the app or by the hosting provider's console.
- **FR-010**: The confirmation page MUST verify the one-time token on the server and establish
  the visitor's session before redirecting; it MUST perform no other write.
- **FR-011**: A link with an unknown kind, an expired token, an already-used token or a failed
  verification MUST create no session and MUST redirect to the Login page with the specific
  notice from the Edge Cases.
- **FR-012**: The post-link destination MUST be restricted to an allow-list of internal pages
  (set-password page, organizer dashboard, vendor dashboard); any other value, including
  protocol-relative and absolute addresses, MUST fall back to the kind's default.
- **FR-013**: The confirmation page MUST NOT be blocked by the signed-in-user or role redirects
  that protect the dashboards and the sign-in pages.
- **FR-014**: No token, token hash or email body MUST ever be written to logs.

**Set password**

- **FR-015**: The set-password page MUST require a signed-in user and otherwise redirect to the
  Login page with a "sign in first" notice.
- **FR-016**: The set-password form MUST take a password and a confirmation, applying the
  existing minimum length and match rules, with the same accessibility standard as the other
  forms (labelled fields, announced errors, touch-friendly targets, brand tokens).
- **FR-017**: Any signed-in user of any role MUST be able to set their own password; the action
  MUST apply the minimum-role check (every account has at least the vendor role), never an
  organizer or admin check.
- **FR-018**: After a successful set, the user MUST be redirected to the organizer dashboard if
  they are an organizer or admin, otherwise to the vendor dashboard.
- **FR-019**: The set-password and forgot-password pages MUST remain reachable while signed in;
  they MUST NOT be treated as guest-only pages.

**Forgot password**

- **FR-020**: The Login page MUST offer a "Forgot password?" link leading to a request page
  that asks only for an email address.
- **FR-021**: The reset request MUST respond with the same neutral message whether or not the
  address has an account, and MUST present a rate-limit failure to the user identically while
  logging it server-side.
- **FR-022**: The reset link MUST be consumed by the confirmation page (FR-009) and land the
  user on the set-password page.

**Team page**

- **FR-023**: The Team page MUST show a Pending badge and a Resend button on every member whose
  invitation is unaccepted — email unconfirmed and never signed in — and neither on any other
  member.
- **FR-024**: Resend MUST behave exactly as submitting the address through the invite form.
- **FR-025**: The Team page summary tiles MUST be unchanged.

**Configuration and security**

- **FR-026**: The privileged credential MUST be server-only, required on production
  deployments and optional elsewhere, held in exactly one module that only the team action
  imports; an automated check run on every pull request MUST fail if anything else imports it.
- **FR-027**: The invitation, password-reset and signup-confirmation email templates on each
  hosted project MUST point at the confirmation page with the link kind and default
  destination for that template, MUST keep the branded sender configured under spec 007, and
  MUST carry copy defined by this spec rather than the console default.
- **FR-028**: The public application-submission posture established by spec 006 MUST be
  unchanged.
- **FR-029**: The Team page MUST be able to tell whether each member's invitation is still unaccepted
  (email unconfirmed and never signed in); the admin-only gating of that list stays where it is
  today.

**Documentation and rollout**

- **FR-030**: Every per-project console change (credential, three templates, site address)
  MUST be a `[manual]` task with an evidence row in this spec's `quickstart.md`, dev first,
  then production.
- **FR-031**: On completion the agent guidance (Epic 4 status, environment section, route list,
  migrations list), the architecture document (the statement that no privileged key is used
  anywhere must say where it is used), the roadmap's Tier 4 bullet, the constitution's
  acknowledged-violation note for the invite stub, the specs index, and a follow-up note in spec
  008's task list for the self-hosted template wiring MUST all be updated.

### Key Entities

- **Team member**: an account with a role (vendor, organizer, admin), an email, and whether its
  invitation is still unaccepted.
- **Invitation**: not a separate record. It is the state of a team member who exists, whose email is
  unconfirmed and who has never signed in; the Pending badge and Resend button follow from that state alone.
- **Auth link**: an emailed, one-time, expiring link of a kind (invitation, password reset,
  signup confirmation, email change) carrying a requested destination.
- **Password**: set once by an invitee on the set-password page and changeable through the
  reset flow.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: An admin onboards a new organizer end to end with zero manual database steps,
  and the invitee reaches the organizer dashboard within 5 minutes of the email arriving.
- **SC-002**: Every emailed link kind (invitation, reset, signup confirmation) lands the
  visitor signed in on the correct page in one click; none lands on the public landing page
  signed out.
- **SC-003**: An expired, reused, unknown-kind or malformed link creates no session in 100% of
  attempts and shows the specific notice.
- **SC-004**: The reset-request response is indistinguishable between an address with an
  account and one without, including under rate limiting.
- **SC-005**: The privileged credential is referenced from exactly one module, proven by an
  automated check on every pull request.
- **SC-006**: Stories 1 through 4 are clicked through once on the dev preview with a real
  mailbox and the evidence recorded; story 1 is run once on production as the first real
  organizer onboarding.
- **SC-007**: An invitee who signed in once and abandoned the set-password page recovers
  through Forgot password with no admin involvement.

## Assumptions

- The branded transactional email sender configured under spec 007 is reused unchanged; the
  hosted auth service sends the invitation, reset and confirmation emails through it.
- The four items under "Carried forward — to confirm during plan" hold; each has a named
  verification owner and a stated fallback.
- Both hosted projects' configured site address points at the right origin for their
  environment; production is re-verified as part of rollout.
- Deliberately out of scope: bulk invites; invitation expiry management; revoking a pending
  invitation (delete the account on the Admin page if needed); inviting with any role other than
  organizer (admins are promoted on the Admin page after accepting); display names or profile
  fields at accept time; a change-password screen for already-signed-in users (the set-password
  page technically works for this but nothing links to it); magic-link sign-in (its template
  stays at the default); the self-hosted stack's template wiring (recorded as a spec 008
  follow-up, not a blocker here).
- The design document is the design record. The plan carries its component list (§4), manual
  configuration table (§5), security notes (§6) and test plan (§7) into `plan.md`, its
  contracts and `tasks.md`.
- Rollout order: local stack, then the dev project and preview (stories 1–4 walked through with
  a throwaway address), then production (promote `dev` to `main`, run story 1 once with a real
  organizer's address).
