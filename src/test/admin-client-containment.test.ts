// @vitest-environment node
//
// The service-role client bypasses RLS, so it may be reached only through the
// admin-gated team actions (spec 009 FR-026, SC-005). This is a subset check —
// "no unexpected importer" — so it holds before and after team.ts wires it in.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const SRC = path.resolve(__dirname, '..');
const ADMIN_MODULE = 'src/lib/supabase/admin.ts';
const PERMITTED = new Set([
  ADMIN_MODULE,
  'src/lib/actions/team.ts',
  'src/test/admin-client-containment.test.ts',
]);

function filesMentioningAdminClient(): string[] {
  const entries = fs.readdirSync(SRC, { recursive: true, encoding: 'utf8' });

  return entries
    .filter((entry) => /\.(ts|tsx)$/.test(entry))
    .filter((entry) =>
      fs.readFileSync(path.join(SRC, entry), 'utf8').includes('lib/supabase/admin')
    )
    .map((entry) => path.posix.join('src', entry.split(path.sep).join('/')))
    .sort();
}

describe('service-role client containment', () => {
  it('exists at src/lib/supabase/admin.ts', () => {
    expect(fs.existsSync(path.join(SRC, 'lib/supabase/admin.ts'))).toBe(true);
  });

  it('is referenced only by the permitted files', () => {
    const offenders = filesMentioningAdminClient().filter((file) => !PERMITTED.has(file));

    expect(
      offenders,
      `unexpected importers of @/lib/supabase/admin: ${offenders.join(', ')}`
    ).toEqual([]);
  });
});
