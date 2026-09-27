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
//
// T007 adds the invite path itself (research R8): inviteOrganizerCore runs with
// a generateLink-based sender — CI's stack has no mail service — and an anon
// client then consumes the hashed token exactly as /auth/confirm would.
// =============================================================================

import { randomUUID } from 'node:crypto';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { stackUp, anonClient, serviceClient, createAuthedVendor, type AuthedUser } from './harness';
import {
  inviteOrganizerCore,
  EXISTING_ACCOUNT_MESSAGE,
  type InviteDeps,
} from '@/lib/team/invite-organizer-core';

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

describe.runIf(stackUp)('inviteOrganizerCore against the real stack', () => {
  const service = serviceClient();
  const tag = randomUUID().slice(0, 8);
  const accepted = `invite-${tag}-a+009@example.com`;
  const pending = `invite-${tag}-b+009@example.com`;
  const hashes = new Map<string, string>();
  const createdIds: string[] = [];
  let vendor: AuthedUser;

  // Records the hashed token instead of mailing it; returns the same shape as
  // inviteUserByEmail so the core cannot tell the difference.
  const sendInvite: NonNullable<InviteDeps['sendInvite']> = async (email) => {
    const { data, error } = await service.auth.admin.generateLink({ type: 'invite', email });
    if (error) return { data: { user: null }, error };
    hashes.set(email, data.properties.hashed_token);
    if (!createdIds.includes(data.user.id)) createdIds.push(data.user.id);
    return { data: { user: data.user }, error: null };
  };

  async function row(email: string) {
    const { data, error } = await service
      .from('users_with_roles')
      .select('id, role, invite_pending')
      .eq('email', email)
      .single();
    expect(error).toBeNull();
    return data!;
  }

  beforeAll(async () => {
    vendor = await createAuthedVendor(`009-inv-${tag}`);
  });

  afterAll(async () => {
    for (const id of createdIds) await service.auth.admin.deleteUser(id);
    if (vendor) await service.auth.admin.deleteUser(vendor.userId);
  });

  it('creates a pending organizer for a new address', async () => {
    const result = await inviteOrganizerCore(service, accepted, { sendInvite });

    expect(result).toEqual({ success: true, error: null, data: { resent: false } });
    const created = await row(accepted);
    expect(created.role).toBe('organizer');
    expect(created.invite_pending).toBe(true);
  });

  it('signs the invitee in once with the hashed token and clears pending', async () => {
    const anon = anonClient();
    const { data, error } = await anon.auth.verifyOtp({
      token_hash: hashes.get(accepted)!,
      type: 'invite',
    });

    expect(error).toBeNull();
    expect(data.session?.access_token).toBeTruthy();
    expect((await row(accepted)).invite_pending).toBe(false);

    const reuse = await anonClient().auth.verifyOtp({
      token_hash: hashes.get(accepted)!,
      type: 'invite',
    });
    expect(reuse.error).not.toBeNull();
    expect(reuse.data.session).toBeNull();
  });

  it('refuses to re-invite an accepted invitee', async () => {
    const result = await inviteOrganizerCore(service, accepted, { sendInvite });

    expect(result).toEqual({ success: false, error: EXISTING_ACCOUNT_MESSAGE, data: null });
  });

  it('re-sends to a pending invitee and keeps the role', async () => {
    const first = await inviteOrganizerCore(service, pending, { sendInvite });
    const firstId = (await row(pending)).id;

    const second = await inviteOrganizerCore(service, pending, { sendInvite });

    expect(first.data).toEqual({ resent: false });
    expect(second).toEqual({ success: true, error: null, data: { resent: true } });
    const after = await row(pending);
    expect(after.id).toBe(firstId);
    expect(after.role).toBe('organizer');
    expect(after.invite_pending).toBe(true);
  });

  it('refuses an existing confirmed account', async () => {
    const result = await inviteOrganizerCore(service, vendor.email, { sendInvite });

    expect(result).toEqual({ success: false, error: EXISTING_ACCOUNT_MESSAGE, data: null });
    expect((await row(vendor.email)).role).toBe('vendor');
  });
});
