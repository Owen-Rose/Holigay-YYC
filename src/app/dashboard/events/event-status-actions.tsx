'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { deleteEvent, updateEventStatus } from '@/lib/actions/events';

interface EventStatusActionsProps {
  eventId: string;
  status: string;
  /**
   * Applications linked to this event. Delete is only offered at zero, which
   * mirrors the guard inside `deleteEvent` — the server rejects the rest.
   */
  applicationCount: number;
}

const BUTTON_BASE =
  'focus:ring-offset-background inline-flex items-center rounded px-2.5 py-1 text-xs font-medium shadow-sm focus:ring-2 focus:ring-offset-2 focus:outline-none disabled:opacity-50';

/** Each row is wrapped in a Link, so no control may bubble a click to it. */
function containClick(handler: () => void) {
  return (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    handler();
  };
}

const transitionConfig: Record<string, { label: string; target: string; style: string }> = {
  draft: {
    label: 'Publish',
    target: 'active',
    style: 'bg-green-600 hover:bg-green-700 focus:ring-green-500 text-white',
  },
  active: {
    label: 'Close',
    target: 'closed',
    style: 'bg-yellow-600 hover:bg-yellow-700 focus:ring-yellow-500 text-white',
  },
};

/**
 * Row actions for an event: the status transition (draft → active → closed)
 * and, for events nothing is linked to yet, a two-step delete.
 */
export function EventStatusActions({ eventId, status, applicationCount }: EventStatusActionsProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const transition = transitionConfig[status];
  const canDelete = applicationCount === 0;

  async function handleTransition(newStatus: string) {
    setLoading(true);

    const result = await updateEventStatus(eventId, newStatus);

    if (result.success) {
      toast.success(newStatus === 'active' ? 'Event published' : 'Event closed');
      router.refresh();
    } else {
      toast.error(result.error || 'Failed to update event status');
    }

    setLoading(false);
  }

  async function handleDelete() {
    setLoading(true);

    const result = await deleteEvent(eventId);

    if (result.success) {
      toast.success('Event deleted');
      router.refresh();
    } else {
      toast.error(result.error || 'Failed to delete event');
      setConfirmingDelete(false);
    }

    setLoading(false);
  }

  // Nothing to offer: a closed event that already has applications.
  if (!transition && !canDelete) return null;

  if (confirmingDelete) {
    return (
      <div className="flex items-center justify-end gap-2">
        <span className="text-muted text-xs">Delete?</span>
        <button
          type="button"
          disabled={loading}
          onClick={containClick(handleDelete)}
          className={`${BUTTON_BASE} bg-red-600 text-white hover:bg-red-700 focus:ring-red-500`}
        >
          {loading ? 'Deleting...' : 'Yes, delete'}
        </button>
        <button
          type="button"
          disabled={loading}
          onClick={containClick(() => setConfirmingDelete(false))}
          className={`${BUTTON_BASE} border-border text-foreground hover:bg-surface-bright focus:ring-primary/50 border bg-transparent shadow-none`}
        >
          Cancel
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-end gap-2">
      {transition && (
        <button
          type="button"
          disabled={loading}
          onClick={containClick(() => handleTransition(transition.target))}
          className={`${BUTTON_BASE} ${transition.style}`}
        >
          {loading ? 'Updating...' : transition.label}
        </button>
      )}
      {canDelete && (
        <button
          type="button"
          disabled={loading}
          onClick={containClick(() => setConfirmingDelete(true))}
          className={`${BUTTON_BASE} border-border text-muted border bg-transparent shadow-none hover:border-red-500/40 hover:text-red-400 focus:ring-red-500/50`}
        >
          Delete
        </button>
      )}
    </div>
  );
}
