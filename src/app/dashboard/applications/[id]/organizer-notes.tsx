'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { updateApplicationNotes } from '@/lib/actions/applications'

// =============================================================================
// Types
// =============================================================================

interface OrganizerNotesProps {
  applicationId: string
  initialNotes: string
}

// =============================================================================
// Component
// =============================================================================

export function OrganizerNotes({
  applicationId,
  initialNotes,
}: OrganizerNotesProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [notes, setNotes] = useState(initialNotes)
  const [savedNotes, setSavedNotes] = useState(initialNotes)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const hasChanges = notes !== savedNotes

  async function handleSave() {
    setError(null)
    setSuccess(false)

    startTransition(async () => {
      const result = await updateApplicationNotes(applicationId, notes)

      if (!result.success) {
        setError(result.error || 'Failed to save notes')
        return
      }

      setSavedNotes(notes)
      setSuccess(true)

      // Clear success message after 3 seconds
      setTimeout(() => setSuccess(false), 3000)

      // Refresh the page data
      router.refresh()
    })
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-6">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900">Organizer Notes</h2>
        {hasChanges && (
          <span className="text-xs text-amber-600">Unsaved changes</span>
        )}
      </div>

      <p className="mb-3 text-sm text-gray-600">
        Add private notes about this application. Only organizers can see these
        notes.
      </p>

      <textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        disabled={isPending}
        placeholder="Add notes about this application..."
        rows={4}
        className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:cursor-not-allowed disabled:bg-gray-50"
      />

      <div className="mt-4 flex items-center justify-between">
        <div>
          {error && (
            <p className="text-sm text-red-600" role="alert">
              {error}
            </p>
          )}
          {success && (
            <p className="text-sm text-green-600" role="status">
              Notes saved successfully
            </p>
          )}
        </div>

        <button
          onClick={handleSave}
          disabled={isPending || !hasChanges}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:bg-gray-300"
        >
          {isPending ? 'Saving...' : 'Save Notes'}
        </button>
      </div>
    </div>
  )
}
