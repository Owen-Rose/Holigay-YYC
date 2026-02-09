'use client'

import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { EventForm } from '@/components/forms/event-form'
import { createEvent } from '@/lib/actions/events'
import type { EventFormInput } from '@/lib/validations/event'

export default function NewEventPage() {
  const router = useRouter()

  async function handleSubmit(data: EventFormInput) {
    const result = await createEvent(data)

    if (result.success) {
      // Brief delay so the user sees the success message before redirect
      setTimeout(() => router.push('/dashboard/events'), 1000)
    }

    return { success: result.success, error: result.error ?? undefined }
  }

  return (
    <div>
      {/* Page Header */}
      <div className="mb-8">
        <Link
          href="/dashboard/events"
          className="mb-4 inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18" />
          </svg>
          Back to Events
        </Link>
        <h1 className="text-2xl font-bold text-gray-900">Create Event</h1>
        <p className="mt-1 text-sm text-gray-600">
          Set up a new market event for vendors to apply to.
        </p>
      </div>

      {/* Event Form */}
      <div className="rounded-lg border border-gray-200 bg-white p-6">
        <EventForm mode="create" onSubmit={handleSubmit} />
      </div>
    </div>
  )
}
