# Organizer UAT session — 2026-10-06

**Feature**: 007-production-readiness · **Story**: US4 · **Tasks**: T017 (the run, reframed by `docs/backlog/2026-10-06-uat-and-go-live.md` Phase 2), T018 (the fixes) · **Template**: `2026-09-23-solo-lifecycle.md` (T016)
**Shape**: `research.md` R10 · **Requirements**: FR-012, FR-013, FR-014 · **Gate**: SC-005

This file was copied from the 2026-09-23 solo template on 2026-10-06 for the organizer session
(backlog 007-T017, reframed). It is written in two passes: the copy carries everything except the
*observed*, *console errors* and *pass/fail* columns, so the expected results exist **before** the
run — that is what makes the session a test rather than a demo. T017 fills those columns during the run and adds
a finding for every deviation. T018 writes PR numbers into the findings table and updates the
observed column after each re-run.

## Environment

| Item | Value |
|---|---|
| Deployment | `https://uat-holigay-yyc.vercel.app` — the stable `dev` alias of the Vercel preview (the `holigay-yyc-git-dev-…` origin is the same build) |
| `dev` commit deployed | `d4986e9` when this file was prepared (2026-10-06); re-checked at run start and recorded in the run log |
| Database | Supabase **dev** project (`kcokcufmzyckbodelqpb`) |
| Sender in use | **Verified domain** — `Holigay Events YYC <noreply@holigayeventsyyc.ca>` via `EMAIL_FROM_ADDRESS` on Vercel Preview (T002/T003 closed 2026-09-20). Steps 3 and 7 are judged against the verified domain directly |
| Auth mail | Custom SMTP through Resend on dev (T013b, 2026-09-23). "Confirm email" is **ON** (2026-09-27) and **sign-up is OFF** — the training deployment is invite-only since spec 010 — so step 9 is not reachable here (see its row) |
| Organizer account | The maintainer's `+uat-org` account (the BL-06 rehearsal invite of 2026-10-06; `user_profiles.role = organizer`; lands on `/dashboard`). **Not** the admin — the organizer steps are run with the organizer nav |
| Vendor mailbox | The maintainer's own mailbox with plus-tags (addresses never written here — no vendor PII in the repo). Vendor one: `+uat-vendor`; vendor two (step 4b): `+uat-vendor2` |
| Test identity | Event **`UAT Dry Run — 2026-10-06`**, created in step 1 — the published sample "Holigay Winter Market 2026" is locked, so its builder cannot take step 1's edits and is left untouched; step 10 throwaway **`UAT Dry Run — 2026-10-06 — THROWAWAY`**; businesses **UAT Vendor One** / **UAT Vendor Two**; attachment: a small valid PDF generated for the run |
| Driver | Claude through the Chrome browser tools, the maintainer at the keyboard for every sign-in (so no password is ever handled by the driver) and reading the vendor mailbox. Sign-in sequence: organizer for steps 1–2 → signed out for 3–4 (`/apply` is public) → organizer for 5–8 → step 9 skipped → organizer for 10 |
| Console check | After every page used, the browser console is read for errors (warnings are noted but do not fail the step) |

## Severities (spec FR-012)

| Severity | Meaning |
|---|---|
| **blocker** | Fix before M4. Must be fixed and merged before `dev` is promoted to `main` (FR-014). |
| **tier3** | Fix in M3 if it is a single-session change; otherwise it becomes backlog. |
| **backlog** | Goes through the roadmap scope-line test (`docs/ROADMAP.md`); not fixed under this spec. |

A finding that would need a schema, RLS or auth change is never fixed under spec 007, whatever
its severity: it opens a new spec and the finding's decision column says "→ spec NNN".

## Pass criteria (spec SC-005)

- All eleven steps reached and every expected result observed (step 9 recorded `n/a` — see its row).
- Zero maintainer interventions outside the script (each one is logged and fails the run).
- Zero browser console errors on the pages used.
- The three emails (application received; approved; waitlisted with notes) delivered from the
  verified domain, in the inbox, within a minute.
- This file committed with a severity on every deviation; zero open blockers at promotion time.

## The eleven steps

Action and expected transcribe `spec.md` US4 acceptance scenarios 1–11, with the concrete rule
the code fixes added where it matters. Observed, console errors and pass/fail are filled by T017.

| Step | Action | Expected | Observed | Console errors | Pass/fail |
|---|---|---|---|---|---|
| 1 | Signed in as the organizer: `/dashboard/events/new` → create the event as a **Draft** (name from the test identity, date a few weeks out, a deadline on or before it). On `/dashboard/events/[id]` → **Seed from template** (pick the template offered). Add a **yes/no** question. Add a **short text** question with a show-if rule: shown only when the yes/no answer is Yes. Mark one question **Required**. Reorder with the move-up/move-down controls. Make sure one **file upload** question is present (add it if the seed did not include one — step 3 needs it). Save **once**. Hard-reload the page. | The event exists as a draft (the builder can only be written while `status = 'draft'` — migration 009 policies). After the reload every question is present exactly as saved: the seeded set, the yes/no, the branched short text with its show-if rule, the required flag, the file upload, and the new order. One save wrote everything (the atomic `save_event_questionnaire` RPC, migration 012). | | | |
| 2 | Still as the organizer: on `/dashboard/events` set the event's status to **Active**. Open `/dashboard/events/[id]` again. Open `/apply` signed out (or in a second tab). | The builder shows **Questionnaire locked** (the draft → active transition stamps `locked_at`) and no longer accepts edits. The `/apply` event picker lists the event and `/apply?event_id=…` renders the dynamic form with the saved questions. | | | |
| 3 | Signed out, on `/apply?event_id=…` as **Rehearsal Vendor One** (vendor-one mailbox): attach the PDF on the file-upload question, answer the yes/no **Yes** so the branched short-text question appears, leave the **required** question empty, submit. Then fill the required question and submit again. | First submit is blocked with a visible validation error on the required question and nothing is saved. Second submit shows the success state. The "application received" email arrives in the vendor-one mailbox within a minute, **From** `Holigay Events YYC <noreply@holigayeventsyyc.ca>`, in the inbox (not spam), with the event name in it. | | | |
| 4 | (a) Still signed out, submit again to the **same event** with the **same** vendor-one email but a **changed phone number**. (b) Then submit as **Rehearsal Vendor Two** (vendor-two mailbox) with **no** file attached, answering the yes/no **No** so the branched question stays hidden. | (a) Refused with exactly **"You have already submitted an application for this event"** (SQLSTATE `P0003` from `submit_public_application`); the vendor row is **unchanged** — the RPC's vendor upsert rolls back together with the rejected application (migration 011 §4, spec 006 FR-008), so the phone change is discarded (check on the application detail page in step 6). (b) Succeeds with the success state and a second "application received" email to the vendor-two mailbox. | | | |
| 5 | Signed in as the organizer: `/dashboard/applications`. Filter by the rehearsal event; filter by status **pending**; search for "Rehearsal Vendor"; clear the filters; press **Export CSV**. | Each filter narrows the table correctly (event filter → 2 rows; status pending → the same 2; search → the same 2; a search for a business that does not exist → 0). The CSV downloads and opens. It carries the legacy columns only — **no questionnaire answer columns** (expected; finding **F-001**). | | | |
| 6 | Open vendor one's application at `/dashboard/applications/[id]`. Read the answers. Click the attachment's download link. Check the vendor's phone number. | Every answer shows, including the yes/no **Yes** and the branched short-text answer. The attachment opens through a signed URL (valid 60 seconds, minted per click — a fresh click must not 404). The phone number is the one from step 3, not the one from step 4a. | | | |
| 7 | On the same page: type notes into **Organizer Notes** but do **not** save (the "Unsaved changes" marker shows); set the status to **Approved**. Then save the notes; set the status to **Waitlisted**. **Ask the organizer** whether unsaved notes being left out of the email is acceptable; record the answer verbatim under F-002. | The approved email arrives in the vendor-one mailbox from the verified domain **without** the notes (expected; finding **F-002** — unsaved notes are not in the email). The waitlisted email arrives from the verified domain **with** the saved notes. | | | |
| 8 | On the same page set the status back to **Pending**. | The status changes; **no** email is sent (by design — pending is not a notifying status). Mailbox checked after a minute: nothing new. | | | |
| 9 | Skipped on dev (decision 2026-10-06). | Not reachable on the invite-only host: sign-up is off since spec 010 and `/signup` answers 404. Self sign-up, the "check your email" copy and the `handle_new_user` vendor link are checked on prod under 010-T012. Pass/fail = `n/a`. | | | |
| 10 | Sign out; sign in as the organizer. On `/dashboard/events` set the rehearsal event to **Closed**, then try to delete it. Create a throwaway draft event (`UAT Dry Run — 2026-10-06 — THROWAWAY`) and delete it. **Ask the organizer** whether closed events need a reopen path; record the answer verbatim under F-003. | Closing succeeds and no transition back to active or draft is offered (transitions are forward-only; finding **F-003**). The closed event offers **no Delete control** at all — since UAT-6 (PR #46) the row hides Delete whenever `application_count > 0`, mirroring the server guard in `deleteEvent`, which still refuses with "Cannot delete this event because it has N applications" if called. The throwaway draft deletes and is gone from the list. | | | |
| 11 | Decide the cleanup. Commit this file. | The rows (event, 2 vendors, 2 applications, answers, 1 attachment) are **left in place** for T018's re-checks and cleared by **BL-07** (`docs/runbooks/reset-hosted-project.md`; keep-list = the admin, the `+uat-org` organizer and the sample event "Holigay Winter Market 2026"; the storage object through Storage, not SQL). This file is committed as `[007-T017]` with every deviation in the findings table. | | | |

## Findings

F-001 to F-004 are carried over from the 2026-09-23 template. T017 appends one row per deviation
(F-005 onward) and records the organizer's answers verbatim in the *decision* column of F-001,
F-002 and F-003. T018 fills the *fix PR* column.

| ID | Step | Severity | Description | Decision | Fix PR |
|---|---|---|---|---|---|
| F-001 | 5 | tier3 | The CSV export carries the legacy columns only; questionnaire answers (`application_answers`) are not exported. | Pending — pre-triaged as a single-session fix **if the organizers want it** (spec Edge Cases); ask at the M4 session unless the maintainer decides to fix it in M3. | |
| F-002 | 7 | backlog | Organizer notes that are typed but not saved are not included in the status email; only `organizer_notes` as stored is rendered. | M4 organizer judgement: warn on unsaved notes, auto-save before a status change, or accept the behaviour. | |
| F-003 | 10 | backlog | A closed event cannot be reopened — `VALID_TRANSITIONS` in `src/lib/actions/events.ts` is forward-only (`draft → active → closed`). | Roadmap scope-line test; likely backlog. | |
| F-004 | 9 | backlog | Nothing exchanges the `?code=` a confirmation link returns (`@supabase/ssr` PKCE, no auth callback route), so a confirmed visitor lands signed out; `/signup` already tells them to sign in afterwards. Not reachable on dev ("Confirm email" OFF). Recorded 2026-09-23 in `quickstart.md`. | Superseded: spec 009 shipped `/auth/confirm` and `/set-password`; self sign-up exists only on prod and is checked under 010-T012. Backlog. | |

## Interventions outside the script

Every action taken during the run that the step's action column did not call for. Empty is
the pass condition.

| Step | What was done and why |
|---|---|
| | |

## Run log

_Filled by T017: start/end time, who was at the keyboard, anything about the environment that
differed from the header, and the SHA re-check after the run._
