# Contract: Keep-alive Route

**Feature**: 007-production-readiness | **Date**: 2026-09-14
**Implemented by**: `src/app/api/keepalive/route.ts` + `vercel.json` (T007); configured by T008

## Purpose

Both hosted Supabase projects sit on the free tier, which pauses a project after about
seven days without API activity (both were found paused on 2026-08-22). A daily read of
one row from each project, driven by Vercel's cron scheduler, keeps them awake. The route
lists **every** project explicitly — production's own project is not inferred from the
deployment's environment — so a misconfigured list cannot silently protect only one.

## Request

```
GET /api/keepalive
Authorization: Bearer <CRON_SECRET>
```

Vercel adds the `Authorization: Bearer` header automatically to cron invocations when the
`CRON_SECRET` environment variable is set on the project. Any other method returns `405`.
The handler is dynamic (`export const dynamic = 'force-dynamic'`) so it is never cached.

## Inputs (environment)

| Variable | Format | Missing → |
|---|---|---|
| `CRON_SECRET` | non-empty string | every request answered `401` |
| `KEEPALIVE_SUPABASE_TARGETS` | `https://a.supabase.co\|<anonKeyA>,https://b.supabase.co\|<anonKeyB>` | `500` with `error: "misconfigured"` |

## Per-target check

```
GET {url}/rest/v1/events?select=id&limit=1
apikey: <anonKey>
Authorization: Bearer <anonKey>
```

Timeout 8 s per target (`AbortSignal.timeout`). Targets are checked concurrently. Any
non-2xx status, network error or timeout marks that target failed. The read touches the
only table that is intentionally anon-readable (active events are public), so the anon
key is sufficient and no user data is involved.

## Response

```json
{
  "ok": true,
  "checkedAt": "2026-09-20T12:00:03.114Z",
  "targets": [
    { "url": "https://kcokcufmzyckbodelqpb.supabase.co", "ok": true, "status": 200, "ms": 412 },
    { "url": "https://hgmfjvjlxrhdojwlkgap.supabase.co", "ok": true, "status": 200, "ms": 388 }
  ]
}
```

| Situation | HTTP | Body |
|---|---|---|
| Header missing or wrong secret | `401` | `{ "ok": false, "error": "unauthorized" }` |
| `KEEPALIVE_SUPABASE_TARGETS` unset or unparseable (secret already verified) | `500` | `{ "ok": false, "error": "misconfigured" }` |
| All targets read OK | `200` | as above, `ok: true` |
| Any target failed | `500` | `ok: false`; the failed entry carries `ok: false`, its `status` (or `0`), and `error` text |

`500` on any failure is deliberate: Vercel's cron log marks the run red only on a
non-2xx response, and a red log entry is the signal the maintainer looks for. Anon keys
never appear in the response; only the URLs do.

## Schedule

`vercel.json`:

```json
{ "crons": [{ "path": "/api/keepalive", "schedule": "0 12 * * *" }] }
```

Daily at 12:00 UTC. Hobby-plan caveats: cron jobs run only on **Production** deployments
(never previews), the plan allows daily granularity with roughly one-hour precision, and
at most two cron jobs. Daily rather than weekly because a weekly ping sits too close to
the seven-day pause window.

## Running it by hand

```bash
curl -s -H "Authorization: Bearer $CRON_SECRET" https://<production-host>/api/keepalive | jq
```

Locally: set `CRON_SECRET` and `KEEPALIVE_SUPABASE_TARGETS` in the shell (never in
`.env.local`), `npm run dev`, then the same `curl` against `http://localhost:3000`.

## Test matrix (`src/test/keepalive-route.test.ts`, mocked `fetch`)

| Case | Expect |
|---|---|
| No `Authorization` header | `401`, `fetch` not called |
| Wrong secret | `401`, `fetch` not called |
| `KEEPALIVE_SUPABASE_TARGETS` unset | `500` `misconfigured`, `fetch` not called |
| Two targets, both `200` | `200`, `ok: true`, two entries with `ok: true` |
| Two targets, one `503` | `500`, `ok: false`, the failing entry names its status |
| One target throws (network/timeout) | `500`, that entry `ok: false`, `status: 0`, `error` set |
| Response never includes an anon key | assert body text does not contain the key |

## Evidence (recorded in `quickstart.md`)

- Date `CRON_SECRET` + targets were set on Vercel Production (T008).
- Date and status of the first cron run in Vercel → Project → Cron Jobs / Logs.
- Seven days later: dev project not paused (dashboard shows Active; `/apply` on the
  preview still loads).
