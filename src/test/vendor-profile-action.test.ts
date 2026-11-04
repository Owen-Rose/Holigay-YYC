import { describe, it, expect, vi, beforeEach } from 'vitest';
import { updateVendorProfile } from '@/lib/actions/vendors';
import { resolveVendorId } from '@/lib/vendor/resolve-vendor-id';
import { PRODUCT_LINK_REQUIRED_MESSAGE } from '@/lib/validations/product-links';

// spec 011 contracts/server-actions-and-ui.md §4 and §14 (US1 and US2 halves)

const mockGetUser = vi.fn();
const mockUpdate = vi.fn();
const mockUpdateEq = vi.fn();

vi.mock('@/lib/vendor/resolve-vendor-id', () => ({ resolveVendorId: vi.fn() }));

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn().mockImplementation(async () => ({
    auth: { getUser: () => mockGetUser() },
    from: (table: string) => {
      expect(table).toBe('vendors');
      return {
        update: (values: unknown) => {
          mockUpdate(values);
          return {
            eq: (...args: unknown[]) => {
              mockUpdateEq(...args);
              return Promise.resolve({ error: null });
            },
          };
        },
      };
    },
  })),
}));

const resolveVendorIdMock = vi.mocked(resolveVendorId);

const validInput = {
  businessName: 'Jane Crafts',
  contactName: 'Jane Doe',
  description: '',
  link1: 'instagram.com/janecrafts',
  link2: '',
  link3: 'https://etsy.com/shop/jane',
};

beforeEach(() => {
  vi.clearAllMocks();
  mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null });
});

describe('updateVendorProfile', () => {
  it('refuses when the account resolves to no vendor', async () => {
    resolveVendorIdMock.mockResolvedValue(null);

    const result = await updateVendorProfile(validInput);

    expect(result).toEqual({ success: false, error: 'No vendor profile linked to your account' });
    expect(resolveVendorIdMock).toHaveBeenCalledWith(expect.anything(), 'user-1');
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('updates the vendor row the resolver returns', async () => {
    resolveVendorIdMock.mockResolvedValue('vendor-1');

    const result = await updateVendorProfile(validInput);

    expect(result).toEqual({ success: true });
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ business_name: 'Jane Crafts', contact_name: 'Jane Doe' })
    );
    expect(mockUpdateEq).toHaveBeenCalledWith('id', 'vendor-1');
  });

  it('writes the links compacted and normalized, and no phone or website (US2)', async () => {
    resolveVendorIdMock.mockResolvedValue('vendor-1');

    await updateVendorProfile(validInput);

    const values = mockUpdate.mock.calls[0]![0] as Record<string, unknown>;
    expect(values['product_links']).toEqual([
      'https://instagram.com/janecrafts',
      'https://etsy.com/shop/jane',
    ]);
    expect(values).not.toHaveProperty('phone');
    expect(values).not.toHaveProperty('website');
  });

  it('refuses a blank Link 1 with the field message and writes nothing (US2)', async () => {
    resolveVendorIdMock.mockResolvedValue('vendor-1');

    const result = await updateVendorProfile({ ...validInput, link1: '  ' });

    expect(result).toEqual({ success: false, error: PRODUCT_LINK_REQUIRED_MESSAGE });
    expect(mockGetUser).not.toHaveBeenCalled();
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('refuses an unauthenticated caller before resolving', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null });

    const result = await updateVendorProfile(validInput);

    expect(result).toEqual({ success: false, error: 'Not authenticated' });
    expect(resolveVendorIdMock).not.toHaveBeenCalled();
  });
});
