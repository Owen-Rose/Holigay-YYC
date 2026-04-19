'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { inviteOrganizer } from '@/lib/actions/team';

// =============================================================================
// Types
// =============================================================================

interface InviteFormProps {
  /** Called after a successful invite so the parent can refresh the team list */
  onInvited?: () => void;
}

// =============================================================================
// Icons
// =============================================================================

function EnvelopeIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={1.5}
      stroke="currentColor"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M21.75 6.75v10.5a2.25 2.25 0 0 1-2.25 2.25h-15a2.25 2.25 0 0 1-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25m19.5 0v.243a2.25 2.25 0 0 1-1.07 1.916l-7.5 4.615a2.25 2.25 0 0 1-2.36 0L3.32 8.91a2.25 2.25 0 0 1-1.07-1.916V6.75"
      />
    </svg>
  );
}

function ExclamationIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={1.5}
      stroke="currentColor"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z"
      />
    </svg>
  );
}

// =============================================================================
// Component
// =============================================================================

export function InviteForm({ onInvited }: InviteFormProps) {
  const [email, setEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    // Client-side email validation
    const trimmed = email.trim();
    if (!trimmed) {
      setError('Email is required');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setError('Please enter a valid email address');
      return;
    }

    setIsSubmitting(true);

    try {
      const result = await inviteOrganizer(trimmed);

      if (!result.success) {
        toast.error(result.error || 'Failed to send invite');
        return;
      }

      toast.success(`Invitation sent to ${trimmed}`);
      setEmail('');
      onInvited?.();
    } catch (err) {
      toast.error('An unexpected error occurred');
      console.error('Invite error:', err);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="border-border-subtle bg-surface rounded-lg border p-6">
      <div className="flex items-center gap-2">
        <EnvelopeIcon className="text-muted-foreground h-5 w-5" />
        <h2 className="text-foreground text-lg font-semibold">Invite Organizer</h2>
      </div>
      <p className="text-muted mt-1 text-sm">
        Send an invitation email to add a new organizer to your team.
      </p>

      <form onSubmit={handleSubmit} className="mt-4 flex gap-3">
        <input
          type="email"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            // Clear error when user starts typing
            if (error) setError(null);
          }}
          placeholder="organizer@example.com"
          required
          disabled={isSubmitting}
          className="border-border bg-surface text-foreground placeholder-muted-foreground focus:border-primary focus:ring-primary/50 disabled:bg-surface-bright min-h-[44px] flex-1 rounded-md border px-3 py-2 text-sm focus:ring-1 focus:outline-none disabled:cursor-not-allowed disabled:opacity-60"
        />
        <button
          type="submit"
          disabled={isSubmitting}
          className="bg-primary text-primary-foreground hover:bg-primary-hover focus:ring-primary/50 focus:ring-offset-background min-h-[44px] rounded-md px-4 py-2 text-sm font-medium focus:ring-2 focus:ring-offset-2 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isSubmitting ? 'Sending...' : 'Send Invite'}
        </button>
      </form>

      {/* Error feedback */}
      {error && (
        <div className="mt-3 flex items-center gap-2 rounded-md bg-red-500/10 px-3 py-2">
          <ExclamationIcon className="h-4 w-4 flex-shrink-0 text-red-400" />
          <p className="text-sm text-red-400">{error}</p>
        </div>
      )}
    </div>
  );
}
