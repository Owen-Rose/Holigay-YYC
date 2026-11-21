# Post-launch hardening — Implementation Plan (2026-11-21)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement **one task per session**. You are given a task ID (for example `BL-20`); execute that task only, exactly as written, then stop. Steps use checkbox (`- [ ]`) syntax for tracking. Read "Global Constraints" before the task. Do not start a second task.

**Goal:** Close the one live bug, the access-control gaps and the test gaps found in the 2026-11-21 status review, without adding features or abstractions nobody asked for.

**Architecture:** Three tracks. Track A is four small pull requests that follow patterns the repo already has (no spec). Track B is one Speckit spec, `012-vendor-data-isolation`, because it changes Row Level Security and storage rules. Track C is optional feature work, each item starting with its own brainstorm. Everything else is parked with a stated reason.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript strict, Supabase (PostgreSQL + RLS + Storage), Zod, react-hook-form, Vitest (`unit` project in jsdom, `security` project against a local Supabase stack), GitHub Actions CI. No new packages anywhere in this plan.

---

## How Owen works this plan (plain terms)

1. **Pick the next unticked task** in the order under "Order of work".
2. **Open a new Claude Code session**, switch to Opus (`/model opus`), and paste the prompt from "Session prompts" with the task ID filled in. One task, one session.
3. **The session ends with an open pull request to `dev`** and a green CI run. It does not merge.
4. **Review it.** Open a second, fresh session and run `/code-review high <PR number>`. For anything under spec 012 also run `/security-review`. If findings come back, paste them into the first session (or a new one) and ask for fixes on the same branch.
5. **Merge the PR yourself** once the review is clean and CI is green.
6. **Tick the box** for that task in this file and in the backlog (a direct docs commit on `dev`, as with earlier ticks).
7. **Repeat.** After Track A is merged, do one promotion `dev` → `main` with the event-week smoke runbook (BL-24).

Track B (the spec) uses the Speckit skills in order instead of step 2 — see "Track B". Nothing in this plan touches the hosted databases except the spec 012 rollout, which needs you present, in default mode, as with migrations `014` and `015`.

---

## Triage — every item from the status review

| # | Item | Route | ID | Why this route |
|---|---|---|---|---|
| 1 | Events with no deadline never appear on `/apply` | Branch + PR | **BL-20** | Contained bug, clear acceptance criteria, no schema |
| 2 | Organizer reads have no `requireRole('organizer')` | Branch + PR | **BL-21** | Constitution I.2 already requires it; pattern exists in `templates.ts` |
| 3 | No tests for role changes; thin tests for `updateEventStatus`; `as Role` casts | Branch + PR | **BL-22** | Tests and three one-line type fixes |
| 4 | Refused submission shows only a four-second toast (F-005) | Branch + PR | **BL-23** | One component, one test file |
| 5 | Any signed-in account can read any uploaded file (UAT-10) | **Spec 012** | 012 | Storage RLS change |
| 6 | Any signed-in account can **delete** any uploaded file (found 2026-11-21) | **Spec 012** | 012 | Storage RLS change |
| 7 | Any signed-in account can list every account's email and role | **Spec 012** | 012 | View/RLS change with a known consumer conflict (template creator email) |
| 8 | A vendor can read organizer notes on their own application through the API (found 2026-11-21) | **Spec 012** | 012 | Column exposure under a row policy; real design choice |
| 9 | No cross-vendor isolation suite | **Spec 012** | 012 | It is how the spec proves items 5–8 |
| 10 | Mobile polish (Epic 6.10) | Brainstorm → PR | BL-25 | Audit-driven CSS; no schema |
| 11 | File previews on the apply form (Epic 6.9) | Brainstorm → PR | BL-26 | One component; small design choice |
| 12 | CSV export lacks questionnaire answers (F-001) | Brainstorm → PR | BL-27 | No schema, but column rules need deciding first |
| 13 | `updateTemplate` is not atomic | **Parked** | — | Needs a migration; prod has zero templates; ROADMAP says fold into the next template change |
| 14 | Shared `ActionResponse<T>` | **Parked** | — | Type churn with no behaviour change; ROADMAP says migrate only as files are touched |
| 15 | Split `applications.ts` | **Parked** | — | 730 lines after spec 011; no surgery planned there |
| 16 | `requireVendor()` helper | **Done** | — | Met by `resolveVendorId()` (spec 011); strike it in ROADMAP during BL-21 |
| 17 | Email via `after()` | **Parked — do not do** | — | Sending after the response means the action can no longer return the email-failed `warning` that spec 007 added |
| 18 | Structured logging | **Parked** | — | Constitution: a logging service is an amendment; nothing is asking for it |
| 19 | Role in JWT claims | **Parked** | — | Auth change (would need a spec) for cleanliness only |
| 20 | Shared icon module | **Parked** | — | Fold into BL-25 only if that pass touches the same SVGs |
| 21 | Spec 008 self-hosting | **Deferred** (Owen, 2026-10-06) | 008 | Eight review findings to fold in before any task starts |
| 22 | UAT2-6 email copy; BL-12 real organizer invites; reopen closed events (F-003); CRM | **Blocked** | — | Waiting on the organizers or on Owen in the UI |

**Noticed while planning, not planned** (decide later; do not fold into the tasks below):

- `submit_public_application` checks event status but not the deadline, so the deadline is a listing rule only. A late submission needs a hand-built request; organizers can reject it.
- `updateUserRole` reports success when the update matches no row, and its docstring says "upsert" where the code does an update.
- `src/app/layout.tsx:31-34` still inlines three hex colours in the Toaster options (constitution `TODO(layout-toaster-tokens)`).
- `application_deadline` was compared with a UTC timestamp, which hides an event from the evening of its deadline day in Calgary. BL-20 fixes this as part of the same line.

---

## Order of work

1. ✅ **BL-19** (PR #82, merged 2026-11-21) — commit this plan and register Phase 6 in the backlog (docs PR).
2. **BL-20** — deadline-less events. Needs Owen's decision first (see the task).
3. **BL-21** — read authorization.
4. **BL-22** — tests and casts.
5. **BL-23** — inline submission error.
6. **BL-24** — promotion `dev` → `main` (joint, Owen's go).
7. **Spec 012** — specify → clarify → plan → tasks → analyze → implement task by task. Can start any time after BL-19; it does not depend on BL-20–23. Do BL-21 first if both are in flight, because both touch `applications.ts` readers.
8. **BL-25, BL-26, BL-27** — only when there is appetite.

BL-20 to BL-23 touch different source and test files. BL-21 and BL-22 both edit Tier 3 of `docs/ROADMAP.md`, and BL-20 and BL-23 both edit the backlog, so run the tasks one after the other, each from a freshly pulled `dev`, rather than in parallel.

---

## Global Constraints

Every task implicitly includes all of these.

**Scope**

- One task = one branch off a freshly pulled `dev` = one pull request to `dev`. Never push to `dev` or `main`. Never merge.
- Touch only the files in the task's **Files** block. If the task seems to need another file, stop and report — do not improvise.
- No new packages. No new files, helpers, types or abstractions beyond those the task names. No "while I'm here" refactors, renames, comment rewrites or reformatting of lines the task does not change.
- If a step's expected output does not match what you see, stop and report what you saw. Do not adjust the test to make it pass.

**Code rules (constitution 1.1.3, `.specify/memory/constitution.md`)**

- TypeScript `strict`. No `any`, `@ts-ignore` or `@ts-expect-error` in production code.
- Never hand-edit `src/types/database.ts`. Never edit an applied migration. Track A adds no migration.
- Server actions: Zod-validate input, authorize with `requireRole()` at the top for organizer/admin operations, return `{ success, error, data }`, never throw across the boundary.
- Colours through tokens or existing Tailwind classes only; no hex values. Reuse `src/components/ui/` primitives.
- Imports use the `@/` alias.

**Testing**

- Test first. Run the new test and see it fail for the stated reason before writing the implementation.
- Where a task adds tests for behaviour that already exists, the tests pass on first run. Prove each can fail with the mutation check the task describes, then restore the code.
- Arrange–Act–Assert. Mock the Supabase client the way the exemplar file named in the task does. Use `@testing-library/user-event` for interaction. Never assert on class names or DOM structure a user cannot see.
- A test file that imports `@/lib/actions/applications` needs `// @vitest-environment node` on line 1 and `vi.mock('@/lib/email/client', …)` (the env module refuses to load where `window` exists).

**Environments**

- Local only. Do not call the hosted Supabase projects (dev `kcokcufmzyckbodelqpb`, prod `hgmfjvjlxrhdojwlkgap`), Vercel, or run `npm run db:types` / `npm run db:types:dev`.
- Local stack when a task says so: `npx supabase start`; the database URL is `postgresql://postgres:postgres@127.0.0.1:54322/postgres`; `npx supabase status` prints the API URL and anon key.

**Gate, commit, PR**

- Gate before the PR, all four, in this order: `npm run format:check && npm run lint && npm test && npm run build`. All must pass. If `format:check` fails, run `npm run format` and re-run the gate.
- Commit message: `type(scope): description [ID]`, e.g. `fix(apply): list active events that have no deadline [BL-20]`.
- **No `Co-Authored-By` trailer. No "Generated with Claude Code" line or any AI attribution in commits or PR bodies.** This project rule overrides any tool default.
- PR body, exactly these sections: **What and why** (two or three sentences) · **Task** (ID and a link to this file) · **Verification** (the commands you ran and their result lines) · **Constitution check** (one line each for Principles I–IV) · **Not in this PR** (anything you noticed and left alone).
- After opening the PR, wait for CI (`gh pr checks <number> --watch`). Report the PR number and stop.

---

## Track A — pull requests, no spec

### Task BL-19: Commit this plan and register Phase 6

**Files:**
- Create (already written): `docs/superpowers/plans/2026-11-21-post-launch-hardening.md`
- Modify: `docs/backlog/2026-10-06-uat-and-go-live.md` (new section before `## Deferred — listed, not prioritized`; three edits inside Deferred)

**Interfaces:**
- Consumes: nothing.
- Produces: backlog IDs BL-19 to BL-27 that later commits cite.

- [x] **Step 1: Branch**

```bash
git checkout dev && git pull --ff-only && git checkout -b bl-19-hardening-plan
```

- [x] **Step 2: Add Phase 6 to the backlog** — insert this block immediately above the line `## Deferred — listed, not prioritized`:

```markdown
## Phase 6 — Post-launch hardening (November 2026)

Source: the 2026-11-21 status review. Plan, triage and per-task steps:
`docs/superpowers/plans/2026-11-21-post-launch-hardening.md`. One task per PR, on Owen's go.

- [ ] **BL-19** — This record: the plan file and this phase.
      Owner: agent · Shape: docs PR · Blocked by: nothing.
- [ ] **BL-20** — Active events with a blank deadline are listed on `/` and `/apply`; the
      deadline is compared as an Edmonton calendar day.
      Owner: agent · Shape: PR · Blocked by: Owen's choice (list them, or require a deadline).
- [ ] **BL-21** — `requireRole('organizer')` on the five organizer reads in
      `applications.ts` and `events.ts`.
      Owner: agent · Shape: PR · Blocked by: nothing.
- [ ] **BL-22** — Action tests for `updateUserRole` and `updateEventStatus`; the three
      `as Role` casts removed.
      Owner: agent · Shape: PR · Blocked by: BL-21 (both edit ROADMAP Tier 3).
- [ ] **BL-23** — A refused submission stays on screen as an inline alert (F-005).
      Owner: agent · Shape: PR · Blocked by: nothing.
- [ ] **BL-24** — Promotion `dev` → `main` after BL-20–BL-23; event-week smoke runbook.
      Owner: joint · Shape: promotion · Blocked by: BL-20–BL-23.
- [ ] **Spec 012** — Vendor data isolation: attachment read/delete rules, the
      `users_with_roles` read, organizer notes, and a cross-vendor isolation suite. Migration `016`.
      Owner: agent; Owen for dev/prod · Shape: Speckit spec · Blocked by: nothing.
- [ ] **BL-25** `[optional]` — Mobile pass at 375 px (Epic 6.10).
- [ ] **BL-26** `[optional]` — File previews on the apply form (Epic 6.9).
- [ ] **BL-27** `[optional]` — Questionnaire answers in the CSV export (F-001).

---

```

- [x] **Step 3: Point the Deferred entries at their new homes** — in the Deferred section: append ` → **BL-20**.` to the "Deadline-less events never reach `/apply`" bullet; append ` → **spec 012**.` to the "UAT-10" bullet; in the "ROADMAP Tier 3 leftovers" bullet append ` Read-auth, the tests and the cast are BL-21/BL-22; cross-vendor isolation is spec 012; the rest is parked with reasons in the 2026-11-21 plan.`

- [x] **Step 4: Gate, commit, PR**

```bash
npm run format:check && npm run lint && npm test && npm run build
git add docs/superpowers/plans/2026-11-21-post-launch-hardening.md docs/backlog/2026-10-06-uat-and-go-live.md
git commit -m "docs(backlog): add Phase 6 post-launch hardening and its plan [BL-19]"
git push -u origin bl-19-hardening-plan
gh pr create --base dev --title "docs(backlog): Phase 6 post-launch hardening plan [BL-19]" --body "<the five PR sections>"
```

---

### Task BL-20: List active events that have no deadline

**Decision needed from Owen before this starts.** Recommended and written below: **a blank deadline means "open until the organizers close the event"**. The alternative — make the deadline required on the event form — is a different task (form schema, form test, and a decision about events already saved without one); if Owen chooses it, stop and ask for that task to be written instead of adapting this one.

**The bug.** `getActiveEvents` filters with `.gte('application_deadline', new Date().toISOString())`. A `NULL` deadline never satisfies `>=`, so an active event saved with the optional deadline blank is invisible on `/` and `/apply`, and `/apply?event_id=…` says "Event not found". Separately, `application_deadline` is a `DATE` and the right-hand side is a UTC instant, so from 5 or 6 pm Calgary time on deadline day the UTC date is already tomorrow and the event disappears early.

**Files:**
- Modify: `src/lib/actions/applications.ts` (the import on line 4; `getActiveEvents`, lines 77–98)
- Create: `src/test/active-events.test.ts`
- Modify: `docs/backlog/2026-10-06-uat-and-go-live.md` (the Deferred "Deadline-less events" bullet: wrap it in `~~…~~` and append `Fixed by BL-20.`)

**Interfaces:**
- Consumes: `todayDateOnly(now?: Date): string` from `@/lib/format-date` — today's `America/Edmonton` calendar day as `YYYY-MM-DD`. Already exists; do not change it.
- Produces: `getActiveEvents()` keeps its signature and return type. Callers (`src/app/(public)/page.tsx`, `src/app/(public)/apply/page.tsx`) are not edited.

- [ ] **Step 1: Branch**

```bash
git checkout dev && git pull --ff-only && git checkout -b bl-20-deadline-less-events
```

- [ ] **Step 2: Write the failing test** — create `src/test/active-events.test.ts`:

```ts
// @vitest-environment node
//
// Node, not jsdom: applications.ts imports the email client, whose env module
// refuses to load where `window` exists.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getActiveEvents } from '@/lib/actions/applications';

// BL-20: an active event with a blank deadline stays open, and the deadline (a
// DATE column) is compared with today's Edmonton calendar day, not a UTC instant.

vi.mock('@/lib/email/client', () => ({ sendEmail: vi.fn() }));

type Result = { data: unknown; error: unknown };

let result: Result;
const calls = { eq: [] as unknown[][], or: [] as string[], gte: [] as unknown[][] };

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn().mockImplementation(async () => {
    const chain: Record<string, unknown> = {
      select: () => chain,
      eq: (...args: unknown[]) => {
        calls.eq.push(args);
        return chain;
      },
      or: (filter: string) => {
        calls.or.push(filter);
        return chain;
      },
      gte: (...args: unknown[]) => {
        calls.gte.push(args);
        return chain;
      },
      order: () => Promise.resolve(result),
    };
    return { from: () => chain };
  }),
}));

const OPEN_EVENT = {
  id: 'event-1',
  name: 'Winter Market',
  event_date: '2026-12-12',
  location: 'Hall',
  description: null,
  application_deadline: null,
};

beforeEach(() => {
  // Only the clock: the Supabase mock resolves through real promises.
  vi.useFakeTimers({ toFake: ['Date'] });
  // 01:30 UTC on the 22nd is 18:30 on the 21st in Edmonton (MST, UTC-7).
  vi.setSystemTime(new Date('2026-11-22T01:30:00Z'));
  calls.eq.length = 0;
  calls.or.length = 0;
  calls.gte.length = 0;
  result = { data: [OPEN_EVENT], error: null };
});

afterEach(() => {
  vi.useRealTimers();
});

describe('getActiveEvents', () => {
  it('keeps active events whose deadline is blank or is today or later in Edmonton', async () => {
    await getActiveEvents();

    expect(calls.eq).toEqual([['status', 'active']]);
    expect(calls.or).toEqual([
      'application_deadline.is.null,application_deadline.gte.2026-11-21',
    ]);
    expect(calls.gte).toEqual([]);
  });

  it('returns the rows the query yields', async () => {
    expect(await getActiveEvents()).toEqual([OPEN_EVENT]);
  });

  it('returns an empty list when the read fails', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    result = { data: null, error: { message: 'boom' } };

    expect(await getActiveEvents()).toEqual([]);
    consoleError.mockRestore();
  });
});
```

- [ ] **Step 3: Run it and see the first test fail**

Run: `npx vitest run src/test/active-events.test.ts`
Expected: the first test FAILS — `calls.or` is `[]` and `calls.gte` holds one call. The other two pass.

- [ ] **Step 4: Implement** — in `src/lib/actions/applications.ts`:

Line 4 becomes:

```ts
import { DATE_LONG, formatDateOnly, todayDateOnly } from '@/lib/format-date';
```

Replace the docstring and body of `getActiveEvents` (down to and including the `.order(...)` line) with:

```ts
/**
 * Fetches events visible to the public: status='active' and still open.
 * An event is open when it has no application deadline, or its deadline is
 * today or later. `application_deadline` is a DATE, so it is compared with
 * today's Edmonton calendar day rather than a UTC instant (BL-20).
 * Draft and closed events are excluded.
 */
export async function getActiveEvents() {
  const supabase = await createClient();
  const today = todayDateOnly();

  const { data: events, error } = await supabase
    .from('events')
    .select('id, name, event_date, location, description, application_deadline')
    .eq('status', 'active')
    .or(`application_deadline.is.null,application_deadline.gte.${today}`)
    .order('event_date', { ascending: true });
```

Leave the error branch and the `return events || [];` line as they are.

- [ ] **Step 5: Run the test again**

Run: `npx vitest run src/test/active-events.test.ts`
Expected: 3 passed.

- [ ] **Step 6: Prove the filter against a real database** — a mocked chain cannot tell you PostgREST accepts the filter string.

```bash
npx supabase start
psql postgresql://postgres:postgres@127.0.0.1:54322/postgres -c "
insert into events (name, event_date, location, status, application_deadline) values
  ('BL20 no deadline',    current_date + 30, 'Test', 'active', null),
  ('BL20 today deadline', current_date + 30, 'Test', 'active', (now() at time zone 'America/Edmonton')::date),
  ('BL20 past deadline',  current_date + 30, 'Test', 'active', (now() at time zone 'America/Edmonton')::date - 1);"
npm run dev
```

(No `psql`? Paste the same SQL into the local Studio SQL editor at `http://127.0.0.1:54323`.)

Open `http://localhost:3000/apply`. Expected: `BL20 no deadline` and `BL20 today deadline` are listed; `BL20 past deadline` is not. Open `/` and expect the same two cards, the first with no "Apply by" line. Then clean up:

```bash
psql postgresql://postgres:postgres@127.0.0.1:54322/postgres -c "delete from events where name like 'BL20 %';"
```

Record the three observations in the PR's Verification section.

- [ ] **Step 7: Backlog note, gate, commit, PR**

```bash
npm run format:check && npm run lint && npm test && npm run build
git add src/lib/actions/applications.ts src/test/active-events.test.ts docs/backlog/2026-10-06-uat-and-go-live.md
git commit -m "fix(apply): list active events that have no deadline [BL-20]"
git push -u origin bl-20-deadline-less-events
gh pr create --base dev --title "fix(apply): list active events that have no deadline [BL-20]" --body "<the five PR sections>"
```

**Done when:** the three unit tests pass, the local check shows the two open events and hides the past one, CI is green.

---

### Task BL-21: Require the organizer role on organizer reads

**Why.** Constitution Principle I.2: every privileged read authorizes with `requireRole()` at the top of the action. Five readers rely on RLS and the `/dashboard` middleware alone. Server actions are callable endpoints, so the action layer should refuse a vendor itself, as `templates.ts` and `export.ts` already do. RLS stays the authority; this restores the second layer. Every caller of these five functions is under `/dashboard` (verified 2026-11-21), which the middleware already limits to organizers and admins, so no page changes behaviour.

**Files:**
- Modify: `src/lib/actions/applications.ts` — `getApplications`, `getApplicationById`, `getApplicationCounts`
- Modify: `src/lib/actions/events.ts` — `getEvents`, `getEventById`
- Create: `src/test/organizer-read-auth.test.ts`
- Modify: `src/test/applications-readers.test.ts` (roles mock; header comment)
- Modify: `docs/ROADMAP.md` (Tier 3: strike "Read-auth consistency" and "`requireVendor()` helper")

**Interfaces:**
- Consumes: `requireRole(minimumRole: Role): Promise<RoleResponse>` from `@/lib/auth/roles`; on refusal it returns `{ success: false, error: 'Requires organizer role or higher', data: null }` (or `'Not authenticated'`).
- Produces: no signature changes. A refused caller gets `{ success: false, error: <the requireRole error>, data: null }` from four readers and all-zero counts from `getApplicationCounts`.

Do **not** add caching, a wrapper, or a shared helper for the guard. Five explicit four-line guards is the repo's pattern.

- [ ] **Step 1: Branch**

```bash
git checkout dev && git pull --ff-only && git checkout -b bl-21-organizer-read-auth
```

- [ ] **Step 2: Write the tests** — create `src/test/organizer-read-auth.test.ts`:

```ts
// @vitest-environment node
//
// Node, not jsdom: applications.ts imports the email client, whose env module
// refuses to load where `window` exists.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  getApplications,
  getApplicationById,
  getApplicationCounts,
} from '@/lib/actions/applications';
import { getEvents, getEventById } from '@/lib/actions/events';
import { requireRole } from '@/lib/auth/roles';

// BL-21 (constitution I.2): organizer-facing reads authorize with
// requireRole('organizer') before touching the database. RLS stays the
// authority; this is the action-layer half of the two-layer rule.

vi.mock('@/lib/email/client', () => ({ sendEmail: vi.fn() }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/auth/roles', () => ({ requireRole: vi.fn() }));

type Result = { data: unknown; error: unknown; count?: number | null };

const fromCalls: string[] = [];
const results: Record<string, Result> = {};

function chain(table: string) {
  const settle = () => Promise.resolve(results[table] ?? { data: [], error: null });
  const c: Record<string, unknown> = {
    select: () => c,
    eq: () => c,
    in: () => c,
    or: () => c,
    order: () => c,
    range: () => c,
    single: settle,
    then: (onFulfilled: (value: Result) => unknown, onRejected?: (reason: unknown) => unknown) =>
      settle().then(onFulfilled, onRejected),
  };
  return c;
}

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn().mockImplementation(async () => ({
    from: (table: string) => {
      fromCalls.push(table);
      return chain(table);
    },
  })),
}));

const ORGANIZER = {
  success: true,
  error: null,
  data: { role: 'organizer' as const, userId: 'user-1' },
};
const DENIED = { success: false, error: 'Requires organizer role or higher', data: null };

const EVENT = {
  id: 'event-1',
  name: 'Winter Market',
  event_date: '2026-12-12',
  location: 'Hall',
  description: null,
  application_deadline: null,
  status: 'active',
  max_vendors: null,
  created_at: '2026-11-01T00:00:00Z',
  updated_at: '2026-11-01T00:00:00Z',
};

const APPLICATION = {
  id: 'app-1',
  event_id: 'event-1',
  vendor_id: 'vendor-1',
  status: 'pending',
  submitted_at: '2026-11-03T18:00:00Z',
  updated_at: '2026-11-03T18:00:00Z',
  organizer_notes: null,
  vendor: {
    id: 'vendor-1',
    business_name: 'Jane Crafts',
    contact_name: 'Jane Doe',
    email: 'jane@example.com',
    product_links: ['https://etsy.com/shop/x'],
    description: null,
    user_id: null,
    created_at: '2026-11-01T00:00:00Z',
    updated_at: '2026-11-01T00:00:00Z',
  },
};

beforeEach(() => {
  vi.clearAllMocks();
  fromCalls.length = 0;
  for (const key of Object.keys(results)) delete results[key];
  vi.mocked(requireRole).mockResolvedValue(ORGANIZER);
});

describe('organizer reads refuse a caller below organizer', () => {
  beforeEach(() => {
    vi.mocked(requireRole).mockResolvedValue(DENIED);
  });

  it('getApplications', async () => {
    expect(await getApplications()).toEqual(DENIED);
    expect(requireRole).toHaveBeenCalledWith('organizer');
    expect(fromCalls).toEqual([]);
  });

  it('getApplicationById', async () => {
    expect(await getApplicationById('app-1')).toEqual(DENIED);
    expect(requireRole).toHaveBeenCalledWith('organizer');
    expect(fromCalls).toEqual([]);
  });

  it('getApplicationCounts answers all zeros', async () => {
    expect(await getApplicationCounts()).toEqual({
      pending: 0,
      approved: 0,
      rejected: 0,
      waitlisted: 0,
      total: 0,
    });
    expect(requireRole).toHaveBeenCalledWith('organizer');
    expect(fromCalls).toEqual([]);
  });

  it('getEvents', async () => {
    expect(await getEvents()).toEqual(DENIED);
    expect(requireRole).toHaveBeenCalledWith('organizer');
    expect(fromCalls).toEqual([]);
  });

  it('getEventById', async () => {
    expect(await getEventById('event-1')).toEqual(DENIED);
    expect(requireRole).toHaveBeenCalledWith('organizer');
    expect(fromCalls).toEqual([]);
  });
});

describe('organizer reads answer an organizer', () => {
  it('getApplications returns the page with its pagination', async () => {
    results['applications'] = { data: [APPLICATION], error: null, count: 1 };

    const result = await getApplications();

    expect(result.success).toBe(true);
    expect(result.data!.applications.map((a) => a.id)).toEqual(['app-1']);
    expect(result.data!.pagination).toEqual({
      page: 1,
      pageSize: 10,
      totalCount: 1,
      totalPages: 1,
    });
  });

  it('getApplicationCounts tallies by status', async () => {
    results['applications'] = {
      data: [{ status: 'pending' }, { status: 'approved' }, { status: 'pending' }],
      error: null,
    };

    expect(await getApplicationCounts()).toEqual({
      pending: 2,
      approved: 1,
      rejected: 0,
      waitlisted: 0,
      total: 3,
    });
  });

  it('getEvents attaches the application count to each event', async () => {
    results['events'] = { data: [EVENT], error: null };
    results['applications'] = {
      data: [{ event_id: 'event-1' }, { event_id: 'event-1' }],
      error: null,
    };

    const result = await getEvents();

    expect(result.success).toBe(true);
    expect(result.data).toEqual([{ ...EVENT, application_count: 2 }]);
  });

  it('getEventById returns the event', async () => {
    results['events'] = { data: EVENT, error: null };

    expect(await getEventById('event-1')).toEqual({ success: true, error: null, data: EVENT });
  });
});
```

- [ ] **Step 3: Run it**

Run: `npx vitest run src/test/organizer-read-auth.test.ts`
Expected: the five tests under "refuse a caller below organizer" FAIL (the readers return data and never call `requireRole`). The four under "answer an organizer" PASS — they describe behaviour that must not change.

- [ ] **Step 4: Add the guard to the three readers in `src/lib/actions/applications.ts`**

`getApplications` — insert as the first statements of the body, above `const supabase = await createClient();`:

```ts
  const auth = await requireRole('organizer');
  if (!auth.success) {
    return { success: false, error: auth.error ?? 'Unauthorized: insufficient role', data: null };
  }

```

`getApplicationById` — the same four lines, in the same position.

`getApplicationCounts` — in the same position:

```ts
  const auth = await requireRole('organizer');
  if (!auth.success) {
    return { pending: 0, approved: 0, rejected: 0, waitlisted: 0, total: 0 };
  }

```

`requireRole` is already imported in this file.

- [ ] **Step 5: Add the guard to the two readers in `src/lib/actions/events.ts`**

`getEvents` and `getEventById` — insert as the first statements of each body:

```ts
  const auth = await requireRole('organizer');
  if (!auth.success) {
    return { success: false, error: auth.error ?? 'Unauthorized: insufficient role', data: null };
  }

```

Update each function's docstring by appending `Requires organizer or admin role.` `requireRole` is already imported in this file.

- [ ] **Step 6: Keep the existing reader test honest** — in `src/test/applications-readers.test.ts`:

Add to the imports: `import { requireRole } from '@/lib/auth/roles';`

Replace the header comment that begins `// spec 011 contracts/server-actions-and-ui.md §6 and §14` (four lines) with:

```ts
// spec 011 contracts/server-actions-and-ui.md §6 and §14 (constitution II for
// the modified getApplicationById). The role gate is covered by
// organizer-read-auth.test.ts (BL-21); here the caller is always an organizer
// and the failure cases are the row not being visible (PGRST116) or a read error.
```

Add below the `vi.mock('@/lib/email/client', …)` line:

```ts
vi.mock('@/lib/auth/roles', () => ({ requireRole: vi.fn() }));
```

Add as the last statement of the existing `beforeEach`:

```ts
  vi.mocked(requireRole).mockResolvedValue({
    success: true,
    error: null,
    data: { role: 'organizer', userId: 'user-1' },
  });
```

- [ ] **Step 7: Run both files, then the whole unit suite**

Run: `npx vitest run src/test/organizer-read-auth.test.ts src/test/applications-readers.test.ts`
Expected: all pass (9 + 4).

Run: `npm test`
Expected: all pass. If a page or component test now fails because it renders something that calls one of the five readers unmocked, stop and report the file name — do not edit it without asking.

- [ ] **Step 8: Check the dashboard still loads** — `npx supabase start`, `npm run dev`, sign in as a local organizer or admin (`scripts/seed-role.sql` sets a role), open `/dashboard`, `/dashboard/applications`, `/dashboard/events` and one event's edit page. Expected: each renders its data as before. Record this in the PR.

- [ ] **Step 9: ROADMAP** — in `docs/ROADMAP.md` Tier 3, strike through (`~~…~~`) the bold lead of the "Read-auth consistency" bullet and of the "`requireVendor()` helper" bullet, and append to each, respectively:

```markdown
✅ **Shipped as BL-21** — the five readers call `requireRole('organizer')`; `src/test/organizer-read-auth.test.ts`.
```

```markdown
✅ **Met by spec 011** — `resolveVendorId()` in `src/lib/vendor/` is the one vendor lookup every loader uses.
```

Then run `grep -n "no requireRole\|RLS alone\|organizer-facing reads" docs/ARCHITECTURE.md docs/ROADMAP.md` and correct any sentence this PR makes false; change nothing else.

- [ ] **Step 10: Gate, commit, PR**

```bash
npm run format:check && npm run lint && npm test && npm run build
git add src/lib/actions/applications.ts src/lib/actions/events.ts src/test/organizer-read-auth.test.ts src/test/applications-readers.test.ts docs/ROADMAP.md docs/ARCHITECTURE.md
git commit -m "fix(auth): require the organizer role on organizer reads [BL-21]"
git push -u origin bl-21-organizer-read-auth
gh pr create --base dev --title "fix(auth): require the organizer role on organizer reads [BL-21]" --body "<the five PR sections>"
```

**Done when:** a vendor-role caller gets a refusal from all five readers without a database call; the dashboard pages render unchanged for an organizer; CI is green.

---

### Task BL-22: Action tests for role changes and event status; remove the `as Role` casts

**Why.** `updateUserRole` changes who is an admin and has no test. `updateEventStatus` has three tests (in `lock-on-publish.test.ts`) but none for the refusal or the missing row. Three `as Role` casts silence the compiler where the generated types already agree; one of them hides a real `null`.

Most of these tests describe behaviour that already exists, so they pass on first run. Each step says how to prove the test can fail.

**Files:**
- Modify: `src/test/admin-actions.test.ts`
- Modify: `src/test/lock-on-publish.test.ts` (two tests added to the existing `describe('updateEventStatus', …)`)
- Modify: `src/lib/actions/admin.ts:105`
- Modify: `src/lib/actions/auth.ts:90-91`
- Modify: `src/lib/auth/roles.ts:51`
- Modify: `docs/ROADMAP.md` (Tier 3 "Leftovers" bullet)

**Interfaces:**
- Consumes: `updateUserRole(userId: string, newRole: Role): Promise<{ success: boolean; error: string | null }>`; `updateEventStatus(id: string, newStatus: string): Promise<{ success: boolean; error: string | null }>`; the generated enum `Database['public']['Enums']['user_role']`, which is the same union as `Role`.
- Produces: no signature changes. `getUsers` maps a `null` role to `'vendor'` (the view already coalesces, so this only matters to the type).

Leave `src/components/admin/user-role-select.tsx:62` (`e.target.value as Role`) alone — it narrows a DOM string, a different problem.

- [ ] **Step 1: Branch**

```bash
git checkout dev && git pull --ff-only && git checkout -b bl-22-role-and-status-tests
```

- [ ] **Step 2: Extend the admin mock** — in `src/test/admin-actions.test.ts`:

Change the first import line's source list and add two imports:

```ts
import { getUsers, updateUserRole } from '@/lib/actions/admin';
import { requireRole } from '@/lib/auth/roles';
import type { Role } from '@/lib/constants/roles';
```

Replace the `vi.hoisted` block and the `vi.mock('@/lib/supabase/server', …)` block with:

```ts
const { mockSelect, mockRows, mockFrom, mockUpdate, mockUpdateEq, mockUpdateError } = vi.hoisted(
  () => ({
    mockSelect: vi.fn(),
    mockRows: { value: [] as unknown[] },
    mockFrom: vi.fn(),
    mockUpdate: vi.fn(),
    mockUpdateEq: vi.fn(),
    mockUpdateError: { value: null as { message: string } | null },
  })
);

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn().mockImplementation(async () => {
    const chain = {
      select: (columns: string) => {
        mockSelect(columns);
        return chain;
      },
      order: () => chain,
      returns: () => Promise.resolve({ data: mockRows.value, error: null }),
      update: (values: unknown) => {
        mockUpdate(values);
        return {
          eq: (column: string, value: string) => {
            mockUpdateEq(column, value);
            return Promise.resolve({ error: mockUpdateError.value });
          },
        };
      },
    };
    return {
      from: (table: string) => {
        mockFrom(table);
        return chain;
      },
    };
  }),
}));
```

Leave the existing `vi.mock('@/lib/auth/roles', …)` block as it is (admin, user id `99999999-9999-4999-8999-999999999999`).

- [ ] **Step 3: Add the null-role test (fails first)** — inside the existing `describe('getUsers', …)`:

```ts
  it('treats a null role from the view as vendor', async () => {
    // Arrange
    mockRows.value = [{ ...row('no-profile', false), role: null }];

    // Act
    const result = await getUsers();

    // Assert
    expect(result.data?.[0]?.role).toBe('vendor');
  });
```

Run: `npx vitest run src/test/admin-actions.test.ts -t "null role"`
Expected: FAIL — received `null`.

- [ ] **Step 4: Remove the three casts**

`src/lib/actions/admin.ts` line 105:

```ts
      role: user.role ?? 'vendor',
```

`src/lib/actions/auth.ts` lines 90–91:

```ts
    const userRole: Role =
      roleError?.code === 'PGRST116' || !roleData ? 'vendor' : roleData.role;
```

`src/lib/auth/roles.ts` line 51:

```ts
  const role: Role = roleData?.role ?? 'vendor';
```

Run: `npx tsc --noEmit`
Expected: no errors. If the compiler objects to any of the three, restore that one cast, leave the other two, and say so in the PR — do not add a different cast or a type guard.

Run: `npx vitest run src/test/admin-actions.test.ts src/test/auth-roles.test.ts`
Expected: all pass, including the null-role test.

- [ ] **Step 5: Add the `updateUserRole` tests** — append to `src/test/admin-actions.test.ts`:

```ts
// =============================================================================
// updateUserRole (BL-22)
// =============================================================================

const ADMIN_ID = '99999999-9999-4999-8999-999999999999';
const OTHER_ID = '11111111-1111-4111-8111-111111111111';

describe('updateUserRole', () => {
  beforeEach(() => {
    mockFrom.mockClear();
    mockUpdate.mockClear();
    mockUpdateEq.mockClear();
    mockUpdateError.value = null;
    vi.mocked(requireRole).mockResolvedValue({
      success: true,
      error: null,
      data: { role: 'admin', userId: ADMIN_ID },
    });
  });

  it('writes the new role to user_profiles for the given user', async () => {
    // Act
    const result = await updateUserRole(OTHER_ID, 'organizer');

    // Assert
    expect(result).toEqual({ success: true, error: null });
    expect(requireRole).toHaveBeenCalledWith('admin');
    expect(mockFrom).toHaveBeenCalledWith('user_profiles');
    expect(mockUpdate).toHaveBeenCalledWith({ role: 'organizer' });
    expect(mockUpdateEq).toHaveBeenCalledWith('id', OTHER_ID);
  });

  it('refuses a caller who is not an admin and writes nothing', async () => {
    // Arrange
    vi.mocked(requireRole).mockResolvedValue({
      success: false,
      error: 'Requires admin role or higher',
      data: null,
    });

    // Act
    const result = await updateUserRole(OTHER_ID, 'organizer');

    // Assert
    expect(result).toEqual({ success: false, error: 'Requires admin role or higher' });
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('refuses a role that does not exist and writes nothing', async () => {
    // Act
    const result = await updateUserRole(OTHER_ID, 'superuser' as unknown as Role);

    // Assert
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/invalid role/i);
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('refuses an admin demoting themselves and writes nothing', async () => {
    // Act
    const result = await updateUserRole(ADMIN_ID, 'organizer');

    // Assert
    expect(result).toEqual({
      success: false,
      error: 'Cannot demote yourself. Ask another admin to change your role.',
    });
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('lets an admin keep their own admin role', async () => {
    // Act
    const result = await updateUserRole(ADMIN_ID, 'admin');

    // Assert
    expect(result).toEqual({ success: true, error: null });
    expect(mockUpdateEq).toHaveBeenCalledWith('id', ADMIN_ID);
  });

  it('answers a generic failure when the write errors', async () => {
    // Arrange
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    mockUpdateError.value = { message: 'boom' };

    // Act
    const result = await updateUserRole(OTHER_ID, 'organizer');

    // Assert
    expect(result).toEqual({ success: false, error: 'Failed to update user role' });
    consoleError.mockRestore();
  });
});
```

Run: `npx vitest run src/test/admin-actions.test.ts`
Expected: all pass (3 `getUsers` + 6 `updateUserRole`).

**Mutation check:** in `src/lib/actions/admin.ts`, temporarily change `if (auth.data?.userId === userId && newRole !== 'admin')` to `if (false)`. Re-run: "refuses an admin demoting themselves" must FAIL. Restore the line by hand; `git diff src/lib/actions/admin.ts` must then show only the line-105 change from Step 4.

- [ ] **Step 6: Add the two `updateEventStatus` tests** — inside the existing `describe('updateEventStatus', …)` in `src/test/lock-on-publish.test.ts`, after its last `it`:

```ts
  it('refuses a caller below organizer without revalidating', async () => {
    vi.mocked(requireRole).mockResolvedValue({
      success: false,
      error: 'Requires organizer role or higher',
      data: null,
    });

    const result = await updateEventStatus(EVENT_ID, 'active');

    expect(result).toEqual({ success: false, error: 'Requires organizer role or higher' });
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it('answers not found when the event row is missing', async () => {
    enqueue(null, { code: 'PGRST116', message: 'No rows' });

    const result = await updateEventStatus(EVENT_ID, 'active');

    expect(result).toEqual({ success: false, error: 'Event not found' });
    expect(revalidatePath).not.toHaveBeenCalled();
  });
```

Run: `npx vitest run src/test/lock-on-publish.test.ts`
Expected: all pass.

**Mutation check:** in `src/lib/actions/events.ts` `updateEventStatus`, temporarily change `if (!auth.success)` to `if (false)`. Re-run: the refusal test must FAIL. Restore, and confirm `git diff src/lib/actions/events.ts` is empty.

- [ ] **Step 7: ROADMAP** — in `docs/ROADMAP.md` Tier 3, replace the whole "Leftovers absorbed from cleanup-roadmap.md" bullet with:

```markdown
- ~~Leftovers absorbed from cleanup-roadmap.md~~ ✅ **Closed by BL-22** — the `as Role` casts in
  `admin.ts`, `auth.ts` and `roles.ts` are gone; `updateUserRole` and `updateEventStatus` have
  action tests (`admin-actions.test.ts`, `lock-on-publish.test.ts`); attachment orphaning went
  with the legacy form (spec 011).
```

- [ ] **Step 8: Gate, commit, PR**

```bash
npm run format:check && npm run lint && npm test && npm run build
git add src/test/admin-actions.test.ts src/test/lock-on-publish.test.ts src/lib/actions/admin.ts src/lib/actions/auth.ts src/lib/auth/roles.ts docs/ROADMAP.md
git commit -m "test(admin): cover role changes and status refusals; drop the Role casts [BL-22]"
git push -u origin bl-22-role-and-status-tests
gh pr create --base dev --title "test(admin): cover role changes and status refusals; drop the Role casts [BL-22]" --body "<the five PR sections>"
```

**Done when:** nine admin tests and the two new status tests pass, both mutation checks were seen to fail and were restored, `npx tsc --noEmit` is clean, CI is green.

---

### Task BL-23: Keep a refused submission on screen (F-005)

**Why.** When `submitDynamicApplication` refuses (a duplicate, a closed event, invalid answers, an upload failure) the only signal is a toast that disappears after about four seconds. A vendor who looks away sees an unchanged form and no reason. The organizers logged this as F-005 on 2026-10-07. The fix is an inline message that stays above the submit button; the toast stays too.

**Files:**
- Modify: `src/app/(public)/apply/_components/dynamic-application-form.tsx`
- Modify: `src/test/dynamic-application-form.test.tsx`

**Interfaces:**
- Consumes: `submitDynamicApplication` (unchanged); `DUPLICATE_APPLICATION_MESSAGE` from `@/lib/submission/errors` (test only).
- Produces: no prop changes to `DynamicApplicationForm`.

Do not add a new component, change the toast, or restyle the form.

- [ ] **Step 1: Branch**

```bash
git checkout dev && git pull --ff-only && git checkout -b bl-23-inline-submit-error
```

- [ ] **Step 2: Write the failing tests** — in `src/test/dynamic-application-form.test.tsx` add the import:

```ts
import { DUPLICATE_APPLICATION_MESSAGE } from '@/lib/submission/errors';
```

and add inside `describe('DynamicApplicationForm submission', …)`:

```tsx
  it('keeps a refused submission on screen as an inline alert (F-005)', async () => {
    mockSubmitDynamic.mockResolvedValue({
      success: false,
      error: DUPLICATE_APPLICATION_MESSAGE,
      data: null,
    });

    const user = userEvent.setup();
    render(
      <DynamicApplicationForm
        accountEmail={null}
        eventId="event-1"
        eventName="Holiday Market"
        questions={[ONE_TEXT_QUESTION]}
      />
    );

    await fillVendorFields(user);
    await user.type(screen.getByLabelText(/describe your products/i), 'Handmade pottery');
    await user.click(screen.getByRole('button', { name: /submit application/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(DUPLICATE_APPLICATION_MESSAGE);
    expect(vi.mocked(toast.error)).toHaveBeenCalledWith(DUPLICATE_APPLICATION_MESSAGE);
    expect(screen.getByRole('button', { name: /submit application/i })).toBeEnabled();
  });

  it('lets the vendor submit again after a refusal', async () => {
    mockSubmitDynamic
      .mockResolvedValueOnce({ success: false, error: 'Failed to create application', data: null })
      .mockResolvedValueOnce({ success: true, error: null, data: { applicationId: 'app-1' } });

    const user = userEvent.setup();
    render(
      <DynamicApplicationForm
        accountEmail={null}
        eventId="event-1"
        eventName="Holiday Market"
        questions={[ONE_TEXT_QUESTION]}
      />
    );

    await fillVendorFields(user);
    await user.type(screen.getByLabelText(/describe your products/i), 'Handmade pottery');
    await user.click(screen.getByRole('button', { name: /submit application/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Failed to create application');

    await user.click(screen.getByRole('button', { name: /submit application/i }));

    await waitFor(() => {
      expect(screen.getByText(/application submitted/i)).toBeInTheDocument();
    });
  });
```

- [ ] **Step 3: Run and see them fail**

Run: `npx vitest run src/test/dynamic-application-form.test.tsx -t "refus"`
Expected: the two new tests FAIL — no element with role `alert` is found. (An existing test, "refuses a blank Link 1…", also matches the filter and passes.)

- [ ] **Step 4: Implement** — in `src/app/(public)/apply/_components/dynamic-application-form.tsx`:

Add one state hook after the `answerErrors` hook:

```tsx
  const [submitError, setSubmitError] = React.useState<string | null>(null);
```

Add this function immediately above `const onSubmit = async (vendor: VendorFields) => {`:

```tsx
  // A refusal stays on screen: the toast alone is gone in a few seconds (F-005).
  const fail = (message: string) => {
    toast.error(message);
    setSubmitError(message);
    setState({ status: 'idle' });
  };
```

In `onSubmit`, directly above `setState({ status: 'submitting' });`, add:

```tsx
    setSubmitError(null);
```

Replace the three failure exits in `onSubmit`:

```tsx
        if (!file) {
          fail(`File missing for "${q.label}"`);
          return;
        }
```

```tsx
        if (!uploadResult.success || !uploadResult.data) {
          fail(uploadResult.error ?? `Failed to upload file for "${q.label}"`);
          return;
        }
```

```tsx
    if (!result.success) {
      fail(result.error ?? 'Failed to submit application');
      return;
    }
```

Directly above the submit `<Button …>` add:

```tsx
      {submitError && (
        <p className="text-sm text-red-400" role="alert">
          {submitError}
        </p>
      )}
```

(`text-sm text-red-400` with `role="alert"` is what the `Input` primitive uses for field errors.)

- [ ] **Step 5: Run the whole form test file**

Run: `npx vitest run src/test/dynamic-application-form.test.tsx`
Expected: all pass, the two new tests included.

- [ ] **Step 6: See it** — `npx supabase start`, `npm run dev`, publish a local event with the default questionnaire, submit an application at `/apply`, then submit a second one with the same email. Expected: the red line "You have already submitted an application for this event" stays above the button after the toast has gone. Record it in the PR.

- [ ] **Step 7: Backlog note, gate, commit, PR** — in `docs/backlog/2026-10-06-uat-and-go-live.md`, in the "Organizer judgement calls" bullet, change `(F-005) — "later"` to `(F-005) — "later"; fixed by BL-23`. Add that file to the commit.

```bash
npm run format:check && npm run lint && npm test && npm run build
git add "src/app/(public)/apply/_components/dynamic-application-form.tsx" src/test/dynamic-application-form.test.tsx docs/backlog/2026-10-06-uat-and-go-live.md
git commit -m "fix(apply): keep a refused submission on screen as an inline alert [BL-23]"
git push -u origin bl-23-inline-submit-error
gh pr create --base dev --title "fix(apply): keep a refused submission on screen as an inline alert [BL-23]" --body "<the five PR sections>"
```

**Done when:** both new tests pass, the duplicate message is visible inline on the local app, CI is green.

---

### Task BL-24: Promote Track A to production (joint — Owen's go)

Not an agent-alone task. With Owen present: follow `docs/runbooks/event-week-smoke.md` exactly as the BL-17 promotion did (fast-forward `dev` → `main`, wait for the Vercel Production deploy, `npm run smoke` against prod before and after the click-through, clean up test data, add the dated entry to the runbook). There is no migration in Track A. Two extra checks for this promotion, both on prod with a throwaway event that is deleted afterwards: an active event saved with a blank deadline appears on `/apply` (BL-20); a second submission with the same email leaves the inline message on screen (BL-23).

---

## Track B — Spec 012: vendor data isolation (Speckit)

**Why a spec.** It changes storage policies, a view's readers and what a vendor can read from `applications` — exactly the "touches schema, RLS, or auth" row of the ROADMAP table — and three of the four fixes involve a real design choice that should be recorded, not improvised.

**What is known (verified against the migrations on 2026-11-21).**

| Gap | Where | Fact |
|---|---|---|
| Read any file | `011_close_public_data_exposure.sql:301` | `attachments_authenticated_select` is `USING (bucket_id = 'attachments')` for every `authenticated` user |
| Delete any file | `011_close_public_data_exposure.sql:305` | `attachments_authenticated_delete` has the same condition; no app code deletes objects |
| List all accounts | `013_users_with_roles_invite_pending.sql:28-30` | only `anon` was revoked; `authenticated` keeps `SELECT`, and the view runs as its owner |
| Organizer notes | `005_rbac_rls_policies.sql:142` | `authenticated_select_applications` lets a vendor read their own row, and `organizer_notes` is a column on that row; `vendor-dashboard.ts` leaves it out of its select, but PostgREST will return it to the vendor's own token |

**Consumers the spec must not break.**

- Anonymous upload on `/apply` happens **before** any vendor or application row exists, and object names are `uploads/<timestamp>-<random>-<name>` — they carry no owner.
- Organizers open files through `createSignedUrl` from the browser (`src/components/questionnaire/file-answer-link.tsx`, `src/app/dashboard/applications/[id]/attachments-list.tsx`).
- A vendor opens their own files from their application detail page through the same component.
- The Team page (`getUsers`, admin) reads `users_with_roles` with the session client.
- `listTemplates` (`src/lib/actions/templates.ts:92`) reads `users_with_roles` **as an organizer** to show who created a template.
- `src/lib/team/invite-organizer-core.ts:45` reads the view with the service-role client.
- The organizer review page and the CSV export read `organizer_notes`; organizers write it.
- `docs/runbooks/reset-hosted-project.md` removes bucket objects.
- `src/test/security/storage.test.ts` ST4 asserts an organizer **can** delete.

**Design questions for `/speckit-clarify` and `/speckit-plan` to settle — do not pre-decide them in the seed.**

1. How is an uploaded object tied to its owner when the name carries none — through the file path stored in the vendor's `application_answers` / `attachments` rows, or some other way?
2. Does any signed-in role keep delete on the bucket, or does it go to organizers only, or away entirely?
3. If the account list becomes admin-only, how does an organizer still see a template's creator?
4. How are organizer notes kept from a vendor when both roles query as `authenticated` — and without breaking the organizer's read and write?

### Steps

- [ ] **B1 — Specify.** New session, on `dev`. Run `/speckit-specify` with this seed (lean on purpose: what and why, consumers, scope, constraints; the how belongs to the plan):

```text
Vendor data isolation. A signed-in vendor account can reach data that belongs to other vendors or to the organizers, and production has open vendor sign-up, so anyone can make such an account. Four gaps, found by reading the policies on 2026-11-21: any signed-in account can read or mint a link to any file in the attachments bucket; any signed-in account can delete any file in that bucket; any signed-in account can list every account's email address and role through the users_with_roles view; a vendor can read the organizers' private notes on their own applications by querying the API directly, because the notes are a column on a row the vendor may read. Nothing automated proves vendors are isolated from each other.

What it should do: a vendor reads only their own vendor record, applications, answers and uploaded files, never another vendor's, never organizer notes, never the account list. Organizers and admins keep everything they have today. An automated suite against a real database proves each statement for two vendors, an organizer, an admin and an anonymous caller.

Who relies on the current behaviour and must keep working: anonymous upload on the apply form, which happens before any vendor or application row exists and names files without an owner; organizers opening files from the review page through short-lived signed links; a vendor opening their own files from their application page; the admin Team page listing accounts with the pending-invite flag; the template list showing organizers who created each template; the invite flow reading the account view with the service role; the organizer review page and the CSV export reading organizer notes; the hosted-project reset runbook removing bucket objects.

In scope: read and delete rules for the attachments bucket; who can read users_with_roles; keeping organizer notes from vendors at the database; a cross-vendor isolation suite under src/test/security; rolling the migration out to local, dev and prod; bringing the docs up to date.

Out of scope: how uploads are named or when they happen; the anonymous upload rule; cleaning up orphaned uploads; role in JWT claims; any interface change a tightened rule does not force; deadline enforcement inside the submission function; making template updates atomic.

Constraints: one append-only migration numbered 016; no new packages; the service-role client stays contained to the existing admin module; row level security stays the authority and application code never stands in for it; every rule ships with a real-database test that fails before the migration and passes after; the existing security suites keep passing, changed only where a test asserted the old broad behaviour; constitution 1.1.3.
```

- [ ] **B2 — Clarify.** `/speckit-clarify`. Give it the four design questions above. Owen answers; the answers land in the spec's Clarifications section.
- [ ] **B3 — Plan.** `/speckit-plan`. The plan must (a) quote the four facts and the consumer list above and say how each consumer still works, (b) name the one migration `016_…sql`, (c) list the new security-suite cases by ID, each stated as "caller X does Y → sees Z", (d) include a rollback statement for the migration.
- [ ] **B4 — Tasks.** `/speckit-tasks`. One task = one PR. The first implementation task writes the isolation suite cases **red** against the current schema; the migration task turns them green. A task that changes `src/types/database.ts` regenerates it with `npm run db:types:local`, never by hand.
- [ ] **B5 — Analyze.** `/speckit-analyze`. Fix every finding in the spec documents before any code.
- [ ] **B6 — Spec docs PR.** Open the spec, plan and tasks as one docs PR to `dev`; Owen reads and merges it. **No implementation starts before that merge and Owen's go** (standing rule).
- [ ] **B7 — Implement task by task.** One session per task, on Opus, with the spec's own `tasks.md` as the instructions (`/speckit-implement` for the named task, or the Track A session prompt pointed at the spec task). Each PR: local stack up, `npm run test:security` green, then the usual gate.
- [ ] **B8 — Review each PR.** `/security-review` and `/code-review high <PR>` in a fresh session. Ask the reviewer to verify claims by running the suite, not by reading the PR body.
- [ ] **B9 — Roll out (Owen present, default mode).** Migration `016` to the dev project → probe with two throwaway vendor accounts on the training site (vendor A cannot open vendor B's file, cannot list accounts, cannot read notes; an organizer can do all of their usual work) → migration to prod with the inventory → confirm → write → verify sequence used for `014`/`015` → promotion → smoke runbook.
- [ ] **B10 — Close out.** `specs/README.md` row, `CLAUDE.md` (migration list, database state, recent changes), `docs/ARCHITECTURE.md` §10, `docs/ROADMAP.md` Tier 3 (strike the `users_with_roles` and cross-vendor items), the backlog's UAT-10 bullet, `supabase/migrations/README.md`.

**Guard rails for the spec's implementer.** No policy is loosened to make a consumer work — if a consumer breaks, the answer is a narrower read path for that consumer, written down in the plan first. No `SECURITY DEFINER` function takes a caller-supplied identity. No service-role use in a page or a loader. If a clean design for question 1 or 4 needs more than one migration or a table change, stop and bring it back to Owen rather than widening the spec.

---

## Track C — optional features (each starts with its own brainstorm)

These are deliberately not planned to step level here: each needs a short decision first, and planning them now would be guessing. For each, open a session and say: `Use superpowers:brainstorming for BL-2x as described in docs/superpowers/plans/2026-11-21-post-launch-hardening.md, then superpowers:writing-plans. Stop after the plan is written.` Review the plan, then run it like a Track A task.

### BL-25: Mobile pass at 375 px (Epic 6.10)

- **Route:** brainstorm → one PR. No spec (CSS only).
- **Method:** with the local app running, walk every route in CLAUDE.md's Route Structure at 375 px wide; write down each defect (overflow, clipped text, a target under 44 px, unreadable contrast) with its route and a screenshot **before** changing anything. That list is the scope; Owen trims it.
- **Constraints:** Tailwind classes and tokens only; no new components; no layout redesign; no change to desktop rendering (re-check each touched page at 1280 px). The `Button` primitive's 44 px minimum is not weakened.
- **Tests:** none for pure CSS (ROADMAP: verify presentational UI by running the app). If a fix changes what a component renders, its existing test must still pass.
- **Done when:** every listed defect is fixed or explicitly declined by Owen, with before/after screenshots in the PR.

### BL-26: File previews on the apply form (Epic 6.9)

- **Route:** brainstorm → one PR. No spec.
- **Scope:** in the `file_upload` question input (`src/components/forms/question-input.tsx`), after a vendor picks a file and before they submit: a small thumbnail for images, the file name and a document icon for PDFs, and a way to remove the choice. Local preview only — nothing is uploaded earlier than today.
- **Decide in the brainstorm:** thumbnail size; whether to show the file size. Nothing else.
- **Constraints:** no new package; revoke object URLs on change and unmount; constitution IV asks for `next/image` for user images — a local `blob:` preview needs `unoptimized`, justify it in the PR; must read correctly on the dark background.
- **Tests:** extend `src/test/dynamic-application-form.test.tsx` (or the question-input test) — picking an image shows its name and a preview element with accessible alt text; picking a PDF shows its name; removing clears it and the required check fires again.

### BL-27: Questionnaire answers in the CSV export (F-001)

- **Route:** brainstorm → one PR. No spec (no schema change), but the column rules must be written down and agreed before code — this is "review/export behaviour", which the ROADMAP routes through Owen.
- **Recommended shape to confirm in the brainstorm:** when the export is filtered to **one event**, append one column per question of that event's questionnaire, in question order, after the eleven existing columns; with no event filter the export stays exactly as it is. Choice answers export their labels, multi-choice joined with `; `, yes/no as `Yes`/`No`, dates as stored, file answers as the file name, a question hidden by its show-if as blank.
- **Constraints:** the eleven existing columns and their order do not change; the read goes through the existing session client under `requireRole('organizer')`; no new action.
- **Tests:** extend `src/test/export.test.ts` — header row with and without an event filter; one row per answer type; a hidden question; a value containing a comma and a quote.

---

## Parked — and what would un-park each

| Item | Reason | Revisit when |
|---|---|---|
| Atomic `updateTemplate` | Needs a new RPC (a migration). Prod has zero templates; a half-saved template is re-saved in seconds | The next change that touches templates — then as a Phase 12 task list on spec 005, the way Phase 11 was |
| Shared `ActionResponse<T>` | Touches every action file for no behaviour change | A file is being restructured anyway |
| Split `applications.ts` | 730 lines, down from 1,037 | It passes roughly 1,000 again, or a spec does major surgery there |
| Email via `after()` | Removes the action's ability to return the email-failed `warning` (spec 007) | Submit latency is measured and is a real complaint |
| Structured logging | A constitutional amendment for a problem nobody has reported | An incident where Vercel logs were not enough |
| Role in JWT claims | Auth change for cleanliness only | Middleware latency is measured and matters |
| Shared icon module | Cosmetic deduplication | BL-25 touches the same SVGs |
| Spec 008 self-hosting | Deferred by decision 2026-10-06 | Owen reopens it; fold in the eight review findings first |

---

## Session prompts

**Track A task (Opus):**

```text
Read docs/superpowers/plans/2026-11-21-post-launch-hardening.md. Execute task BL-__ only, exactly as written, using the superpowers:executing-plans skill. Follow its Global Constraints. Stop when the pull request to dev is open and CI is green. Report the PR number, the gate output and anything you noticed and left alone. Do not start another task.
```

**Review (fresh session):**

```text
/code-review high <PR number>
```

then, if you want a second pair of eyes on the claims:

```text
Review PR <number> against task BL-__ in docs/superpowers/plans/2026-11-21-post-launch-hardening.md. Check out the branch, run the commands its Verification section lists, and tell me which claims hold. List anything outside the task's Files block. No nitpicks.
```

**Fixes after review:**

```text
On branch <branch>, address these review findings for PR <number>, one commit, same task ID. Change nothing else. <paste findings>
```

**After merge (tick):**

```text
PR <number> for BL-__ is merged. On dev, tick BL-__ in docs/superpowers/plans/2026-11-21-post-launch-hardening.md and in docs/backlog/2026-10-06-uat-and-go-live.md with the PR number and today's date. Commit as docs(backlog): tick BL-__ (#<number>) [BL-__] and push.
```
