'use client';

import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { updateApplicationNotes } from '@/lib/actions/applications';

// =============================================================================
// Types
// =============================================================================

export interface NotesDraft {
  /** The textarea's current value. */
  notes: string;
  setNotes: (value: string) => void;
  /** True while the draft differs from what the server holds. */
  isDirty: boolean;
  isSaving: boolean;
  /** Persists the draft; resolves true on success (toasts either way). */
  save: () => Promise<boolean>;
}

interface NotesDraftProviderProps {
  applicationId: string;
  initialNotes: string;
  children: ReactNode;
}

// =============================================================================
// Context
// =============================================================================

const NotesDraftContext = createContext<NotesDraft | null>(null);

/**
 * Holds the organizer-notes draft for one application so the status controls
 * can see whether it is unsaved and save it before an emailing transition
 * (F-002, organizer UAT 2026-10-06). The notes editor and the status buttons
 * are siblings on the detail page; this is the one piece of state they share.
 */
export function NotesDraftProvider({
  applicationId,
  initialNotes,
  children,
}: NotesDraftProviderProps) {
  const router = useRouter();
  const [notes, setNotes] = useState(initialNotes);
  const [savedNotes, setSavedNotes] = useState(initialNotes);
  const [isSaving, setIsSaving] = useState(false);

  const save = useCallback(async (): Promise<boolean> => {
    setIsSaving(true);
    try {
      const result = await updateApplicationNotes(applicationId, notes);
      if (!result.success) {
        toast.error(result.error || 'Failed to save notes');
        return false;
      }
      setSavedNotes(notes);
      toast.success('Notes saved');
      router.refresh();
      return true;
    } finally {
      setIsSaving(false);
    }
  }, [applicationId, notes, router]);

  const value: NotesDraft = {
    notes,
    setNotes,
    isDirty: notes !== savedNotes,
    isSaving,
    save,
  };

  return <NotesDraftContext.Provider value={value}>{children}</NotesDraftContext.Provider>;
}

/** The draft, or null when rendered outside a provider (then there are no notes to worry about). */
export function useNotesDraft(): NotesDraft | null {
  return useContext(NotesDraftContext);
}

/** For the notes editor itself, which cannot work without the provider. */
export function useRequiredNotesDraft(): NotesDraft {
  const draft = useContext(NotesDraftContext);
  if (!draft) {
    throw new Error('OrganizerNotes must be rendered inside <NotesDraftProvider>');
  }
  return draft;
}
