# Handoff: brainstorm spec 006 — close the public data exposure

**For:** a fresh Claude Code session, starting the brainstorming that becomes
`specs/006-<slug>/spec.md`.
**Written:** 2026-07-08, at the end of the architecture-review session.
**Kickoff prompt for the human:** *"Read docs/handoffs/spec-006-brainstorm.md, then
brainstorm spec 006 with me."*

## Read these first (in order)

1. `docs/ROADMAP.md` — Tier 1 (the work), plus "Working the roadmap" (the process).
2. `docs/ARCHITECTURE.md` — §3 (three-layer auth model) and §10 (weak points).
3. This file — the evidence, decisions already made, and open questions.

## The mission

Anyone with the app's public anon key (i.e., anyone — it ships in the JS bundle) can
read three tables directly via Supabase's REST endpoint:

| Policy | File | Exposes |
|---|---|---|
| `anon_select_vendors USING (true)` | `005_rbac_rls_policies.sql:89` | every vendor's name, **email, phone**, website, description |
| `anon_select_applications USING (true)` | `005_rbac_rls_policies.sql:137` | application status + **`organizer_notes`** (internal notes) |
| `anon_select_attachments USING (true)` | `005_rbac_rls_policies.sql:190` | attachment paths |

These are live in prod today (migration 005 is merged and applied).

Same root cause, two silent-failure bugs (RLS filters unauthorized UPDATE/DELETE to
zero rows *without erroring*):

- Returning applicants' contact updates silently no-op — no anon UPDATE policy on
  `vendors` (`src/lib/actions/answers.ts:186`, `src/lib/actions/applications.ts:169`).
- The rollback in `src/lib/actions/answers.ts:269` (`applications.delete()`) no-ops —
  DELETE is organizer-only — leaving orphaned application rows on failure.

Related, in scope: `deleteFile` (`src/lib/actions/upload.ts:153`) is a publicly
invocable server action that deletes any storage path with no auth/ownership check;
storage bucket policies exist only in the Supabase dashboard, not in any migration
(`002_rls_policies.sql:184-204` documents the manual setup).

## Decisions already made (don't relitigate — recorded in ROADMAP.md Tier 1)

1. **Approach:** move public submission into a `SECURITY DEFINER` Postgres function
   (transactional: vendor upsert → duplicate check → application insert → answers
   insert), following the existing pattern of
   `create_event_with_default_questionnaire` (`009_dynamic_questionnaires.sql:388`).
   Then drop the broad anon policies. **Not** a service-role client in the request
   path — the RPC gives real atomicity, which also fixes both silent-failure bugs.
2. Keep public reads that are meant to be public: `anon_select_active_events` and the
   questionnaire SELECT policies.
3. Gate `deleteFile` in app code; write the `attachments` bucket policies into a
   migration (SQL on `storage.objects`).
4. Bundle the **first RLS integration tests** into this spec — they're how the spec
   proves itself (anon can't read vendors/applications/attachments; submission still
   works; rollback leaves no orphans).
5. App-layer validation stays where it is: Zod + show-if re-evaluation in `answers.ts`
   run *before* calling the RPC. The RPC replaces only the write sequence. (Note: a
   SECURITY DEFINER function bypasses RLS, so the function itself must re-check the
   event is `active` — don't rely on the dropped anon policies' guards.)

## Genuinely open questions (this is what brainstorming should settle)

1. **Branch sequencing — the big one.** The dynamic submission path (`answers.ts`) and
   the `application_answers` anon policies (migration 009) exist only on the unmerged
   `005-dynamic-questionnaires` branch, but the exposed tables are live on `main`/prod
   now. Options: (a) branch 006 off the 005 branch and land 005's Tier 2 fixes first
   or together; (b) a minimal 006a on `main` for the legacy path now, extended after
   005 merges. Recommendation to test in brainstorming: **branch off 005** — the
   RPC must cover the dynamic path anyway, the app is barely used, and one coherent
   migration beats two overlapping ones. But pressure-test this.
2. **One RPC or two?** Legacy static form (`submitApplication`) and dynamic form
   (`submitDynamicApplication`) both need the transactional path. One function with a
   nullable answers argument, or two thin functions sharing an inner helper? (Remember
   ROADMAP Tier 4 wants the legacy path retired eventually — don't over-invest in it.)
3. **Attachments in the legacy flow:** legacy submissions insert `attachments` rows as
   anon. Does that move into the RPC, or does dropping `anon_insert_attachments` wait
   until the legacy form is retired?
4. **RLS test harness mechanics:** how to run tests against local Supabase
   (`supabase db reset` + per-role JWTs vs. service-key-driven setup with anon
   PostgREST probes), where they live, and how CI runs them (or whether they're
   local-only behind a flag for now).
5. **`anon_insert_vendors` / `anon_insert_applications`:** the RPC makes these
   droppable too. Confirm nothing else depends on them (grep for anon-client writes).
6. **Rollout:** migration order against prod (barely used, but live) — apply window,
   and a manual PostgREST probe checklist post-apply.

## Constraints (constitution — `.specify/memory/constitution.md`)

- Migrations are append-only; new tables/policies ship RLS in the same migration.
- Every new/modified server action: Zod `safeParse`, `{success, error, data}` shape,
  happy-path + failure test (write tests first per ROADMAP "Working the roadmap").
- No `any`/`@ts-ignore`; regenerate `src/types/database.ts` after schema changes
  (`npm run db:types:dev`), never hand-edit.
- Commits: `type(scope): description [006-<slug>]`. Local `lint`/`test`/`build` before PR.

## State of the repo at handoff

- Branch `005-dynamic-questionnaires`, 8 commits ahead of `main`, one uncommitted
  change (`src/app/dashboard/events/new/page.tsx` redirect tweak — intentional, keep).
- Spec 005 is implemented but has known bugs (ROADMAP Tier 2); T050 manual walkthrough
  not run.
- `docs/ARCHITECTURE.md` and `docs/ROADMAP.md` are current as of 2026-07-08 and are
  the source of truth for this work.
