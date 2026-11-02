import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

// FileAnswerLink pulls in the browser Supabase client (and the env module).
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({ storage: { from: vi.fn() } }),
}));

import { DynamicAnswers } from '@/app/dashboard/applications/[id]/dynamic-answers';

// Spec 011 (T008): both application detail pages now always render
// DynamicAnswers — the fixed-form "Application Details" fallback is gone — so
// an application with no recorded answers needs a visible empty state rather
// than a titled card with nothing in it.

describe('DynamicAnswers', () => {
  it('shows an empty state when there are no answers', () => {
    render(<DynamicAnswers answers={[]} />);

    expect(screen.getByText('Application Answers')).toBeInTheDocument();
    expect(screen.getByText('No answers recorded for this application.')).toBeInTheDocument();
  });

  it('renders each answer and no empty state when answers exist', () => {
    render(
      <DynamicAnswers
        answers={[
          {
            answerId: 'a-1',
            rawValue: { kind: 'text', value: 'Handmade pottery' },
            question: {
              id: 'q-1',
              label: 'What do you sell?',
              type: 'short_text',
              options: null,
              position: 0,
            },
          },
        ]}
      />
    );

    expect(screen.getByText('What do you sell?')).toBeInTheDocument();
    expect(screen.getByText('Handmade pottery')).toBeInTheDocument();
    expect(screen.queryByText('No answers recorded for this application.')).not.toBeInTheDocument();
  });
});
