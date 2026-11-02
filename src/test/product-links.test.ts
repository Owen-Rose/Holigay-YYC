import { describe, it, expect } from 'vitest';
import {
  MAX_PRODUCT_LINKS,
  MAX_PRODUCT_LINK_LENGTH,
  PRODUCT_LINK_INVALID_MESSAGE,
  PRODUCT_LINK_REQUIRED_MESSAGE,
  PRODUCT_LINK_TOO_LONG_MESSAGE,
  compactProductLinks,
  isWebAddress,
  normalizeProductLink,
  productLinkFieldsSchema,
  toProductLinkFields,
} from '@/lib/validations/product-links';

// Spec 011 FR-011/FR-012, research R2: one rule for the apply form and the
// profile form. Contract: specs/011-vendor-linking-and-contact-fields/
// contracts/server-actions-and-ui.md §1.

/** The message Zod reports on one field, or undefined when that field passed. */
function messageOn(input: Record<string, string>, field: 'link1' | 'link2' | 'link3') {
  const result = productLinkFieldsSchema.safeParse(input);
  if (result.success) return undefined;
  return result.error.issues.find((issue) => issue.path[0] === field)?.message;
}

describe('constants', () => {
  it('caps the trio at three links of 500 characters', () => {
    expect(MAX_PRODUCT_LINKS).toBe(3);
    expect(MAX_PRODUCT_LINK_LENGTH).toBe(500);
    expect(PRODUCT_LINK_TOO_LONG_MESSAGE).toBe('Each link must be 500 characters or fewer');
  });
});

describe('normalizeProductLink', () => {
  it('prefixes https:// when there is no scheme', () => {
    expect(normalizeProductLink('instagram.com/myshop')).toBe('https://instagram.com/myshop');
  });

  it('leaves an http(s) address unchanged', () => {
    expect(normalizeProductLink('https://x.com/a')).toBe('https://x.com/a');
    expect(normalizeProductLink('http://x.com/a')).toBe('http://x.com/a');
  });

  it('keeps an upper-case scheme rather than prefixing it again', () => {
    expect(normalizeProductLink('HTTP://X.COM')).toBe('HTTP://X.COM');
  });

  it('trims, and leaves a blank value blank', () => {
    expect(normalizeProductLink('  etsy.com/shop/x  ')).toBe('https://etsy.com/shop/x');
    expect(normalizeProductLink('  ')).toBe('');
  });
});

describe('isWebAddress', () => {
  it('accepts an absolute http(s) address with a dotted host', () => {
    expect(isWebAddress('https://etsy.com/shop/x')).toBe(true);
    expect(isWebAddress('HTTP://X.COM')).toBe(true);
  });

  it('refuses text with spaces', () => {
    expect(isWebAddress(normalizeProductLink('not a link'))).toBe(false);
  });

  it('refuses a mailto: value after normalization', () => {
    expect(isWebAddress(normalizeProductLink('mailto:a@b.c'))).toBe(false);
  });

  it('refuses a host without a dot', () => {
    expect(isWebAddress(normalizeProductLink('example'))).toBe(false);
  });

  it('refuses a value over 500 characters', () => {
    const value = `https://example.com/${'a'.repeat(MAX_PRODUCT_LINK_LENGTH - 19)}`;
    expect(value).toHaveLength(501);
    expect(isWebAddress(value)).toBe(false);
    expect(isWebAddress(value.slice(0, 500))).toBe(true);
  });

  it('refuses a non-http scheme', () => {
    expect(isWebAddress('ftp://example.com')).toBe(false);
  });
});

describe('productLinkFieldsSchema', () => {
  it('requires Link 1', () => {
    expect(messageOn({ link1: '', link2: '', link3: '' }, 'link1')).toBe(
      PRODUCT_LINK_REQUIRED_MESSAGE
    );
    expect(messageOn({ link1: '   ', link2: '', link3: '' }, 'link1')).toBe(
      PRODUCT_LINK_REQUIRED_MESSAGE
    );
  });

  it('accepts Link 2 and Link 3 blank, and normalizes what is given', () => {
    const parsed = productLinkFieldsSchema.parse({
      link1: 'etsy.com/shop/x',
      link2: '',
      link3: 'https://instagram.com/x',
    });
    expect(parsed).toEqual({
      link1: 'https://etsy.com/shop/x',
      link2: '',
      link3: 'https://instagram.com/x',
    });
  });

  it('reports an invalid link on its own field', () => {
    const input = { link1: 'etsy.com/shop/x', link2: '', link3: 'not a link' };
    expect(messageOn(input, 'link3')).toBe(PRODUCT_LINK_INVALID_MESSAGE);
    expect(messageOn(input, 'link1')).toBeUndefined();
    expect(messageOn({ link1: 'mailto:a@b.c', link2: '', link3: '' }, 'link1')).toBe(
      PRODUCT_LINK_INVALID_MESSAGE
    );
  });

  it('measures the length after the https:// prefix is added', () => {
    // 495 typed characters + 'https://' = 503: too long only after normalization.
    const typed = `example.com/${'a'.repeat(495 - 12)}`;
    expect(typed).toHaveLength(495);

    expect(messageOn({ link1: 'etsy.com', link2: typed, link3: '' }, 'link2')).toBe(
      PRODUCT_LINK_TOO_LONG_MESSAGE
    );
    expect(messageOn({ link1: typed, link2: '', link3: '' }, 'link1')).toBe(
      PRODUCT_LINK_TOO_LONG_MESSAGE
    );

    // Only the length message: the web-address check does not pile on.
    const result = productLinkFieldsSchema.safeParse({
      link1: 'etsy.com',
      link2: typed,
      link3: '',
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues.filter((issue) => issue.path[0] === 'link2')).toHaveLength(1);
  });

  it('accepts exactly 500 characters after normalization', () => {
    const typed = `example.com/${'a'.repeat(500 - 8 - 12)}`;
    expect(normalizeProductLink(typed)).toHaveLength(500);
    expect(productLinkFieldsSchema.safeParse({ link1: typed, link2: '', link3: '' }).success).toBe(
      true
    );
  });
});

describe('compactProductLinks', () => {
  it('drops blanks and keeps the order', () => {
    expect(
      compactProductLinks({
        link1: 'https://a.example',
        link2: '',
        link3: 'https://c.example',
      })
    ).toEqual(['https://a.example', 'https://c.example']);
  });

  it('keeps all three when all are given', () => {
    expect(
      compactProductLinks({
        link1: 'https://a.example',
        link2: 'https://b.example',
        link3: 'https://c.example',
      })
    ).toEqual(['https://a.example', 'https://b.example', 'https://c.example']);
  });
});

describe('toProductLinkFields', () => {
  it('fills three blank slots from an empty array', () => {
    expect(toProductLinkFields([])).toEqual({ link1: '', link2: '', link3: '' });
  });

  it('fills slots in stored order', () => {
    expect(toProductLinkFields(['https://a.example', 'https://b.example'])).toEqual({
      link1: 'https://a.example',
      link2: 'https://b.example',
      link3: '',
    });
  });
});
