# Contract: Auth Email Templates

**Feature**: 009-organizer-invites | **Date**: 2026-09-26
**Where**: Supabase → Authentication → Email Templates, on the **dev** project (`kcokcufmzyckbodelqpb`) then **prod** (`hgmfjvjlxrhdojwlkgap`) — `[manual]` tasks with evidence rows in `quickstart.md`
**Requirements**: FR-027, FR-030; US1-S1, US2-S2, US4-S1

## Shared rules

- Sender: unchanged from spec 007 T013b — custom SMTP via Resend, `noreply@holigayeventsyyc.ca`,
  name "Holigay Events YYC".
- Every link is `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=<kind>&next=<default>`.
  `{{ .SiteURL }}` is the project's configured Site URL (dev: the `dev`-branch preview origin;
  prod: `https://vendors.holigayeventsyyc.ca`). `{{ .RedirectTo }}` is **not** used, so the
  Redirect URLs allow-list does not change.
- Copy below is the deliverable; the console default is not acceptable (FR-027). Plain HTML,
  no images, no tracking. Keep `{{ .Email }}` out of the body except where shown so the mail
  reads the same for every recipient.
- **Magic Link** and **Change Email Address** templates stay at the default (out of scope);
  the route still accepts `email_change` if one is ever pointed at it.

## 1. Invite user

**Subject**: `You're invited to the Holigay Vendor Market team`

```html
<h2>You're invited</h2>
<p>An admin has invited you to help run the Holigay Vendor Market — the vendor application
platform for Holigay Events YYC.</p>
<p><a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=invite&next=/set-password">Accept the invitation and set your password</a></p>
<p>The link signs you in and takes you straight to a page where you choose a password. It can
be used once and expires in 24 hours; if it has expired, ask the admin to send it again from
the Team page.</p>
<p>If you weren't expecting this, you can ignore this email — nothing happens until the link
is used.</p>
```

## 2. Reset password

**Subject**: `Reset your Holigay Vendor Market password`

```html
<h2>Reset your password</h2>
<p>Someone asked to reset the password for the Holigay Vendor Market account with this
address.</p>
<p><a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery&next=/set-password">Choose a new password</a></p>
<p>The link signs you in and opens the set-password page. It can be used once and expires in
1 hour.</p>
<p>If you didn't ask for this, ignore this email — your password stays as it is.</p>
```

## 3. Confirm signup

**Subject**: `Confirm your Holigay Vendor Market email`

```html
<h2>Confirm your email</h2>
<p>Thanks for creating a Holigay Vendor Market account. Confirm this address to finish
signing up.</p>
<p><a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=signup&next=/vendor-dashboard">Confirm my email</a></p>
<p>The link signs you in and takes you to your vendor dashboard. It can be used once and
expires in 24 hours.</p>
<p>If you didn't create this account, ignore this email.</p>
```

On the **dev** project "Confirm email" is off, so this template never sends there; it is set
anyway so the two projects match (US4 scenario 3 — dev behaviour unchanged).

## Verifying a template (per project)

1. Save the template in the console.
2. Send one real mail of that kind to a throwaway address the maintainer controls
   (invite: Team page Send Invite; reset: `/forgot-password`; confirm: `/signup` on prod).
3. Confirm it arrived in the Inbox from the branded sender, the link's host is the
   project's Site URL, and clicking it lands signed in on the expected page.
4. Record date, project, template and outcome in the matching `quickstart.md` row. Delete the
   throwaway user afterwards (Authentication → Users), as 007's rows did.

## Self-hosted equivalents (spec 008 follow-up — not done here)

| Console template | GoTrue setting on the Pi (008 T013) |
|---|---|
| link base | `GOTRUE_MAILER_URLPATHS_{INVITE,CONFIRMATION,RECOVERY,EMAIL_CHANGE}` must resolve to the **app** origin's `/auth/confirm` (008's draft points them at `/auth/v1/verify`, which would bypass this contract) |
| body | `GOTRUE_MAILER_TEMPLATES_{INVITE,CONFIRMATION,RECOVERY}` — URLs to the three HTML bodies above, served from the repo or the Caddy static root |
| subjects | `GOTRUE_MAILER_SUBJECTS_{INVITE,CONFIRMATION,RECOVERY}` |
