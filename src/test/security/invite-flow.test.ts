// =============================================================================
// Organizer invites against the real stack (spec 009, T003; T007 extends it)
//
// Covers FR-023 and FR-029 at the view level. `users_with_roles.invite_pending`
// is `email_confirmed_at IS NULL AND last_sign_in_at IS NULL` (research R5);
// a confirmed, signed-in account must read false.
//
// Migration 013 also revokes anon's default-privilege grant on the view. The
// view runs as its owner, so that grant let the public anon key list every
// account's email — the anon case below keeps it closed.
// =============================================================================

import { randomUUID } from 'node:crypto';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { stackUp, anonClient, serviceClient, createAuthedVendor, type AuthedUser } from './harness';

describe.runIf(stackUp)('users_with_roles.invite_pending', () => {
  const service = serviceClient();
  let vendor: AuthedUser;

  beforeAll(async () => {
    vendor = await createAuthedVendor(`009-${randomUUID().slice(0, 8)}`);
  });

  afterAll(async () => {
    if (vendor) await service.auth.admin.deleteUser(vendor.userId);
  });

  it('exposes the invite_pending column', async () => {
    const { error } = await service.from('users_with_roles').select('invite_pending').limit(1);
    expect(error).toBeNull();
  });

  it('is false for a confirmed account that has signed in', async () => {
    const { data, error } = await service
      .from('users_with_roles')
      .select('invite_pending')
      .eq('id', vendor.userId)
      .single();
    expect(error).toBeNull();
    expect(data?.invite_pending).toBe(false);
  });

  it('is not readable with the anon key', async () => {
    const { data, error } = await anonClient().from('users_with_roles').select('id').limit(1);
    expect(data).toBeNull();
    expect(error?.code).toBe('42501');
  });
});
