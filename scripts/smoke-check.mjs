#!/usr/bin/env node
// Read-only smoke check for a deployed app and its Supabase project.
//
// Run it before event week, after every promotion to `main`, and whenever a hosted project
// wakes from a free-tier pause. It automates the spec 006 exposure probe — which existed
// only as a block of curl in a quickstart nobody re-runs — and adds the three invariants an
// organizer actually trips over on event day: the public pages answer, every active event
// has a questionnaire with questions, and the public write path still exists while the
// organizer-only RPCs still refuse anon.
//
// It cannot write. Both RPCs it calls raise before touching a row: the nil event id fails
// submit_public_application's event gate (P0002, the function's first executable statement,
// ahead of every other validation) and the organizer RPCs have no anon EXECUTE (42501).
// submit_public_application is never called with a real event id.
//
// Usage — values live in the shell only, never in .env.local and never committed:
//   SMOKE_APP_URL=https://<host> \
//   SMOKE_SUPABASE_URL=https://<ref>.supabase.co \
//   SMOKE_SUPABASE_ANON_KEY=<anon key> \
//   npm run smoke
//
// Exit codes: 0 every check passed · 1 at least one failed · 2 usage (a variable missing).
//
// Procedure: docs/runbooks/event-week-smoke.md
// Spec: specs/007-production-readiness/ (T011, T021) · Research: research.md R6
//
// Plain ESM, Node >= 20 (native fetch, AbortSignal.timeout). The only dependency is
// @supabase/supabase-js, already a direct dependency of the app.

import { createClient } from '@supabase/supabase-js';

/** Per-request budget, applied to the page fetches and to every Supabase call. */
const TIMEOUT_MS = 10_000;

/** A uuid no row can hold. Both RPCs reject it before any write. */
const NIL_UUID = '00000000-0000-0000-0000-000000000000';

/** Closed to anon by migration 011; each must read back empty. */
const PRIVATE_TABLES = ['vendors', 'applications', 'attachments', 'application_answers'];

const REQUIRED_ENV = ['SMOKE_APP_URL', 'SMOKE_SUPABASE_URL', 'SMOKE_SUPABASE_ANON_KEY'];

// ---------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------

/** Exits 2 — distinct from 1 — so a wrapper can tell "not configured" from "broken". */
function readEnv() {
  const missing = REQUIRED_ENV.filter((name) => !process.env[name]?.trim());

  if (missing.length > 0) {
    process.stderr.write(
      `missing: ${missing.join(', ')}\n\n` +
        'usage: SMOKE_APP_URL=<app origin> SMOKE_SUPABASE_URL=<project url> ' +
        'SMOKE_SUPABASE_ANON_KEY=<anon key> npm run smoke\n' +
        '  Use the ANON key, never the service role key: these checks prove what an\n' +
        '  anonymous visitor can reach, and a service key would pass all five while\n' +
        '  proving nothing.\n' +
        '  Procedure: docs/runbooks/event-week-smoke.md\n'
    );
    process.exit(2);
  }

  // A trailing slash would make `${appUrl}/apply` a double slash, which some hosts 404.
  const trimmed = (name) => process.env[name].trim().replace(/\/+$/, '');

  return {
    appUrl: trimmed('SMOKE_APP_URL'),
    supabaseUrl: trimmed('SMOKE_SUPABASE_URL'),
    anonKey: process.env.SMOKE_SUPABASE_ANON_KEY.trim(),
  };
}

// ---------------------------------------------------------------------------
// Failure description
// ---------------------------------------------------------------------------

/** Stripped from every printed reason: a failure can quote the request it failed on. */
let anonKeyForRedaction = '';

/** The output is meant to be pasted into a PR or an evidence row. The key never goes in it. */
function redact(text) {
  return anonKeyForRedaction ? text.split(anonKeyForRedaction).join('[redacted]') : text;
}

/**
 * Node's fetch reports every network-level failure as "fetch failed" and keeps the reason
 * (`getaddrinfo ENOTFOUND …`, `ECONNREFUSED`) in `cause` — the same unwrapping
 * src/app/api/keepalive/route.ts does. A paused Supabase project presents as NXDOMAIN, so
 * without the cause the one failure worth catching arrives with its reason stripped.
 */
function describeError(error) {
  if (!(error instanceof Error)) return String(error);

  const cause = error.cause instanceof Error ? error.cause.message : error.cause;

  return cause ? `${error.message}: ${String(cause)}` : error.message;
}

/**
 * supabase-js does not throw for these calls; it returns { data, error, status }. A real
 * PostgREST or Postgres failure carries a code (a SQLSTATE like 42501, or a PGRST… code),
 * but a transport failure — DNS, connection refused, or our own 10 s timeout — is reported
 * by postgrest-js with an EMPTY code and status 0. That case is spelled out here, or the
 * line would read "expected P0002, got " and send the reader looking for a SQLSTATE that
 * was never involved.
 */
function describeRestError(error, status) {
  if (!error.code) return `request failed: ${error.message}`;

  return `${error.code} (HTTP ${status}): ${error.message}`;
}

/**
 * True when PostgREST rejected the request before it ever reached the function — a bad or
 * expired key (PGRST301, HTTP 401). Worth its own branch because the obvious reading of
 * "not the code I expected" is that the database answered something unexpected, when in
 * fact the database was never consulted. HTTP 403 is deliberately NOT treated this way:
 * that is what a 42501 raised by the function itself returns.
 */
function isRejectedBeforeReachingPostgres(code, status) {
  return code === 'PGRST301' || status === 401;
}

// ---------------------------------------------------------------------------
// Check runner
// ---------------------------------------------------------------------------

const pass = (note) => ({ ok: true, note });
const fail = (reason) => ({ ok: false, reason });

const failed = [];

/**
 * Runs one check and prints its single line. A check reports by returning pass()/fail();
 * a throw is caught here and counts as a failure, so no bug inside a check can turn into a
 * silent success.
 */
async function runCheck(name, fn) {
  let result;

  try {
    result = await fn();
  } catch (error) {
    result = fail(describeError(error));
  }

  if (result.ok) {
    process.stdout.write(`PASS ${name}${result.note ? ` (${result.note})` : ''}\n`);
  } else {
    process.stdout.write(`FAIL ${name}: ${redact(result.reason)}\n`);
    failed.push(name);
  }
}

// ---------------------------------------------------------------------------
// The five checks
// ---------------------------------------------------------------------------

/** 1. The two public pages a vendor reaches without an account. */
async function checkAppPages(appUrl) {
  const problems = [];

  for (const path of ['/', '/apply']) {
    try {
      const response = await fetch(`${appUrl}${path}`, {
        // Asks the CDN to revalidate: a stale edge-cached 200 would otherwise pass while
        // the origin is down, which is exactly the failure worth catching after a deploy.
        headers: { 'cache-control': 'no-cache' },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });

      // Drain the body so the socket is released rather than left half-read.
      await response.arrayBuffer();

      if (response.status !== 200) problems.push(`${path} → HTTP ${response.status}`);
    } catch (error) {
      problems.push(`${path} → ${describeError(error)}`);
    }
  }

  return problems.length > 0 ? fail(problems.join('; ')) : pass();
}

/** 2. The spec 006 posture: anon sees nothing in the four private tables. */
async function checkPrivateTables(supabase) {
  const problems = [];

  for (const table of PRIVATE_TABLES) {
    // limit(1) is enough — one readable row is the failure — and it keeps a regression from
    // dumping a whole table of vendor PII into the terminal.
    const { data, error, status } = await supabase.from(table).select('id').limit(1);

    if (error) {
      // A 42501 here would mean anon lost even table-level SELECT: stricter than required,
      // but still a change to the posture, so it is reported rather than quietly accepted.
      problems.push(`${table} → ${describeRestError(error, status)}`);
    } else if (data.length > 0) {
      problems.push(`${table} → readable by anon`);
    }
  }

  return problems.length > 0 ? fail(problems.join('; ')) : pass();
}

/** 3. Every active event has a questionnaire, and that questionnaire has questions. */
async function checkQuestionnaireInvariant(supabase) {
  // One embedded select rather than three round trips: PostgREST resolves both embeds
  // through the real foreign keys (event_questionnaires.event_id → events.id,
  // event_questions.event_questionnaire_id → event_questionnaires.id) and answers PGRST200
  // if either stops existing, so a future schema change cannot quietly degrade this into an
  // empty column. Both questionnaire tables are anon-readable by design (migration 009 —
  // vendors at /apply read them without an account); anon sees only active events anyway.
  const { data, error, status } = await supabase
    .from('events')
    .select('id,name,event_questionnaires(id,event_questions(id))')
    .eq('status', 'active');

  if (error) return fail(describeRestError(error, status));

  // Zero active events is a marketplace between events, not a fault: the check is a
  // universal statement over active events and is vacuously true on an empty set. Failing
  // would assert "there is at least one active event" — a business state, not a health one.
  // The note keeps the vacuous pass visible instead of letting a bare PASS imply more.
  if (data.length === 0) return pass('no active events');

  const problems = [];

  for (const event of data) {
    const label = `"${event.name}" (${event.id})`;

    // event_questionnaires.event_id is UNIQUE, so PostgREST treats the embed as to-one and
    // returns an object; the array shape has appeared across versions. Normalise rather
    // than depend on which one this project's PostgREST produces.
    const questionnaire = Array.isArray(event.event_questionnaires)
      ? event.event_questionnaires[0]
      : event.event_questionnaires;

    if (!questionnaire) {
      problems.push(`${label} has no event_questionnaires row`);
    } else if ((questionnaire.event_questions ?? []).length === 0) {
      problems.push(`${label} has a questionnaire with no questions`);
    }
  }

  return problems.length > 0
    ? fail(problems.join('; '))
    : pass(`${data.length} active event${data.length === 1 ? '' : 's'}`);
}

/** 4. The public write path exists and rejects an unknown event before writing. */
async function checkSubmitRpcGate(supabase) {
  const { data, error, status } = await supabase.rpc('submit_public_application', {
    p_submission: {
      event_id: NIL_UUID,
      vendor: {
        business_name: 'smoke',
        contact_name: 'smoke',
        email: 'smoke@example.invalid',
      },
    },
  });

  // Success would mean a row was written for the nil event — the one outcome this script
  // must never produce. Tested first, on its own branch, so it can never fall through.
  if (!error) {
    return fail(`the nil event id was ACCEPTED (HTTP ${status}): ${JSON.stringify(data)}`);
  }

  if (error.code === 'P0002') return pass();

  // 42501 is a pass in check 5 and a production outage here, which is why the hints are
  // per-check rather than shared.
  const hints = {
    PGRST202: ' — PostgREST cannot see the function: is migration 011 applied to this project?',
    42883: ' — the function does not exist here',
    42501: ' — anon has no EXECUTE, so the public application form cannot submit at all',
    P0001: ' — a row is somehow using the nil uuid and is not active; check the events table',
    '': ' — the request never reached PostgREST (DNS, refused, or the 10 s timeout)',
  };

  const hint =
    hints[error.code] ??
    (isRejectedBeforeReachingPostgres(error.code, status)
      ? ' — the key was rejected, so the function was never reached; check SMOKE_SUPABASE_ANON_KEY'
      : '');

  return fail(`expected P0002, got ${describeRestError(error, status)}${hint}`);
}

/** 5. Both organizer-only RPCs refuse anon. */
async function checkOrganizerRpcsDenied(supabase) {
  // Migration 011 revoked anon EXECUTE on both; migration 012 also gates each with an
  // in-function get_user_role() check. Either layer answers 42501, and that is the point:
  // whichever one is doing the work, anon is refused.
  const calls = [
    ['create_event_with_default_questionnaire', { p_event: {} }],
    ['ensure_event_questionnaire', { p_event_id: NIL_UUID }],
  ];

  const problems = [];

  for (const [fn, args] of calls) {
    const { error, status } = await supabase.rpc(fn, args);

    if (!error) {
      problems.push(`${fn} → anon was ALLOWED to call it (HTTP ${status})`);
      continue;
    }

    if (error.code === '42501') continue;

    // Any other code means the role gate did not fire. 23502 in particular — a NOT NULL
    // violation raised by `p_event: {}` — means anon reached the INSERT itself.
    const hint =
      error.code === 'PGRST202' || error.code === '42883'
        ? ' — the function is missing, so nothing here proves anon is denied'
        : error.code === ''
          ? ' — the request never reached PostgREST'
          : isRejectedBeforeReachingPostgres(error.code, status)
            ? ' — the key was rejected before the role gate, so this proves nothing either way'
            : ' — anon got past the role gate';

    problems.push(`${fn} → expected 42501, got ${describeRestError(error, status)}${hint}`);
  }

  return problems.length > 0 ? fail(problems.join('; ')) : pass();
}

// ---------------------------------------------------------------------------

async function main() {
  const { appUrl, supabaseUrl, anonKey } = readEnv();

  anonKeyForRedaction = anonKey;

  const supabase = createClient(supabaseUrl, anonKey, {
    // Nothing signs in, and an auto-refresh timer would hold the event loop open after the
    // last check returned.
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    // supabase-js has no per-call timeout, but it accepts the fetch it uses. Applying the
    // budget once here cannot be forgotten on the next call added, which threading
    // .abortSignal() through each of the seven calls below could be. `init.signal` is
    // undefined on every call this script makes; the ?? keeps a supplied signal working if
    // that ever changes.
    global: {
      fetch: (input, init = {}) =>
        fetch(input, { ...init, signal: init.signal ?? AbortSignal.timeout(TIMEOUT_MS) }),
    },
  });

  // The key is never printed, here or in any failure reason.
  process.stdout.write(`smoke: ${appUrl} · ${supabaseUrl}\n`);

  // Sequential, not Promise.all: a human reads this top to bottom while an event is live,
  // and five checks at the 10 s worst case still finish inside a minute.
  await runCheck('app-pages', () => checkAppPages(appUrl));
  await runCheck('private-tables-closed', () => checkPrivateTables(supabase));
  await runCheck('questionnaire-invariant', () => checkQuestionnaireInvariant(supabase));
  await runCheck('submit-rpc-event-gate', () => checkSubmitRpcGate(supabase));
  await runCheck('organizer-rpcs-denied', () => checkOrganizerRpcsDenied(supabase));

  // The explicit exit also settles undici's keep-alive sockets, which would otherwise hold
  // the process open for a few seconds after the last response.
  if (failed.length > 0) {
    process.stdout.write(`\n${failed.length} of 5 failed: ${failed.join(', ')}\n`);
    process.exit(1);
  }

  process.stdout.write('\nall 5 checks passed\n');
  process.exit(0);
}

main();
