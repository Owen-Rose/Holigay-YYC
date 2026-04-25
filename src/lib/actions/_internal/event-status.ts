'use server';

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';

type DraftEventResult =
  | { success: true; error: null; data: { eventId: string } }
  | { success: false; error: string; data: null };

export async function requireDraftEvent(
  supabase: SupabaseClient<Database>,
  eventId: string,
): Promise<DraftEventResult> {
  const { data: event, error } = await supabase
    .from('events')
    .select('id, status')
    .eq('id', eventId)
    .single();

  if (error || !event) {
    return { success: false, error: 'Event not found', data: null };
  }
  if (event.status !== 'draft') {
    return {
      success: false,
      error: `Event is not in draft status (current: ${event.status})`,
      data: null,
    };
  }
  return { success: true, error: null, data: { eventId: event.id } };
}
