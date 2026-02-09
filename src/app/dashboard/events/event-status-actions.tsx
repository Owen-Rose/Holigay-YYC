'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { updateEventStatus } from '@/lib/actions/events'

interface EventStatusActionsProps {
  eventId: string
  status: string
}

/**
 * Renders the appropriate status transition button for an event row.
 * draft → "Publish" button, active → "Close" button, closed → no button.
 */
export function EventStatusActions({ eventId, status }: EventStatusActionsProps) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleTransition(newStatus: string) {
    setLoading(true)
    setError(null)

    const result = await updateEventStatus(eventId, newStatus)

    if (result.success) {
      router.refresh()
    } else {
      setError(result.error)
    }

    setLoading(false)
  }

  // No transition available for closed events
  if (status === 'closed') return null

  const config =
    status === 'draft'
      ? { label: 'Publish', target: 'active', style: 'bg-green-600 hover:bg-green-700 focus:ring-green-500' }
      : { label: 'Close', target: 'closed', style: 'bg-yellow-600 hover:bg-yellow-700 focus:ring-yellow-500' }

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        disabled={loading}
        onClick={(e) => {
          // Prevent the parent Link from navigating
          e.preventDefault()
          e.stopPropagation()
          handleTransition(config.target)
        }}
        className={`inline-flex items-center rounded px-2.5 py-1 text-xs font-medium text-white shadow-sm focus:ring-2 focus:ring-offset-2 focus:outline-none disabled:opacity-50 ${config.style}`}
      >
        {loading ? 'Updating...' : config.label}
      </button>
      {error && (
        <span className="text-xs text-red-600" title={error}>
          Failed
        </span>
      )}
    </div>
  )
}
