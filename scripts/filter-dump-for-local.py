#!/usr/bin/env python3
"""Strip COPY blocks a local Supabase stack cannot accept, for the restore drill.

A hosted Supabase project runs a newer GoTrue than the pinned local CLI stack, so its
`auth` schema carries tables and columns the local one lacks. Restoring a hosted
`--data-only` dump into local therefore aborts (see docs/runbooks/backup-restore.md,
section 3.3).

This removes only the COPY blocks whose table or columns are absent locally, and
REFUSES to run if any such block holds rows — losing real data to a schema mismatch
must be an error, never a silent skip.

Usage:
    python3 scripts/filter-dump-for-local.py backup/dev/<date>/data.sql > /tmp/data-filtered.sql

Requires the local stack to be running (it reads the live catalog via docker exec).
"""

import re
import subprocess
import sys

CONTAINER = "supabase_db_Holigay"
SCHEMAS = ("auth", "public")


def local_columns():
    """Map 'schema.table' -> set(column names) from the running local stack."""
    query = (
        "select table_schema||'.'||table_name||'|'||column_name "
        "from information_schema.columns where table_schema in "
        f"({','.join(repr(s) for s in SCHEMAS)});"
    )
    proc = subprocess.run(
        ["docker", "exec", CONTAINER, "psql", "-U", "postgres", "-d", "postgres", "-Atc", query],
        capture_output=True,
        text=True,
    )
    if proc.returncode != 0:
        sys.exit(f"could not read the local catalog (is the stack up?): {proc.stderr.strip()}")

    found = {}
    for line in proc.stdout.split():
        if "|" in line:
            table, column = line.split("|", 1)
            found.setdefault(table, set()).add(column)
    if not found:
        sys.exit("the local catalog came back empty — is the stack up?")
    return found


def main():
    if len(sys.argv) != 2:
        sys.exit(__doc__)

    local = local_columns()
    lines = open(sys.argv[1], encoding="utf-8", errors="replace").read().split("\n")

    kept, skipped, blocking = [], [], []
    i = 0
    while i < len(lines):
        match = re.match(r'COPY "([^"]+)"\."([^"]+)" \(([^)]*)\)', lines[i])
        if match:
            table = f"{match.group(1)}.{match.group(2)}"
            columns = [c.strip().strip('"') for c in match.group(3).split(",")]

            end, rows = i + 1, 0
            while end < len(lines) and lines[end] != "\\.":
                rows += 1
                end += 1

            missing = table not in local or [c for c in columns if c not in local.get(table, ())]
            if missing:
                if rows:
                    blocking.append((table, rows))
                skipped.append((table, rows))
                i = end + 1
                continue

        kept.append(lines[i])
        i += 1

    if blocking:
        sys.exit(
            "REFUSING: these tables are incompatible with the local stack but hold rows — "
            f"filtering them would lose data: {blocking}"
        )

    sys.stderr.write(f"skipped (all empty): {skipped}\n")
    print("\n".join(kept))


if __name__ == "__main__":
    main()
