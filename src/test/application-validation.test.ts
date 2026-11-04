import { describe, it, expect } from 'vitest';
import { vendorInfoSchema } from '@/lib/validations/application';

// UAT-11: GoTrue stores addresses lower-cased and handle_new_user matches
// vendors.email exactly, so the public form must store the normalized address
// or an applicant who typed capitals is never linked to their account.

const base = {
  businessName: 'Candle Co',
  contactName: 'Sam Example',
  description: '',
  link1: 'candleco.example',
  link2: '',
  link3: '',
};

describe('vendorInfoSchema.email — normalization (UAT-11)', () => {
  it('lower-cases the address the applicant typed', () => {
    const parsed = vendorInfoSchema.parse({ ...base, email: 'Mixed.Case@Example.com' });

    expect(parsed.email).toBe('mixed.case@example.com');
  });

  it('trims surrounding whitespace before validating', () => {
    const parsed = vendorInfoSchema.parse({ ...base, email: '  sam@example.com  ' });

    expect(parsed.email).toBe('sam@example.com');
  });

  it('still rejects an invalid address', () => {
    const result = vendorInfoSchema.safeParse({ ...base, email: 'not-an-email' });

    expect(result.success).toBe(false);
  });
});

// Spec 011 (FR-010, FR-011): the contact block carries the product-link trio
// in place of phone and website; the rule itself is tested in product-links.test.ts.
describe('vendorInfoSchema — product links (spec 011)', () => {
  it('normalizes the links and drops phone and website', () => {
    const parsed = vendorInfoSchema.parse({
      ...base,
      email: 'sam@example.com',
      phone: '403-555-0000',
      website: 'candleco.example',
    });

    expect(parsed.link1).toBe('https://candleco.example');
    expect(parsed).not.toHaveProperty('phone');
    expect(parsed).not.toHaveProperty('website');
  });

  it('requires Link 1', () => {
    const result = vendorInfoSchema.safeParse({ ...base, email: 'sam@example.com', link1: '' });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(['link1']);
  });
});
