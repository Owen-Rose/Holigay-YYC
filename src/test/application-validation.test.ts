import { describe, it, expect } from 'vitest';
import { applicationFormSchema, vendorInfoSchema } from '@/lib/validations/application';

// UAT-11: GoTrue stores addresses lower-cased and handle_new_user matches
// vendors.email exactly, so the public form must store the normalized address
// or an applicant who typed capitals is never linked to their account.

const base = {
  businessName: 'Candle Co',
  contactName: 'Sam Example',
  phone: '',
  website: '',
  description: '',
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

  it('applies the same normalization through applicationFormSchema', () => {
    const result = applicationFormSchema.safeParse({
      ...base,
      email: 'Vendor@Example.COM',
      eventId: '0b9b5a5c-9b1e-4b1e-9a1e-7c0a0b1c2d3e',
      productCategories: ['art'],
      specialRequirements: '',
    });

    expect(result.success).toBe(true);
    expect(result.success && result.data.email).toBe('vendor@example.com');
  });
});
