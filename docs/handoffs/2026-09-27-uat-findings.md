# UAT findings — dev preview, 2026-09-27

A full lifecycle run on the dev preview (`uat-holigay-yyc.vercel.app`) before inviting
a real organizer. It was driven through Claude-in-Chrome; Owen typed every password.
Steps: create an event → build the questionnaire (show-if plus a required file upload)
→ publish → apply signed out with a file → vendor sign-up → organizer review → note
→ approve → status email.

Result: every step worked except organizers opening uploaded files (fixed, below).
The open items here are what's left to decide or fix. Each fix is its own branch and PR
off `dev`, and starts only on Owen's go.

## Already done

| Item                                                                                                                      | Outcome                                                                                                                                                                                                                                 |
| ------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Settings sidebar link 404'd (`/dashboard/settings` has no page)                                                           | Removed, and `src/test/dashboard-layout.test.tsx` asserts every sidebar link has a page — PR #36, merged to `dev` (94e679d)                                                                                                             |
| **Blocker:** uploaded file answers 404'd for organizers and vendors — `AnswerRenderer` used the storage key as its `href` | `src/components/questionnaire/file-answer-link.tsx` makes a 60-second signed URL on click — PR #37, merged to `dev` (56317b3); on the PR preview the organizer opened the file. Vendor side uses the same component but wasn't clicked. |
| Dev Supabase had **Confirm email** off, so sign-up sent no email and logged the user straight in                          | Turned **on** in the dev dashboard (Authentication → Sign In / Providers), and still on after a reload. The confirm-signup template was already set by spec 009 (D5), and `/auth/confirm` sends `signup` to `/vendor-dashboard`.        |
| Stale dev event "PBJ"                                                                                                     | Deleted in the UI                                                                                                                                                                                                                       |

## Open items

### 1. Delete the three remaining stale dev events — _Owen, manual_

TEST, Beep boop and Test event are still on dev. All have 0 applications, so each row's
**Delete** → **Yes, delete** on `/dashboard/events` works. Claude's bulk delete was
blocked by auto mode.

### 2. Re-test sign-up now that Confirm email is on — _moved_

Moved to the production-only checklist below: dev no longer allows sign-up (spec 010).

### 3. Sign-up message ignores whether a session was returned — _moved_

Moved to the production-only checklist below.

### 4. Times render in UTC — _should-fix_

The vendor application page showed "Submitted Sep 27, 2026, 10:13 PM" for a 4:13 PM
Calgary submission. `formatDateTime` in `src/app/vendor-dashboard/applications/[id]/page.tsx`
(~line 33) runs `toLocaleDateString` on the server, which is UTC on Vercel. Pass
`timeZone: 'America/Edmonton'`, or format on the client. Check the organizer pages and
the CSV export for the same pattern.

### 5. Emails say "reply to this email" but come from `noreply@` — _should-fix_

Both `src/lib/email/templates/application-received.ts` (~lines 147, 180) and
`status-update.ts` (~lines 81, 252, 290, 330) invite replies. `sendEmail` in
`src/lib/email/client.ts` supports `replyTo` but no caller passes one. Either set a real
reply-to address (needs an organizer inbox and a new env var) or change the copy.

### 6. Status buttons swap under the cursor with no confirmation — _should-fix_

- `src/app/dashboard/applications/[id]/status-buttons.tsx`: after **Approve**, a
  **Pending** button takes its place under the cursor. A double-click approves then
  un-approves, and the vendor has already been emailed.
- `src/app/dashboard/events/event-status-actions.tsx`: **Publish** turns into **Close** in
  the same spot, so a double-click publishes then closes the event.

Options: a confirm step for status changes that send email or close an event, a short
disabled period after a change, or stable button positions.

### 7. Locked questionnaire hides show-if rules — _polish_

After publishing, the read-only view in `src/app/dashboard/events/[id]/questionnaire-builder.tsx`
lists each question's type and whether it's required, but not its show-if rule. "Special
Requirements" (shown only if Booth Preference = Outdoor) looks like it always appears.

### 8. Delete confirmation overlaps on narrow windows — _polish_

On `/dashboard/events` at about 930px wide, the "Yes, delete / Cancel" pair spills over the
Applications column.

### 9. Sign-up subtitle is organizer-flavoured — _moved_

Moved to the production-only checklist below.

### 10. Storage read policy is broader than needed — _note, pre-existing_

`attachments_authenticated_select` (migration `011`) lets **any** signed-in user read or
sign **any** object in the `attachments` bucket. That includes a vendor reading another
vendor's uploads, if they learn the key. PR #37 relies on the policy but didn't widen it.
It's a ROADMAP candidate: scope reads to organizers plus the owning vendor.

### 11. Application email casing — _should-fix_

`src/lib/validations/application.ts:120` keeps the case the applicant typed,
`handle_new_user` matches `vendors.email` exactly, and GoTrue stores addresses
lower-cased — so an applicant who typed capitals is never linked to their account (self
sign-up or invite). Options: `.trim().toLowerCase()` on the public form email, or a
migration `014` matching `lower(email)`. Proven by the documenting case in
`src/test/security/invite-flow.test.ts` (spec 010 research R8).

## Production-only checklist (spec 010)

Since spec 010 the training deployment is invite-only (dev sign-up off), so self sign-up
exists only on production. Items 2, 3 and 9 are checked there, during spec 010's T011/T012 —
evidence rows P1–P3 in `specs/010-invite-only-uat/quickstart.md`, **owed** at the time of
writing (prod was out of scope for the 2026-09-27 session).

- **Item 2 — re-test sign-up.** Read prod's "Confirm email" (`mailer_autoconfirm`, P1), then
  sign up a throwaway on `vendors.holigayeventsyyc.ca`: mail from
  `noreply@holigayeventsyyc.ca`, link lands signed in on `/vendor-dashboard` (P3). The dev
  half is moot: dev's Site URL is now the `uat-` host and dev refuses sign-up.
- **Item 3 — sign-up message vs. session.** `signUp` still discards `authData`; record in P3
  whether the "check your email" copy matched what happened given P1's setting. Fix in its
  own PR.
- **Item 9 — sign-up subtitle.** `src/app/(auth)/signup/page.tsx` still says "Sign up to
  manage vendor applications"; record it in P3 and fix in its own PR.

Item 1 (three stale dev events) is still open as of 2026-09-27.

## UAT data left on dev

- Event **UAT Market 2026** (`34dd5881-1a60-4df3-9068-0da57db8d663`), active, locked
  questionnaire (4 questions, one show-if, one required file upload).
- Application `2b703c47-1a4f-451e-8d60-742537445195` from **UAT Candle Co** /
  `owenconnorrose+uat@gmail.com`, **Approved**, with note. Its `uat-product.png`
  (`uploads/1790547229133-j5uak4-uat-product.png`) was deleted from the bucket 2026-09-28
  during spec 010's T013 cleanup, so its file link now fails — re-upload a file at that
  path, or submit a fresh sample application.
- Auth user `owenconnorrose+uat@gmail.com` (vendor). It was created while Confirm email
  was off, so it's already confirmed.

Kept on purpose as sample data. Delete the event (cascades), the vendor row, the auth user
and the bucket object when no longer wanted.
