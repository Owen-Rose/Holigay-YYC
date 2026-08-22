// =============================================================================
// ST1–ST4 — storage posture on the `attachments` bucket (spec 006, T014)
//
// Covers FR-010, FR-011, US1-AC5, US4-AC2, and research.md R9.
//
// Migration 011 §4 keeps anonymous UPLOAD open — the apply flow uploads before
// the vendor has any session — while moving download and delete behind an
// authenticated session. The organizer dashboard's createSignedUrl() flow
// (src/app/dashboard/applications/[id]/attachments-list.tsx:109) must keep
// working; ST3 is what proves it.
//
// Each test uploads its own object, so the file is order-independent;
// cleanupFixtures sweeps the whole run prefix afterwards.
//
// Matrix: specs/006-close-public-data-exposure/contracts/security-test-matrix.md
// =============================================================================

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  stackUp,
  anonClient,
  serviceClient,
  createAuthedOrganizer,
  seedFixtures,
  cleanupFixtures,
  type AuthedOrganizer,
  type SecurityFixtures,
} from './harness';

const BUCKET = 'attachments';
const FILE_BODY = 'security-suite upload probe';

describe.runIf(stackUp)('storage policies', () => {
  let fx: SecurityFixtures;
  let organizer: AuthedOrganizer;
  const anon = anonClient();
  const service = serviceClient();

  /** Uploads a fresh object as anon and returns its full path. */
  async function uploadAsAnon(name: string): Promise<string> {
    const path = `${fx.storagePrefix}/${name}`;
    const { error } = await anon.storage
      .from(BUCKET)
      .upload(path, new Blob([FILE_BODY], { type: 'text/plain' }), {
        contentType: 'text/plain',
        upsert: false,
      });
    if (error) {
      throw new Error(`[storage suite] anon upload of ${path} failed: ${error.message}`);
    }
    return path;
  }

  /** Service-role ground truth: is `name` present under the run prefix? */
  async function existsUnderPrefix(name: string): Promise<boolean> {
    const { data } = await service.storage.from(BUCKET).list(fx.storagePrefix, { limit: 1000 });
    return (data ?? []).some((o) => o.name === name);
  }

  beforeAll(async () => {
    fx = await seedFixtures();
    // Once per file — [auth.rate_limit] sign_in_sign_ups is 30 per 5 minutes.
    organizer = await createAuthedOrganizer(fx.suffix);
    fx.authUserIds.push(organizer.userId);
  });

  afterAll(async () => {
    await cleanupFixtures(fx);
  });

  // ---------------------------------------------------------------------------
  // ST1 — anonymous upload stays open (the apply flow depends on it)
  // ---------------------------------------------------------------------------

  it('ST1: anon can upload to the attachments bucket', async () => {
    const path = `${fx.storagePrefix}/st1-upload.txt`;

    const { data, error } = await anon.storage
      .from(BUCKET)
      .upload(path, new Blob([FILE_BODY], { type: 'text/plain' }), {
        contentType: 'text/plain',
        upsert: false,
      });

    expect(error).toBeNull();
    expect(data?.path).toBe(path);
    await expect(existsUnderPrefix('st1-upload.txt')).resolves.toBe(true);
  });

  // ---------------------------------------------------------------------------
  // ST2 — anonymous download is closed
  // ---------------------------------------------------------------------------

  it('ST2: anon cannot download an uploaded file', async () => {
    const path = await uploadAsAnon('st2-download.txt');

    const { data, error } = await anon.storage.from(BUCKET).download(path);

    expect(error).not.toBeNull();
    expect(data).toBeNull();
  });

  it('ST2: anon cannot mint a signed URL', async () => {
    const path = await uploadAsAnon('st2-signed.txt');

    const { data, error } = await anon.storage.from(BUCKET).createSignedUrl(path, 60);

    expect(error).not.toBeNull();
    expect(data?.signedUrl).toBeUndefined();
  });

  // ---------------------------------------------------------------------------
  // ST3 — the organizer dashboard's download path still works (R9, SC-005)
  // ---------------------------------------------------------------------------

  it('ST3: an authenticated organizer can mint a signed URL and redeem it', async () => {
    const path = await uploadAsAnon('st3-signed.txt');

    const { data, error } = await organizer.client.storage
      .from(BUCKET)
      .createSignedUrl(path, 60);

    expect(error).toBeNull();
    expect(data?.signedUrl).toBeTruthy();

    const response = await fetch(data!.signedUrl);
    expect(response.status).toBe(200);
    await expect(response.text()).resolves.toBe(FILE_BODY);
  });

  it('ST3: an authenticated organizer can download directly', async () => {
    const path = await uploadAsAnon('st3-download.txt');

    const { data, error } = await organizer.client.storage.from(BUCKET).download(path);

    expect(error).toBeNull();
    await expect(data!.text()).resolves.toBe(FILE_BODY);
  });

  // ---------------------------------------------------------------------------
  // ST4 — deletion is authenticated-only (the posture `deleteFile` used to break)
  // ---------------------------------------------------------------------------

  it('ST4: anon cannot delete a file, an authenticated organizer can', async () => {
    const path = await uploadAsAnon('st4-remove.txt');

    const { data: anonRemoved } = await anon.storage.from(BUCKET).remove([path]);

    // Primary assertion: the file survives. supabase-js reports an empty result
    // rather than an error when RLS filters every candidate row.
    expect(anonRemoved ?? []).toHaveLength(0);
    await expect(existsUnderPrefix('st4-remove.txt')).resolves.toBe(true);

    const { data: authedRemoved, error: authedError } = await organizer.client.storage
      .from(BUCKET)
      .remove([path]);

    expect(authedError).toBeNull();
    expect(authedRemoved ?? []).toHaveLength(1);
    await expect(existsUnderPrefix('st4-remove.txt')).resolves.toBe(false);
  });
});
