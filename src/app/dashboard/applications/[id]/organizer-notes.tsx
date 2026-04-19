'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { updateApplicationNotes } from '@/lib/actions/applications';

// =============================================================================
// Types
// =============================================================================

interface OrganizerNotesProps {
  applicationId: string;
  initialNotes: string;
}

// =============================================================================
// Component
// =============================================================================

export function OrganizerNotes({ applicationId, initialNotes }: OrganizerNotesProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [notes, setNotes] = useState(initialNotes);
  const [savedNotes, setSavedNotes] = useState(initialNotes);

  const hasChanges = notes !== savedNotes;

  async function handleSave() {
    startTransition(async () => {
      const result = await updateApplicationNotes(applicationId, notes);

      if (!result.success) {
        toast.error(result.error || 'Failed to save notes');
        return;
      }

      setSavedNotes(notes);
      toast.success('Notes saved');
      router.refresh();
    });
  }

  return (
    <div className="border-border-subtle bg-surface rounded-lg border p-6">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-foreground text-lg font-semibold">Organizer Notes</h2>
        {hasChanges && <span className="text-xs text-amber-400">Unsaved changes</span>}
      </div>

      <p className="text-muted mb-3 text-sm">
        Add private notes about this application. Only organizers can see these notes.
      </p>

      <textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        disabled={isPending}
        placeholder="Add notes about this application..."
        rows={4}
        className="border-border bg-surface text-foreground placeholder:text-muted-foreground focus:border-primary focus:ring-primary/50 disabled:bg-surface-bright disabled:text-muted-foreground w-full rounded-md border px-3 py-2 text-sm shadow-sm focus:ring-1 focus:outline-none disabled:cursor-not-allowed"
      />

      <div className="mt-4 flex justify-end">
        <button
          onClick={handleSave}
          disabled={isPending || !hasChanges}
          className="bg-primary text-primary-foreground hover:bg-primary-hover focus:ring-primary/50 focus:ring-offset-background disabled:bg-surface-bright disabled:text-muted-foreground rounded-md px-4 py-2 text-sm font-medium shadow-sm transition-colors focus:ring-2 focus:ring-offset-2 focus:outline-none disabled:cursor-not-allowed"
        >
          {isPending ? 'Saving...' : 'Save Notes'}
        </button>
      </div>
    </div>
  );
}
