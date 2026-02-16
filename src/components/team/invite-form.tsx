'use client';

import { useState, useEffect } from 'react';
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
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M21.75 6.75v10.5a2.25 2.25 0 0 1-2.25 2.25h-15a2.25 2.25 0 0 1-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25m19.5 0v.243a2.25 2.25 0 0 1-1.07 1.916l-7.5 4.615a2.25 2.25 0 0 1-2.36 0L3.32 8.91a2.25 2.25 0 0 1-1.07-1.916V6.75"
      />
    </svg>
  );
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
    </svg>
  );
}

function ExclamationIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
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
  const [success, setSuccess] = useState<string | null>(null);

  // Auto-dismiss success message after 5 seconds
  useEffect(() => {
    if (!success) return;
    const timer = setTimeout(() => setSuccess(null), 5000);
    return () => clearTimeout(timer);
  }, [success]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);

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
        setError(result.error || 'Failed to send invite');
        return;
      }

      setSuccess(`Invitation sent to ${trimmed}`);
      setEmail('');
      onInvited?.();
    } catch (err) {
      setError('An unexpected error occurred');
      console.error('Invite error:', err);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="rounded-lg border border-border-subtle bg-surface p-6">
      <div className="flex items-center gap-2">
        <EnvelopeIcon className="h-5 w-5 text-muted-foreground" />
        <h2 className="text-lg font-semibold text-foreground">Invite Organizer</h2>
      </div>
      <p className="mt-1 text-sm text-muted">
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
          className="min-h-[44px] flex-1 rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground placeholder-muted-foreground focus:border-primary focus:ring-1 focus:ring-primary/50 focus:outline-none disabled:cursor-not-allowed disabled:bg-surface-bright disabled:opacity-60"
        />
        <button
          type="submit"
          disabled={isSubmitting}
          className="min-h-[44px] rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary-hover focus:ring-2 focus:ring-primary/50 focus:ring-offset-2 focus:ring-offset-background focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
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

      {/* Success feedback */}
      {success && (
        <div className="mt-3 flex items-center gap-2 rounded-md bg-green-500/10 px-3 py-2">
          <CheckIcon className="h-4 w-4 flex-shrink-0 text-green-400" />
          <p className="text-sm text-green-400">{success}</p>
        </div>
      )}
    </div>
  );
}
