'use client';

import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { updateApplicationStatus } from '@/lib/actions/applications';
import { APPLICATION_STATUSES, type ApplicationStatus } from '@/lib/constants/application-status';
import { useNotesDraft } from './notes-draft-context';

// =============================================================================
// Types
// =============================================================================

interface StatusUpdateButtonsProps {
  applicationId: string;
  currentStatus: string;
}

// =============================================================================
// Status Button Configuration (dark-theme friendly)
// =============================================================================

const statusButtonConfig: Record<
  ApplicationStatus,
  { label: string; statusLabel: string; className: string; hoverClassName: string }
> = {
  pending: {
    label: 'Pending',
    statusLabel: 'Pending',
    className: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30',
    hoverClassName: 'hover:bg-yellow-500/25',
  },
  approved: {
    label: 'Approve',
    statusLabel: 'Approved',
    className: 'bg-green-500/15 text-green-400 border-green-500/30',
    hoverClassName: 'hover:bg-green-500/25',
  },
  rejected: {
    label: 'Reject',
    statusLabel: 'Rejected',
    className: 'bg-red-500/15 text-red-400 border-red-500/30',
    hoverClassName: 'hover:bg-red-500/25',
  },
  waitlisted: {
    label: 'Waitlist',
    statusLabel: 'Waitlisted',
    className: 'bg-primary/15 text-primary border-primary/30',
    hoverClassName: 'hover:bg-primary/25',
  },
};

/** Transitions that notify the vendor — see `updateApplicationStatus`. */
function sendsEmail(status: ApplicationStatus): boolean {
  return status !== 'pending';
}

// =============================================================================
// Component
// =============================================================================

/**
 * Status controls for an application. Every status is always rendered in the
 * same order (the current one disabled) so nothing moves under the cursor
 * after a change, and every transition goes through an explicit Confirm step
 * because most of them email the vendor (UAT-6). When the organizer notes are
 * unsaved and the transition emails, the step says so and offers to save them
 * first, since only stored notes reach the email (F-002).
 */
export function StatusUpdateButtons({ applicationId, currentStatus }: StatusUpdateButtonsProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState<ApplicationStatus | null>(null);
  const draft = useNotesDraft();
  // Guards against a second click landing before React has re-rendered the
  // disabled state (a double-click fires both clicks synchronously).
  const inFlight = useRef(false);

  function handleConfirm(saveNotesFirst = false) {
    const newStatus = confirming;
    if (!newStatus || inFlight.current) return;
    inFlight.current = true;

    startTransition(async () => {
      try {
        // Only stored notes reach the email, so save the draft before the
        // transition when asked; a failed save leaves the status alone.
        if (saveNotesFirst && draft) {
          const saved = await draft.save();
          if (!saved) return;
        }

        const result = await updateApplicationStatus(applicationId, newStatus);

        if (!result.success) {
          toast.error(result.error || 'Failed to update status');
          return;
        }

        // Status updated; surface email-delivery failures instead of a
        // misleading success toast.
        if (result.warning) {
          toast.warning(result.warning);
        } else {
          toast.success(`Application ${newStatus}`);
        }
        setConfirming(null);
        router.refresh();
      } finally {
        inFlight.current = false;
      }
    });
  }

  const busy = isPending || (draft?.isSaving ?? false);
  const confirmConfig = confirming ? statusButtonConfig[confirming] : null;
  const emails = confirming !== null && sendsEmail(confirming);
  const notesUnsaved = emails && (draft?.isDirty ?? false);

  return (
    <div className="border-border-subtle bg-surface rounded-lg border p-4">
      <h3 className="text-muted mb-3 text-sm font-medium">Update Application Status</h3>

      <div className="flex flex-wrap gap-2">
        {APPLICATION_STATUSES.map((status) => {
          const config = statusButtonConfig[status];
          const isCurrent = status === currentStatus;
          const isSelected = status === confirming;
          const disabled = isCurrent || busy || (confirming !== null && !isSelected);
          return (
            <button
              key={status}
              type="button"
              aria-pressed={isCurrent}
              onClick={() => {
                if (!isCurrent && !busy) setConfirming(status);
              }}
              disabled={disabled}
              className={cn(
                'min-h-[44px] rounded-md border px-4 py-2.5 text-sm font-medium transition-colors',
                'disabled:cursor-not-allowed disabled:opacity-50',
                config.className,
                !disabled && config.hoverClassName,
                isSelected && 'ring-primary/60 ring-2'
              )}
            >
              {config.label}
            </button>
          );
        })}
      </div>

      {confirmConfig && (
        <div className="border-border-subtle mt-3 flex flex-wrap items-center gap-2 border-t pt-3">
          <p className="text-foreground text-sm">
            Change status to {confirmConfig.statusLabel}?
            {emails ? ' The vendor will be emailed.' : ''}
            {notesUnsaved && (
              <span className="mt-1 block text-amber-400">
                Your unsaved notes will not be in the email.
              </span>
            )}
          </p>
          <div className="flex flex-wrap gap-2">
            {notesUnsaved ? (
              <>
                <button
                  type="button"
                  onClick={() => handleConfirm(true)}
                  disabled={busy}
                  className={cn(
                    'min-h-[44px] rounded-md border px-4 py-2.5 text-sm font-medium transition-colors',
                    'disabled:cursor-not-allowed disabled:opacity-50',
                    confirmConfig.className,
                    !busy && confirmConfig.hoverClassName
                  )}
                >
                  {busy ? 'Updating...' : 'Save notes and confirm'}
                </button>
                <button
                  type="button"
                  onClick={() => handleConfirm(false)}
                  disabled={busy}
                  className={cn(
                    'border-border text-foreground hover:bg-surface-bright min-h-[44px] rounded-md border bg-transparent px-4 py-2.5 text-sm font-medium transition-colors',
                    'disabled:cursor-not-allowed disabled:opacity-50'
                  )}
                >
                  Confirm without saving
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => handleConfirm(false)}
                disabled={busy}
                className={cn(
                  'min-h-[44px] rounded-md border px-4 py-2.5 text-sm font-medium transition-colors',
                  'disabled:cursor-not-allowed disabled:opacity-50',
                  confirmConfig.className,
                  !busy && confirmConfig.hoverClassName
                )}
              >
                {busy ? 'Updating...' : 'Confirm'}
              </button>
            )}
            <button
              type="button"
              onClick={() => setConfirming(null)}
              disabled={busy}
              className={cn(
                'border-border text-foreground hover:bg-surface-bright min-h-[44px] rounded-md border bg-transparent px-4 py-2.5 text-sm font-medium transition-colors',
                'disabled:cursor-not-allowed disabled:opacity-50'
              )}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
