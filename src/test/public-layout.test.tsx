import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { copyrightLine } from '@/lib/constants/brand';

import PublicLayout from '@/app/(public)/layout';

// UAT2-7: the public site footer shows the same copyright line as the emails,
// from the one constants module.
describe('PublicLayout footer', () => {
  it('shows the brand copyright line', () => {
    render(<PublicLayout>content</PublicLayout>);

    expect(screen.getByRole('contentinfo')).toHaveTextContent(copyrightLine());
    expect(screen.queryByText(/All rights reserved/)).not.toBeInTheDocument();
  });
});
