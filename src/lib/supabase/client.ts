import { createBrowserClient } from '@supabase/ssr';
import { supabaseAnonKey, supabaseUrl } from '@/lib/env-public';
import type { Database } from '@/types/database';

export function createClient() {
  return createBrowserClient<Database>(supabaseUrl, supabaseAnonKey);
}
