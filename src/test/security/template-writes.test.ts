// =============================================================================
// TW1–TW10 — template write paths under RLS (spec 005, T054)
//
// Migration 009's questionnaire_templates / template_questions policies were
// only ever asserted by reading the policy text (T050 waiver, gap 1). These
// suites exercise them: the creator edits their own template, another
// organizer can read but not touch it, a vendor sees nothing, and an orphaned
// template (creator deleted → created_by NULL) is admin-only (gap 3).
//
// Sign-ins: organizer A, organizer B, vendor = 3 (30 per 5 minutes budget).
// B is promoted to admin by the service client mid-file; get_user_role()
// reads user_profiles live, so no re-sign-in is needed.
// =============================================================================

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  stackUp,
  anonClient,
  serviceClient,
  createAuthedOrganizer,
  createAuthedVendor,
  seedFixtures,
  cleanupFixtures,
  type AuthedUser,
  type SecurityFixtures,
} from './harness';

const RLS_DENIED = '42501';

describe.runIf(stackUp)('template writes', () => {
  let fx: SecurityFixtures;
  let organizerA: AuthedUser;
  let organizerB: AuthedUser;
  let vendor: AuthedUser;
  const anon = anonClient();
  const service = serviceClient();

  let templateId: string;

  async function templateRow() {
    const { data } = await service
      .from('questionnaire_templates')
      .select('id, name, created_by')
      .eq('id', templateId)
      .maybeSingle();
    return data;
  }

  async function templateQuestionLabels(): Promise<string[]> {
    const { data } = await service
      .from('template_questions')
      .select('label')
      .eq('template_id', templateId)
      .order('position', { ascending: true });
    return (data ?? []).map((r) => r.label);
  }

  beforeAll(async () => {
    fx = await seedFixtures();
    organizerA = await createAuthedOrganizer(`${fx.suffix}-a`);
    organizerB = await createAuthedOrganizer(`${fx.suffix}-b`);
    vendor = await createAuthedVendor(fx.suffix);
    fx.authUserIds.push(organizerA.userId, organizerB.userId, vendor.userId);
  });

  afterAll(async () => {
    await cleanupFixtures(fx);
  });

  // ---------------------------------------------------------------------------
  // TW1 / TW2 — the creator's own write path (createTemplate / updateTemplate)
  // ---------------------------------------------------------------------------

  it('TW1: an organizer creates a template with questions', async () => {
    const { data: template, error } = await organizerA.client
      .from('questionnaire_templates')
      .insert({ name: `SEC TW ${fx.suffix}`, created_by: organizerA.userId })
      .select('id')
      .single();

    expect(error).toBeNull();
    templateId = template!.id;
    fx.extraTemplateIds.push(templateId);

    const { error: questionsError } = await organizerA.client.from('template_questions').insert([
      { template_id: templateId, position: 0, type: 'short_text', label: 'Booth name' },
      { template_id: templateId, position: 1, type: 'yes_no', label: 'Need power?' },
    ]);

    expect(questionsError).toBeNull();
    expect(await templateQuestionLabels()).toEqual(['Booth name', 'Need power?']);
  });

  it('TW2: the creator renames it and replaces its questions', async () => {
    const { data: updated, error: updateError } = await organizerA.client
      .from('questionnaire_templates')
      .update({ name: `SEC TW renamed ${fx.suffix}` })
      .eq('id', templateId)
      .select('id');
    expect(updateError).toBeNull();
    expect(updated).toHaveLength(1);

    const { error: deleteError } = await organizerA.client
      .from('template_questions')
      .delete()
      .eq('template_id', templateId);
    expect(deleteError).toBeNull();

    const { error: insertError } = await organizerA.client
      .from('template_questions')
      .insert([{ template_id: templateId, position: 0, type: 'long_text', label: 'Replaced' }]);
    expect(insertError).toBeNull();

    expect((await templateRow())?.name).toBe(`SEC TW renamed ${fx.suffix}`);
    expect(await templateQuestionLabels()).toEqual(['Replaced']);
  });

  // ---------------------------------------------------------------------------
  // TW3 – TW6 — a second organizer: read yes, write no
  // ---------------------------------------------------------------------------

  it('TW3: another organizer can read the template and its questions', async () => {
    const { data: templates, error } = await organizerB.client
      .from('questionnaire_templates')
      .select('id')
      .eq('id', templateId);
    expect(error).toBeNull();
    expect(templates).toHaveLength(1);

    const { data: questions } = await organizerB.client
      .from('template_questions')
      .select('id')
      .eq('template_id', templateId);
    expect(questions).toHaveLength(1);
  });

  it("TW4: another organizer's update affects no rows", async () => {
    const { data: affected, error } = await organizerB.client
      .from('questionnaire_templates')
      .update({ name: 'PWNED' })
      .eq('id', templateId)
      .select('id');

    expect(error).toBeNull();
    expect(affected ?? []).toHaveLength(0);
    expect((await templateRow())?.name).toBe(`SEC TW renamed ${fx.suffix}`);
  });

  it("TW5: another organizer's delete removes nothing", async () => {
    const { data: affected } = await organizerB.client
      .from('questionnaire_templates')
      .delete()
      .eq('id', templateId)
      .select('id');

    expect(affected ?? []).toHaveLength(0);
    expect(await templateRow()).not.toBeNull();
  });

  it('TW6: another organizer cannot insert a question under it', async () => {
    const { error } = await organizerB.client
      .from('template_questions')
      .insert({ template_id: templateId, position: 5, type: 'short_text', label: 'Injected' });

    expect(error?.code).toBe(RLS_DENIED);
    expect(await templateQuestionLabels()).toEqual(['Replaced']);
  });

  // ---------------------------------------------------------------------------
  // TW7 / TW8 — vendor and anon
  // ---------------------------------------------------------------------------

  it('TW7: a vendor (and anon) reads no templates or template questions', async () => {
    const [vTemplates, vQuestions, aTemplates] = await Promise.all([
      vendor.client.from('questionnaire_templates').select('id').eq('id', templateId),
      vendor.client.from('template_questions').select('id').eq('template_id', templateId),
      anon.from('questionnaire_templates').select('id').eq('id', templateId),
    ]);

    expect(vTemplates.error).toBeNull();
    expect(vTemplates.data ?? []).toHaveLength(0);
    expect(vQuestions.data ?? []).toHaveLength(0);
    expect(aTemplates.data ?? []).toHaveLength(0);
  });

  it('TW8: a vendor cannot create a template', async () => {
    const name = `SEC TW vendor ${fx.suffix}`;

    const { error } = await vendor.client
      .from('questionnaire_templates')
      .insert({ name, created_by: vendor.userId });

    expect(error?.code).toBe(RLS_DENIED);
    const { data } = await service.from('questionnaire_templates').select('id').eq('name', name);
    expect(data ?? []).toHaveLength(0);
  });

  // ---------------------------------------------------------------------------
  // TW9 / TW10 — orphaned template is admin-only
  // ---------------------------------------------------------------------------

  it('TW9: once orphaned, a plain organizer still cannot update or delete it', async () => {
    const { error: orphanError } = await service
      .from('questionnaire_templates')
      .update({ created_by: null })
      .eq('id', templateId);
    expect(orphanError).toBeNull();

    const { data: updated } = await organizerB.client
      .from('questionnaire_templates')
      .update({ name: 'PWNED' })
      .eq('id', templateId)
      .select('id');
    const { data: deleted } = await organizerB.client
      .from('questionnaire_templates')
      .delete()
      .eq('id', templateId)
      .select('id');

    expect(updated ?? []).toHaveLength(0);
    expect(deleted ?? []).toHaveLength(0);
    expect((await templateRow())?.name).toBe(`SEC TW renamed ${fx.suffix}`);
  });

  it('TW10: an admin can update and delete the orphaned template', async () => {
    const { error: promoteError } = await service
      .from('user_profiles')
      .update({ role: 'admin' })
      .eq('id', organizerB.userId);
    expect(promoteError).toBeNull();

    const { data: updated, error: updateError } = await organizerB.client
      .from('questionnaire_templates')
      .update({ name: `SEC TW admin ${fx.suffix}` })
      .eq('id', templateId)
      .select('id');
    expect(updateError).toBeNull();
    expect(updated).toHaveLength(1);

    const { data: deleted, error: deleteError } = await organizerB.client
      .from('questionnaire_templates')
      .delete()
      .eq('id', templateId)
      .select('id');
    expect(deleteError).toBeNull();
    expect(deleted).toHaveLength(1);

    expect(await templateRow()).toBeNull();
    expect(await templateQuestionLabels()).toEqual([]);
  });
});
