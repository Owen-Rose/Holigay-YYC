// @vitest-environment node
//
// Node, not jsdom: applications.ts imports the email client, whose env module
// refuses to load where `window` exists.
//
// spec 012 contracts/server-actions.md §1 and §5: since migration 016 an
// organizer note is a row of application_notes (one per application; no row
// means no note). updateApplicationNotes validates, authorizes, upserts or
// deletes that row, bumps the application's updated_at, and revalidates the
// list and the review page. RLS on application_notes stays the authority; the
// security suite (vendor-isolation.test.ts I24–I28) proves who may do what.
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/email/client', () => ({ sendEmail: vi.fn() }));
vi.mock('@/lib/auth/roles', () => ({ requireRole: vi.fn() }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

type Call = { table: string; op: 'upsert' | 'delete' | 'update'; args: unknown[] };
type Result = { error: unknown };

const calls: Call[] = [];
let notesResult: Result;
let bumpResult: Result;

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn().mockImplementation(async () => ({
    from: (table: string) => ({
      upsert: (...args: unknown[]) => {
        calls.push({ table, op: 'upsert', args });
        return Promise.resolve(notesResult);
      },
      delete: () => ({
        eq: (...args: unknown[]) => {
          calls.push({ table, op: 'delete', args });
          return Promise.resolve(notesResult);
        },
      }),
      update: (values: unknown) => ({
        eq: (...args: unknown[]) => {
          calls.push({ table, op: 'update', args: [values, ...args] });
          return Promise.resolve(bumpResult);
        },
      }),
    }),
  })),
}));

// Imports after mocks
import { updateApplicationNotes } from '@/lib/actions/applications';
import { requireRole } from '@/lib/auth/roles';
import { revalidatePath } from 'next/cache';

const APP_ID = '7c9e6679-7425-40de-944b-e07fc1f90ae7';
const ORGANIZER = {
  success: true,
  error: null,
  data: { role: 'organizer' as const, userId: 'user-1' },
};
const DENIED = { success: false, error: 'Requires organizer role or higher', data: null };

let consoleError: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.clearAllMocks();
  calls.length = 0;
  notesResult = { error: null };
  bumpResult = { error: null };
  vi.mocked(requireRole).mockResolvedValue(ORGANIZER);
  consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('updateApplicationNotes', () => {
  it('upserts a non-empty note into application_notes, then bumps the application', async () => {
    const result = await updateApplicationNotes(APP_ID, 'Strong fit');

    expect(result).toEqual({ success: true, error: null });
    expect(requireRole).toHaveBeenCalledWith('organizer');
    expect(calls).toEqual([
      {
        table: 'application_notes',
        op: 'upsert',
        args: [{ application_id: APP_ID, notes: 'Strong fit' }, { onConflict: 'application_id' }],
      },
      {
        table: 'applications',
        op: 'update',
        args: [{ updated_at: expect.any(String) }, 'id', APP_ID],
      },
    ]);
  });

  it('deletes the note row for an empty note instead of upserting', async () => {
    const result = await updateApplicationNotes(APP_ID, '');

    expect(result).toEqual({ success: true, error: null });
    expect(calls.map((c) => `${c.table}.${c.op}`)).toEqual([
      'application_notes.delete',
      'applications.update',
    ]);
    expect(calls[0]!.args).toEqual(['application_id', APP_ID]);
  });

  it('refuses a caller below organizer without touching the database', async () => {
    vi.mocked(requireRole).mockResolvedValue(DENIED);

    const result = await updateApplicationNotes(APP_ID, 'Strong fit');

    expect(result).toEqual({ success: false, error: 'Requires organizer role or higher' });
    expect(calls).toEqual([]);
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it('answers "Invalid notes" for a non-UUID id without touching the database', async () => {
    const result = await updateApplicationNotes('not-a-uuid', 'Strong fit');

    expect(result).toEqual({ success: false, error: 'Invalid notes' });
    expect(calls).toEqual([]);
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it('answers "Failed to update notes" when the upsert errors, and stops there', async () => {
    notesResult = { error: { code: '42501', message: 'denied' } };

    const result = await updateApplicationNotes(APP_ID, 'Strong fit');

    expect(result).toEqual({ success: false, error: 'Failed to update notes' });
    expect(calls.map((c) => `${c.table}.${c.op}`)).toEqual(['application_notes.upsert']);
    expect(revalidatePath).not.toHaveBeenCalled();
    expect(consoleError).toHaveBeenCalled();
  });

  it('answers "Failed to update notes" when the delete errors', async () => {
    notesResult = { error: { code: '42501', message: 'denied' } };

    const result = await updateApplicationNotes(APP_ID, '');

    expect(result).toEqual({ success: false, error: 'Failed to update notes' });
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it('still succeeds when only the timestamp bump errors: the note is saved', async () => {
    bumpResult = { error: { code: '500', message: 'boom' } };

    const result = await updateApplicationNotes(APP_ID, 'Strong fit');

    expect(result).toEqual({ success: true, error: null });
    expect(consoleError).toHaveBeenCalled();
    expect(revalidatePath).toHaveBeenCalledWith('/dashboard/applications');
    expect(revalidatePath).toHaveBeenCalledWith(`/dashboard/applications/${APP_ID}`);
  });

  it('revalidates the list and the review page after a successful save', async () => {
    await updateApplicationNotes(APP_ID, 'Strong fit');

    expect(revalidatePath).toHaveBeenCalledTimes(2);
    expect(revalidatePath).toHaveBeenCalledWith('/dashboard/applications');
    expect(revalidatePath).toHaveBeenCalledWith(`/dashboard/applications/${APP_ID}`);
  });
});
