import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ProductLinksList } from '@/components/vendor/product-links-list';

// spec 011 contracts/server-actions-and-ui.md §12 and §14 row 7 (FR-013)

describe('ProductLinksList', () => {
  it('lists the links in stored order, each opening in a new tab', () => {
    render(<ProductLinksList links={['https://etsy.com/shop/x', 'https://instagram.com/x']} />);

    expect(screen.getByRole('list').tagName).toBe('OL');
    const anchors = screen.getAllByRole('link');
    expect(anchors.map((a) => a.getAttribute('href'))).toEqual([
      'https://etsy.com/shop/x',
      'https://instagram.com/x',
    ]);
    expect(anchors[0]).toHaveTextContent('https://etsy.com/shop/x');
    for (const anchor of anchors) {
      expect(anchor).toHaveAttribute('target', '_blank');
      expect(anchor).toHaveAttribute('rel', 'noopener noreferrer');
    }
  });

  it('renders nothing when there are no links', () => {
    const { container } = render(<ProductLinksList links={[]} />);

    expect(container).toBeEmptyDOMElement();
  });
});
