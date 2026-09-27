import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { supabaseUrl } from '@/lib/env-public';
import { supabaseServiceRoleKey } from '@/lib/env';
import type { Database } from '@/types/database';

// Same guard as src/lib/env.ts: this module must never reach a client bundle.
if (typeof window !== 'undefined') {
  throw new Error(
    '@/lib/supabase/admin is server-only and must never be imported from a client component.'
  );
}

/**
 * A service-role client that bypasses RLS. Returns null when the key is not
 * configured so callers fail closed with a plain message instead of a stack trace.
 * Callers MUST have passed requireRole('admin') before calling this.
 *
 * The only permitted importer is src/lib/actions/team.ts, asserted by
 * src/test/admin-client-containment.test.ts.
 */
export function createAdminClient(): SupabaseClient<Database> | null {
  if (!supabaseServiceRoleKey) return null;
  return createClient<Database>(supabaseUrl, supabaseServiceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
