'use client';

import { useRef, useState } from 'react';
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

const CANCEL_STYLE = `${BUTTON_BASE} border-border text-foreground hover:bg-surface-bright focus:ring-primary/50 border bg-transparent shadow-none`;

/** The cell is two of twelve grid columns; wrapping keeps the pair inside it at tablet widths (UAT-8). */
const ROW_STYLE = 'flex flex-wrap items-center justify-end gap-2';

/** Each row is wrapped in a Link, so no control may bubble a click to it. */
function contain(e: React.MouseEvent, handler: () => void) {
  e.preventDefault();
  e.stopPropagation();
  handler();
}

interface TransitionConfig {
  label: string;
  target: string;
  style: string;
  /** Present when the transition must be confirmed first (UAT-6). */
  confirm?: { prompt: string; yes: string };
}

const transitionConfig: Record<string, TransitionConfig> = {
  draft: {
    label: 'Publish',
    target: 'active',
    style: 'bg-green-600 hover:bg-green-700 focus:ring-green-500 text-white',
  },
  active: {
    label: 'Close',
    target: 'closed',
    style: 'bg-yellow-600 hover:bg-yellow-700 focus:ring-yellow-500 text-white',
    // Closing is forward-only (VALID_TRANSITIONS) and ends applications.
    confirm: { prompt: 'Close event?', yes: 'Yes, close' },
  },
};

type Confirming = 'delete' | 'close' | null;

/**
 * Row actions for an event: the status transition (draft → active → closed)
 * and, for events nothing is linked to yet, a two-step delete. Close and
 * Delete both ask first; Publish is one click but can only fire once.
 */
export function EventStatusActions({ eventId, status, applicationCount }: EventStatusActionsProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [confirming, setConfirming] = useState<Confirming>(null);
  // Guards against a second click landing before React has re-rendered the
  // disabled state (a double-click fires both clicks synchronously).
  const inFlight = useRef(false);

  const transition = transitionConfig[status];
  const canDelete = applicationCount === 0;

  async function handleTransition(newStatus: string) {
    if (inFlight.current) return;
    inFlight.current = true;
    setLoading(true);

    const result = await updateEventStatus(eventId, newStatus);

    if (result.success) {
      toast.success(newStatus === 'active' ? 'Event published' : 'Event closed');
      setConfirming(null);
      router.refresh();
    } else {
      toast.error(result.error || 'Failed to update event status');
      setConfirming(null);
    }

    setLoading(false);
    inFlight.current = false;
  }

  async function handleDelete() {
    if (inFlight.current) return;
    inFlight.current = true;
    setLoading(true);

    const result = await deleteEvent(eventId);

    if (result.success) {
      toast.success('Event deleted');
      router.refresh();
    } else {
      toast.error(result.error || 'Failed to delete event');
      setConfirming(null);
    }

    setLoading(false);
    inFlight.current = false;
  }

  function startTransition() {
    if (!transition) return;
    if (transition.confirm) {
      setConfirming('close');
    } else {
      void handleTransition(transition.target);
    }
  }

  // Nothing to offer: a closed event that already has applications.
  if (!transition && !canDelete) return null;

  if (confirming === 'delete') {
    return (
      <div className={ROW_STYLE}>
        <span className="text-muted text-xs">Delete?</span>
        <button
          type="button"
          disabled={loading}
          onClick={(e) => contain(e, handleDelete)}
          className={`${BUTTON_BASE} bg-red-600 text-white hover:bg-red-700 focus:ring-red-500`}
        >
          {loading ? 'Deleting...' : 'Yes, delete'}
        </button>
        <button
          type="button"
          disabled={loading}
          onClick={(e) => contain(e, () => setConfirming(null))}
          className={CANCEL_STYLE}
        >
          Cancel
        </button>
      </div>
    );
  }

  if (confirming === 'close' && transition?.confirm) {
    return (
      <div className={ROW_STYLE}>
        <span className="text-muted text-xs">{transition.confirm.prompt}</span>
        <button
          type="button"
          disabled={loading}
          onClick={(e) => contain(e, () => handleTransition(transition.target))}
          className={`${BUTTON_BASE} ${transition.style}`}
        >
          {loading ? 'Updating...' : transition.confirm.yes}
        </button>
        <button
          type="button"
          disabled={loading}
          onClick={(e) => contain(e, () => setConfirming(null))}
          className={CANCEL_STYLE}
        >
          Cancel
        </button>
      </div>
    );
  }

  return (
    <div className={ROW_STYLE}>
      {transition && (
        <button
          type="button"
          disabled={loading}
          onClick={(e) => contain(e, startTransition)}
          className={`${BUTTON_BASE} ${transition.style}`}
        >
          {loading ? 'Updating...' : transition.label}
        </button>
      )}
      {canDelete && (
        <button
          type="button"
          disabled={loading}
          onClick={(e) => contain(e, () => setConfirming('delete'))}
          className={`${BUTTON_BASE} border-border text-muted border bg-transparent shadow-none hover:border-red-500/40 hover:text-red-400 focus:ring-red-500/50`}
        >
          Delete
        </button>
      )}
    </div>
  );
}
