'use client';

import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { updateApplicationStatus } from '@/lib/actions/applications';
import { APPLICATION_STATUSES, type ApplicationStatus } from '@/lib/constants/application-status';

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
 * because most of them email the vendor (UAT-6).
 */
export function StatusUpdateButtons({ applicationId, currentStatus }: StatusUpdateButtonsProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState<ApplicationStatus | null>(null);
  // Guards against a second click landing before React has re-rendered the
  // disabled state (a double-click fires both clicks synchronously).
  const inFlight = useRef(false);

  function handleConfirm() {
    const newStatus = confirming;
    if (!newStatus || inFlight.current) return;
    inFlight.current = true;

    startTransition(async () => {
      try {
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

  const busy = isPending;
  const confirmConfig = confirming ? statusButtonConfig[confirming] : null;

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
            {confirming && sendsEmail(confirming) ? ' The vendor will be emailed.' : ''}
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleConfirm}
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
