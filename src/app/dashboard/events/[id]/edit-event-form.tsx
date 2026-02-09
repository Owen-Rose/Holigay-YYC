'use client'

import { useRouter } from 'next/navigation'
import { EventForm } from '@/components/forms/event-form'
import { updateEvent } from '@/lib/actions/events'
import type { EventFormInput } from '@/lib/validations/event'

interface EditEventFormProps {
  eventId: string
  defaultValues: EventFormInput
}

export function EditEventForm({ eventId, defaultValues }: EditEventFormProps) {
  const router = useRouter()

  async function handleSubmit(data: EventFormInput) {
    const result = await updateEvent(eventId, data)

    if (result.success) {
      // Refresh server data so the page header and list reflect changes
      router.refresh()
    }

    return { success: result.success, error: result.error ?? undefined }
  }

  return <EventForm mode="edit" defaultValues={defaultValues} onSubmit={handleSubmit} />
}
