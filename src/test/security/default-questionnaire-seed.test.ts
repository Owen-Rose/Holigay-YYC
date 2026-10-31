// =============================================================================
// DS1–DS3 — the default-questionnaire seed carries show-if rules (migration 014)
//
// UAT2-4 adds a corner acknowledgement that is shown only when the booth
// question's "corner" option is chosen. The rule references the booth question
// by id, so `create_event_with_default_questionnaire` must insert the ids the
// app assigns and store the rule; a rule that points outside the payload must
// be refused with nothing written.
//
// Sign-ins: organizer = 1 ([auth.rate_limit] sign_in_sign_ups 30/5min).
// =============================================================================

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  stackUp,
  serviceClient,
  createAuthedOrganizer,
  seedFixtures,
  cleanupFixtures,
  type AuthedUser,
  type SecurityFixtures,
} from './harness';
import { buildDefaultQuestionnaire } from '@/lib/questionnaire/default-questions';
import type { Json } from '@/types/database';

const INVALID_PAYLOAD = 'P0004';
const NONEXISTENT_UUID = '00000000-0000-4000-8000-000000000000';

describe.runIf(stackUp)('default questionnaire seed (migration 014)', () => {
  const service = serviceClient();
  let fx: SecurityFixtures;
  let organizer: AuthedUser;

  beforeAll(async () => {
    fx = await seedFixtures();
    organizer = await createAuthedOrganizer(`${fx.suffix}-seed`);
    fx.authUserIds.push(organizer.userId);
  });

  afterAll(async () => {
    await cleanupFixtures(fx);
  });

  it('DS1: the real seed lands with its ids and the corner acknowledgement rule', async () => {
    const questions = buildDefaultQuestionnaire();
    const booth = questions[0];
    const ack = questions[1];

    const { data: eventId, error } = await organizer.client.rpc(
      'create_event_with_default_questionnaire',
      {
        p_event: {
          name: `SEC DS1 ${fx.suffix}`,
          event_date: '2030-12-31',
          location: 'Calgary',
          status: 'draft',
          questions: questions as unknown as Json,
        },
      }
    );
    expect(error).toBeNull();
    expect(eventId).toBeTruthy();
    fx.extraEventIds.push(eventId as string);

    const { data: rows } = await service
      .from('event_questions')
      .select(
        'id, position, type, label, help_text, required, options, show_if, event_questionnaires!inner(event_id)'
      )
      .eq('event_questionnaires.event_id', eventId as string)
      .order('position');

    expect(rows?.map((r) => r.id)).toEqual(questions.map((q) => q.id));
    expect(rows?.map((r) => r.position)).toEqual([0, 1, 2, 3]);
    expect(rows?.[0]).toMatchObject({
      id: booth.id,
      type: 'single_select',
      required: true,
      help_text: booth.help_text,
      show_if: null,
    });
    expect((rows?.[0].options as { key: string }[]).map((o) => o.key)).toEqual([
      'single_central',
      'single_wall',
      'double_central',
      'double_wall',
      'corner',
    ]);
    expect(rows?.[1]).toMatchObject({
      id: ack.id,
      type: 'yes_no',
      required: true,
      show_if: { questionId: booth.id, operator: 'equals', value: 'corner' },
    });
  });

  it('DS2: a show_if pointing outside the payload is refused and nothing is written', async () => {
    const questions = buildDefaultQuestionnaire();
    questions[1].show_if = { questionId: NONEXISTENT_UUID, operator: 'equals', value: 'corner' };
    const name = `SEC DS2 ${fx.suffix}`;

    const { error } = await organizer.client.rpc('create_event_with_default_questionnaire', {
      p_event: {
        name,
        event_date: '2030-12-31',
        location: 'Calgary',
        status: 'draft',
        questions: questions as unknown as Json,
      },
    });
    expect(error?.code).toBe(INVALID_PAYLOAD);

    const { count } = await service
      .from('events')
      .select('id', { count: 'exact', head: true })
      .eq('name', name);
    expect(count).toBe(0);
  });

  it('DS3: a show_if pointing at a LATER seed question is refused', async () => {
    const questions = buildDefaultQuestionnaire();
    // Make the booth question depend on the acknowledgement that follows it.
    questions[1].show_if = null;
    questions[0].show_if = { questionId: questions[1].id, operator: 'equals', value: 'true' };
    const name = `SEC DS3 ${fx.suffix}`;

    const { error } = await organizer.client.rpc('create_event_with_default_questionnaire', {
      p_event: {
        name,
        event_date: '2030-12-31',
        location: 'Calgary',
        status: 'draft',
        questions: questions as unknown as Json,
      },
    });
    expect(error?.code).toBe(INVALID_PAYLOAD);

    const { count } = await service
      .from('events')
      .select('id', { count: 'exact', head: true })
      .eq('name', name);
    expect(count).toBe(0);
  });
});
