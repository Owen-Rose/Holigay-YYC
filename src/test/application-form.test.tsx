import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { VendorApplicationForm } from '@/components/forms/vendor-application-form';
import type { ApplicationFormInput } from '@/lib/validations/application';

// =============================================================================
// Test Setup
// =============================================================================

const mockEvents = [
  { id: '123e4567-e89b-12d3-a456-426614174000', name: 'Holiday Market 2024', date: '2024-12-15' },
  { id: '223e4567-e89b-12d3-a456-426614174001', name: 'Spring Festival 2025', date: '2025-03-20' },
];

const mockOnSubmit = vi.fn();

beforeEach(() => {
  mockOnSubmit.mockClear();
});

// =============================================================================
// Render Tests
// =============================================================================

describe('VendorApplicationForm', () => {
  describe('Rendering', () => {
    it('renders all form sections', () => {
      render(<VendorApplicationForm events={mockEvents} onSubmit={mockOnSubmit} />);

      // Check section headings
      expect(screen.getByText('Business Information')).toBeInTheDocument();
      expect(screen.getByText('Event Details')).toBeInTheDocument();
      expect(screen.getByText('Product Categories')).toBeInTheDocument();
      expect(screen.getByText('Additional Information')).toBeInTheDocument();
      expect(screen.getByText('Product Photos')).toBeInTheDocument();
    });

    it('renders all required form fields', () => {
      render(<VendorApplicationForm events={mockEvents} onSubmit={mockOnSubmit} />);

      // Required fields
      expect(screen.getByLabelText(/business name/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/contact name/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/select event/i)).toBeInTheDocument();
    });

    it('renders optional form fields', () => {
      render(<VendorApplicationForm events={mockEvents} onSubmit={mockOnSubmit} />);

      // Optional fields
      expect(screen.getByLabelText(/phone/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/website/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/business description/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/booth preference/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/special requirements/i)).toBeInTheDocument();
    });

    it('renders event options from props', () => {
      render(<VendorApplicationForm events={mockEvents} onSubmit={mockOnSubmit} />);

      const eventSelect = screen.getByLabelText(/select event/i);
      expect(eventSelect).toBeInTheDocument();

      // The options should include event names
      expect(screen.getByText(/holiday market 2024/i)).toBeInTheDocument();
      expect(screen.getByText(/spring festival 2025/i)).toBeInTheDocument();
    });

    it('renders product category checkboxes', () => {
      render(<VendorApplicationForm events={mockEvents} onSubmit={mockOnSubmit} />);

      // Check for some product categories
      expect(screen.getByLabelText(/handmade crafts/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/jewelry/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/clothing/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/art/i)).toBeInTheDocument();
    });

    it('renders submit button', () => {
      render(<VendorApplicationForm events={mockEvents} onSubmit={mockOnSubmit} />);

      expect(screen.getByRole('button', { name: /submit application/i })).toBeInTheDocument();
    });
  });

  // =============================================================================
  // Validation Tests
  // =============================================================================

  describe('Validation', () => {
    it('shows validation errors for empty required fields on submit', async () => {
      const user = userEvent.setup();
      render(<VendorApplicationForm events={mockEvents} onSubmit={mockOnSubmit} />);

      // Try to submit empty form
      const submitButton = screen.getByRole('button', { name: /submit application/i });
      await user.click(submitButton);

      // Wait for validation errors
      await waitFor(() => {
        expect(
          screen.getByText(/business name must be at least 2 characters/i)
        ).toBeInTheDocument();
      });

      await waitFor(() => {
        expect(screen.getByText(/contact name must be at least 2 characters/i)).toBeInTheDocument();
      });

      await waitFor(() => {
        expect(screen.getByText(/please enter a valid email/i)).toBeInTheDocument();
      });

      // onSubmit should NOT have been called
      expect(mockOnSubmit).not.toHaveBeenCalled();
    });

    it('shows error when no product category is selected', async () => {
      const user = userEvent.setup();
      render(<VendorApplicationForm events={mockEvents} onSubmit={mockOnSubmit} />);

      // Fill in required text fields
      await user.type(screen.getByLabelText(/business name/i), 'Test Business');
      await user.type(screen.getByLabelText(/contact name/i), 'John Doe');
      await user.type(screen.getByLabelText(/email/i), 'john@example.com');

      // Select an event
      await user.selectOptions(screen.getByLabelText(/select event/i), mockEvents[0].id);

      // Don't select any product categories

      // Try to submit
      const submitButton = screen.getByRole('button', { name: /submit application/i });
      await user.click(submitButton);

      // Wait for validation error
      await waitFor(() => {
        expect(
          screen.getByText(/please select at least one product category/i)
        ).toBeInTheDocument();
      });

      expect(mockOnSubmit).not.toHaveBeenCalled();
    });

    it('does not submit form with invalid email format', async () => {
      const user = userEvent.setup();
      render(<VendorApplicationForm events={mockEvents} onSubmit={mockOnSubmit} />);

      // Fill in other required fields
      await user.type(screen.getByLabelText(/business name/i), 'Test Business');
      await user.type(screen.getByLabelText(/contact name/i), 'John Doe');

      // Type invalid email (no @ symbol)
      await user.type(screen.getByLabelText(/email/i), 'notanemail');

      // Select event and category
      await user.selectOptions(screen.getByLabelText(/select event/i), mockEvents[0].id);
      await user.click(screen.getByLabelText(/handmade crafts/i));

      // Try to submit
      const submitButton = screen.getByRole('button', { name: /submit application/i });
      await user.click(submitButton);

      // Form should not submit due to HTML5 validation or Zod validation
      // Give a small delay for any async operations
      await new Promise((resolve) => setTimeout(resolve, 100));

      // onSubmit should NOT have been called with invalid email
      expect(mockOnSubmit).not.toHaveBeenCalled();
    });
  });

  // =============================================================================
  // Submission Tests
  // =============================================================================

  describe('Form Submission', () => {
    it('calls onSubmit with form data when all required fields are valid', async () => {
      const user = userEvent.setup();
      render(<VendorApplicationForm events={mockEvents} onSubmit={mockOnSubmit} />);

      // Fill in required fields
      await user.type(screen.getByLabelText(/business name/i), 'Artisan Crafts');
      await user.type(screen.getByLabelText(/contact name/i), 'Jane Smith');
      await user.type(screen.getByLabelText(/email/i), 'jane@artisancrafts.com');

      // Select an event
      await user.selectOptions(screen.getByLabelText(/select event/i), mockEvents[0].id);

      // Select a product category
      await user.click(screen.getByLabelText(/handmade crafts/i));

      // Submit the form
      const submitButton = screen.getByRole('button', { name: /submit application/i });
      await user.click(submitButton);

      // Wait for submission
      await waitFor(() => {
        expect(mockOnSubmit).toHaveBeenCalledTimes(1);
      });

      // Verify the data passed to onSubmit
      const submittedData = mockOnSubmit.mock.calls[0][0] as ApplicationFormInput;
      expect(submittedData.businessName).toBe('Artisan Crafts');
      expect(submittedData.contactName).toBe('Jane Smith');
      expect(submittedData.email).toBe('jane@artisancrafts.com');
      expect(submittedData.eventId).toBe(mockEvents[0].id);
      expect(submittedData.productCategories).toContain('handmade_crafts');

      // Second argument should be files array (empty in this case)
      const submittedFiles = mockOnSubmit.mock.calls[0][1] as File[];
      expect(submittedFiles).toEqual([]);
    });

    it('includes optional fields when provided', async () => {
      const user = userEvent.setup();
      render(<VendorApplicationForm events={mockEvents} onSubmit={mockOnSubmit} />);

      // Fill in required fields
      await user.type(screen.getByLabelText(/business name/i), 'Artisan Crafts');
      await user.type(screen.getByLabelText(/contact name/i), 'Jane Smith');
      await user.type(screen.getByLabelText(/email/i), 'jane@artisancrafts.com');

      // Fill in optional fields
      await user.type(screen.getByLabelText(/phone/i), '555-123-4567');
      await user.type(screen.getByLabelText(/website/i), 'https://artisancrafts.com');
      await user.type(
        screen.getByLabelText(/business description/i),
        'Handmade pottery and crafts'
      );

      // Select an event and booth preference
      await user.selectOptions(screen.getByLabelText(/select event/i), mockEvents[0].id);
      await user.selectOptions(screen.getByLabelText(/booth preference/i), 'indoor');

      // Select multiple product categories
      await user.click(screen.getByLabelText(/handmade crafts/i));
      await user.click(screen.getByLabelText(/home decor/i));

      // Add special requirements
      await user.type(screen.getByLabelText(/special requirements/i), 'Need electrical outlet');

      // Submit the form
      const submitButton = screen.getByRole('button', { name: /submit application/i });
      await user.click(submitButton);

      // Wait for submission
      await waitFor(() => {
        expect(mockOnSubmit).toHaveBeenCalledTimes(1);
      });

      // Verify all data
      const submittedData = mockOnSubmit.mock.calls[0][0] as ApplicationFormInput;
      expect(submittedData.phone).toBe('555-123-4567');
      expect(submittedData.website).toBe('https://artisancrafts.com');
      expect(submittedData.description).toBe('Handmade pottery and crafts');
      expect(submittedData.boothPreference).toBe('indoor');
      expect(submittedData.productCategories).toContain('handmade_crafts');
      expect(submittedData.productCategories).toContain('home_decor');
      expect(submittedData.specialRequirements).toBe('Need electrical outlet');
    });

    it('shows loading state during submission', async () => {
      // Create a promise that we can control
      let resolveSubmit: () => void;
      const submitPromise = new Promise<void>((resolve) => {
        resolveSubmit = resolve;
      });

      const slowOnSubmit = vi.fn().mockReturnValue(submitPromise);

      const user = userEvent.setup();
      render(<VendorApplicationForm events={mockEvents} onSubmit={slowOnSubmit} />);

      // Fill in required fields
      await user.type(screen.getByLabelText(/business name/i), 'Test Business');
      await user.type(screen.getByLabelText(/contact name/i), 'Test Person');
      await user.type(screen.getByLabelText(/email/i), 'test@example.com');
      await user.selectOptions(screen.getByLabelText(/select event/i), mockEvents[0].id);
      await user.click(screen.getByLabelText(/handmade crafts/i));

      // Submit the form
      const submitButton = screen.getByRole('button', { name: /submit application/i });
      await user.click(submitButton);

      // Button should show loading state
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /submitting/i })).toBeInTheDocument();
      });

      // Resolve the promise
      resolveSubmit!();

      // Button should return to normal
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /submit application/i })).toBeInTheDocument();
      });
    });
  });

  // =============================================================================
  // Product Category Tests
  // =============================================================================

  describe('Product Categories', () => {
    it('displays category count as user selects categories', async () => {
      const user = userEvent.setup();
      render(<VendorApplicationForm events={mockEvents} onSubmit={mockOnSubmit} />);

      // Initial state
      expect(screen.getByText('0/5 categories selected')).toBeInTheDocument();

      // Select one category
      await user.click(screen.getByLabelText(/handmade crafts/i));
      expect(screen.getByText('1/5 categories selected')).toBeInTheDocument();

      // Select another
      await user.click(screen.getByLabelText(/jewelry/i));
      expect(screen.getByText('2/5 categories selected')).toBeInTheDocument();

      // Deselect one
      await user.click(screen.getByLabelText(/handmade crafts/i));
      expect(screen.getByText('1/5 categories selected')).toBeInTheDocument();
    });

    it('disables additional categories when 5 are selected', async () => {
      const user = userEvent.setup();
      render(<VendorApplicationForm events={mockEvents} onSubmit={mockOnSubmit} />);

      // Select 5 categories
      await user.click(screen.getByLabelText(/handmade crafts/i));
      await user.click(screen.getByLabelText(/jewelry/i));
      await user.click(screen.getByLabelText(/clothing/i));
      await user.click(screen.getByLabelText(/art/i));
      await user.click(screen.getByLabelText(/food/i));

      // Count should show 5/5
      expect(screen.getByText('5/5 categories selected')).toBeInTheDocument();

      // Other category should be disabled
      const otherCheckbox = screen.getByLabelText(/other/i);
      expect(otherCheckbox).toBeDisabled();
    });
  });
});
