import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DynamicApplicationForm } from '@/app/(public)/apply/_components/dynamic-application-form';
import type { Database } from '@/types/database';

type EventQuestion = Database['public']['Tables']['event_questions']['Row'];

// =============================================================================
// Mocks
// =============================================================================

const mockSubmitDynamic = vi.fn();
const mockUploadFile = vi.fn();

vi.mock('@/lib/actions/answers', () => ({
  submitDynamicApplication: (...args: unknown[]) => mockSubmitDynamic(...args),
}));

vi.mock('@/lib/actions/upload', () => ({
  uploadFile: (...args: unknown[]) => mockUploadFile(...args),
}));

vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
    warning: vi.fn(),
    success: vi.fn(),
  },
}));

// =============================================================================
// Helpers
// =============================================================================

function makeQuestion(overrides: Partial<EventQuestion> & Pick<EventQuestion, 'id' | 'type' | 'label'>): EventQuestion {
  return {
    event_questionnaire_id: 'q-1',
    help_text: null,
    required: false,
    options: null,
    show_if: null,
    position: 1,
    ...overrides,
  };
}

const ONE_TEXT_QUESTION = makeQuestion({
  id: 'q-text',
  type: 'short_text',
  label: 'Describe your products',
  required: true,
});

// Vendor fields — valid values to pass react-hook-form validation
async function fillVendorFields(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText(/business name/i), 'Artisan Crafts');
  await user.type(screen.getByLabelText(/contact name/i), 'Jane Smith');
  await user.type(screen.getByLabelText(/email/i), 'jane@artisan.com');
}

// =============================================================================
// Tests
// =============================================================================

beforeEach(() => {
  vi.clearAllMocks();
  mockSubmitDynamic.mockResolvedValue({ success: true, error: null, data: { applicationId: 'app-1' } });
  mockUploadFile.mockResolvedValue({
    success: true,
    error: null,
    data: { filePath: '/uploads/test.jpg', fileName: 'test.jpg', fileType: 'image/jpeg', fileSize: 1024 },
  });
});

// ---------------------------------------------------------------------------
// Rendering — all 11 question types
// ---------------------------------------------------------------------------

describe('DynamicApplicationForm rendering', () => {
  it('renders all 11 question types', () => {
    const questions: EventQuestion[] = [
      makeQuestion({ id: 'q-short',  type: 'short_text',    label: 'Short text Q',    position: 1 }),
      makeQuestion({ id: 'q-long',   type: 'long_text',     label: 'Long text Q',     position: 2 }),
      makeQuestion({ id: 'q-email',  type: 'email',         label: 'Email Q',         position: 3 }),
      makeQuestion({ id: 'q-phone',  type: 'phone',         label: 'Phone Q',         position: 4 }),
      makeQuestion({ id: 'q-url',    type: 'url',           label: 'URL Q',           position: 5 }),
      makeQuestion({ id: 'q-num',    type: 'number',        label: 'Number Q',        position: 6 }),
      makeQuestion({ id: 'q-date',   type: 'date',          label: 'Date Q',          position: 7 }),
      makeQuestion({
        id: 'q-single', type: 'single_select', label: 'Single select Q', position: 8,
        options: [{ key: 'a', label: 'Option A' }, { key: 'b', label: 'Option B' }] as never,
      }),
      makeQuestion({
        id: 'q-multi',  type: 'multi_select',  label: 'Multi select Q',  position: 9,
        options: [{ key: 'x', label: 'Option X' }, { key: 'y', label: 'Option Y' }] as never,
      }),
      makeQuestion({ id: 'q-yn',     type: 'yes_no',        label: 'Yes no Q',        position: 10 }),
      makeQuestion({ id: 'q-file',   type: 'file_upload',   label: 'File upload Q',   position: 11 }),
    ];

    render(<DynamicApplicationForm eventId="event-1" eventName="Test Event" questions={questions} />);

    // Text inputs
    expect(screen.getByLabelText(/short text q/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/long text q/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/email q/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/phone q/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/url q/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/number q/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/date q/i)).toBeInTheDocument();

    // Select
    expect(screen.getByLabelText(/single select q/i)).toBeInTheDocument();

    // Multi select — options are Checkbox labels
    expect(screen.getByLabelText(/option x/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/option y/i)).toBeInTheDocument();

    // Yes / No radios
    expect(screen.getAllByRole('radio')).toHaveLength(2);

    // File upload
    expect(screen.getByLabelText(/file upload q/i)).toBeInTheDocument();
  });

  it('renders vendor contact fields', () => {
    render(<DynamicApplicationForm eventId="event-1" eventName="Test Event" questions={[]} />);

    expect(screen.getByLabelText(/business name/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/contact name/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Validation — missing required answer
// ---------------------------------------------------------------------------

describe('DynamicApplicationForm validation', () => {
  it('shows error when required question has no answer on submit', async () => {
    const user = userEvent.setup();
    render(
      <DynamicApplicationForm
        eventId="event-1"
        eventName="Test Event"
        questions={[ONE_TEXT_QUESTION]}
      />,
    );

    await fillVendorFields(user);
    // Do NOT fill the dynamic question

    await user.click(screen.getByRole('button', { name: /submit application/i }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });
    expect(screen.getByRole('alert')).toHaveTextContent(/required/i);
    expect(mockSubmitDynamic).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// File upload happy path
// ---------------------------------------------------------------------------

describe('DynamicApplicationForm file upload', () => {
  it('uploads file and submits with correct FileAnswer shape', async () => {
    const user = userEvent.setup();
    const fileQuestion = makeQuestion({
      id: 'q-file',
      type: 'file_upload',
      label: 'Product photo',
      required: true,
    });

    render(
      <DynamicApplicationForm
        eventId="event-1"
        eventName="Test Event"
        questions={[fileQuestion]}
      />,
    );

    await fillVendorFields(user);

    const fileInput = screen.getByLabelText(/product photo/i);
    const mockFile = new File(['img'], 'photo.jpg', { type: 'image/jpeg' });
    await user.upload(fileInput, mockFile);

    await user.click(screen.getByRole('button', { name: /submit application/i }));

    await waitFor(() => {
      expect(mockUploadFile).toHaveBeenCalled();
    });

    await waitFor(() => {
      expect(mockSubmitDynamic).toHaveBeenCalledWith(
        expect.objectContaining({
          answers: expect.arrayContaining([
            expect.objectContaining({
              questionId: 'q-file',
              value: expect.objectContaining({
                kind: 'file',
                path: '/uploads/test.jpg',
                name: 'test.jpg',
              }),
            }),
          ]),
        }),
      );
    });
  });
});

// ---------------------------------------------------------------------------
// Submit success
// ---------------------------------------------------------------------------

describe('DynamicApplicationForm submission', () => {
  it('shows success confirmation after successful submit', async () => {
    const user = userEvent.setup();
    render(
      <DynamicApplicationForm
        eventId="event-1"
        eventName="Holiday Market"
        questions={[ONE_TEXT_QUESTION]}
      />,
    );

    await fillVendorFields(user);

    await user.type(screen.getByLabelText(/describe your products/i), 'Handmade pottery');

    await user.click(screen.getByRole('button', { name: /submit application/i }));

    await waitFor(() => {
      expect(screen.getByText(/application submitted/i)).toBeInTheDocument();
    });
    expect(screen.getByText(/app-1/)).toBeInTheDocument();
  });

  it('calls submitDynamicApplication with vendor and answer data', async () => {
    const user = userEvent.setup();
    render(
      <DynamicApplicationForm
        eventId="event-1"
        eventName="Test Event"
        questions={[ONE_TEXT_QUESTION]}
      />,
    );

    await fillVendorFields(user);
    await user.type(screen.getByLabelText(/describe your products/i), 'Pottery');

    await user.click(screen.getByRole('button', { name: /submit application/i }));

    await waitFor(() => {
      expect(mockSubmitDynamic).toHaveBeenCalledWith(
        expect.objectContaining({
          eventId: 'event-1',
          vendor: expect.objectContaining({
            businessName: 'Artisan Crafts',
            email: 'jane@artisan.com',
          }),
          answers: expect.arrayContaining([
            expect.objectContaining({
              questionId: 'q-text',
              value: { kind: 'text', value: 'Pottery' },
            }),
          ]),
        }),
      );
    });
  });
});
