# Quickstart: Per-Event Dynamic Questionnaires

End-to-end manual verification covering all seven user stories, run against a freshly migrated dev environment. Use this once Phase-2 implementation is in.

## Prerequisites

```bash
npm run db:types:dev          # ensure src/types/database.ts is current
supabase db reset --local     # or apply 009 against your dev project
npm run lint && npm test && npm run build
npm run dev                   # localhost:3000
```

You'll need three accounts in dev:
- **admin@example.com** — `user_profiles.role = 'admin'`
- **organizer@example.com** — `user_profiles.role = 'organizer'`
- **vendor@example.com** — `user_profiles.role = 'vendor'` (default after signup)

Bootstrap admin per `CLAUDE.md` "Admin Bootstrap" if needed.

---

## Story 1 — Organizer builds a per-event questionnaire (P1)

1. Sign in as `organizer@example.com`.
2. Go to `/dashboard/events/new`. Create a draft event "Test Holigay Spring 2026".
3. After redirect to `/dashboard/events/[id]`, scroll to the Questionnaire builder section.
4. Confirm the three default questions are pre-rendered: Booth Preference (single_select), Product Categories (multi_select with 11 options), Special Requirements (long_text). **(FR-011)**
5. Add a `yes_no` question: "Are you a first-time vendor?". Save.
6. Add a `single_select` question: "Tent type" with options Pop-up / Frame / None.
7. Mark "Are you a first-time vendor?" as required. Save.
8. Reorder: drag "Tent type" above "Are you a first-time vendor?". Save.
9. Refresh the page. Verify all five questions persist in the saved order.

✅ Acceptance: Story 1 scenarios 1, 2, 3, plus reorder behavior.

**Negative**: Sign in as `vendor@example.com`, navigate to `/dashboard/events/[id]`. Confirm middleware redirect to `/unauthorized`. (FR-017, Story 1 scenario 4)

---

## Story 5 — Save as template, seed second event from it (P2)

10. As organizer, on the same event page, click "Save as template". Name it "Spring Market Standard". Confirm success toast.
11. Go to `/dashboard/templates`. Confirm the template appears with question count = 5.
12. Open the template detail. Confirm all five questions visible.
13. As `admin@example.com`, also navigate to `/dashboard/templates`. Confirm the template is visible (FR-008). Confirm the "Edit" / "Delete" buttons render only when the row is owned by you OR you are admin.
14. Back as organizer: `/dashboard/events/new` → create "Test Summer 2026" → on the event page, "Seed from template" → pick "Spring Market Standard" → confirm five questions copied.
15. Edit a question label on Test Summer 2026. Save. Re-open the original template — confirm its questions UNCHANGED. **(FR-010, Story 5 scenarios 3 & 4)**
16. Edit a question label on the template. Re-open Test Summer 2026 — confirm its questions UNCHANGED.

✅ Acceptance: Story 5 scenarios 1–5.

**Orphaned-template edge case (Q4)**:
17. As admin, in Supabase SQL editor, simulate creator deletion: `update auth.users set email = null where email = 'organizer@example.com';` then `delete from auth.users where id = '<organizer-uuid>';`. (Or use a disposable test creator account.) The template's `created_by` should now be `NULL`.
18. Re-sign-in as a different organizer. `/dashboard/templates` should still show the template (FR-008). Edit/Delete buttons should now be disabled / hidden for non-admin organizers. As admin, the buttons remain functional. **(Q4 / FR-009a)**

---

## Story 6 — Show-if branching (P3)

19. As organizer, edit Test Holigay Spring 2026's questionnaire. On Q5 ("Tent type"), open the show-if panel. Add: "Show only if Q1 ('Are you a first-time vendor?') equals yes". Save.
20. Try to add a show-if rule on Q1 referencing Q4 (a later question). Confirm save is rejected with a "forward references not allowed" error. **(Story 6 scenario 5, Edge Cases)**
21. Try to add a show-if rule whose trigger is the multi_select Q2 ("Product Categories"). Confirm rejection with a "trigger must be yes_no or single_select" error. **(Q2 clarification, new Edge Case)**

---

## Story 2 — Vendor submits a dynamic application (P1)

22. Publish the event: change Test Holigay Spring 2026 status `draft → active`. Confirm the questionnaire is now locked (`event_questionnaires.locked_at` set; UI blocks all question edits with "This event is published — its questionnaire is locked"). **(Story 7 scenarios 1–4, FR-019/FR-020)**
23. Open an incognito window. Visit `/apply` (no auth needed). Pick Test Holigay Spring 2026.
24. Confirm the dynamic form renders all six questions (default 3 + your 2 + Tent type appears only conditionally on yes_no answer).
25. Set "Are you a first-time vendor?" = No. Confirm Tent type field is NOT rendered. **(Story 6 scenario 2)**
26. Set "Are you a first-time vendor?" = Yes. Confirm Tent type field appears and is required.
27. Submit with Tent type left blank. Confirm a validation error on Tent type. **(Story 6 scenario 3)**
28. Pick a Tent type and finish all required fields. Submit. Confirm success toast + redirect.
29. Verify in DB:
    - One `applications` row (status=`pending`, `vendor_id` set, `user_id IS NULL`).
    - `application_answers` row count == visible-question count (six if Tent type was shown; five if hidden).
    - Hidden questions have NO answer row. **(FR-022, FR-023)**

**File-upload edge case**:
30. Add a `file_upload` question to a different draft event. Publish. As vendor, submit a 12 MB file → confirm rejection. Submit a valid PDF → confirm acceptance and that the answer's `value` carries `{ kind: "file", path, name, mimeType, size }`. **(Story 2 scenarios 3 & 4)**

---

## Story 3 — Legacy events keep using the static form (P1)

31. In SQL editor (or via a dev seed), simulate a legacy event by deleting its `event_questionnaires` row: `delete from event_questionnaires where event_id = '<legacy-event-id>';`. Confirm the related `event_questions` cascade away. (Or use an event row that was inserted before migration 009.)
32. Visit `/apply`. Pick the legacy event. Confirm the form renders the existing three static fields (booth preference, product categories, special requirements) — **not** a dynamic form. **(FR-025, Story 3 scenario 1)**
33. Submit the legacy form. Verify a row is created with the three legacy columns populated and zero `application_answers` rows. **(FR-027)**

---

## Story 4 — Organizer reviews dynamic answers (P2)

34. As organizer, open `/dashboard/applications/[id]` for the dynamic submission from Story 2.
35. Confirm each answer renders with its question label and a type-appropriate widget:
    - Booth Preference (single_select) → label
    - Product Categories (multi_select) → comma-list or pill set
    - First-time vendor (yes_no) → "Yes" / "No" badge
    - Tent type (single_select) → label
    - Special Requirements (long_text) → wrapped paragraph
    - File upload → download link
36. Confirm hidden questions do NOT appear at all (no "Tent type: —" placeholder). **(Story 4 scenario 1)**
37. As the same vendor, open `/vendor-dashboard/applications/[id]`. Confirm the same renderer is used and the data matches. **(Story 4 scenario 2)**

**Legacy renderer**:
38. Open the legacy application from step 33 in `/dashboard/applications/[id]`. Confirm the existing hard-coded three-field renderer is used (no per-question rendering). **(Story 4 scenario 4 / FR-027)**

---

## Story 7 — Lock-on-publish (P3)

39. As organizer, attempt to add a question to the now-active Test Holigay Spring 2026 via the builder UI. Confirm the action is blocked with a clear error.
40. Open Supabase Studio's SQL editor. Try a direct UPDATE: `update event_questions set label = 'hijack' where event_questionnaire_id = '<id>';` Confirm RLS rejection (`new row violates row-level security policy`). **(FR-020 data-layer gate, Story 7 scenario 4)**

---

## Cleanup

```bash
supabase db reset --local      # if you used local
# Or in dev SQL editor: delete the test events / templates / vendors.
```

---

## Smoke-test summary table

| Story | What you verified | Where |
|---|---|---|
| 1 | Builder add/edit/remove/reorder, role gate | `/dashboard/events/[id]` |
| 2 | Public submit with file + branching, validation | `/apply` |
| 3 | Legacy form still renders + submits | `/apply` (legacy event) |
| 4 | Type-aware review renderer (org + vendor sides) + legacy fallback | `/dashboard/applications/[id]`, `/vendor-dashboard/applications/[id]` |
| 5 | Templates: save, seed, decoupled edits, orphan handling | `/dashboard/templates`, `/dashboard/templates/[id]` |
| 6 | Show-if equals on yes_no/single_select; forward + trigger-type guards | builder show-if panel |
| 7 | Lock-on-publish at app + RLS layers | direct SQL |
