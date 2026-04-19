'use client';

import { useTransition } from 'react';
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
  { label: string; className: string; hoverClassName: string }
> = {
  pending: {
    label: 'Pending',
    className: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30',
    hoverClassName: 'hover:bg-yellow-500/25',
  },
  approved: {
    label: 'Approve',
    className: 'bg-green-500/15 text-green-400 border-green-500/30',
    hoverClassName: 'hover:bg-green-500/25',
  },
  rejected: {
    label: 'Reject',
    className: 'bg-red-500/15 text-red-400 border-red-500/30',
    hoverClassName: 'hover:bg-red-500/25',
  },
  waitlisted: {
    label: 'Waitlist',
    className: 'bg-primary/15 text-primary border-primary/30',
    hoverClassName: 'hover:bg-primary/25',
  },
};

// =============================================================================
// Component
// =============================================================================

export function StatusUpdateButtons({ applicationId, currentStatus }: StatusUpdateButtonsProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  async function handleStatusChange(newStatus: ApplicationStatus) {
    if (newStatus === currentStatus) return;

    startTransition(async () => {
      const result = await updateApplicationStatus(applicationId, newStatus);

      if (!result.success) {
        toast.error(result.error || 'Failed to update status');
        return;
      }

      toast.success(`Application ${newStatus}`);
      router.refresh();
    });
  }

  // Available status transitions - show all statuses except current
  const availableStatuses = APPLICATION_STATUSES.filter((status) => status !== currentStatus);

  return (
    <div className="border-border-subtle bg-surface rounded-lg border p-4">
      <h3 className="text-muted mb-3 text-sm font-medium">Update Application Status</h3>

      <div className="flex flex-wrap gap-2">
        {availableStatuses.map((status) => {
          const config = statusButtonConfig[status];
          return (
            <button
              key={status}
              onClick={() => handleStatusChange(status)}
              disabled={isPending}
              className={cn(
                'min-h-[44px] rounded-md border px-4 py-2.5 text-sm font-medium transition-colors',
                'disabled:cursor-not-allowed disabled:opacity-50',
                config.className,
                !isPending && config.hoverClassName
              )}
            >
              {isPending ? 'Updating...' : config.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
