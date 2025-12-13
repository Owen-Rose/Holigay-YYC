'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'
import { updateApplicationStatus } from '@/lib/actions/applications'
import {
  APPLICATION_STATUSES,
  type ApplicationStatus,
} from '@/lib/constants/application-status'

// =============================================================================
// Types
// =============================================================================

interface StatusUpdateButtonsProps {
  applicationId: string
  currentStatus: string
}

// =============================================================================
// Status Button Configuration
// =============================================================================

const statusButtonConfig: Record<
  ApplicationStatus,
  { label: string; className: string; hoverClassName: string }
> = {
  pending: {
    label: 'Pending',
    className: 'bg-yellow-100 text-yellow-800 border-yellow-300',
    hoverClassName: 'hover:bg-yellow-200',
  },
  approved: {
    label: 'Approve',
    className: 'bg-green-100 text-green-800 border-green-300',
    hoverClassName: 'hover:bg-green-200',
  },
  rejected: {
    label: 'Reject',
    className: 'bg-red-100 text-red-800 border-red-300',
    hoverClassName: 'hover:bg-red-200',
  },
  waitlisted: {
    label: 'Waitlist',
    className: 'bg-blue-100 text-blue-800 border-blue-300',
    hoverClassName: 'hover:bg-blue-200',
  },
}

// =============================================================================
// Component
// =============================================================================

export function StatusUpdateButtons({
  applicationId,
  currentStatus,
}: StatusUpdateButtonsProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  async function handleStatusChange(newStatus: ApplicationStatus) {
    if (newStatus === currentStatus) return

    setError(null)

    startTransition(async () => {
      const result = await updateApplicationStatus(applicationId, newStatus)

      if (!result.success) {
        setError(result.error || 'Failed to update status')
        return
      }

      // Refresh the page to show updated status
      router.refresh()
    })
  }

  // Available status transitions - show all statuses except current
  const availableStatuses = APPLICATION_STATUSES.filter(
    (status) => status !== currentStatus
  )

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <h3 className="mb-3 text-sm font-medium text-gray-700">
        Update Application Status
      </h3>

      <div className="flex flex-wrap gap-2">
        {availableStatuses.map((status) => {
          const config = statusButtonConfig[status]
          return (
            <button
              key={status}
              onClick={() => handleStatusChange(status)}
              disabled={isPending}
              className={cn(
                'rounded-md border px-4 py-2 text-sm font-medium transition-colors',
                'disabled:cursor-not-allowed disabled:opacity-50',
                config.className,
                !isPending && config.hoverClassName
              )}
            >
              {isPending ? 'Updating...' : config.label}
            </button>
          )
        })}
      </div>

      {error && (
        <p className="mt-2 text-sm text-red-600" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}
