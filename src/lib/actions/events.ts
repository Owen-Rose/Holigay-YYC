'use server'

import { createClient } from '@/lib/supabase/server'
import { isOrganizerOrAdmin } from '@/lib/auth/roles'
import { eventFormSchema, type EventFormInput } from '@/lib/validations/event'

// =============================================================================
// Types
// =============================================================================

/** Event with its application count for the events list page */
export type EventWithCount = {
  id: string
  name: string
  event_date: string
  location: string
  description: string | null
  application_deadline: string | null
  status: string
  max_vendors: number | null
  created_at: string
  updated_at: string
  application_count: number
}

export type GetEventsResponse = {
  success: boolean
  error: string | null
  data: EventWithCount[] | null
}

// =============================================================================
// Server Actions
// =============================================================================

/**
 * Fetches all events with application counts, ordered by event_date descending.
 */
export async function getEvents(): Promise<GetEventsResponse> {
  const supabase = await createClient()

  // Fetch all events
  const { data: events, error: eventsError } = await supabase
    .from('events')
    .select('*')
    .order('event_date', { ascending: false })

  if (eventsError) {
    console.error('Error fetching events:', eventsError)
    return { success: false, error: 'Failed to fetch events', data: null }
  }

  if (!events || events.length === 0) {
    return { success: true, error: null, data: [] }
  }

  // Fetch application counts grouped by event_id
  const { data: appCounts, error: countError } = await supabase
    .from('applications')
    .select('event_id')

  if (countError) {
    console.error('Error fetching application counts:', countError)
    // Still return events, just without counts
    return {
      success: true,
      error: null,
      data: events.map((e) => ({ ...e, application_count: 0 })),
    }
  }

  // Count applications per event
  const countMap = new Map<string, number>()
  for (const app of appCounts || []) {
    countMap.set(app.event_id, (countMap.get(app.event_id) || 0) + 1)
  }

  const eventsWithCounts: EventWithCount[] = events.map((event) => ({
    ...event,
    application_count: countMap.get(event.id) || 0,
  }))

  return { success: true, error: null, data: eventsWithCounts }
}

/**
 * Creates a new event. Requires organizer or admin role.
 */
export async function createEvent(
  data: EventFormInput
): Promise<{ success: boolean; error: string | null }> {
  if (!(await isOrganizerOrAdmin())) {
    return { success: false, error: 'Unauthorized: insufficient role' }
  }

  // Server-side validation
  const parsed = eventFormSchema.safeParse(data)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message || 'Invalid input' }
  }

  const { name, description, eventDate, location, applicationDeadline, status, maxVendors } =
    parsed.data

  const supabase = await createClient()

  const { error } = await supabase.from('events').insert({
    name,
    description: description || null,
    event_date: eventDate,
    location,
    application_deadline: applicationDeadline || null,
    status,
    max_vendors: maxVendors ? parseInt(maxVendors, 10) : null,
  })

  if (error) {
    console.error('Error creating event:', error)
    return { success: false, error: 'Failed to create event' }
  }

  return { success: true, error: null }
}
