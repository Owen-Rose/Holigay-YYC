import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';
import { resolveVendorId } from '@/lib/vendor/resolve-vendor-id';

// spec 011, contracts/link-vendor-account.md "Unit test"

type Result = { data: unknown; error: { code: string; message?: string } | null };

const mockSingle = vi.fn<() => Promise<Result>>();
const mockEq = vi.fn();
const mockRpc = vi.fn<(fn: string) => Promise<Result>>();

function makeClient() {
  return {
    from: (table: string) => ({
      select: (columns: string) => {
        expect(table).toBe('user_profiles');
        expect(columns).toBe('vendor_id');
        return {
          eq: (...args: unknown[]) => {
            mockEq(...args);
            return { single: () => mockSingle() };
          },
        };
      },
    }),
    rpc: (fn: string) => mockRpc(fn),
  } as unknown as SupabaseClient<Database>;
}

let consoleError: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.clearAllMocks();
  consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  consoleError.mockRestore();
});

describe('resolveVendorId', () => {
  it('returns the tied vendor id without calling the self-heal RPC', async () => {
    mockSingle.mockResolvedValue({ data: { vendor_id: 'vendor-1' }, error: null });

    const result = await resolveVendorId(makeClient(), 'user-1');

    expect(result).toBe('vendor-1');
    expect(mockEq).toHaveBeenCalledWith('id', 'user-1');
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('ties through link_vendor_account when the profile has no vendor', async () => {
    mockSingle.mockResolvedValue({ data: { vendor_id: null }, error: null });
    mockRpc.mockResolvedValue({ data: 'vendor-2', error: null });

    const result = await resolveVendorId(makeClient(), 'user-1');

    expect(result).toBe('vendor-2');
    expect(mockRpc).toHaveBeenCalledWith('link_vendor_account');
  });

  it('returns null when the RPC finds no matching vendor', async () => {
    mockSingle.mockResolvedValue({ data: { vendor_id: null }, error: null });
    mockRpc.mockResolvedValue({ data: null, error: null });

    expect(await resolveVendorId(makeClient(), 'user-1')).toBeNull();
  });

  it('returns null and logs the code only when the RPC errors', async () => {
    mockSingle.mockResolvedValue({ data: { vendor_id: null }, error: null });
    mockRpc.mockResolvedValue({
      data: null,
      error: { code: '42501', message: 'permission denied for function link_vendor_account' },
    });

    expect(await resolveVendorId(makeClient(), 'user-1')).toBeNull();
    expect(consoleError).toHaveBeenCalledWith('[vendor] link_vendor_account failed:', '42501');
  });

  it('returns null and logs the code only when the profile read errors', async () => {
    mockSingle.mockResolvedValue({ data: null, error: { code: 'PGRST116', message: 'no rows' } });

    expect(await resolveVendorId(makeClient(), 'user-1')).toBeNull();
    expect(mockRpc).not.toHaveBeenCalled();
    expect(consoleError).toHaveBeenCalledWith('[vendor] user_profiles read failed:', 'PGRST116');
  });
});
