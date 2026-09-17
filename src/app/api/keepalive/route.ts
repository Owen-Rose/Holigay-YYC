import { NextResponse } from 'next/server';

import { cronSecret, keepaliveTargets, type KeepaliveTarget } from '@/lib/env';

/**
 * Daily keep-alive for the hosted Supabase projects.
 *
 * Both projects are on the free tier, which pauses a project after about seven
 * days without API activity (both were found paused on 2026-08-22). A Vercel
 * cron calls this route once a day; it reads one row from EVERY project named
 * in `KEEPALIVE_SUPABASE_TARGETS`. Production's own project is not inferred
 * from the deployment environment, so a half-filled list cannot silently
 * protect only one project.
 *
 * Contract: specs/007-production-readiness/contracts/keepalive-route.md
 */

/** Never cached: a cached 200 would keep nothing awake. */
export const dynamic = 'force-dynamic';

/** Per-target budget. Two slow projects still finish well inside a cron run. */
const TIMEOUT_MS = 8000;

type TargetResult = {
  url: string;
  ok: boolean;
  /** HTTP status, or 0 when the request never produced a response. */
  status: number;
  ms: number;
  error?: string;
};

/**
 * Node's fetch reports every network-level failure as "fetch failed" and keeps
 * the reason (`getaddrinfo ENOTFOUND …`, `ECONNREFUSED`) in `cause`. A paused
 * Supabase project presents as NXDOMAIN, so without the cause the one failure
 * this route exists to catch would reach the cron log with its reason stripped.
 */
function describeError(error: unknown): string {
  if (!(error instanceof Error)) return String(error);

  const cause = error.cause instanceof Error ? error.cause.message : error.cause;

  return cause ? `${error.message}: ${String(cause)}` : error.message;
}

/**
 * The response carries URLs but never keys. A thrown fetch error can quote the
 * request it failed on, so every configured key is stripped from the text
 * rather than trusted not to appear in it.
 */
function redact(text: string, anonKeys: string[]): string {
  return anonKeys.reduce((redacted, key) => redacted.split(key).join('[redacted]'), text);
}

/**
 * Reads one row from the only table that is intentionally anon-readable
 * (active events are public), so the anon key suffices and no user data is
 * touched. Never throws: a failure becomes a failed entry.
 */
async function checkTarget({ url, anonKey }: KeepaliveTarget): Promise<TargetResult> {
  const startedAt = Date.now();

  try {
    const response = await fetch(`${url}/rest/v1/events?select=id&limit=1`, {
      headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}` },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: 'no-store',
    });

    return {
      url,
      ok: response.ok,
      status: response.status,
      ms: Date.now() - startedAt,
      ...(response.ok ? {} : { error: `HTTP ${response.status}` }),
    };
  } catch (error) {
    return {
      url,
      ok: false,
      status: 0,
      ms: Date.now() - startedAt,
      error: describeError(error),
    };
  }
}

/**
 * GET /api/keepalive
 *
 * Vercel adds `Authorization: Bearer <CRON_SECRET>` to cron invocations when
 * CRON_SECRET is set on the project. Only GET is exported, so the App Router
 * answers every other method 405 on its own.
 *
 * Responses:
 *   - 401: secret unconfigured, header missing, or secret mismatched
 *   - 500: targets unset or unparseable (`misconfigured`), or any target failed
 *   - 200: every target read a row
 */
export async function GET(request: Request): Promise<NextResponse> {
  // -------------------------------------------------------------------------
  // Authorization, before any outbound request
  // -------------------------------------------------------------------------
  // An unconfigured secret answers 401 rather than advertising the route as
  // merely misconfigured — see the Inputs table in the contract.
  if (!cronSecret || request.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }

  // -------------------------------------------------------------------------
  // Configuration
  // -------------------------------------------------------------------------
  // Null when unset or malformed: @/lib/env deliberately does not throw, so the
  // app still deploys with the keep-alive unconfigured.
  if (!keepaliveTargets) {
    return NextResponse.json({ ok: false, error: 'misconfigured' }, { status: 500 });
  }

  // -------------------------------------------------------------------------
  // Check every target concurrently
  // -------------------------------------------------------------------------
  const anonKeys = keepaliveTargets.map((target) => target.anonKey);
  const targets = (await Promise.all(keepaliveTargets.map(checkTarget))).map((target) =>
    target.error ? { ...target, error: redact(target.error, anonKeys) } : target
  );
  const ok = targets.every((target) => target.ok);

  // 500 on any failure is deliberate: Vercel's cron log marks a run red only on
  // a non-2xx response, and that red entry is the signal the maintainer looks for.
  return NextResponse.json(
    { ok, checkedAt: new Date().toISOString(), targets },
    { status: ok ? 200 : 500 }
  );
}
