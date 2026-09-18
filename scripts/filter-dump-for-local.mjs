#!/usr/bin/env node
// Strip COPY blocks a local Supabase stack cannot accept, for the restore drill.
//
// A hosted Supabase project runs a newer GoTrue than the pinned local CLI stack, so
// its `auth` schema carries tables and columns the local one lacks. Restoring a hosted
// `--data-only` dump into local therefore aborts — see docs/runbooks/backup-restore.md
// section 3.3.
//
// This removes only the COPY blocks whose table or columns are absent locally, and
// REFUSES to run if any such block holds rows: losing real data to a schema mismatch
// must be an error, never a silent skip. It also prints every table's row count to
// stderr, which is the "source" side of the runbook's 3.5 comparison — the dump is the
// only source the restore ever sees, so counting it is exact and needs no DB access.
//
// Usage:
//   node scripts/filter-dump-for-local.mjs backup/dev/<date>/data.sql > /tmp/data-filtered.sql
//
// Requires the local stack to be running (it reads the live catalog via docker exec).
// Plain ESM, Node >= 20, no dependencies.

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const CONTAINER = 'supabase_db_Holigay';
const SCHEMAS = ['auth', 'public'];

/** Map 'schema.table' -> Set of column names from the running local stack. */
function localColumns() {
  const query =
    "select table_schema||'.'||table_name||'|'||column_name " +
    'from information_schema.columns where table_schema in ' +
    `(${SCHEMAS.map((s) => `'${s}'`).join(',')});`;

  let out;
  try {
    out = execFileSync(
      'docker',
      ['exec', CONTAINER, 'psql', '-U', 'postgres', '-d', 'postgres', '-Atc', query],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }
    );
  } catch (err) {
    fail(
      `could not read the local catalog (is the stack up?): ${err.stderr?.trim() ?? err.message}`
    );
  }

  const found = new Map();
  for (const line of out.split('\n')) {
    const sep = line.indexOf('|');
    if (sep === -1) continue;
    const table = line.slice(0, sep);
    if (!found.has(table)) found.set(table, new Set());
    found.get(table).add(line.slice(sep + 1));
  }
  if (found.size === 0) fail('the local catalog came back empty — is the stack up?');
  return found;
}

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

function main() {
  const [dumpPath] = process.argv.slice(2);
  if (!dumpPath || process.argv.length !== 3) {
    fail('usage: node scripts/filter-dump-for-local.mjs <data.sql>  > filtered.sql');
  }

  const local = localColumns();
  const lines = readFileSync(dumpPath, 'utf8').split('\n');

  const kept = [];
  const counts = []; // [table, rows] for every COPY block, in dump order
  const skipped = [];
  const blocking = [];

  let i = 0;
  while (i < lines.length) {
    const match = /^COPY "([^"]+)"\."([^"]+)" \(([^)]*)\)/.exec(lines[i]);
    if (match) {
      const table = `${match[1]}.${match[2]}`;
      const columns = match[3].split(',').map((c) => c.trim().replace(/^"|"$/g, ''));

      let end = i + 1;
      let rows = 0;
      while (end < lines.length && lines[end] !== '\\.') {
        rows += 1;
        end += 1;
      }
      counts.push([table, rows]);

      const localCols = local.get(table);
      const incompatible = !localCols || columns.some((c) => !localCols.has(c));
      if (incompatible) {
        if (rows > 0) blocking.push([table, rows]);
        skipped.push([table, rows]);
        i = end + 1;
        continue;
      }
    }
    kept.push(lines[i]);
    i += 1;
  }

  if (blocking.length > 0) {
    fail(
      'REFUSING: these tables are incompatible with the local stack but hold rows — ' +
        `filtering them would lose data: ${JSON.stringify(blocking)}`
    );
  }

  // Source-side row counts for the runbook's 3.5 comparison; same shape as the
  // restored-side query output (table|rows, one per line, sorted).
  process.stderr.write('# rows per table in the dump (table|rows)\n');
  for (const [table, rows] of [...counts].sort((a, b) => a[0].localeCompare(b[0]))) {
    process.stderr.write(`${table}|${rows}\n`);
  }
  process.stderr.write(`# skipped as incompatible (all empty): ${JSON.stringify(skipped)}\n`);

  process.stdout.write(kept.join('\n') + '\n');
}

main();
