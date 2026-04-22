import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ApplicationSubmitInput } from '@/lib/validations/application';

// =============================================================================
// Mocks — hoisted module stubs
// =============================================================================

// Per-table queued responses. Each test configures which rows/errors the
// chainable builders hand back for select / insert.single() / update.eq().
type Response = { data?: unknown; error?: unknown };
const responses: Record<string, { select: Response[]; insert: Response[]; update: Response[] }> =
  {};

function resetResponses() {
  for (const key of Object.keys(responses)) {
    delete responses[key];
  }
}

function queue(table: string, op: 'select' | 'insert' | 'update', response: Response) {
  if (!responses[table]) {
    responses[table] = { select: [], insert: [], update: [] };
  }
  responses[table][op].push(response);
}

function nextResponse(table: string, op: 'select' | 'insert' | 'update'): Response {
  const queued = responses[table]?.[op].shift();
  if (!queued) {
    throw new Error(`No mock queued for ${table}.${op}`);
  }
  return queued;
}

// Chainable query builder that ignores eq/in filters and returns the next
// queued response for the requested table+op via .single() or direct await.
function makeFrom(table: string) {
  const selectChain = {
    eq: () => selectChain,
    in: () => selectChain,
    or: () => selectChain,
    order: () => selectChain,
    range: () => selectChain,
    single: () => Promise.resolve(nextResponse(table, 'select')),
  };

  const insertChain = {
    select: () => ({
      single: () => Promise.resolve(nextResponse(table, 'insert')),
    }),
  };

  const updateChain = {
    eq: () => Promise.resolve(nextResponse(table, 'update')),
  };

  return {
    select: () => selectChain,
    insert: (payload: unknown) => {
      if (!responses[table]?.insert.length) {
        // Bare insert (no .select().single()) — return directly as a thenable
        return Promise.resolve({ error: null, data: payload });
      }
      return insertChain;
    },
    update: () => updateChain,
  };
}

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn().mockResolvedValue({
    from: (table: string) => makeFrom(table),
  }),
}));

vi.mock('@/lib/email/client', async (importOriginal) => {
  // Partial mock: keep wrapEmailTemplate + other exports (the templates
  // under src/lib/email/templates re-use them), only stub sendEmail so
  // tests never touch the network or env vars.
  const actual = await importOriginal<typeof import('@/lib/email/client')>();
  return {
    ...actual,
    sendEmail: vi.fn(),
  };
});

vi.mock('@/lib/auth/roles', () => ({
  requireRole: vi.fn(),
}));

// Imports after mocks
import { submitApplication, updateApplicationStatus } from '@/lib/actions/applications';
import { sendEmail } from '@/lib/email/client';
import { requireRole } from '@/lib/auth/roles';

const sendEmailMock = vi.mocked(sendEmail);
const requireRoleMock = vi.mocked(requireRole);

beforeEach(() => {
  vi.clearAllMocks();
  resetResponses();
});

// =============================================================================
// Fixtures
// =============================================================================

const validSubmission: ApplicationSubmitInput = {
  businessName: 'Glitter Goods',
  contactName: 'Alex Example',
  email: 'alex@example.com',
  phone: '555-123-4567',
  website: 'https://example.com',
  description: 'Handmade jewelry',
  eventId: '550e8400-e29b-41d4-a716-446655440000',
  boothPreference: 'indoor',
  productCategories: ['jewelry'],
  specialRequirements: '',
};

function queueSubmitHappyPath() {
  // Step 1: vendor lookup — no match → trigger insert path
  queue('vendors', 'select', { data: null, error: { code: 'PGRST116' } });
  // Step 1b: create vendor
  queue('vendors', 'insert', { data: { id: 'vendor-1' }, error: null });
  // Step 2: no existing application for this (vendor, event)
  queue('applications', 'select', { data: null, error: { code: 'PGRST116' } });
  // Step 3: create application
  queue('applications', 'insert', { data: { id: 'app-1' }, error: null });
  // Step 5: event lookup for email
  queue('events', 'select', {
    data: { name: 'Holigay Winter Market', event_date: '2026-12-01' },
    error: null,
  });
}

// =============================================================================
// submitApplication
// =============================================================================

describe('submitApplication — email failure propagation (Workstream 2c)', () => {
  it('returns success:true with a warning when sendEmail reports failure', async () => {
    queueSubmitHappyPath();
    sendEmailMock.mockResolvedValue({
      success: false,
      messageId: null,
      error: 'boom',
    });

    const result = await submitApplication(validSubmission);

    expect(result.success).toBe(true);
    expect(result.error).toBeNull();
    expect(result.warning).toMatch(/email/i);
    expect(result.data).toEqual({ applicationId: 'app-1', vendorId: 'vendor-1' });
    expect(sendEmailMock).toHaveBeenCalledOnce();
  });

  it('omits the warning field when sendEmail succeeds', async () => {
    queueSubmitHappyPath();
    sendEmailMock.mockResolvedValue({
      success: true,
      messageId: 'msg-1',
      error: null,
    });

    const result = await submitApplication(validSubmission);

    expect(result.success).toBe(true);
    expect(result.warning).toBeUndefined();
    expect(result.data).toEqual({ applicationId: 'app-1', vendorId: 'vendor-1' });
  });
});

// =============================================================================
// updateApplicationStatus
// =============================================================================

describe('updateApplicationStatus — email failure propagation (Workstream 2c)', () => {
  function queueStatusUpdateHappyPath() {
    // Step 1: fetch application with vendor + event
    queue('applications', 'select', {
      data: {
        id: 'app-1',
        status: 'pending',
        organizer_notes: null,
        vendor: {
          contact_name: 'Alex Example',
          business_name: 'Glitter Goods',
          email: 'alex@example.com',
        },
        event: { name: 'Holigay Winter Market', event_date: '2026-12-01' },
      },
      error: null,
    });
    // Step 2: update status
    queue('applications', 'update', { error: null });
  }

  it('returns success:true with a warning when sendEmail fails on status transition', async () => {
    requireRoleMock.mockResolvedValue({
      success: true,
      error: null,
      data: { role: 'organizer', userId: 'org-1' },
    });
    queueStatusUpdateHappyPath();
    sendEmailMock.mockResolvedValue({
      success: false,
      messageId: null,
      error: 'boom',
    });

    const result = await updateApplicationStatus('app-1', 'approved');

    expect(result.success).toBe(true);
    expect(result.error).toBeNull();
    expect(result.warning).toMatch(/email/i);
    expect(sendEmailMock).toHaveBeenCalledOnce();
  });

  it('omits the warning field when sendEmail succeeds', async () => {
    requireRoleMock.mockResolvedValue({
      success: true,
      error: null,
      data: { role: 'organizer', userId: 'org-1' },
    });
    queueStatusUpdateHappyPath();
    sendEmailMock.mockResolvedValue({
      success: true,
      messageId: 'msg-1',
      error: null,
    });

    const result = await updateApplicationStatus('app-1', 'approved');

    expect(result.success).toBe(true);
    expect(result.warning).toBeUndefined();
  });
});
