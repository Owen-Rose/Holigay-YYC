# UAT findings — vendor side, training deployment, October 2026

The organizers tested the vendor side of `training.holigayeventsyyc.ca` (the `dev` branch) on
2026-10-11 and sent their notes. Owen and the agent triaged them on 2026-10-31 against `dev` at
`b452675`. This is the record: the notes as received, what the code does today, the decisions,
the work items and their order. Each item is its own branch and PR off `dev` and starts only on
Owen's go (constitution workflow; backlog Phase 5 in `docs/backlog/2026-10-06-uat-and-go-live.md`).

No tester addresses appear here; people are named by role.

## The notes, as received

> **Vendor Side — Application section**
>
> - We don't need or want people's phone numbers XP
> - Can website header say something like "where can we view your products? Website, Instagram
>   LINK, Facebook LINK"
> - Can we have more than one input for the above? Make the first one mandatory, and the second
>   (third?) optional
> - Booth preferences: tables ARE PROVIDED for each option, and are approximately 6' long and 2'
>   wide each; two chairs are provided for each single space — this info in the booth preference
>   header
>   - Single space in central area (approximately 6'x6', one table is provided)
>   - Single space on the wall (approximately 6'x6', one table is provided, access to power)
>   - Double space in central area (approximately 12'x6', two tables are provided)
>   - Double space on the wall (approximately 12'x6', two tables are provided, access to power)
>   - Corner space {LOTTERY} (approximately 10'x10', up to three tables are provided, access to
>     power)
> - Checkbox? Note? for underneath booth selection: "Since there are only three corner spots
>   available for each event, they will be assigned on a lottery draw basis if we have more than
>   three applications for these spots. If you are not chosen via the lottery for a corner, we
>   will change your application to a double space on the wall"
> - I know it's not live yet, but when I did a trial application I got a confirmation email. But
>   when I went back into the vendor side to create a profile, my application was not listed
>   there?
> - Automatic email that vendors receive: we will want to change the wording but I figure that's
>   easy enough. Footer is "Yours in Holigay Cheer, Lauren, Sandy, Tony, and Beans".
>   "© 2026 Holigay Vendor Market. All rights reserved." → change to "© 2026 Holigay Events YYC.
>   Don't steal, that's not cool."

## Findings and decisions

IDs are `UAT2-n` (second UAT round). Decisions are Owen's, 2026-10-31, unless marked otherwise.

### UAT2-1 — Remove the phone field — _spec 011, story 2_

**Today.** Phone is a fixed, optional column on `vendors`, not a questionnaire question. It is
asked on the dynamic apply form and the vendor profile form, shown on the organizer's
application page, and exported in the CSV. The legacy fixed form asks for it too.

**Decision.** Remove the input and the display from all four places. Keep the nullable column
for now (no migration just for this; nothing writes it once the inputs are gone). The builder's
`phone` question type stays, so an organizer can still ask for a number on a specific event.

### UAT2-2 — "Where can we view your products?" with up to three links — _spec 011, story 2_

**Today.** One optional `Website` field, validated by a URL regex that accepts addresses without
a protocol, stored in `vendors.website`. The organizer page renders it as `href={website}`, so
`instagram.com/shop` saved without `https://` becomes a broken relative link.

**Decision.** Option A: one heading, "Where can we view your products? Website, Instagram,
Facebook…", above three plain inputs — Link 1 required, Link 2 and Link 3 optional. Not three
labelled boxes: a vendor whose shop is on Etsy or TikTok should not have to pick a wrong box.
The organizers give feedback on the shape once it is on the training site. Links are normalized
on save (prepend `https://` when the protocol is missing) so every stored value is a working
URL. The organizer page lists them as links; the export gets Link 1–3 columns. Existing
`website` values become Link 1. The vendor profile form edits the same three slots.

### UAT2-3 — Booth preference options and header text — _PR_

**Today.** Not a fixed field. "Booth Preference" is the first of the three default questions
seeded into every new event's questionnaire from `src/lib/questionnaire/default-questions.ts`
(single select: Indoor / Outdoor / No Preference, required). Organizers can edit it per event
in the builder, but every new event starts from that default.

**Decision.** Change the default seed. New options, in this order:

| key              | label                                                                                           |
| ---------------- | ----------------------------------------------------------------------------------------------- |
| `single_central` | Single space in central area (approximately 6'x6', one table is provided)                       |
| `single_wall`    | Single space on the wall (approximately 6'x6', one table is provided, access to power)          |
| `double_central` | Double space in central area (approximately 12'x6', two tables are provided)                    |
| `double_wall`    | Double space on the wall (approximately 12'x6', two tables are provided, access to power)       |
| `corner`         | Corner space, lottery (approximately 10'x10', up to three tables are provided, access to power) |

Help text on the question (the "header" in the notes; the column allows 500 characters):

> Tables are provided for every option and are approximately 6' long by 2' wide. Two chairs are
> provided for each single space. Only three corner spaces are available per event; if more than
> three vendors ask for one, corners are assigned by lottery draw, and anyone not drawn is moved
> to a double space on the wall.

Bundled polish: render single-select questions with up to six options as radio buttons instead
of a dropdown, so the long labels read on a phone. (The dropdown stays for longer lists.)

**Caveats.** A published questionnaire is locked, so the active event on the training site
keeps the old options; someone creates a fresh event to see the new default. Organizers can
also save the new questionnaire as a template from the builder; prod has no templates yet
(BL-08 observation).

### UAT2-4 — Lottery note and acknowledgement — _same PR as UAT2-3_

**Decision.** Both. The note is in the help text above. In addition, a required yes/no question
appears only when `corner` is chosen (the builder's existing show-if rule), label:

> I understand that corner spaces are assigned by lottery, and that if my name isn't drawn my
> application will be changed to a double space on the wall.

The builder has no checkbox-acknowledgement type; yes/no is the closest, and a "No" answer is
visible to the organizer on the application page, which is useful rather than a problem.

### UAT2-5 — Trial application not listed in the vendor dashboard — _spec 011, story 1_

**Today.** An account is linked to a vendor row exactly once, in the `handle_new_user` trigger
when the auth user is created, by exact email match. `submit_public_application` deliberately
never writes `vendors.user_id`. So two orderings fail silently: the account exists before the
application is submitted, or the application uses a different address than the account. The
vendor then sees "No applications yet" and "No vendor profile linked".

**Investigation (2026-10-31, read-only Management API inventory of the dev project).** The
tester holds two training accounts, both created by invite at 19:39 UTC on 2026-10-11: an
organizer account on their main address and a vendor account on a `+vendor` alias of it. At
20:09 they submitted the trial application with the **main** address. The vendor row was
created under that address, `user_id` null; it matches the organizer account's email, not the
vendor account's. Gmail delivers the alias to the same inbox, so the confirmation mail arrived
and it looked like one identity. Both failure modes at once: account first, and a different
address. A fix that only re-links on matching email would not have saved this case.

**Decision.** Fix in spec 011, story 1:

1. **Self-heal on match.** When a signed-in vendor's profile has no `vendor_id`, link it to the
   `vendors` row whose email equals the account's (lower-cased), and set `vendors.user_id`.
   One `SECURITY DEFINER` RPC, called from the vendor dashboard loaders.
2. **Link at submit.** When `submit_public_application` runs for a signed-in user whose account
   email matches the application email, set `vendors.user_id` and `user_profiles.vendor_id` in
   the same transaction.
3. **Prefill and lock the email on `/apply`** when the applicant is signed in, so the address
   cannot drift from the account.
4. **Say so on the empty dashboard.** "Applications are matched to the email address they were
   submitted with. You are signed in as …" with the account address.

Not doing: letting a vendor claim an application by ID (anyone could claim anyone's).

**For the tester's own case** the vendor-alias account still will not match after the fix,
because the addresses differ. They re-apply signed in as the vendor account (the email is then
prefilled), or Owen points the existing vendor row at the alias in SQL. The misfiled row stays
on dev as the reproduction case until then.

### UAT2-6 — Email body wording — _PR, once the copy settles_

**Today.** Two templates in `src/lib/email/templates/`: application received, and status update
with four variants (approved, waitlisted, not selected, pending). Each has an HTML and a plain
text body. The copy is generic ("Thank You for Your Application!", "Best regards, The Holigay
Vendor Market Team").

**Decision.** The agent drafts the bodies in the organizers' voice (below); Owen takes the draft
to the organizers for feedback and their own wording; the PR lands when the copy is settled.
The auth emails (confirm sign-up, invite, password reset) live in the Supabase dashboard on
each project, not in the repo; if the organizers want the same voice there, that is a manual
change on dev and prod (009 `contracts/email-templates.md` is the current text).

### UAT2-7 — Sign-off and footers — _PR_

**Today.** "Best regards, The Holigay Vendor Market Team" in both templates (HTML and text);
"© {year} Holigay Vendor Market. All rights reserved." in the shared wrapper
(`src/lib/email/client.ts`) and, identically, in the public site footer
(`src/app/(public)/layout.tsx`).

**Decision.** Sign-off becomes "Yours in Holigay Cheer, Lauren, Sandy, Tony, and Beans"; the
footer line becomes "© {year} Holigay Events YYC. Don't steal, that's not cool." in the email
wrapper **and** the public site footer. Both strings live in one constants module
(`src/lib/constants/brand.ts` or alongside `src/lib/constants/email.ts`) so the next wording
change is a one-line edit. Unit tests assert the templates carry the constants.

## Also decided

- **Retire the legacy fixed form** inside spec 011 (story 3; ROADMAP Tier 4 item pulled
  forward). No event on either host can reach it — every event since spec 005 has a
  questionnaire — and while it exists every contact-block change is made twice. Goes with it:
  `vendor-application-form.tsx`, the `ApplicationPageClient` branch of `/apply`, the legacy
  `submitApplication` action and its schema, the `legacy` branch of the submit RPC, and the three
  always-blank legacy columns in the CSV export (the rest of F-001, answers in the export, stays
  deferred).
- **CRM for emails** (Owen's side note) — deferred until the organizers say what they want to
  do. Tiers, cheapest first: an in-app log of every email sent per application; organizer-edited
  templates plus "email all approved vendors for this event"; a third-party CRM sync (one API call
  per vendor, but a second copy of vendor data outside Supabase, and anything beyond transactional
  mail needs consent under Canada's anti-spam law). Listed under Deferred in the backlog.

## Work items and order

| Order | ID                             | Item                                                                                 | Shape         | Owner                | Blocked by         |
| ----- | ------------------------------ | ------------------------------------------------------------------------------------ | ------------- | -------------------- | ------------------ |
| 1     | BL-15                          | This record + backlog Phase 5                                                        | docs PR       | agent                | —                  |
| 2     | UAT2-7                         | Sign-off and footers via constants                                                   | PR            | agent                | —                  |
| 3     | UAT2-3 + UAT2-4                | New default booth question, help text, conditional acknowledgement, radio rendering  | PR            | agent                | —                  |
| 4     | UAT2-6                         | Email body copy: draft → organizers → PR                                             | copy, then PR | joint                | organizer feedback |
| 5     | BL-16                          | Spec 011 written: `spec.md`, `plan.md`, `tasks.md`                                   | docs PR       | agent                | —                  |
| 6     | UAT2-5, UAT2-1, UAT2-2, legacy | Spec 011 tasks, one PR each; migration `015` on dev, training walkthrough, then prod | PRs + SQL     | agent; Owen for prod | BL-16              |
| 7     | BL-17                          | `dev` → `main` promotion, prod smoke, new event on prod shows the new default        | promotion     | joint                | all above          |

Items 2, 3 and 5 are independent and can run in parallel. The organizers can review items 2
and 3 on the training site as soon as each merges, and item 4's draft on paper, before spec 011
lands.

## Spec 011 outline

Working title `011-vendor-linking-and-contact-fields`. Written as a Speckit spec (BL-16), then
tasked.

- **Story 1 (P1)** — a vendor sees their applications regardless of whether the account or the
  application came first: self-heal RPC, link-at-submit, prefilled locked email, empty-state copy
  (UAT2-5).
- **Story 2 (P2)** — the contact block asks for what the organizers want: no phone, three product
  links with the first required, normalized URLs, same slots on the profile form, organizer page
  and export (UAT2-1, UAT2-2).
- **Story 3 (P3)** — one apply form: the legacy fixed form and its action, schema, RPC branch and
  export columns are removed.
- **Migration `015`** (`014` was taken by UAT2-3+4: the seed RPC learns `id` and `show_if`) — storage for the links (shape decided in `plan.md`: `text[]` with a 1–3
  check, or three columns; `website` migrated into slot 1), a replacement
  `submit_public_application` (new column list, link-at-submit, `legacy` branch dropped), the
  self-heal RPC. Security suite: `submission-rpc.test.ts`, `invite-flow.test.ts` and a new
  linking suite covering both orderings and the mixed-address case.
- **Rollout** — migration to dev, walkthrough on the training site (apply signed in; apply
  signed out then invite; invite then apply), migration to prod, promotion, smoke.

## Draft email copy for organizer review (UAT2-6)

Placeholders in braces are filled by the app. The sign-off and footer come from UAT2-7. The
"this mailbox is not monitored" line stays until there is an organizer inbox to reply to
(UAT-5 decision).

**Application received** — subject: `We got your application for {event}!`

> Hi {contact name},
>
> Thanks for applying to bring {business name} to {event} on {date}! Your application is in and
> we're excited to look it over.
>
> Here's what happens next: we review every application after the call closes, and you'll hear
> from us by email as soon as there's news. If you're in, that email will have your booth details
> and set-up info.
>
> Your reference number is {reference}. If you have questions in the meantime, reach the Holigay
> Events YYC team directly; this mailbox isn't monitored.
>
> Yours in Holigay Cheer,
> Lauren, Sandy, Tony, and Beans

**Approved** — subject: `You're in! {event}`

> Hi {contact name},
>
> Great news: {business name} has a spot at {event} on {date}! We can't wait to have you.
>
> Next steps: mark the date, watch for a follow-up email with your booth assignment and set-up
> times, and start getting your display ready. {organizer note, if any}
>
> Questions? Reach the Holigay Events YYC team directly; this mailbox isn't monitored.
>
> Yours in Holigay Cheer,
> Lauren, Sandy, Tony, and Beans

**Waitlisted** — subject: `You're on the waitlist for {event}`

> Hi {contact name},
>
> We loved your application for {event}, and we've run out of spots, so {business name} is on
> our waitlist. If a space opens up we'll email you right away, and we'll let you know either way
> before the event. {organizer note, if any}
>
> Yours in Holigay Cheer,
> Lauren, Sandy, Tony, and Beans

**Not selected** — subject: `About your application for {event}`

> Hi {contact name},
>
> Thank you for applying to {event}. We had far more wonderful applications than spots this
> time, and we weren't able to offer {business name} a table. {organizer note, if any}
>
> Please apply again; every market has a different mix and we'd love to see you at a future one.
>
> Yours in Holigay Cheer,
> Lauren, Sandy, Tony, and Beans

## Training data left on dev (as of 2026-10-31)

One active event created 2026-10-11 by an organizer; one vendor row and one pending application
under that organizer's main address (the UAT2-5 reproduction case); accounts: Owen's admin, the
`+uat-org` organizer from BL-06, two real organizers invited 2026-10-11, and a `+vendor` alias
account for each of them. Nothing was changed by the triage. BL-12's training half is therefore
done in practice; prod was not checked.
