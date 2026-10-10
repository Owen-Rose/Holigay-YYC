# UAT deployment on a Holigay subdomain — design

**Date**: 2026-10-09
**Status**: Design agreed in brainstorm 2026-10-09; tracked as backlog item **BL-14** (no Speckit spec — a one-evening configuration change).
**Plan**: `docs/superpowers/plans/2026-10-09-uat-custom-domain-plan.md`.
**Related**: `specs/010-invite-only-uat/quickstart.md` (dev auth settings table and the D2 row this supersedes); `docs/backlog/2026-10-06-uat-and-go-live.md` (BL-14); the custom-domain work of spec 007 (T002/T003) that put production on `vendors.holigayeventsyyc.ca`.

## 1. Problem

The training deployment the organizers are onboarded on is a Vercel Preview of `dev` at
`uat-holigay-yyc.vercel.app`. Every invite, confirmation and reset email for the dev Supabase
project links to that host. It works, but the address says "vercel.app", not "Holigay", and it
is one more thing to explain during onboarding.

## 2. Decision

Serve the `dev` branch at **`training.holigayeventsyyc.ca`** as a Vercel *branch domain* on
the existing project. The deployment stays a Preview (`VERCEL_ENV=preview`), so the
invite-only flag, the lenient env rules and the dev Supabase project carry over unchanged.
No code changes. The vercel.app host keeps resolving; it is not retired.

Name chosen over `uat.` and `vendors-uat.` because non-technical organizers see it in emails
and it says what the site is for.

## 3. Alternatives rejected

| Option | Why not |
|---|---|
| Second Vercel project for UAT with its own Production domain | Its deploys would be `VERCEL_ENV=production`: prod env strictness, Resend and service-role keys required, keep-alive cron run twice. Needs env work to undo. |
| GoDaddy forwarding `training.` → the vercel.app host | Address bar and every emailed link still show vercel.app. |

## 4. What changes, where

| Surface | Change | How |
|---|---|---|
| GoDaddy DNS (`holigayeventsyyc.ca`, Owen's delegate access) | **Add** one CNAME `training` → the target Vercel shows for the project (`vendors` uses a `*.vercel-dns-017.com` form). Nothing else touched. | Chrome extension |
| Vercel project | Add domain `training.holigayeventsyyc.ca`, environment **Preview**, git branch **`dev`**. Vercel issues the certificate. | Chrome extension (no Vercel CLI on this machine) |
| Supabase **dev** project `kcokcufmzyckbodelqpb` auth config | `site_url` → `https://training.holigayeventsyyc.ca`; `uri_allow_list` keeps the vercel.app and git-`dev` origins and **adds** the new host. | Management API `PATCH …/config/auth`, CLI login token from the keyring (default-mode session) |
| Docs | CLAUDE.md "Production is live" paragraph; backlog BL-14 entry with evidence; 010 quickstart setting table / D2 note. Dated rehearsal and spec records keep the old host as history. | PR to `dev` |

Order: Vercel (add the domain, read the CNAME target it asks for) → GoDaddy CNAME → Vercel verify → Supabase → end-to-end check → docs. Vercel first because it shows the exact CNAME value only once the domain is added.

## 5. Acceptance

1. Logged-out `GET` of `/`, `/apply`, `/login` on `https://training.holigayeventsyyc.ca` → 200 over a valid certificate; `/signup` → 404 (invite-only still on).
2. Management API `GET …/config/auth` reads back the new `site_url` and an allow-list containing all three origins.
3. A `/forgot-password` request on the new host for the `+uat-org` account produces a mail whose link host is `training.holigayeventsyyc.ca`, and that link lands signed in on `/set-password`.
4. `vendors.holigayeventsyyc.ca` unchanged: `dig` for `vendors`, `send`, `rsend`, `resend._domainkey` returns what it did before.

## 6. Out of scope

Retiring the vercel.app alias; Deployment Protection (already off on both preview hosts,
verified 2026-10-09); any application code; the prod Supabase project; Resend.

## 7. Rollback

Delete the CNAME and the Vercel domain entry; `PATCH` the two auth fields back. The
vercel.app host never stops working, so there is no outage window in either direction.
