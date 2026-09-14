# Contract: Security Test Matrix

**Feature**: 006-close-public-data-exposure
**Suite location**: `src/test/security/` (Vitest project `security`, node env,
real local Supabase stack; `describe.runIf(stackUp)` — skipped locally when the
stack is down, mandatory in CI via `CI_REQUIRE_SECURITY_TESTS=1`)

Clients: **anon** (public key, no session), **service** (service-role key —
fixtures, ground-truth assertions, cleanup only; never the subject under
test), **authed** (organizer user created via `auth.admin` + role update +
password sign-in).

Fixtures (seeded via service client, per-run unique suffix): active event A
with questionnaire + one question per answer kind (required text, required
multi-select, required file among them), draft event D, second active event B.

## Matrix

| # | File | Test | Client | Asserts | Covers |
|---|---|---|---|---|---|
| R1 | anon-reads | select vendors / applications / attachments / application_answers while seeded rows exist | anon | zero rows returned, each table | FR-001, US1-AC1, SC-001 |
| R2 | anon-reads | select active events; select event_questionnaires + event_questions for event A | anon | seeded rows returned | FR-003, US1-AC3 |
| R3 | anon-reads | select events filtered to draft | anon | draft event not visible | FR-003 |
| W1 | anon-writes | insert into each of the 4 private tables | anon | error; service read confirms no row | FR-002, US1-AC2 |
| W2 | anon-writes | update / delete against seeded rows in the 4 tables | anon | 0 rows affected; service read confirms unchanged | FR-002 |
| W3 | anon-writes | `rpc('create_event_with_default_questionnaire')`; `rpc('ensure_event_questionnaire')` | anon | permission denied | R6 hardening |
| S1 | submission-rpc | new vendor, legacy variant with attachments | anon | one row returned, `vendor_created = true`; service reads confirm vendor + application + attachment rows | FR-004, SC-002 |
| S2 | submission-rpc | new vendor, dynamic variant with answers | anon | answers rows present and correct | FR-004, SC-002 |
| S3 | submission-rpc | returning vendor with changed phone, event B | anon | vendor phone updated, exactly 1 vendor row, new application, `vendor_created = false` | FR-005, US2-AC2 |
| S4 | submission-rpc | returning vendor, unchanged details, event B | anon | 1 vendor, exactly one new application | edge case |
| S5 | submission-rpc | duplicate (same vendor + event) | anon | `error.code === 'P0003'`; service counts unchanged | FR-006, US2-AC3 |
| S6 | submission-rpc | against draft event D → `P0001`; bogus event id → `P0002` | anon | rejected at the data layer | FR-007, US2-AC4 |
| S7 | submission-rpc | one bogus `event_question_id` → `P0004` | anon | error; zero new vendor/application/answer rows | FR-008, edge case |
| S8 | submission-rpc | same question id twice (unique_violation fires *after* vendor + application inserts) | anon | error; zero orphaned rows | FR-008, SC-003, US2-AC5 |
| S9 | submission-rpc | attachment entry missing `file_name` (NOT NULL after application insert) | anon | error; zero orphaned rows | FR-008, SC-003 |
| S10 | submission-rpc | minimal payload (no answers, no attachments, no legacy) | anon | succeeds | FR-004 |
| ST1 | storage | upload small blob to `attachments` bucket | anon | succeeds | FR-011, US4-AC2 |
| ST2 | storage | `.download()` and `.createSignedUrl()` of ST1's path | anon | both denied | FR-011, US1-AC5 |
| ST3 | storage | `.createSignedUrl()` then fetch the URL; `.download()` | authed | both succeed | FR-011, R9, SC-005 |
| ST4 | storage | `.remove()` of ST1's path | anon, then authed | anon denied (file still exists per service check); authed succeeds | FR-010/011 |
| D1 | dashboard-reads | applications-with-vendor join, application_answers, attachments selects mirroring dashboard queries | authed organizer | seeded data returned | SC-005, edge case |

Forced mid-submission failure vectors are S7/S8/S9 — three different
transaction depths, no test-only hooks in production code.

## Out of the suite (covered elsewhere)

- FR-009 required-emptiness: unit tests (`isAnswerEmpty` table test; action
  tests; form tests) — it's app-layer semantics, not a database rule.
- FR-010 removal of `deleteFile`/`/test-upload`: absence is proven by the
  codebase (no export, no route); ST4 proves anon storage deletion is denied.
- FR-013: types regeneration is a build-time gate (`db:types:local`, zero
  hand-edits), checked in review.
- SC-001 production probes: manual rollout checklist (quickstart.md).
