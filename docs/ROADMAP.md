# Roadmap

**Created:** 2026-07-08, from the full architecture review (see [ARCHITECTURE.md](./ARCHITECTURE.md)).
Supersedes [cleanup-roadmap.md](./cleanup-roadmap.md) (all five of its workstreams shipped
2026-04-21 → 2026-04-25; its leftover "opportunistic" items are folded into Tier 3 below).

**Update (2026-08-22):** Tier 1 shipped as **spec 006** — see the marked-up section below.
Tier 2 item 2 and part of item 4 came with it, as did Tier 3's RLS-integration-test item.
The rest of the document stands as written.

**Review verdict, for the record:** the foundation is solid — lean dependency set, strict
TS with zero suppressions, one consistent mutation pattern, behavioral tests, portable
schema. Nothing here calls for a rewrite or a stack change. The work below is ordered by
what actually threatens the app: a real data-exposure hole first, then finishing the
in-flight feature safely, then paying down consistency debt.

---

## Current state

| Area | Status |
|---|---|
| RBAC (DB + app), vendor dashboard, event management | ✅ Complete (Epics 1–3, 5; specs 001/002/004 merged) |
| Brand re-skin | ✅ Mostly (6.9 file previews, 6.10 mobile polish outstanding) |
| Organizer invites (Epic 4) | UI only — backend stub awaits a service-role client |
| **Public data exposure (spec 006)** | ✅ **Closed and shipped to `dev`** (PR #7, 2026-08-22). Migration 011 applied to the dev Supabase project and the posture verified live; CI security gate green. **Prod rollout still outstanding.** |
| **Dynamic questionnaires (spec 005)** | **Shipped to `dev`** with 006. Required-answer semantics fixed by 006/US3; two defects still open (builder atomicity, `seeded_from_template_id`); T050 manual walkthrough still not done |
| Deployment | Vercel + dev/prod Supabase; deployed but barely used — low migration risk, real freedom to restructure |

---

## Tier 1 — Close the public data exposure ✅ SHIPPED (spec 006, 2026-08-22)

> **Resolved by [`specs/006-close-public-data-exposure/`](../specs/006-close-public-data-exposure/),
> migration `011_close_public_data_exposure.sql`.** The analysis below is kept as the record of
> *why* — see "What actually landed" at the end of the section for the mapping. Acceptance is no
> longer a manual check: it is asserted on every PR by `src/test/security/` (five suites against a
> real Supabase stack), and was re-verified by hand against the local stack on 2026-08-22.

The app shipped its Supabase URL + anon key to every browser (by design), and RLS granted
the `anon` role blanket reads. Anyone could dump these tables via PostgREST directly, no
app involved:

- `vendors` — `anon_select_vendors USING (true)`: business names, contact names,
  **emails, phones** (`005_rbac_rls_policies.sql:89`)
- `applications` — `anon_select_applications USING (true)`: includes
  **`organizer_notes`** — internal notes about vendors (`005_rbac_rls_policies.sql:137`)
- `attachments` — `anon_select_attachments USING (true)` (`005_rbac_rls_policies.sql:190`)

These policies existed to serve the public `/apply` form (duplicate checks, vendor
lookup-by-email). But the form logic runs **server-side** in server actions — it never
needed anonymous *browser-grade* access; it needed a privileged server path.

Two related silent-failure bugs shared the same root cause (anon writes that RLS filters
to zero rows *without erroring*):

- Repeat applicants' updated contact info is silently discarded — there is no anon
  UPDATE policy on `vendors`, so the update in `answers.ts:186` and
  `applications.ts:169` no-ops.
- The failure-rollback in `answers.ts:269` (`applications.delete()`) no-ops for anon —
  a failed answers-insert strands an orphaned application row.

### The fix (effort: M — one migration + one action-file refactor)

1. **Move public submission into a `SECURITY DEFINER` RPC** —
   `submit_public_application(jsonb)` doing vendor upsert → duplicate check →
   application insert → answers bulk-insert **in one transaction**. This follows the
   existing pattern (`create_event_with_default_questionnaire`), fixes both silent-write
   bugs *and* the orphaned-row bug atomically, and keeps the anon key (no service-role
   key in the request path). App-layer Zod validation and show-if re-evaluation in
   `answers.ts` stay exactly where they are — the RPC replaces only the write sequence.
   Do the same for the legacy `submitApplication` path (or fold both into one RPC with
   a nullable answers argument).
2. **Drop every broad anon policy** in a new migration: `anon_select_vendors`,
   `anon_select_applications`, `anon_select_attachments`, `anon_insert_vendors`,
   `anon_insert_applications`, `anon_insert_attachments`, and the two
   `application_answers` anon policies. Keep `anon_select_active_events` and the
   questionnaire SELECT policies (questions are meant to be public).
3. **Add an ownership check to `deleteFile`** (`upload.ts:153`) — it's a publicly
   invocable server action that deletes any storage path; today only dashboard-managed
   storage policies stand in the way. Gate it (organizer role, or path ownership) in
   app code.
4. **Put storage bucket policies into a migration** (SQL on `storage.objects`) so the
   bucket's access rules are version-controlled instead of dashboard-only
   (`002_rls_policies.sql:184` documents the current manual setup).

Acceptance: PostgREST requests with the anon key against `vendors`/`applications`/
`attachments` return zero rows; public submission still works end-to-end (new vendor,
repeat vendor with changed contact info, with/without files); a forced answers-insert
failure leaves no orphaned application.

### What actually landed

| Planned | Shipped |
|---|---|
| 1. Submission RPC | `submit_public_application(jsonb)` — one `SECURITY DEFINER` function serving **both** form variants via a nullable answers argument, as the plan's parenthetical suggested. Signals failures as ERRCODEs (`P0001`–`P0004`) mapped to user copy by `src/lib/submission/errors.ts`. Zod validation and show-if re-evaluation stayed in the actions, unchanged. |
| 2. Drop broad anon policies | All seven dropped. `anon_select_active_events`, `anon_select_event_questionnaires`, `anon_select_event_questions` kept. Also **revoked** `anon` EXECUTE on `create_event_with_default_questionnaire` and `ensure_event_questionnaire` — an exposure the review missed: both were anon-invocable. |
| 3. Gate `deleteFile` | **Deleted instead of gated.** Nothing in the app called it; `src/app/test-upload/` went with it. No delete capability is better than a guarded one. |
| 4. Storage policies in SQL | Migration 011 §4 creates the `attachments` bucket (`public = false`) and exactly three policies: `attachments_anon_insert`, `attachments_authenticated_select`, `attachments_authenticated_delete`. |
| — (not planned) | A `security` Vitest project — `src/test/security/`, five suites against a live local stack — plus a parallel `security-tests` CI job that cannot silently skip (`CI_REQUIRE_SECURITY_TESTS=1`). This is Tier 3's RLS-integration-test item, pulled forward. |

Both silent-write bugs and the orphaned-row bug are fixed by construction: the RPC runs as
definer inside one transaction, so the vendor upsert applies and any failure rolls the whole
submission back.

---

## Tier 2 — Ship spec 005 safely

The feature is close. Known defects, in priority order:

1. **Make the builder save atomic** (effort: M). `questionnaire-builder.tsx:147-224`
   currently fires one server action per deleted/updated/added question plus a reorder,
   sequentially — a mid-batch failure strands half-saved state, and updates running
   before the reorder can transiently violate show-if position validation (the likely
   "some bugs to work out"). Replace with one `saveQuestionnaire(eventId, questions[])`
   action validated by **`questionnaireInputSchema`** — already written for exactly this
   at `validations/questionnaire.ts:153` and currently dead code — backed by a
   `SECURITY DEFINER` RPC (delete-missing / upsert / set positions in one transaction).
   This also collapses ~4 per-question actions in `questionnaires.ts` into one.
2. ~~**Fix required-answer semantics**~~ ✅ **Shipped by spec 006 / US3.**
   `isAnswerEmpty(answer)` in `src/lib/questionnaire/answer-coercion.ts` decides emptiness
   per answer kind and is applied on both sides — server in `answers.ts`, client in
   `dynamic-application-form.tsx`. Empty *optional* answers are now skipped rather than
   stored as empty-value rows.
3. **Decide `seeded_from_template_id`** (effort: S). The write at `templates.ts:425`
   always no-ops (no UPDATE policy on `event_questionnaires` — known, commented). Either
   set it inside the seed RPC/transaction, or delete the column. Don't keep a field
   that's never populated.
4. **Finish the branch** (effort: S): run the T050 manual walkthrough from
   `specs/005-dynamic-questionnaires/` (especially the legacy-event upgrade path — the
   least-exercised code). The `events/new` redirect tweak and the removal of
   `src/app/test-upload/` both landed with spec 006.

---

## Tier 3 — Foundation hardening (do opportunistically, not as a big-bang)

Fold these into whichever PRs touch the relevant files; none justifies a dedicated
rewrite session.

- **Shared `ActionResponse<T>`** in `src/lib/actions/types.ts`; migrate files as you
  touch them. Kills the three-coexisting-shapes drift and per-file response types.
- **`requireVendor()` helper** next to `requireRole()` — replaces the ownership-scoping
  block copy-pasted 5× in `vendor-dashboard.ts`/`vendors.ts`.
- **Read-auth consistency**: add `requireRole('organizer')` to organizer-facing reads in
  `applications.ts`/`events.ts` (as `templates.ts` already does). RLS remains the
  authority; this restores the two-layer convention and makes intent legible.
- **Env validation module** (`src/lib/env.ts`, Zod-parsed at import) replacing scattered
  `process.env.X!`.
- **Split `applications.ts`** (1,037 lines) into submit / queries / status-mutations
  when next doing surgery there.
- ~~**RLS integration tests**~~ ✅ **Shipped by spec 006** — `src/test/security/` is a
  separate Vitest project (node env, serial) running against a real local stack, with
  `src/test/security/harness.ts` seeding and tearing down its own fixtures. It covers anon
  reads/writes, storage, the submission RPC's failure modes, and organizer dashboard reads.
  It self-skips when the stack is down and is forced on in CI via
  `CI_REQUIRE_SECURITY_TESTS=1`. Cross-vendor isolation and lock-on-publish are the
  natural next suites to add.
- Leftovers absorbed from cleanup-roadmap.md: `as Role` cast in `admin.ts:103`;
  attachment orphaning on failed legacy submits (largely mooted by the Tier 1 RPC);
  tests for `admin.ts` role changes and `updateEventStatus`.

---

## Tier 4 — When there's appetite

- **Epic 4 backend** (organizer invites): needs the service-role client the app
  deliberately doesn't have yet. Contain it in `src/lib/supabase/admin.ts`, used only by
  `team.ts`.
- **Retire the legacy form**: once existing events are upgraded
  (`ensure_event_questionnaire`), delete the static form path (`apply/client.tsx`,
  `vendor-application-form.tsx`, the legacy half of `applications.ts`) — several hundred
  lines and a whole code path gone.
- **Role in JWT claims or session cookie** — drops the per-request `user_profiles` query
  in middleware (fine at current scale; do it for cleanliness, not perf).
- **Email via `after()`** (Next 16) — moves the awaited Resend call out of the
  submit-request latency path. Keep the best-effort + `warning` pattern.
- **Structured logging** — `console.error` is the only error signal today; even a tiny
  `log()` wrapper with levels beats grepping Vercel logs. An error tracker (Sentry) is
  optional at this scale.
- Epic 6.9 (file previews) / 6.10 (mobile polish); shared icon module to deduplicate
  inline SVGs across layouts.
- **Supabase free-tier pause guard**: seasonal usage means projects will sit idle > 1
  week and get paused. A weekly keep-alive ping (or a paid tier) prevents "the site is
  down" on event week.

---

## Explicitly not recommended

- **Migrating off Supabase / self-hosting.** The schema is portable; the auth+RLS layer
  is the only real lock-in, and rebuilding it buys nothing for a free single-tenant tool
  (full tradeoff map: ARCHITECTURE.md §8). Keep the seams clean instead.
- **Replacing Resend or restructuring email.** It's the cleanest seam in the codebase —
  one file, three call sites, provider-agnostic templates. Change providers in an
  afternoon if ever needed.
- **A data-access layer as a project.** A DAL would help a future DB migration, but
  building one now is speculative work. The shared-`ActionResponse`/helper items in
  Tier 3 capture most of the value at a fraction of the cost.
- **Extending the form builder** — see below.

---

## The form builder: stabilize and freeze

Context: the builder replicates Google Forms because that's where the organizers came
from. The review's honest read — it was **over-scoped for the actual usage** (one form,
reused across events, with occasional tweaks; the feature is ~a fifth of the app's
source), but it is built, spec'd, and well-tested, and ripping it out would discard
working code *and* the flexibility that motivated leaving Google Forms. So: finish it
(Tier 2), then **freeze its scope**.

**The scope line** (where organizer freedom ends and "ask Owen" begins):

| Organizers self-serve | Goes through you |
|---|---|
| Question text, help text, required flags | New question *types* |
| Add/remove/reorder questions | Richer branching (multi-rule, other operators) |
| Choice options | Layout/sections/pages |
| Simple show-if (equals, as shipped) | Anything touching review/export behavior |
| Seeding from + saving to templates | Template *governance* changes |

Rationale: the 11 question types + equals-only show-if already cover a Google-Forms-
equivalent surface. Every extension multiplies builder UI, renderer, validation, and
answer-review code simultaneously (four surfaces per feature). With two organizers and
one reused form, a requested change is a conversation — the marginal value of more
self-serve power is near zero, and the marginal cost is the highest in the codebase.
Revisit only if the organizers themselves hit the wall repeatedly.

---

## Working the roadmap — process and path to production

### The framework decision (2026-07-08)

Keep the framework that already exists: **spec-kit for planning across sessions, the
constitution as the quality gate, superpowers skills as in-session execution
discipline.** They operate at different altitudes and compose; none replaces another.
Don't adopt anything new — tune ceremony to work size.

**When to open a spec vs. just branch** (matches the precedent set in
cleanup-roadmap.md, where WS2 was a single PR and WS3/schema work was a spec):

| Open a `specs/<nnn>-*` spec | Branch + PR, no spec |
|---|---|
| Touches schema, RLS, or auth | Contained fix with clear acceptance criteria |
| Multi-session scope or >1 user story | Single-session change |
| Real design uncertainty to record | Pattern already established, just applying it |

**Per-session workflow** (inside either path):

1. New-feature ideas start with a brainstorming pass — its output *becomes* `spec.md`.
   Don't double-plan: the spec's `plan.md`/`tasks.md` **is** the implementation plan;
   execution skills consume it rather than producing a second one.
2. Implement test-first where behavior is testable and consequential: server actions,
   RPCs, validation logic, questionnaire logic. (Constitution Principle II already
   requires tests *with* every new/modified action and form — writing them first is the
   same obligation, better ordered.) Skip TDD for presentational UI; verify that by
   running the app.
3. Before every PR: verification against acceptance criteria, a code-review pass, then
   the constitution's local gate (`lint`, `test`, `build`) — in that order.

**Applied to the tiers:**

- **Tier 1 → spec 006.** Schema + RLS + security = exactly the work the spec rule
  exists for; most acceptance criteria are already written above. Bundle the *first*
  RLS integration tests into 006 — they're how the spec proves itself.
- **Tier 2 → stays inside spec 005.** Add the fix tasks to its `tasks.md` (the
  constitution's task source of truth) rather than opening a new spec.
- **Tier 3 → single PRs**, no ceremony, except the full RLS harness if grown beyond 006.
- **New features later → brainstorm first, then spec.** The scope-line table below
  decides whether a request even becomes a feature.

### Milestones to production

The code work is roughly three focused weeks; the calendar is dominated by UAT and
operational readiness, not implementation.

| Milestone | Contents | Target |
|---|---|---|
| **M1 — Safe** 🟡 | Spec 006 shipped to `dev` 2026-08-22: submission RPC, anon policies dropped, `deleteFile` **removed**, storage policies in SQL, security suite proving all of it, CI gate green. **Dev is closed; prod is not** — the exposure remains in the prod database until `011` is pushed there | weeks 1–2 |
| **M2 — Feature-complete** | Spec 005 finished and merged: atomic save, `seeded_from_template_id` decided, T050 walkthrough (required-semantics and `/test-upload` already done via 006) | weeks 2–4 |
| **M3 — Production-ready** | Ops checklist below + organizer UAT dry-run (fake event end-to-end on a preview deploy: apply → review → status email), Tier 3 fixes as UAT surfaces them | month 2 |
| **M4 — Live** | First real event on the platform; maintenance mode after | month 2–3 |

**Production-readiness checklist (M3):**

- [ ] **Verify a sending domain in Resend** and set `EMAIL_FROM_ADDRESS`. The current
      fallback `onboarding@resend.dev` cannot deliver to real vendors — production email
      is silently broken until this is done. (Confirm current restrictions in the Resend
      dashboard.)
- [ ] Decide the Supabase plan: free tier pauses after ~1 week idle (fatal for a
      seasonal app) — paid tier or a weekly keep-alive ping.
      **This has now happened: on 2026-08-22 both the dev and prod projects were found
      paused** — subdomains NXDOMAIN, empty API-key lists — blocking the spec 006
      dev rollout until Holigay-Dev was manually restored. Note the security angle:
      while prod is paused the data exposure is unreachable, but the permissive
      policies are still in that database, so restoring prod re-opens the hole until
      migration 011 is applied. Restore-and-migrate must happen back-to-back.
- [ ] Confirm database backups are enabled on prod; do one restore drill on dev.
- [ ] Env validation module in place; `.env` contract in CLAUDE.md current.
- [ ] Seed the real organizer accounts (manual SQL is fine — Epic 4 backend is not
      launch-blocking with ~2 organizers).
- [ ] Preview-deployment access decided for UAT (Vercel preview URLs are
      public-by-link).
- [ ] A smoke-test script for event week: submit test application, check email arrives,
      check review flow.

**Maintenance mode (post-M4):** small fixes as single PRs under the constitution's
gates; keep this file current as items land; occasional dependency/security bump
sessions; new feature requests go through brainstorm → spec → the scope-line test.
