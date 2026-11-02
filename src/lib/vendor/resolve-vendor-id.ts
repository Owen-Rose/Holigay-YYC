import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';

// Plain module, deliberately not 'use server': exporting this from a server
// action file would make it a public endpoint (spec 011,
// contracts/link-vendor-account.md).

/**
 * The vendor row the signed-in account is tied to, tying it first when an
 * untied row carries the account's address (spec 011 FR-001). Null when the
 * account has no vendor record.
 *
 * The caller must already have checked `auth.getUser()`. The tie itself is
 * written by `link_vendor_account()`, which takes no input and scopes itself
 * to `auth.uid()`; after the first success the profile read short-circuits,
 * so the RPC runs at most once per account.
 */
export async function resolveVendorId(
  supabase: SupabaseClient<Database>,
  userId: string
): Promise<string | null> {
  const { data: profile, error: profileError } = await supabase
    .from('user_profiles')
    .select('vendor_id')
    .eq('id', userId)
    .single();

  if (profileError) {
    console.error('[vendor] user_profiles read failed:', profileError.code);
    return null;
  }

  if (profile.vendor_id) return profile.vendor_id;

  const { data: vendorId, error } = await supabase.rpc('link_vendor_account');

  if (error) {
    console.error('[vendor] link_vendor_account failed:', error.code);
    return null;
  }

  return vendorId ?? null;
}
