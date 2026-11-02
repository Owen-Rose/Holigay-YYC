import { describe, it, expect, vi, beforeEach } from 'vitest';
import { updateVendorProfile } from '@/lib/actions/vendors';
import { resolveVendorId } from '@/lib/vendor/resolve-vendor-id';

// spec 011 contracts/server-actions-and-ui.md §4 and §14 (US1 half)

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
  phone: '',
  website: '',
  description: '',
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

  it('refuses an unauthenticated caller before resolving', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null });

    const result = await updateVendorProfile(validInput);

    expect(result).toEqual({ success: false, error: 'Not authenticated' });
    expect(resolveVendorIdMock).not.toHaveBeenCalled();
  });
});
