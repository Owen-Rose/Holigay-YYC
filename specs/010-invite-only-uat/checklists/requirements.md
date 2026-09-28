# Specification Quality Checklist: Invite-Only UAT Environment

**Purpose**: Validate specification completeness and quality before proceeding to planning
**Created**: 2026-09-27
**Feature**: [spec.md](../spec.md)

## Content Quality

- [x] No implementation details (languages, frameworks, APIs)
- [x] Focused on user value and business needs
- [x] Written for non-technical stakeholders
- [x] All mandatory sections completed

## Requirement Completeness

- [x] No [NEEDS CLARIFICATION] markers remain
- [x] Requirements are testable and unambiguous
- [x] Success criteria are measurable
- [x] Success criteria are technology-agnostic (no implementation details)
- [x] All acceptance scenarios are defined
- [x] Edge cases are identified
- [x] Scope is clearly bounded
- [x] Dependencies and assumptions identified

## Feature Readiness

- [x] All functional requirements have clear acceptance criteria
- [x] User scenarios cover primary flows
- [x] Feature meets measurable outcomes defined in Success Criteria
- [x] No implementation details leak into specification

## Notes

- Validated 2026-09-27 in one pass. The source design document
  (`docs/superpowers/specs/2026-09-27-invite-only-uat-design.md`) names the environment
  variable, the middleware, the env module, the invite core function, the trigger and the
  hosting provider's setting names; none of them appear in `spec.md`. The spec names page
  **kinds** (Login page, sign-up page, Team page, public application form, set-password page)
  and setting **roles** (the per-deployment invite-only setting, the training project's self
  sign-up setting, the configured site address), never a route path, module, variable name,
  table or library. A grep for the usual leak terms (`src/`, `.ts`, `NEXT_PUBLIC`, `Vercel`,
  `Supabase`, `GoTrue`, `middleware`, `RPC`, `Zod`, table and trigger names) returns nothing.
- Implementation-detail check, the house line (specs 007, 008 and 009 precedent): the Context
  section describes the current state being replaced (public-by-link preview, self sign-up
  through the page or a direct call with the public key) because it is the problem, not a
  design choice. The `uat-` hostname and the git-branch preview address are named because the
  hostname an invitee lands on is itself an acceptance criterion (story 3). Exact user-facing
  strings ("Sign-up is by invitation on this site.") are quoted because wording is part of the
  acceptance criteria, as in spec 009.
- "Written for non-technical stakeholders": the actors are a stranger with the training
  address, an admin on the Team page, an invited tester with a mailbox, and a vendor on
  production. Every acceptance scenario can be executed by a reviewer clicking through the
  training deployment or production with a mailbox open, except story 1 scenario 5 and FR-013's
  evidence (a direct sign-up request to the authentication service), which the plan gives a
  one-line recipe for.
- Zero clarification markers: decisions D1–D7 were settled in the 2026-09-27 brainstorm and the
  user instructed that section 2 be treated as decided. They are recorded in intent under
  "Clarifications / Session 2026-09-27", one bullet per decision, so `/speckit.clarify` has
  nothing to ask and `/speckit.plan` can cite them.
- Every functional requirement maps to at least one Given/When/Then or a named Edge Case:
  FR-001 → US1 scenario 6, SC-006 and the "other previews" edge case; FR-002 → US1 scenario 2;
  FR-003 → US1 scenario 3; FR-004 → US1 scenario 4; FR-005 → US1 scenario 1 and US1 scenario 2's
  unchanged paths; FR-006 → US1 scenario 5 and the "setting on, self sign-up still on" edge
  case; FR-007 → US2 scenario 1; FR-008 → US2 scenario 1 ("and nothing else"); FR-009 → US2
  scenarios 2–3; FR-010 → US2 scenario 5 and the re-invite edge case; FR-011 → US2 scenarios
  5–7; FR-012 → US2 scenario 4 and SC-004; FR-013 → US1 scenario 5; FR-014 → US3 scenarios 1–3;
  FR-015 → US1 scenarios 2–3 and US4 scenario 1; FR-016 → US4 scenario 3; FR-017 and FR-018 →
  SC-005 and the rollout Assumption (verified by documentation review, as 009's FR-030/FR-031
  were).
- Every decision D1–D7 is traceable: D1 → FR-006, FR-013; D2 → FR-005, SC-002; D3 → FR-001,
  FR-015, SC-006; D4 → FR-002–FR-004; D5 → FR-007–FR-012; D6 → FR-014, US3; D7 → US4, FR-016,
  FR-018.
- The requirement identifiers FR-001–FR-018 and SC-001–SC-006 are stable from this point:
  `plan.md` and `tasks.md` will cite them.
