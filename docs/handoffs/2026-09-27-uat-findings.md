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

### 2. Re-test sign-up now that Confirm email is on — _should-do before the invite_

No real sign-up has run since the setting changed. Sign up with a fresh `+uat2` address,
check that the mail arrives from `noreply@holigayeventsyyc.ca`, and that the link lands
signed in on `/vendor-dashboard`.

- Expect the link on the dev **Site URL** host (`holigay-yyc-git-dev-owen-roses-projects.vercel.app`),
  not `uat-holigay-yyc.vercel.app`. Same `dev` build, different origin, so the vendor
  ends up signed in on the git-dev host. Decide whether the Site URL should become the
  `uat-` alias.
- **Prod's Confirm email setting was not checked.** Read it before prod gets real vendors.

### 3. Sign-up message ignores whether a session was returned — _should-fix_

`src/lib/actions/auth.ts` `signUp` (~line 120) discards `authData` (that's one of the two
standing lint warnings). `src/app/(auth)/signup/page.tsx` always shows "Account created!
Check your email for a confirmation link". With dev now confirming, the copy is right there (prod
unverified — see item 2). It lies wherever confirmation is off: have
`signUp` return whether `authData.session` exists, then redirect or show the right message.

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

### 9. Sign-up subtitle is organizer-flavoured — _polish_

`src/app/(auth)/signup/page.tsx:38` says "Sign up to manage vendor applications". Sign-up
creates **vendor** accounts (organizers are invited), so it should speak to vendors.

### 10. Storage read policy is broader than needed — _note, pre-existing_

`attachments_authenticated_select` (migration `011`) lets **any** signed-in user read or
sign **any** object in the `attachments` bucket. That includes a vendor reading another
vendor's uploads, if they learn the key. PR #37 relies on the policy but didn't widen it.
It's a ROADMAP candidate: scope reads to organizers plus the owning vendor.

## UAT data left on dev

- Event **UAT Market 2026** (`34dd5881-1a60-4df3-9068-0da57db8d663`), active, locked
  questionnaire (4 questions, one show-if, one required file upload).
- Application `2b703c47-1a4f-451e-8d60-742537445195` from **UAT Candle Co** /
  `owenconnorrose+uat@gmail.com`, **Approved**, with note, and `uat-product.png` in the bucket.
- Auth user `owenconnorrose+uat@gmail.com` (vendor). It was created while Confirm email
  was off, so it's already confirmed.

Kept on purpose as sample data. Delete the event (cascades), the vendor row, the auth user
and the bucket object when no longer wanted.
