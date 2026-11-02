import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getVendorProfile } from '@/lib/actions/vendor-dashboard';
import { resolveVendorId } from '@/lib/vendor/resolve-vendor-id';

// spec 011 contracts/server-actions-and-ui.md §5 and §14 (US1). The other
// three loaders share the same resolveVendorId path.

const mockGetUser = vi.fn();
const mockVendorSingle = vi.fn();
const mockVendorEq = vi.fn();

vi.mock('@/lib/vendor/resolve-vendor-id', () => ({ resolveVendorId: vi.fn() }));

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn().mockImplementation(async () => ({
    auth: { getUser: () => mockGetUser() },
    from: (table: string) => {
      expect(table).toBe('vendors');
      return {
        select: () => ({
          eq: (...args: unknown[]) => {
            mockVendorEq(...args);
            return { single: () => mockVendorSingle() };
          },
        }),
      };
    },
  })),
}));

const resolveVendorIdMock = vi.mocked(resolveVendorId);

const vendorRow = {
  id: 'vendor-1',
  business_name: 'Jane Crafts',
  contact_name: 'Jane Doe',
  email: 'jane@example.com',
  phone: null,
  website: null,
  description: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null });
});

describe('getVendorProfile', () => {
  it('returns not_authenticated with no session', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null });

    expect(await getVendorProfile()).toEqual({
      success: false,
      error: 'not_authenticated',
      data: null,
    });
    expect(resolveVendorIdMock).not.toHaveBeenCalled();
  });

  it('returns no_vendor_profile when the resolver finds no vendor', async () => {
    resolveVendorIdMock.mockResolvedValue(null);

    expect(await getVendorProfile()).toEqual({
      success: false,
      error: 'no_vendor_profile',
      data: null,
    });
    expect(resolveVendorIdMock).toHaveBeenCalledWith(expect.anything(), 'user-1');
    expect(mockVendorSingle).not.toHaveBeenCalled();
  });

  it('returns the vendor row the resolver points at', async () => {
    resolveVendorIdMock.mockResolvedValue('vendor-1');
    mockVendorSingle.mockResolvedValue({ data: vendorRow, error: null });

    expect(await getVendorProfile()).toEqual({ success: true, data: vendorRow });
    expect(mockVendorEq).toHaveBeenCalledWith('id', 'vendor-1');
  });
});
