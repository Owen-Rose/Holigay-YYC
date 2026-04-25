# Implementation Plan: Per-Event Dynamic Questionnaires

**Branch**: `005-dynamic-questionnaires` | **Date**: 2026-04-25 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/005-dynamic-questionnaires/spec.md`

## Summary

Add per-event dynamic questionnaires to the vendor application platform plus an org-wide reusable template library. New events are auto-seeded with three default questions that mirror today's static form (Booth Preference, Product Categories, Special Requirements). Organizers can build, reorder, and remove questions across 11 supported types in `/dashboard/events/[id]`, save the resulting set as a named template under a new `/dashboard/templates` route, and seed future events from saved templates (copy-on-attach — no live linkage). Publishing an event atomically locks its questionnaire. Vendors at `/apply` see a form built from the event's questions, with show-if branching (`equals` only, `yes_no`/`single_select` triggers) hiding non-applicable questions; submissions write one Application Answer row per visible question. Legacy events (no attached questionnaire) keep using today's hard-coded form. The five new entities ship in a single migration `009_dynamic_questionnaires.sql` with full RLS.

## Technical Context

**Language/Version**: TypeScript 5.x (strict), Node ≥ 20 (Next.js 16 runtime)
**Primary Dependencies**: Next.js 16 (App Router, RSC-first), React 19, `@supabase/ssr`, `react-hook-form`, `zod`, `@hookform/resolvers`, `sonner` (toasts), Tailwind CSS v4
**Storage**: Supabase PostgreSQL with RLS; existing `attachments` bucket reused for `file_upload` answers; new tables added via migration `009_dynamic_questionnaires.sql`
**Testing**: Vitest + jsdom + React Testing Library + `@testing-library/user-event` + `@testing-library/jest-dom`
**Target Platform**: Vercel-deployed Next.js app, Supabase-hosted PostgreSQL (dev + prod projects)
**Project Type**: Single Next.js App Router project (no separate frontend/backend split)
**Performance Goals**: SC-001 (build 10-question questionnaire in < 5 min), SC-002 (seed-from-template + edit start in < 30 s), SC-003 (10-question dynamic submission with file + branching, 100 % happy-path test runs); LCP budget on `/dashboard` and `/apply` ≤ 2.5 s per Constitution IV
**Constraints**: Strict TS (`any` / `@ts-ignore` / `@ts-expect-error` forbidden in production code); RLS-only authorization at the data layer; lock-on-publish must be enforced both in the application layer (server actions) and at the data layer (RLS policy referencing `events.status`); file-upload reuse only — no new buckets; append-only migrations
**Scale/Scope**: Single-tenant org; ≤ 5 organizers expected; ≤ 100 events/year; questionnaires expected ≤ 25 questions typical (no hard cap per Q5 clarification)

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | How this plan complies |
|---|---|
| **I. Code Quality & Type Safety** | All new server actions in `src/lib/actions/{templates,questionnaires,answers}.ts` use Zod `safeParse`, `requireRole('organizer')`, and the literal `{ success, error, data }` return shape (matching `applications.ts` and `events.ts`). `src/types/database.ts` regenerated and committed in same PR as migration 009 (FR-006). RLS policies ship inside migration 009 (FR-004). Migration is append-only, prefix `009_`. Strict TS — no `any`/`@ts-ignore` introduced. |
| **II. Testing Standards** | Every new server action ships with happy-path + auth-or-validation failure test using the `auth-roles.test.ts` mock pattern. New form components (`QuestionnaireBuilder`, `DynamicApplicationForm`, `QuestionRenderer`, `AnswerRenderer`) ship with rendering + validation-error-display + happy-submit tests using the `application-form.test.tsx` pattern. RLS for migration 009 includes a manual verification note in the PR until DB-integration harness exists. |
| **III. UX Consistency** | All new UI built from `src/components/ui/` primitives (`Input`, `Textarea`, `Select`, `Checkbox`, `Button`, `Card`, `Badge`, `FileUpload`); brand tokens via `src/app/globals.css` only (no inline hex). All new forms use `react-hook-form` + `zod` + `useId()` for label-input pairing + `aria-invalid`/`aria-describedby`/`role="alert"` on error messages. New mutating actions surface results via Sonner toasts in client callers. New segments `/dashboard/templates`, `/dashboard/templates/[id]` get `loading.tsx`. Min interactive-target 44 × 44 px enforced via existing `Button`. |
| **IV. Performance Requirements** | New actions call `revalidatePath()` for affected routes (introduces the pattern — currently absent in repo, see Complexity Tracking). Builder + templates list default to RSC; only the form-state pieces (`QuestionnaireBuilder`, `DynamicApplicationForm`) become Client Components, justified by interactive state. No raw `<img>` introduced. No new runtime deps in `src/app/layout.tsx`. |

**Result**: All gates pass at Phase 0 entry. Single noted complexity: introducing `revalidatePath()` is not a violation — it's the resolution of an existing constitutional MUST that today is silently violated by `events.ts` and `applications.ts`. We adopt the pattern starting with this feature; backfilling the older actions is out of scope for spec 005.

**Post-design re-check (after Phase 1)**: All gates still pass. Specific re-confirmations:
- I — `application_answers.value` JSONB shape is validated by a discriminated-union Zod schema at the server-action boundary on both write and read; no `any` introduced (research.md R1, R9). Migration 009 ships RLS for all five new tables in the same file.
- II — `show-if-evaluator.test.ts` is a pure unit test, no Supabase mock needed; all four new server-action files (`templates.ts`, `questionnaires.ts`, `answers.ts`, plus modifications to `events.ts`) have paired test files in `src/test/` (plan.md tree).
- III — New form components (`QuestionnaireBuilder`, `DynamicApplicationForm`, `QuestionInput`, `ShowIfEditor`) are all spec'd to compose existing UI primitives only; no new primitive proposed. New segments `/dashboard/templates`, `/dashboard/templates/[id]` get `loading.tsx`.
- IV — Every mutation contract spells out its `revalidatePath()` calls (contracts/templates-actions.md, contracts/questionnaire-actions.md, contracts/public-submit-action.md). The amended `createEvent` and `updateEventStatus` calls also revalidate `/dashboard/events` and `/dashboard/events/[id]` — small, scoped retrofit, not a repo-wide sweep.
- RLS performance — subquery joins (`event_questionnaires` → `events.status`) used in lock-on-publish RLS predicates run against tables with row counts in the hundreds at most; well within the < 2.5 s LCP budget.

## Project Structure

### Documentation (this feature)

```text
specs/005-dynamic-questionnaires/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output (server action contracts)
│   ├── templates-actions.md
│   ├── questionnaire-actions.md
│   └── public-submit-action.md
├── checklists/
│   └── requirements.md  # (already exists from /specify)
└── tasks.md             # /speckit-tasks output (NOT created by /speckit-plan)
```

### Source Code (repository root)

```text
src/
├── app/
│   ├── (public)/apply/
│   │   ├── page.tsx                              # MODIFIED — branch on questionnaire presence
│   │   └── _components/
│   │       └── dynamic-application-form.tsx     # NEW (client) — RHF-driven dynamic form + show-if
│   ├── dashboard/
│   │   ├── events/[id]/
│   │   │   ├── page.tsx                          # MODIFIED — render builder section
│   │   │   ├── questionnaire-builder.tsx         # NEW (client) — add/remove/reorder/show-if
│   │   │   └── save-as-template-button.tsx       # NEW (client)
│   │   ├── templates/                            # NEW segment
│   │   │   ├── page.tsx                          # list templates (RSC)
│   │   │   ├── loading.tsx                       # NEW
│   │   │   ├── new/page.tsx                      # create template (RSC + client form)
│   │   │   └── [id]/
│   │   │       ├── page.tsx                      # template detail (RSC)
│   │   │       ├── loading.tsx                   # NEW
│   │   │       └── template-builder.tsx          # NEW (client) — reuses QuestionnaireBuilder
│   │   └── applications/[id]/
│   │       ├── page.tsx                          # MODIFIED — branch dynamic vs legacy renderer
│   │       └── dynamic-answers.tsx               # NEW (RSC) — type-aware renderer
│   └── vendor-dashboard/applications/[id]/
│       └── page.tsx                              # MODIFIED — same dynamic vs legacy branch
├── components/
│   ├── forms/
│   │   ├── question-editor.tsx                   # NEW (client) — single-question edit panel
│   │   ├── show-if-editor.tsx                    # NEW (client) — equals-only rule editor
│   │   └── question-input.tsx                    # NEW (client) — type-dispatched answer input
│   └── questionnaire/
│       ├── answer-renderer.tsx                   # NEW (RSC) — type-dispatched read-only renderer
│       └── question-types.ts                     # NEW — QUESTION_TYPES const + label helpers
├── lib/
│   ├── actions/
│   │   ├── templates.ts                          # NEW — CRUD for templates + template_questions
│   │   ├── questionnaires.ts                     # NEW — CRUD + reorder + save-as-template
│   │   └── answers.ts                            # NEW — public submitDynamicApplication
│   ├── validations/
│   │   └── questionnaire.ts                      # NEW — Zod schemas for question, template, answer
│   └── questionnaire/
│       ├── default-questions.ts                  # NEW — three pre-seeded defaults (FR-011)
│       ├── show-if.ts                            # NEW — evaluator (pure function) + cycle detector
│       └── answer-coercion.ts                    # NEW — JSONB ↔ typed value helpers
├── types/
│   └── database.ts                               # REGENERATED via npm run db:types:dev
└── test/
    ├── questionnaire-builder.test.tsx            # NEW
    ├── dynamic-application-form.test.tsx         # NEW
    ├── answer-renderer.test.tsx                  # NEW
    ├── show-if-evaluator.test.ts                 # NEW (pure unit)
    ├── templates-actions.test.ts                 # NEW
    ├── questionnaires-actions.test.ts            # NEW
    └── answers-actions.test.ts                   # NEW

supabase/
└── migrations/
    └── 009_dynamic_questionnaires.sql            # NEW — five tables + RLS policies + lock guard
```

**Structure Decision**: Single Next.js App Router project (matches existing layout — no separate `backend/`/`frontend/`). New code is co-located alongside existing peers: server actions in `src/lib/actions/`, validations in `src/lib/validations/`, route-specific client components colocated with their `page.tsx`, and reusable form / renderer components in `src/components/`. New domain-pure helpers go under `src/lib/questionnaire/`. The migration adds one numbered file (`009_*.sql`).

## Complexity Tracking

| Item | Why needed | Simpler alternative rejected because |
|---|---|---|
| Introduce `revalidatePath()` for new actions | Constitution Principle IV mandates it for any mutating action that changes data rendered by an existing route. | Skipping would propagate the existing repo-wide gap and visibly leave stale UI on builder save / template edit / submission. |
| New `src/lib/questionnaire/` directory | Houses pure helpers (show-if evaluator, default-question seed, JSONB coercion) shared across server actions, RSC renderers, and client builder. | Inlining into one of those callers would force the others to duplicate or import across module boundaries — pure helpers belong outside any single tier. |
| `Application Answer.value` is JSONB | Spec FR-002 requires a single column able to carry text / number / boolean / list / date / file-reference per question type, varying per row. | Per-type columns would explode schema and break the "one row per (application, question)" model; separate child tables per type would multiply queries and joins for each application read. JSONB with type-tagged shape (validated by Zod at the action boundary) keeps reads cheap. |
| Soft-pointer `created_by` on templates (`ON DELETE SET NULL`) | Q4 clarification: templates outlive their creator; admins manage orphans. | `ON DELETE CASCADE` would lose template history when an organizer leaves; explicit ownership transfer on user deletion requires custom DB triggers or app code we don't yet need. |
